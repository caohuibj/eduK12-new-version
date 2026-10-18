import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  compositeAssessment: { findUnique: vi.fn() },
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
import { projectCompositeCollectionReport } from '../../modules/composite/composite-report.projector'
import { buildTrainingFlowUnits } from '../../modules/composite/training-flow-definition'
import { resolveTrainingFlowScope, trainingFlowProvenance } from '../../modules/composite/training-flow-scope'
import { loadTrainingVariantExportGraph } from '../../modules/composite/training-variant-export'
import { applyTrainingAttemptScope, resolveTrainingAttemptScope } from '../../modules/composite/training-variant-scope'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'e'.repeat(64))
  db.$queryRaw.mockResolvedValue([{ id: 'flow-task' }])
  db.assessment.findMany.mockResolvedValue([])
  db.cognitiveSession.findMany.mockResolvedValue([])
  db.compositeFormAnswer.findMany.mockResolvedValue([])
  db.cognitiveTrial.count.mockResolvedValue(0)
  db.cognitiveRawSubmission.aggregate.mockResolvedValue({ _sum: { trialCount: 0 } })
})
afterEach(() => vi.unstubAllEnvs())

type AttemptSpec = { id: string; answer: 'yes' | 'no'; epoch?: number }

/** Real compiled definitions, authenticated envelopes and stored path proofs.
 * Only persistence is mocked; no scope/compiler/proof reader is replaced. */
