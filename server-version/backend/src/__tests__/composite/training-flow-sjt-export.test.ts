import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  compositeAssessment: { findUnique: vi.fn() },
  compositeAssessmentAttempt: { count: vi.fn() },
  assessmentUnitSnapshot: { findMany: vi.fn() },
  assessment: { findMany: vi.fn() },
  cognitiveSession: { findMany: vi.fn() },
  compositeFormAnswer: { findMany: vi.fn() },
  cognitiveTrial: { count: vi.fn() },
  cognitiveRawSubmission: { aggregate: vi.fn() },
}))
vi.mock('../../config/database', () => ({ prisma: db }))

import { compileTrainingFlow, trainingFlowItemKey, trainingFlowUnitKey } from '../../modules/assessment-core/flow/training'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { mapCompositeSection } from '../../modules/assessment-runtime/form-section-definition'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet, type FrozenActiveSlotV1 } from '../../modules/assessment-runtime/slot-set'
import { createCanonicalUnitResultEnvelope, type CanonicalUnitResultCoreV1 } from '../../modules/assessment-runtime/unit-result'
import { getExportData, exportToCSV } from '../../modules/composite/composite-export.service'
import { readSituationalExportResults } from '../../modules/composite/situational-canonical-export'
import { buildTrainingFlowUnits } from '../../modules/composite/training-flow-definition'
import { resolveTrainingFlowScope } from '../../modules/composite/training-flow-scope'
import { resolveTrainingAttemptScope } from '../../modules/composite/training-variant-scope'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'e'.repeat(64))
  db.$queryRaw.mockImplementation(async (parts: TemplateStringsArray) => parts.join('').includes('training_variant_frozen') ? [{ id: 'flow-task' }] : [])
  db.compositeAssessmentAttempt.count.mockResolvedValue(2)
  db.assessment.findMany.mockResolvedValue([])
  db.cognitiveSession.findMany.mockResolvedValue([])
  db.compositeFormAnswer.findMany.mockResolvedValue([])
  db.cognitiveTrial.count.mockResolvedValue(0)
  db.cognitiveRawSubmission.aggregate.mockResolvedValue({ _sum: { trialCount: 0 } })
})
afterEach(() => vi.unstubAllEnvs())

/** A genuine compiled Form -> conditional END -> required SJT publication.
 * Proofs and canonical results use the production encryption/validation path. */
