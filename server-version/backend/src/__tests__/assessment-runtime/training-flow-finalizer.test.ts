import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  global: { $transaction: vi.fn(), compositeAssessmentAttempt: { findUnique: vi.fn() }, assessmentUnitSnapshot: { findMany: vi.fn() } },
  tx: { $queryRaw: vi.fn(), compositeAssessmentAttempt: { findUnique: vi.fn(), update:vi.fn(), updateMany: vi.fn() },
    assessmentUnitSnapshot: { findMany: vi.fn(), create: vi.fn() }, compositeReportJob: { update: vi.fn() } },
}))
vi.mock('../../config/database', () => ({ prisma: mocks.global }))
import { compileTrainingFlow, trainingFlowUnitKey, trainingFlowItemKey } from '../../modules/assessment-core/flow/training'
import { buildTrainingFlowUnits } from '../../modules/composite/training-flow-definition'
import { resolveTrainingFlowScope } from '../../modules/composite/training-flow-scope'
import { mapCompositeSection } from '../../modules/assessment-runtime/form-section-definition'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet, type FrozenActiveSlotV1 } from '../../modules/assessment-runtime/slot-set'
import { encryptUnifiedRuntimePayload, decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { createCanonicalUnitResultEnvelope } from '../../modules/assessment-runtime/unit-result'
import { finalizeCompositeAttemptUnifiedIfReady } from '../../modules/assessment-runtime/unified-aggregate-finalizer.service'
import { enqueueCompositeReportForUnit } from '../../modules/assessment-runtime/report-outbox.service'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'e'.repeat(64))
  mocks.global.$transaction.mockImplementation(async operation => operation(mocks.tx))
  mocks.tx.$queryRaw.mockResolvedValue([{ id: 'parent' }])
  mocks.tx.compositeAssessmentAttempt.updateMany.mockResolvedValue({ count: 1 })
})
async function fixture(options: { termination?: 'SCREEN_OUT' | 'COMPLETE_EARLY'; refused?: boolean; sjt?: 'valid' | 'invalid' | 'empty' | 'refused' } = {}) {
  const items: any[] = [0, 1].map(index => ({ id: `item-${index}`, type: 'FORM', position: index * 2,
    formSectionId: `section-${index}`, formSectionPosition: 0, formType: 'single_choice', formLabel: `Question ${index}`,
    required: true, formOptions: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
    formDefinition: { itemKey: `item_${index}`, type: 'SINGLE', prompt: `Question ${index}`,
      required: true, allowRefusal: true, options: [{ optionKey: 'yes', label: 'Yes' }, { optionKey: 'no', label: 'No' }], rows: [] },
    formPolicy: { version: 3, requiredRefusal: 'ALLOW_SUBMIT', hiddenRequired: 'EXEMPT' } }))
  const sections = items.map((item, index) => ({ id: `section-${index}`, title: `Section ${index}`, description: null,
    position: index * 2, contextSection: false, items: [item] }))
  if (options.sjt) items.push({ id: 'sjt', type: 'SITUATIONAL', required: true, position: 1,
    situationalInstrumentKey: 'test-sjt', situationalInstrumentVersion: '1' })
  const composite: any = { id: 'composite', productKind: 'QUESTIONNAIRE', publishedAt: new Date('2026-10-18T00:00:00Z'),
    trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null,
    trainingFlowDraft: null, items, formSections: sections }
  const config = compileTrainingFlow({ schemaVersion: 1, blocks: [
    { blockKey: 'first', kind: 'INSTRUMENT', instrumentKey: trainingFlowUnitKey('section-0') },
    ...(options.sjt ? [{ blockKey: 'sjt_block', kind: 'INSTRUMENT', instrumentKey: trainingFlowItemKey('sjt') }] : []),
    { blockKey: 'finish', kind: 'END', termination: options.termination ?? 'COMPLETE_EARLY',
      when: { op: options.refused ? 'IS_MISSING' : 'EQUALS', field: { source: 'ANSWER', instrumentKey: trainingFlowUnitKey('section-0'), itemKey: 'item_0' }, ...(options.refused ? {} : { value: 'yes' }) } },
    { blockKey: 'future', kind: 'INSTRUMENT', instrumentKey: trainingFlowUnitKey('section-1') },
  ] }, buildTrainingFlowUnits(composite))
  composite.trainingFlowFrozen = config; composite.trainingFlowDigest = config.flowDigest
  const candidateSlots: FrozenActiveSlotV1[] = sections.map(section => ({ slotKey: `form-section:${section.id}`, unitType: 'FORM_SECTION', required: true,
    sourceDefinitionIdentity: { key: section.id, version: 'FORM_SECTION_V3', hash: canonicalHash(mapCompositeSection(section)) }, sourceBinding: { sectionId: section.id } }))
  const hash = 'a'.repeat(64)
  if (options.sjt) candidateSlots.push({ slotKey: 'situational:sjt', unitType: 'SITUATIONAL', required: true,
    sourceDefinitionIdentity: { key: 'test-sjt', version: '1', hash }, sourceBinding: { compositeItemId: 'sjt', compiledRuntimeHash: hash },
    runtimeIdentity: { instrumentKey: 'test-sjt', instrumentVersion: '1', definitionHash: hash, compiledRuntimeHash: hash,
      scorerKey: 'sjt', scoringVersion: '1', runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', frozenAt: composite.publishedAt.toISOString() } })
  const slots = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: candidateSlots })
  const snapshot = { schemaVersion: 1, compositeId: composite.id, publishedAt: composite.publishedAt.toISOString(), attemptId: 'parent', attemptEpoch: 1,
    flowDigest: config.flowDigest, unionDigest: config.unionDigest, slotSetHash: slots.snapshotHash }
  const parent: any = { id: 'parent', status: 'IN_PROGRESS', runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY',
    attemptEpoch: 1, asyncReportEpoch: 1, participantKey: 'student', startedAt: composite.publishedAt, completedAt: null, progress: 0, completedItems: 0,
    contextSnapshotEncrypted: null, contextSnapshotHash: null, compiledBundleRuntimeHash: null, aggregateInputHash: null,
    trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
    trainingFlowSnapshotEncrypted: encryptUnifiedRuntimePayload(snapshot), trainingFlowSnapshotHash: canonicalHash(snapshot),
    trainingFlowPathEncrypted: null, trainingFlowPathHash: null, frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots),
    frozenActiveSlotSetHash: slots.snapshotHash, compositeAssessment: composite,
    formSectionAttempts: [{ sectionId: 'section-0', attemptEpoch: 1, status: 'COMPLETED', taskSatisfaction: options.refused ? 'NOT_SATISFIED' : 'SATISFIED' }] }
  const facts = { schemaVersion: 3, sectionKey: 'section-0', items: [{ key: 'item-0', label: 'Question 0',
    value: options.refused ? null : 'yes', state: options.refused ? 'REFUSED' : 'ANSWERED' }] }
  const rows: any[] = [{ id: 'snapshot', compositeAttemptId: parent.id, attemptEpoch: 1, slotKey: 'form-section:section-0', unitType: 'FORM_SECTION',
    terminalState: 'COMPLETED', payloadKind: 'COLLECTION_FACTS', sourceType: 'COMPOSITE_FORM_SECTION', sourceAttemptId: 'section-attempt', sourceSubmissionId: 'submission',
    sourceDefinitionHash: candidateSlots[0].sourceDefinitionIdentity.hash, compiledRuntimeHash: null, completedAt: new Date('2026-10-18T00:01:00Z'),
    canonicalResultEncrypted: null, collectionFactsEncrypted: encryptUnifiedRuntimePayload(facts) }]
  if (options.sjt) {
    const core: any = { schemaVersion: 1, unitType: 'SITUATIONAL', instrumentKey: 'test-sjt', instrumentVersion: '1', sourceDefinitionHash: hash,
      compilerVersion: '1', compiledRuntimeHash: hash, scorerKey: 'sjt', scorerVersion: '1', contextHash: null,
      quality: { status: options.sjt === 'invalid' ? 'invalid' : 'interpretable', flags: options.sjt === 'refused' ? ['sjt_online_response_v1', 'sjt_online_task_not_satisfied'] : [] },
      metrics: [{ key: 'score', value: options.sjt === 'empty' ? null : 1, quality: options.sjt === 'empty' ? 'not_calculable' : 'calculated' }],
      facts: [], references: [], scientificProvenance: { instrumentKey: 'test-sjt', instrumentVersion: '1' } }
    const envelope = createCanonicalUnitResultEnvelope({ core, completedAt: '2026-10-18T00:02:00Z',
      persistenceProvenance: { sourceType: 'SITUATIONAL_ATTEMPT', sourceAttemptId: 'sjt-attempt', sourceSubmissionId: 'sjt-submit' } })
    rows.push({ id: 'sjt-snapshot', compositeAttemptId: parent.id, attemptEpoch: 1, slotKey: 'situational:sjt', unitType: 'SITUATIONAL', terminalState: 'COMPLETED',
      payloadKind: 'UNIT_RESULT', sourceType: 'SITUATIONAL_ATTEMPT', sourceAttemptId: 'sjt-attempt', sourceSubmissionId: 'sjt-submit', sourceDefinitionHash: hash,
      compiledRuntimeHash: hash, completedAt: new Date(envelope.completedAt), canonicalResultEncrypted: encryptUnifiedRuntimePayload(envelope), collectionFactsEncrypted: null })
  }
  mocks.tx.compositeAssessmentAttempt.findUnique.mockResolvedValue(parent)
  mocks.tx.assessmentUnitSnapshot.findMany.mockResolvedValue(rows)
  const proof=await resolveTrainingFlowScope(parent,composite,{db:mocks.tx,snapshotRows:rows,frozenSlots:slots,allowAdvance:true})
  parent.trainingFlowPathEncrypted=encryptUnifiedRuntimePayload(proof!.evidence);parent.trainingFlowPathHash=proof!.pathHash
  mocks.tx.compositeAssessmentAttempt.update.mockImplementation(async({data})=>{Object.assign(parent,data);return parent})
  return { parent, rows, slots, config }
}