async function fixture(specs: AttemptSpec[] = [{ id: 'attempt-a', answer: 'yes' }]) {
  const questions: any[] = ['gate', 'future'].map((key, index) => ({
    id: `question-${key}`, type: 'FORM', position: index ? 3 : 0,
    formSectionId: `section-${key}`, formSectionPosition: 0,
    formType: 'single_choice', formLabel: `Question ${key}`, required: true,
    formOptions: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
    formDefinition: { itemKey: `answer_${key}`, type: 'SINGLE', prompt: `Question ${key}`,
      required: true, options: [{ optionKey: 'yes', label: 'Yes' }, { optionKey: 'no', label: 'No' }], rows: [] },
    formPolicy: { version: 3, requiredRefusal: 'ALLOW_SUBMIT', hiddenRequired: 'EXEMPT' },
  }))
  const sections = questions.map(question => ({
    id: question.formSectionId, title: question.formLabel, description: null,
    position: question.position, contextSection: false, items: [question],
  }))
  const scale = { id: 'scale-selected', type: 'SCALE', required: true, position: 1, scaleId: 'scale-definition' }
  const cognitive = { id: 'cognitive-selected', type: 'COGNITIVE', required: true, position: 2, cognitiveAssignmentId: 'cognitive-definition' }
  const template: any = {
    id: 'flow-task', name: 'Conditional flow', productKind: 'QUESTIONNAIRE',
    publishedAt: new Date('2026-10-18T00:00:00Z'),
    items: [questions[0], scale, cognitive, questions[1]], formSections: sections,
    trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null,
    trainingFlowDraft: null,
  }
  const condition = (value: string) => ({ op: 'EQUALS',
    field: { source: 'ANSWER', instrumentKey: trainingFlowUnitKey('section-gate'), itemKey: 'answer_gate' }, value })
  const config = compileTrainingFlow({ schemaVersion: 1, blocks: [
    { blockKey: 'gate', kind: 'INSTRUMENT', instrumentKey: trainingFlowUnitKey('section-gate') },
    { blockKey: 'selected_scale', kind: 'INSTRUMENT', instrumentKey: trainingFlowItemKey(scale.id), when: condition('yes') },
    { blockKey: 'selected_cognitive', kind: 'INSTRUMENT', instrumentKey: trainingFlowItemKey(cognitive.id), when: condition('no') },
    { blockKey: 'future_material', kind: 'MATERIAL', body: 'UNREACHED_MATERIAL_SECRET' },
    { blockKey: 'future', kind: 'INSTRUMENT', instrumentKey: trainingFlowUnitKey('section-future') },
  ] }, buildTrainingFlowUnits(template))
  template.trainingFlowFrozen = config
  template.trainingFlowDigest = config.flowDigest
  const candidateSlots: FrozenActiveSlotV1[] = [
    ...sections.map(section => ({ slotKey: `form-section:${section.id}`, unitType: 'FORM_SECTION' as const, required: true,
      sourceDefinitionIdentity: { key: section.id, version: 'FORM_SECTION_V3', hash: canonicalHash(mapCompositeSection(section)) },
      sourceBinding: { sectionId: section.id } })),
    { slotKey: `scale:${scale.id}`, unitType: 'SCALE', required: true,
      sourceDefinitionIdentity: { key: 'scale-definition', version: '1', hash: 'a'.repeat(64) },
      sourceBinding: { compositeItemId: scale.id, compiledRuntimeHash: 'a'.repeat(64) } },
    { slotKey: `cognitive:${cognitive.id}`, unitType: 'COGNITIVE', required: true,
      sourceDefinitionIdentity: { key: 'cognitive-definition', version: '1', hash: 'b'.repeat(64) },
      sourceBinding: { compositeItemId: cognitive.id, compiledRuntimeHash: 'b'.repeat(64) } },
  ]
  const rows: any[] = [], attempts: any[] = []
  const frozenSlotSets = new Map<string, ReturnType<typeof createFrozenActiveSlotSet>>()
  for (const spec of specs) {
    const epoch = spec.epoch ?? 1
    const slots = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: epoch, slots: candidateSlots })
    const snapshot = { schemaVersion: 1, compositeId: template.id, publishedAt: template.publishedAt.toISOString(),
      attemptId: spec.id, attemptEpoch: epoch, flowDigest: config.flowDigest, unionDigest: config.unionDigest, slotSetHash: slots.snapshotHash }
    const parent: any = {
      id: spec.id, compositeAssessmentId: template.id, attemptEpoch: epoch, participantKey: `participant-${spec.id}`,
      runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', status: 'IN_PROGRESS', contextSnapshotHash: null,
      trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
      trainingFlowSnapshotEncrypted: encryptUnifiedRuntimePayload(snapshot), trainingFlowSnapshotHash: canonicalHash(snapshot),
      trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
      frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash,
    }
    const row = {
      id: `snapshot-${spec.id}`, compositeAttemptId: spec.id, attemptEpoch: epoch,
      slotKey: 'form-section:section-gate', unitType: 'FORM_SECTION', terminalState: 'COMPLETED', payloadKind: 'COLLECTION_FACTS',
      sourceType: 'COMPOSITE_FORM_SECTION', sourceAttemptId: `section-attempt-${spec.id}`, sourceSubmissionId: `submission-${spec.id}`,
      sourceDefinitionHash: candidateSlots[0].sourceDefinitionIdentity.hash, compiledRuntimeHash: null,
      canonicalResultEncrypted: null,
      collectionFactsEncrypted: encryptUnifiedRuntimePayload({ schemaVersion: 3, sectionKey: 'section-gate',
        items: [{ key: 'question-gate', label: 'Question gate', value: spec.answer, state: 'ANSWERED' }] }),
    }
    const proof = await resolveTrainingFlowScope(parent, template, { db, frozenSlots: slots, snapshotRows: [row], allowAdvance: true })
    parent.trainingFlowPathEncrypted = encryptUnifiedRuntimePayload(proof!.evidence)
    parent.trainingFlowPathHash = proof!.pathHash
    frozenSlotSets.set(spec.id, slots)
    rows.push(row)
    attempts.push(parent)
  }
  template.attempts = attempts
  db.compositeAssessment.findUnique.mockResolvedValue(template)
  db.assessmentUnitSnapshot.findMany.mockResolvedValue(rows)
  return { template, attempts, rows, frozenSlotSets }
}