async function fixture(termination: 'COMPLETE_EARLY' | 'SCREEN_OUT' = 'COMPLETE_EARLY') {
  const question: any = { id: 'question-gate', type: 'FORM', position: 0, formSectionId: 'gate-section', formSectionPosition: 0,
    formType: 'single_choice', formLabel: 'Gate', required: true,
    formOptions: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
    formDefinition: { itemKey: 'gate_answer', type: 'SINGLE', prompt: 'Gate', required: true,
      options: [{ optionKey: 'yes', label: 'Yes' }, { optionKey: 'no', label: 'No' }], rows: [] },
    formPolicy: { version: 3, requiredRefusal: 'ALLOW_SUBMIT', hiddenRequired: 'EXEMPT' } }
  const section = { id: 'gate-section', title: 'Gate', description: null, position: 0, contextSection: false, items: [question] }
  const sjt = { id: 'sjt', type: 'SITUATIONAL', position: 1, required: true,
    situationalInstrumentKey: 'export-sjt', situationalInstrumentVersion: '1' }
  const template: any = { id: 'flow-task', name: 'Flow SJT export', productKind: 'QUESTIONNAIRE',
    publishedAt: new Date('2026-10-18T00:00:00Z'), items: [question, sjt], formSections: [section],
    trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null, trainingFlowDraft: null }
  const config = compileTrainingFlow({ schemaVersion: 1, blocks: [
    { blockKey: 'gate', kind: 'INSTRUMENT', instrumentKey: trainingFlowUnitKey(section.id) },
    { blockKey: 'finish', kind: 'END', termination,
      when: { op: 'EQUALS', field: { source: 'ANSWER', instrumentKey: trainingFlowUnitKey(section.id), itemKey: 'gate_answer' }, value: 'yes' } },
    { blockKey: 'sjt', kind: 'INSTRUMENT', instrumentKey: trainingFlowItemKey(sjt.id) },
  ] }, buildTrainingFlowUnits(template))
  template.trainingFlowFrozen = config
  template.trainingFlowDigest = config.flowDigest
  const definitionHash = 'a'.repeat(64), runtimeHash = 'b'.repeat(64)
  const candidateSlots: FrozenActiveSlotV1[] = [
    { slotKey: `form-section:${section.id}`, unitType: 'FORM_SECTION', required: true,
      sourceDefinitionIdentity: { key: section.id, version: 'FORM_SECTION_V3', hash: canonicalHash(mapCompositeSection(section)) },
      sourceBinding: { sectionId: section.id } },
    { slotKey: 'situational:sjt', unitType: 'SITUATIONAL', required: true,
      sourceDefinitionIdentity: { key: sjt.situationalInstrumentKey, version: '1', hash: definitionHash },
      sourceBinding: { compositeItemId: sjt.id, compiledRuntimeHash: runtimeHash },
      runtimeIdentity: { instrumentKey: sjt.situationalInstrumentKey, instrumentVersion: '1', definitionHash,
        compiledRuntimeHash: runtimeHash, scorerKey: 'sjt', scoringVersion: '1',
        runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', frozenAt: template.publishedAt.toISOString() } },
  ]
  const slots = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: candidateSlots })
  const core: CanonicalUnitResultCoreV1 = { schemaVersion: 1, unitType: 'SITUATIONAL', instrumentKey: sjt.situationalInstrumentKey,
    instrumentVersion: '1', sourceDefinitionHash: definitionHash, compilerVersion: '1', compiledRuntimeHash: runtimeHash,
    scorerKey: 'sjt', scorerVersion: '1', contextHash: null, quality: { status: 'interpretable', flags: [] },
    metrics: [{ key: 'score', value: 0, quality: 'calculated' }], facts: [], references: [],
    scientificProvenance: { instrumentKey: sjt.situationalInstrumentKey, instrumentVersion: '1' } }
  const attempts: any[] = [], rows: any[] = []
  for (const [id, answer] of [['early', 'yes'], ['executed', 'no']]) {
    const snapshot = { schemaVersion: 1, compositeId: template.id, publishedAt: template.publishedAt.toISOString(),
      attemptId: id, attemptEpoch: 1, flowDigest: config.flowDigest, unionDigest: config.unionDigest, slotSetHash: slots.snapshotHash }
    const parent: any = { id, compositeAssessmentId: template.id, attemptEpoch: 1, participantKey: `participant-${id}`,
      runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', status: 'IN_PROGRESS', contextSnapshotHash: null,
      trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
      trainingFlowSnapshotEncrypted: encryptUnifiedRuntimePayload(snapshot), trainingFlowSnapshotHash: canonicalHash(snapshot),
      trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
      frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash }
    const accepted: any[] = [{ id: `form-${id}`, compositeAttemptId: id, attemptEpoch: 1, slotKey: `form-section:${section.id}`,
      unitType: 'FORM_SECTION', terminalState: 'COMPLETED', payloadKind: 'COLLECTION_FACTS', sourceType: 'COMPOSITE_FORM_SECTION',
      sourceAttemptId: `form-attempt-${id}`, sourceSubmissionId: `form-submit-${id}`,
      sourceDefinitionHash: candidateSlots[0].sourceDefinitionIdentity.hash, compiledRuntimeHash: null,
      canonicalResultEncrypted: null, completedAt: new Date('2026-10-18T00:01:00Z'),
      collectionFactsEncrypted: encryptUnifiedRuntimePayload({ schemaVersion: 3, sectionKey: section.id,
        items: [{ key: question.id, label: question.formLabel, value: answer, state: 'ANSWERED' }] }) }]
    if (id === 'executed') {
      const result = createCanonicalUnitResultEnvelope({ core, completedAt: new Date('2026-10-18T00:02:00Z'),
        persistenceProvenance: { sourceType: 'SITUATIONAL_ATTEMPT', sourceAttemptId: 'sjt-attempt', sourceSubmissionId: 'sjt-submit' } })
      accepted.push({ id: 'sjt-snapshot', compositeAttemptId: id, attemptEpoch: 1, slotKey: 'situational:sjt', unitType: 'SITUATIONAL',
        terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT', sourceType: 'SITUATIONAL_ATTEMPT',
        sourceAttemptId: 'sjt-attempt', sourceSubmissionId: 'sjt-submit', sourceDefinitionHash: definitionHash,
        compiledRuntimeHash: runtimeHash, completedAt: new Date(result.completedAt), collectionFactsEncrypted: null,
        canonicalResultEncrypted: encryptUnifiedRuntimePayload(result) })
    }
    const proof = await resolveTrainingFlowScope(parent, template, { db, frozenSlots: slots, snapshotRows: accepted, allowAdvance: true })
    parent.trainingFlowPathEncrypted = encryptUnifiedRuntimePayload(proof!.evidence)
    parent.trainingFlowPathHash = proof!.pathHash
    parent.status = 'COMPLETED'
    parent.completedAt = new Date('2026-10-18T00:02:00Z')
    attempts.push(parent)
    rows.push(...accepted)
  }
  template.attempts = attempts
  db.compositeAssessment.findUnique.mockResolvedValue(template)
  db.assessmentUnitSnapshot.findMany.mockResolvedValue(rows)
  const verified = async (index: number) => {
    const parent = { ...attempts[index], compositeAssessment: template }
    const accepted = rows.filter(row => row.compositeAttemptId === parent.id)
    const scope = await resolveTrainingAttemptScope(parent, template, { db: db as any,
      frozenSlotSets: new Map([[parent.id, slots]]), flowSnapshots: new Map([[parent.id, accepted]]) })
    return { parent, accepted, scope }
  }
  return { template, attempts, rows, slots, verified }
}