describe('transaction-bound training flow finalization', () => {
  it('atomically freezes actual path and completes once without rewriting candidate slots or inventing snapshots', async () => {
    const f = await fixture(), before = JSON.stringify({ slots: f.slots, rows: f.rows })
    mocks.tx.compositeAssessmentAttempt.updateMany.mockImplementation(async ({ data }) => { Object.assign(f.parent, data); return { count: 1 } })
    const result = await finalizeCompositeAttemptUnifiedIfReady(f.parent.id, f.parent)
    expect(result).toMatchObject({ status: 'COMPLETED', taskSatisfaction: 'SATISFIED', progress: 100 })
    const data = mocks.tx.compositeAssessmentAttempt.updateMany.mock.calls[0][0].data
    const evidence: any = decryptUnifiedRuntimePayload(data.trainingFlowPathEncrypted)
    expect(canonicalHash(evidence)).toBe(data.trainingFlowPathHash)
    expect(evidence.path).toMatchObject({ termination: 'COMPLETE_EARLY', acceptedInstrumentKeys: [trainingFlowUnitKey('section-0')] })
    expect(data).toMatchObject({ completedItems: 1, completedAt: new Date('2026-10-18T00:01:00Z') })
    expect(data).not.toHaveProperty('frozenActiveSlotSetEncrypted')
    expect(JSON.stringify({ slots: f.slots, rows: f.rows })).toBe(before)
    expect(mocks.tx.assessmentUnitSnapshot.create).not.toHaveBeenCalled()
    expect(mocks.tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE')
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.compositeAssessmentAttempt.findUnique.mock.invocationCallOrder[0])
    expect(mocks.global.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
    expect(mocks.global.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
    const replay = await finalizeCompositeAttemptUnifiedIfReady(f.parent.id, f.parent)
    expect(replay).toMatchObject({ status: 'COMPLETED', taskSatisfaction: 'SATISFIED' })
    expect(mocks.tx.compositeAssessmentAttempt.updateMany).toHaveBeenCalledTimes(1)
  })
  it('screens out with NOT_SATISFIED even with valid measurement', async () => {
    const f = await fixture({ termination: 'SCREEN_OUT' })
    expect(await finalizeCompositeAttemptUnifiedIfReady(f.parent.id, f.parent)).toMatchObject({ status: 'COMPLETED', taskSatisfaction: 'NOT_SATISFIED' })
  })
  it('keeps required Form refusal unsatisfied after an early end', async () => {
    const f = await fixture({ refused: true })
    expect(await finalizeCompositeAttemptUnifiedIfReady(f.parent.id, f.parent)).toMatchObject({ status: 'COMPLETED', taskSatisfaction: 'NOT_SATISFIED' })
  })
  it.each(['invalid', 'empty', 'refused'] as const)('does not upgrade %s required SJT because a prior Form is valid', async sjt => {
    const f = await fixture({ sjt })
    expect(await finalizeCompositeAttemptUnifiedIfReady(f.parent.id, f.parent)).toMatchObject({ status: 'COMPLETED', taskSatisfaction: 'NOT_SATISFIED' })
  })
  it('allows valid required SJT and Form evidence to qualify', async () => {
    const f = await fixture({ sjt: 'valid' })
    expect(await finalizeCompositeAttemptUnifiedIfReady(f.parent.id, f.parent)).toMatchObject({ status: 'COMPLETED', taskSatisfaction: 'SATISFIED' })
  })
  it('leaves a current pending unit open, with no terminal path write', async () => {
    const f = await fixture({ sjt: 'valid' }); f.rows.pop();f.parent.trainingFlowPathEncrypted=null;f.parent.trainingFlowPathHash=null;const proof=await resolveTrainingFlowScope(f.parent,f.parent.compositeAssessment,{db:mocks.tx,allowAdvance:true});f.parent.trainingFlowPathEncrypted=encryptUnifiedRuntimePayload(proof!.evidence);f.parent.trainingFlowPathHash=proof!.pathHash
    expect(await finalizeCompositeAttemptUnifiedIfReady(f.parent.id, f.parent)).toMatchObject({ status: 'IN_PROGRESS', progress: 50 })
    const data = mocks.tx.compositeAssessmentAttempt.updateMany.mock.calls[0][0].data
    expect(data).not.toHaveProperty('trainingFlowPathHash'); expect(data).not.toHaveProperty('aggregateInputHash')
  })
  it('rejects injected future facts before any completion update', async () => {
    const f = await fixture()
    f.rows.push({ ...f.rows[0], id: 'future-snapshot', slotKey: 'form-section:section-1', sourceAttemptId: 'future-section-attempt',
      sourceDefinitionHash: f.slots.slots[1].sourceDefinitionIdentity.hash,
      collectionFactsEncrypted: encryptUnifiedRuntimePayload({ schemaVersion: 3, sectionKey: 'section-1',
        items: [{ key: 'item-1', label: 'Question 1', value: 'yes', state: 'ANSWERED' }] }) })
    await expect(finalizeCompositeAttemptUnifiedIfReady(f.parent.id, f.parent)).rejects.toBeTruthy()
    expect(mocks.tx.compositeAssessmentAttempt.updateMany).not.toHaveBeenCalled()
  })
  it('coalesces early-path outbox notifications in the existing job and reserves one budget permit', async () => {
    const f = await fixture(); let budgetHeld = false; let budgetReservations = 0
    mocks.tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = strings.join('')
      if (sql.includes('INSERT INTO "composite_report_jobs"')) return [{ id: 'job', status: 'WAITING', budgetHeld }]
      if (sql.includes('UPDATE "composite_report_queue_budget"')) { budgetReservations++; return [{ pending: 1 }] }
      return [{ id: 'parent' }]
    })
    mocks.tx.compositeReportJob.update.mockImplementation(async () => { budgetHeld = true; return { id: 'job' } })
    expect(await enqueueCompositeReportForUnit(mocks.tx as any, { compositeAttemptId: f.parent.id, attemptEpoch: 1 })).toBe('job')
    expect(await enqueueCompositeReportForUnit(mocks.tx as any, { compositeAttemptId: f.parent.id, attemptEpoch: 1 })).toBe('job')
    expect(budgetReservations).toBe(1); expect(mocks.tx.compositeReportJob.update).toHaveBeenCalledTimes(1)
    expect(mocks.tx.assessmentUnitSnapshot.create).not.toHaveBeenCalled()
    const scope = await resolveTrainingFlowScope(f.parent, f.parent.compositeAssessment, { db: mocks.tx, snapshotRows: f.rows, frozenSlots: f.slots })
    expect(scope?.executedSlotKeys.size).toBe(1); expect(f.slots.slots).toHaveLength(2)
  })
  it('keeps a pending-path job waiting until the actual last executed unit is accepted', async () => {
    const f = await fixture({ sjt: 'valid' }), last = f.rows.pop();f.parent.trainingFlowPathEncrypted=null;f.parent.trainingFlowPathHash=null
    let budgetReservations = 0
    mocks.tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = strings.join('')
      if (sql.includes('INSERT INTO "composite_report_jobs"')) return [{ id: 'job', status: 'WAITING', budgetHeld: false }]
      if (sql.includes('UPDATE "composite_report_queue_budget"')) { budgetReservations++; return [{ pending: 1 }] }
      return [{ id: 'parent' }]
    })
    await enqueueCompositeReportForUnit(mocks.tx as any, { compositeAttemptId: f.parent.id, attemptEpoch: 1 })
    expect(budgetReservations).toBe(0); expect(mocks.tx.compositeReportJob.update).not.toHaveBeenCalled()
    f.rows.push(last)
    await enqueueCompositeReportForUnit(mocks.tx as any, { compositeAttemptId: f.parent.id, attemptEpoch: 1 })
    expect(budgetReservations).toBe(1); expect(mocks.tx.compositeReportJob.update).toHaveBeenCalledTimes(1)
  })
})