describe('training flow safe collection report provenance', () => {
  it.each(['participant', 'teacher', 'researcher'] as const)('projects only the safe summary for %s without AST, candidates or accepted payloads', async audience => {
    const { template, attempts, frozenSlotSets } = await fixture()
    const scope = await resolveTrainingAttemptScope(attempts[0], template, { db: db as any, frozenSlotSets })
    const safe = trainingFlowProvenance(scope.flow!)
    const report = {
      productKind: 'QUESTIONNAIRE', unitReports: [], backgroundValues: [],
      trainingFlow: { ...safe, config: scope.flow!.config, path: scope.flow!.path,
        candidateSlots: scope.flow!.frozenSlots.slots, acceptedSnapshots: scope.flow!.snapshots,
        futureSensitiveField: 'MUST_NOT_LEAK' },
    }
    const before = JSON.stringify(report)
    const projected = projectCompositeCollectionReport(report, audience)
    expect(projected.trainingFlow).toEqual(safe)
    expect(projected.trainingFlow).not.toBe(report.trainingFlow)
    expect(Object.keys(projected.trainingFlow).sort()).toEqual([
      'configDigest', 'executedUnitCount', 'pathHash', 'schemaVersion', 'skippedUnitCount', 'taskSatisfaction', 'termination',
    ])
    expect(projected.trainingFlow).toMatchObject({ executedUnitCount: 1, skippedUnitCount: 0, termination: 'PENDING', taskSatisfaction: 'PENDING' })
    for (const secret of ['MUST_NOT_LEAK', 'UNREACHED_MATERIAL_SECRET', 'section-future', 'cognitive-selected', 'answer_gate', 'collectionFactsEncrypted']) {
      expect(JSON.stringify(projected)).not.toContain(secret)
    }
    expect(JSON.stringify(report)).toBe(before)
  })

  it.each([undefined, null])('does not invent flow provenance for a legacy %s report', trainingFlow => {
    const result = projectCompositeCollectionReport({ productKind: 'QUESTIONNAIRE', unitReports: [], trainingFlow }, 'participant')
    expect(result).not.toHaveProperty('trainingFlow')
  })
})