describe('flow SJT exports consume the authenticated accepted path', () => {
  it.each(['COMPLETE_EARLY', 'SCREEN_OUT'] as const)('exports %s before SJT as NOT_SHOWN/null while preserving an executed zero and all candidate slots', async termination => {
    const f = await fixture(termination)
    const before = JSON.stringify({ slots: f.slots, definition: f.template.trainingFlowFrozen, rows: f.rows })
    const data = await getExportData(f.template.id)
    expect(data.rows.map(row => [row.A_attempt_id, row.P002_path_state, row.J002_terminal_state])).toEqual([
      ['early', 'NOT_SHOWN', 'NOT_SHOWN'], ['executed', 'EXECUTED', 'COMPLETED'],
    ])
    const metric = data.fields.find(field => field.name.startsWith('J002_M_') && field.type === 'numeric')!
    expect(metric).toBeTruthy()
    expect(data.rows.map(row => row[metric.name])).toEqual([null, 0])
    expect(data.rows[0].P_termination).toBe(termination)
    expect(data.rows[0].P_task_satisfaction).toBe(termination === 'SCREEN_OUT' ? 'NOT_SATISFIED' : 'SATISFIED')
    expect(Object.entries(data.rows[0]).filter(([key]) => key.startsWith('J002_') && key !== 'J002_terminal_state').every(([, value]) => value === null)).toBe(true)
    expect(exportToCSV(data)).toContain('NOT_SHOWN')
    expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
    expect(db.assessment.findMany).not.toHaveBeenCalled()
    expect(db.cognitiveSession.findMany).not.toHaveBeenCalled()
    expect(JSON.stringify({ slots: f.slots, definition: f.template.trainingFlowFrozen, rows: f.rows })).toBe(before)
    expect(f.slots.slots).toHaveLength(2)
  })

  it('permits absent required SJT only with the original verified flow scope, never with ordinary/null/variant scope', async () => {
    const f = await fixture(), { parent, accepted, scope } = await f.verified(0)
    expect(readSituationalExportResults(parent, accepted, f.slots, scope).get('situational:sjt')).toBeNull()
    for (const ordinary of [undefined, { ...scope, flow: null }, { ...scope, flow: null, variant: { variantKey: 'selected' } }]) {
      expect(() => readSituationalExportResults(parent, accepted, f.slots, ordinary)).toThrow('required snapshot missing')
    }
    expect(() => readSituationalExportResults(parent, accepted, f.slots, { ...scope })).toThrow('scope绑定')
    expect(db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
  })

  it('still rejects a missing accepted SJT after scope verification', async () => {
    const f = await fixture(), { parent, accepted, scope } = await f.verified(1)
    expect(() => readSituationalExportResults(parent, accepted.filter(row => row.unitType !== 'SITUATIONAL'), f.slots, scope)).toThrow('required snapshot missing')
  })

  it('does not exempt the reached current SJT of a nonterminal flow', async () => {
    const f = await fixture()
    const parent = { ...f.attempts[1], status: 'IN_PROGRESS', trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
      compositeAssessment: f.template }
    const accepted = f.rows.filter(row => row.compositeAttemptId === parent.id && row.unitType === 'FORM_SECTION')
    const proof = await resolveTrainingFlowScope(parent, f.template, { db, frozenSlots: f.slots, snapshotRows: accepted, allowAdvance: true })
    parent.trainingFlowPathEncrypted = encryptUnifiedRuntimePayload(proof!.evidence)
    parent.trainingFlowPathHash = proof!.pathHash
    const scope = await resolveTrainingAttemptScope(parent, f.template, { db: db as any,
      frozenSlotSets: new Map([[parent.id, f.slots]]), flowSnapshots: new Map([[parent.id, accepted]]) })
    expect(scope.flow!.reachedSlotKeys.has('situational:sjt')).toBe(true)
    expect(scope.flow!.executedSlotKeys.has('situational:sjt')).toBe(false)
    expect(() => readSituationalExportResults(parent, accepted, f.slots, scope)).toThrow('required snapshot missing')
  })

  it.each([
    ['attempt', { id: 'other' }], ['epoch', { attemptEpoch: 2 }],
    ['path proof', { trainingFlowPathHash: 'f'.repeat(64) }], ['snapshot', { trainingFlowSnapshotHash: 'f'.repeat(64) }],
    ['context', { contextSnapshotHash: 'f'.repeat(64) }], ['slot set', { frozenActiveSlotSetHash: 'f'.repeat(64) }],
  ])('rejects a scope reused with mismatched %s', async (_name, patch) => {
    const f = await fixture(), { parent, accepted, scope } = await f.verified(0)
    expect(() => readSituationalExportResults({ ...parent, ...patch }, accepted, f.slots, scope)).toThrow()
  })

  it.each([
    ['task', { id: 'other-task' }], ['publication', { publishedAt: new Date('2026-10-19T00:00:00Z') }],
    ['configuration', { trainingFlowDigest: 'f'.repeat(64) }],
  ])('rejects a verified scope attached to a different %s', async (_name, patch) => {
    const f = await fixture(), { parent, accepted, scope } = await f.verified(0)
    expect(() => readSituationalExportResults({ ...parent, compositeAssessment: { ...f.template, ...patch } }, accepted, f.slots, scope)).toThrow('scope绑定')
  })

  it.each(['COMPLETED', 'SKIPPED', 'NOT_APPLICABLE', 'wrong-unit-type'])('rejects an injected %s row for the END-skipped SJT instead of filtering it away', async mode => {
    const f = await fixture(), { parent, accepted, scope } = await f.verified(0)
    const source = f.rows.find(row => row.unitType === 'SITUATIONAL')!
    const injected = { ...source, id: 'injected', compositeAttemptId: parent.id,
      ...(mode === 'wrong-unit-type' ? { unitType: 'FORM_SECTION' } : { terminalState: mode }) }
    expect(() => readSituationalExportResults(parent, [...accepted, injected], f.slots, scope)).toThrow()
  })

  it.each([
    { sourceAttemptId: 'foreign' }, { sourceSubmissionId: 'foreign' }, { sourceDefinitionHash: 'f'.repeat(64) },
    { compiledRuntimeHash: 'f'.repeat(64) }, { canonicalResultEncrypted: 'corrupt' }, { payloadKind: 'NONE' },
  ])('keeps executed canonical integrity checks for %j', async patch => {
    const f = await fixture(), { parent, accepted, scope } = await f.verified(1)
    const changed = accepted.map(row => row.unitType === 'SITUATIONAL' ? { ...row, ...patch } : row)
    expect(() => readSituationalExportResults(parent, changed, f.slots, scope)).toThrow()
  })
})