describe('persisted path proof integrity',()=>{
  it.each(['cipherOnly','hashOnly','acceptedMissing','completedMissing','changedCipher','changedHeader','changedContext'])('rejects %s on normal reads',async mode=>{
    const f=await fixture()
    if(mode==='cipherOnly')f.parent.trainingFlowPathHash=null
    if(mode==='hashOnly')f.parent.trainingFlowPathEncrypted=null
    if(mode==='acceptedMissing'||mode==='completedMissing'){f.parent.trainingFlowPathEncrypted=null;f.parent.trainingFlowPathHash=null}
    if(mode==='completedMissing')f.parent.status='COMPLETED'
    if(mode==='changedCipher')f.rows[0].collectionFactsEncrypted=encryptUnifiedRuntimePayload({schemaVersion:3,sectionKey:'section-0',items:[]})
    if(mode==='changedHeader')f.rows[0].sourceAttemptId='foreign-attempt'
    if(mode==='changedContext')f.parent.contextSnapshotHash='foreign-context'
    await expect(resolveTrainingFlowScope(f.parent,f.parent.compositeAssessment,{db:mocks.tx,snapshotRows:f.rows,frozenSlots:f.slots})).rejects.toThrow()
  })
  it('persists a nonterminal proof in the same supplied transaction before waiting',async()=>{
    const f=await fixture({sjt:'valid'});f.rows.pop();f.parent.trainingFlowPathEncrypted=null;f.parent.trainingFlowPathHash=null
    mocks.tx.$queryRaw.mockImplementation(async(strings:TemplateStringsArray)=>strings.join('').includes('INSERT INTO "composite_report_jobs"')?[{id:'job',status:'WAITING',budgetHeld:false}]:[{id:'parent'}])
    await enqueueCompositeReportForUnit(mocks.tx as any,{compositeAttemptId:f.parent.id,attemptEpoch:1})
    expect(mocks.tx.compositeAssessmentAttempt.update).toHaveBeenCalledTimes(1)
    const proof=await resolveTrainingFlowScope(f.parent,f.parent.compositeAssessment,{db:mocks.tx,snapshotRows:f.rows,frozenSlots:f.slots})
    expect(proof?.terminal).toBe(false);expect(proof?.path.currentInstrumentKey).toBe(trainingFlowItemKey('sjt'))
    expect(f.parent.trainingFlowPathHash).toBe(proof?.pathHash)
  })
})