describe('request-local verified flow scope binding', () => {
  it('reuses one verified scope for the same row identity and projects only reached children without a second snapshot query', async () => {
    const { template, attempts, frozenSlotSets } = await fixture()
    const parent = { ...attempts[0], compositeAssessment: template }
    const scope = await resolveTrainingAttemptScope(parent, template, { db: db as any, frozenSlotSets })
    expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
    const analysisCopy = { ...parent,
      scaleAssessments: [{ compositeItemId: 'scale-selected' }, { compositeItemId: 'future-scale' }],
      cognitiveSessions: [{ compositeItemId: 'cognitive-selected' }],
      formSectionAttempts: [{ sectionId: 'section-gate' }, { sectionId: 'section-future' }],
    }
    const projected = await applyTrainingAttemptScope(analysisCopy, { db: db as any, frozenSlotSets, verifiedScope: scope })
    expect(projected.compositeAssessment.items.map((item: any) => item.id)).toEqual(['question-gate', 'scale-selected'])
    expect(projected.compositeAssessment.formSections.map((section: any) => section.id)).toEqual(['section-gate'])
    expect(projected.scaleAssessments).toEqual([{ compositeItemId: 'scale-selected' }])
    expect(projected.cognitiveSessions).toEqual([])
    expect(projected.formSectionAttempts).toEqual([{ sectionId: 'section-gate' }])
    expect(projected.trainingFlowScope).toBe(scope.flow)
    expect(await resolveTrainingAttemptScope(projected)).toBe(scope)
    expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
    expect(analysisCopy.cognitiveSessions).toHaveLength(1)
    expect(template.items).toHaveLength(4)
    expect(frozenSlotSets.get(parent.id)!.slots).toHaveLength(4)
  })

  it.each([
    ['attempt ID', { id: 'different-attempt' }],
    ['attempt epoch', { attemptEpoch: 2 }],
    ['slot-set hash', { frozenActiveSlotSetHash: 'f'.repeat(64) }],
    ['context hash', { contextSnapshotHash: 'f'.repeat(64) }],
    ['flow snapshot hash', { trainingFlowSnapshotHash: 'f'.repeat(64) }],
    ['path hash', { trainingFlowPathHash: 'f'.repeat(64) }],
  ])('rejects a verified scope reused after %s changes before any second fact read', async (_label, patch) => {
    const { template, attempts, frozenSlotSets } = await fixture()
    const parent = { ...attempts[0], compositeAssessment: template }
    const scope = await resolveTrainingAttemptScope(parent, template, { db: db as any, frozenSlotSets })
    await expect(applyTrainingAttemptScope({ ...parent, ...patch }, { db: db as any, verifiedScope: scope })).rejects.toThrow('scope绑定')
    expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
  })

  it('rejects configuration digest drift on both explicit reuse and the same-object cache', async () => {
    const { template, attempts, frozenSlotSets } = await fixture()
    const parent = { ...attempts[0], compositeAssessment: template }
    const scope = await resolveTrainingAttemptScope(parent, template, { db: db as any, frozenSlotSets })
    template.trainingFlowDigest = 'f'.repeat(64)
    await expect(applyTrainingAttemptScope({ ...parent }, { verifiedScope: scope })).rejects.toThrow('scope绑定')
    await expect(resolveTrainingAttemptScope(parent)).rejects.toThrow('scope绑定')
    expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
  })

  it('does not treat a copied scope object as verified proof', async () => {
    const { template, attempts, frozenSlotSets } = await fixture()
    const parent = { ...attempts[0], compositeAssessment: template }
    const scope = await resolveTrainingAttemptScope(parent, template, { db: db as any, frozenSlotSets })
    await expect(applyTrainingAttemptScope({ ...parent }, { verifiedScope: { ...scope } })).rejects.toThrow('scope绑定')
    expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['task ID', { id: 'different-task' }],
    ['publication', { publishedAt: new Date('2026-10-19T00:00:00Z') }],
  ])('rejects a verified scope attached to another %s', async (_label, patch) => {
    const { template, attempts, frozenSlotSets } = await fixture()
    const parent = { ...attempts[0], compositeAssessment: template }
    const scope = await resolveTrainingAttemptScope(parent, template, { db: db as any, frozenSlotSets })
    await expect(applyTrainingAttemptScope({ ...parent, compositeAssessment: { ...template, ...patch } }, { verifiedScope: scope })).rejects.toThrow()
    expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
  })
})

