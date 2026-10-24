import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { emptyOptionalReportRelations, OPTIONAL_REPORT_RELATIONS } from '../../modules/composite/composite-report-read-plan'

const fixture = () => {
  const slots = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
    slots: [{ slotKey: 'scale:one', unitType: 'SCALE', required: true, sourceDefinitionIdentity: { key: 'scale', version: '1', hash: 'a'.repeat(64) }, sourceBinding: {} }] })
  return { status: 'COMPLETED', runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', attemptEpoch: 1,
    trainingFlowSnapshotEncrypted: null, trainingFlowSnapshotHash: null, trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
    trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
    frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash,
    _count: { cognitiveSessions: 0, situationalAttempts: 0, formAnswers: 0, formSectionAttempts: 0 },
    compositeAssessment: { productKind: 'QUESTIONNAIRE', items: [{ type: 'SCALE' }], formSections: [],
      trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null,
      trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null } } as any
}
beforeEach(() => { vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64)); vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', 'false') })
describe('completed report empty-relation read plan', () => {
  it('skips four empty relations only with valid frozen authority and exact zero counts', async () => {
    expect([...await emptyOptionalReportRelations(fixture())]).toEqual([...OPTIONAL_REPORT_RELATIONS])
  })
  it.each(OPTIONAL_REPORT_RELATIONS)('loads unexpected existing %s rows despite a scale-only manifest', async relation => {
    const row = fixture(); row._count[relation] = 1
    expect((await emptyOptionalReportRelations(row)).has(relation)).toBe(false)
  })
  it.each([undefined, null, '0', -1, NaN])('never treats an absent or invalid count as zero: %s', async count => {
    const row = fixture(); row._count = Object.fromEntries(OPTIONAL_REPORT_RELATIONS.map(key => [key, count]))
    expect((await emptyOptionalReportRelations(row)).size).toBe(0)
  })
  it.each([{ status: 'IN_PROGRESS' }, { runtimeGeneration: null }, { deliveryMode: 'INCREMENTAL' },
    { attemptEpoch: 2 }, { frozenActiveSlotSetHash: 'b'.repeat(64) }, { frozenActiveSlotSetEncrypted: 'corrupt' },
    { frozenActiveSlotSetEncrypted: null }, { trainingVariantAllocationHash: 'configured' },
    { trainingFlowSnapshotHash: 'configured' }, { trainingFlowPathHash: undefined }])('retains full reads for unsupported or unverifiable authority %j', async patch => {
    expect((await emptyOptionalReportRelations({ ...fixture(), ...patch })).size).toBe(0)
  })
  it('does not skip declared mixed modules even if their counts are zero', async () => {
    const row = fixture(); row.compositeAssessment.items.push({ type: 'COGNITIVE' }, { type: 'SITUATIONAL' }, { type: 'FORM' })
    expect((await emptyOptionalReportRelations(row)).size).toBe(0)
  })
  it('does not skip a frozen module absent from the current mutable definition', async () => {
    const row = fixture(); const slots = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
      slots: [{ slotKey: 'cognitive:one', unitType: 'COGNITIVE', required: false, sourceDefinitionIdentity: { key: 'cognitive', version: '1', hash: 'a'.repeat(64) }, sourceBinding: {} }] })
    row.frozenActiveSlotSetEncrypted = encryptFrozenActiveSlotSet(slots); row.frozenActiveSlotSetHash = slots.snapshotHash
    expect((await emptyOptionalReportRelations(row)).has('cognitiveSessions')).toBe(false)
  })
  it('retains full reads for historical products and missing definition markers', async () => {
    const row = fixture(); row.compositeAssessment.productKind = 'LEGACY_COMPOSITE'
    expect((await emptyOptionalReportRelations(row)).size).toBe(0)
    row.compositeAssessment.productKind = 'QUESTIONNAIRE'; delete row.compositeAssessment.trainingVariantDraft
    expect((await emptyOptionalReportRelations(row)).size).toBe(0)
  })
})