describe('training flow export graph batches and selected-set grouping', () => {
  const specs: AttemptSpec[] = [
    { id: 'yes-1', answer: 'yes' }, { id: 'yes-2', answer: 'yes' },
    { id: 'no-1', answer: 'no' }, { id: 'no-2', answer: 'no' },
    { id: 'yes-epoch-2', answer: 'yes', epoch: 2 }, { id: 'no-epoch-2', answer: 'no', epoch: 2 },
  ]

  it('reads current-epoch accepted snapshots once for every parent, grouping equal reached selections rather than unique path hashes', async () => {
    const { template, attempts } = await fixture(specs)
    expect(new Set(attempts.map(attempt => attempt.trainingFlowPathHash)).size).toBe(6)
    const scaleRows = ['yes-1', 'yes-2', 'yes-epoch-2'].map(id => ({ id: `scale-${id}`, compositeAttemptId: id, compositeItemId: 'scale-selected' }))
    const cognitiveRows = ['no-1', 'no-2', 'no-epoch-2'].map(id => ({ id: `cognitive-${id}`, compositeAttemptId: id, compositeItemId: 'cognitive-selected' }))
    const formRows = attempts.map(attempt => ({ id: `answer-${attempt.id}`, attemptId: attempt.id, itemId: 'question-gate' }))
    db.assessment.findMany.mockResolvedValue(scaleRows)
    db.cognitiveSession.findMany.mockResolvedValue(cognitiveRows)
    db.compositeFormAnswer.findMany.mockResolvedValue(formRows)
    const graph = await loadTrainingVariantExportGraph(template.id, { deliveryCourseId: 'course' }, {}, false, db as any)
    expect(graph!.scopes.size).toBe(6)
    expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledExactlyOnceWith({ where: {
      OR: attempts.map(attempt => ({ compositeAttemptId: attempt.id, attemptEpoch: attempt.attemptEpoch })),
    } })
    expect(db.assessment.findMany.mock.calls[0][0].where).toEqual({ OR: [
      { compositeAttemptId: { in: ['yes-1', 'yes-2'] }, attemptEpoch: 1, compositeItemId: { in: ['scale-selected'] } },
      { compositeAttemptId: { in: ['yes-epoch-2'] }, attemptEpoch: 2, compositeItemId: { in: ['scale-selected'] } },
    ] })
    expect(db.cognitiveSession.findMany.mock.calls[0][0].where).toEqual({ OR: [
      { compositeAttemptId: { in: ['no-1', 'no-2'] }, attemptNo: 1, compositeItemId: { in: ['cognitive-selected'] } },
      { compositeAttemptId: { in: ['no-epoch-2'] }, attemptNo: 2, compositeItemId: { in: ['cognitive-selected'] } },
    ] })
    expect(db.compositeFormAnswer.findMany.mock.calls[0][0].where).toEqual({ OR: [
      { attemptId: { in: ['yes-1', 'yes-2'] }, itemId: { in: ['question-gate'] } },
      { attemptId: { in: ['no-1', 'no-2'] }, itemId: { in: ['question-gate'] } },
      { attemptId: { in: ['yes-epoch-2'] }, itemId: { in: ['question-gate'] } },
      { attemptId: { in: ['no-epoch-2'] }, itemId: { in: ['question-gate'] } },
    ] })
    for (const attempt of graph!.template.attempts) {
      expect(attempt.scaleAssessments).toEqual(scaleRows.filter(row => row.compositeAttemptId === attempt.id))
      expect(attempt.cognitiveSessions).toEqual(cognitiveRows.filter(row => row.compositeAttemptId === attempt.id))
      expect(attempt.formAnswers).toEqual(formRows.filter(row => row.attemptId === attempt.id))
    }
    expect(template.items).toHaveLength(4)
    expect(template.formSections).toHaveLength(2)
    expect(db.assessment.findMany).toHaveBeenCalledTimes(1)
    expect(db.cognitiveSession.findMany).toHaveBeenCalledTimes(1)
    expect(db.compositeFormAnswer.findMany).toHaveBeenCalledTimes(1)
  })

  it('keeps headers-only analysis scope batched and reads no native children or legacy Form answers', async () => {
    const { template, attempts } = await fixture(specs)
    const graph = await loadTrainingVariantExportGraph(template.id, {}, {}, true, db as any)
    expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
    expect(graph!.scopes.size).toBe(attempts.length)
    for (const attempt of attempts) {
      const scope = graph!.scopes.get(attempt.id)!
      const projected = await applyTrainingAttemptScope({ ...attempt, compositeAssessment: template },
        { db: db as any, frozenSlotSets: graph!.frozenSlotSets, verifiedScope: scope })
      expect(projected.compositeAssessment.items.map((item: any) => item.id)).toEqual([
        'question-gate', attempt.id.startsWith('yes') ? 'scale-selected' : 'cognitive-selected',
      ])
    }
    expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
    expect(db.assessment.findMany).not.toHaveBeenCalled()
    expect(db.cognitiveSession.findMany).not.toHaveBeenCalled()
    expect(db.compositeFormAnswer.findMany).not.toHaveBeenCalled()
  })

  it('rejects stale-epoch accepted facts before reading any selected child payload', async () => {
    const { template, rows } = await fixture(specs)
    rows[0].attemptEpoch = 2
    await expect(loadTrainingVariantExportGraph(template.id, {}, {}, false, db as any)).rejects.toThrow()
    expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
    expect(db.assessment.findMany).not.toHaveBeenCalled()
    expect(db.cognitiveSession.findMany).not.toHaveBeenCalled()
    expect(db.compositeFormAnswer.findMany).not.toHaveBeenCalled()
  })
})
