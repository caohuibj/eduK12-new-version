import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ parent: vi.fn(), headers: vi.fn(), scale: vi.fn(), cognitive: vi.fn(), scaleRuntime: vi.fn(), scaleAdmission: vi.fn(), cognitiveAdmission: vi.fn(), cognitiveConfig: vi.fn(), sjtRuntime: vi.fn(), sjtResponse: vi.fn(), finalize: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { compositeAssessmentAttempt: { findUnique: mocks.parent }, assessmentUnitSnapshot: { findMany: mocks.headers }, assessment: { findUnique: mocks.scale }, cognitiveSession: { findUnique: mocks.cognitive } } }))
vi.mock('../../modules/scale/scale-admission.service', async () => ({ ...await vi.importActual('../../modules/scale/scale-admission.service'), loadScaleAdmissionRuntime: mocks.scaleRuntime, ensureScaleAdmissionAtDelivery: mocks.scaleAdmission }))
vi.mock('../../modules/cognitive/cognitive-admission.service', async () => ({ ...await vi.importActual('../../modules/cognitive/cognitive-admission.service'), ensureCognitiveAdmissionAtDelivery: mocks.cognitiveAdmission }))
vi.mock('../../modules/cognitive/session.service', async () => ({ ...await vi.importActual('../../modules/cognitive/session.service'), loadCognitiveSessionConfig: mocks.cognitiveConfig }))
vi.mock('../../modules/assessment-policy/participant-feedback', async () => ({ ...await vi.importActual('../../modules/assessment-policy/participant-feedback'), isLoadedCompositeParticipantFeedbackDeferred: async () => false }))
vi.mock('../../modules/situational/situational-runtime.service', async () => ({ ...await vi.importActual('../../modules/situational/situational-runtime.service'), loadEmbeddedSituationalAttemptRuntime: mocks.sjtRuntime, situationalAttemptForResponse: mocks.sjtResponse }))
vi.mock('../../modules/situational/authoring/service', async () => ({ ...await vi.importActual('../../modules/situational/authoring/service'), projectSjtReleaseStatus: async (value: unknown) => value }))
vi.mock('../../modules/assessment-runtime/unified-aggregate-finalizer.service', async () => ({ ...await vi.importActual('../../modules/assessment-runtime/unified-aggregate-finalizer.service'), finalizeCompositeAttemptUnifiedIfReady: mocks.finalize }))
import { getAttemptState } from '../../modules/composite/composite.service'
import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'

const definitionHash = 'a'.repeat(64), runtimeHash = 'b'.repeat(64)
const relations = ['scaleAssessments', 'cognitiveSessions', 'situationalAttempts'] as const
function fixture(kind: 'SCALE' | 'COGNITIVE' | 'SITUATIONAL', completed = false) {
  const identity = { instrumentKey: 'fixture', instrumentVersion: '1', definitionHash, compiledRuntimeHash: runtimeHash, scorerKey: 'fixture', scoringVersion: '1', runtimeGeneration: 'UNIFIED_V1' as const, deliveryMode: 'FINAL_ONLY' as const, frozenAt: '2026-10-24T00:00:00.000Z' }
  const slotKey = `${kind.toLowerCase()}:item`
  const slots = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: [{ slotKey, unitType: kind, required: true, sourceDefinitionIdentity: { key: 'fixture', version: '1', hash: definitionHash }, sourceBinding: { compiledRuntimeHash: runtimeHash }, ...(kind === 'SITUATIONAL' ? { runtimeIdentity: identity } : {}) }] })
  const child = { id: 'child', compositeItemId: 'item', compositeAttemptId: 'attempt', runtimeGeneration: 'UNIFIED_V1', runtimeSnapshotEncrypted: 'runtime', compiledRuntimeHash: runtimeHash, status: 'IN_PROGRESS', assignmentId: 'assignment', testType: 'fixture', configSnapshotEncrypted: 'config', attemptNo: 1, attemptEpoch: 1, ...identity }
  const relation = kind === 'SCALE' ? 'scaleAssessments' : kind === 'COGNITIVE' ? 'cognitiveSessions' : 'situationalAttempts'
  const parent: any = { id: 'attempt', userId: 'student', status: 'IN_PROGRESS', runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', attemptEpoch: 1,
    trainingFlowSnapshotEncrypted: null, trainingFlowSnapshotHash: null, trainingFlowPathEncrypted: null, trainingFlowPathHash: null, trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
    frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash,
    compositeAssessment: { id: 'product', name: 'Fixture', productKind: 'QUESTIONNAIRE', trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null, trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null,
      formSections: [], items: [{ id: 'item', type: kind, position: 0, required: true, scale: { id: 'scale', code: 'fixture', instrumentVersion: '1', name: 'Scale' }, cognitiveAssignment: { id: 'assignment', title: 'Cognitive' }, situationalInstrumentKey: 'fixture', situationalInstrumentVersion: '1' }] },
    scaleAssessments: [], cognitiveSessions: [], situationalAttempts: [], [relation]: [child] }
  mocks.parent.mockImplementation(async ({ select }: any) => {
    const result = { ...parent }
    for (const name of relations) {
      expect(select[name].select).toEqual({ id: true, compositeItemId: true })
      expect(select[name].where).toBeUndefined()
      result[name] = parent[name].map((row: any) => Object.fromEntries(Object.keys(select[name].select).map(key => [key, row[key]])))
    }
    expect(select.scaleAssessments.orderBy).toEqual({ startedAt: 'asc' })
    expect(select.compositeAssessment.select.items.select.scale).toBeDefined()
    return result
  })
  mocks.headers.mockResolvedValue(completed ? [{ slotKey, terminalState: 'COMPLETED' }] : [])
  mocks.scale.mockResolvedValue(child); mocks.cognitive.mockResolvedValue(child)
  mocks.scaleRuntime.mockResolvedValue({ instrumentKey: 'fixture', instrumentVersion: '1', sourceDefinitionHash: definitionHash, legacyDefinitionHash: definitionHash, compiledRuntime: { compiledRuntimeHash: runtimeHash }, definition: { schemaVersion: 2, items: [], display: {}, respondentType: 'SELF' } })
  mocks.scaleAdmission.mockResolvedValue({ attemptEpoch: 1 }); mocks.cognitiveAdmission.mockResolvedValue({ attemptEpoch: 1 })
  mocks.cognitiveConfig.mockResolvedValue({ config: { trials: 10 }, snapshot: null })
  mocks.sjtRuntime.mockResolvedValue({ row: child, snapshot: identity }); mocks.sjtResponse.mockReturnValue({ instrument: { key: 'fixture' } })
  mocks.finalize.mockResolvedValue({ status: 'COMPLETED', progress: 100, completedAt: new Date('2026-10-24T00:00:00Z') })
  return { parent, child }
}
beforeEach(() => { vi.clearAllMocks(); process.env.DATA_ENCRYPTION_KEY = 'e'.repeat(64) })
describe('identity-only current-unit child summaries', () => {
  it.each(['SCALE', 'COGNITIVE', 'SITUATIONAL'] as const)('loads authoritative current %s after enforcing the summary projection', async kind => {
    const { parent, child } = fixture(kind)
    const full = await getAttemptState(parent.id, { userId: 'student' })
    const current = await getAttemptState(parent.id, { userId: 'student' }, undefined, 'current-unit')
    const { formSections: _sections, ...expected } = full
    expect(current).toEqual(expected)
    expect(current.currentItem).toMatchObject({ id: 'item', type: kind })
    if (kind === 'SCALE') { expect(mocks.scale).toHaveBeenCalledTimes(2); expect(mocks.scaleAdmission.mock.calls[0][2]).toBe(child) }
    if (kind === 'COGNITIVE') { expect(mocks.cognitive).toHaveBeenCalledTimes(2); expect(mocks.cognitiveAdmission.mock.calls[0][2]).toBe(child); expect(current.currentItem.cognitiveSession.config).toEqual({ trials: 10 }) }
    if (kind === 'SITUATIONAL') expect(mocks.sjtRuntime).toHaveBeenCalledTimes(2)
  })
  it('still repairs completion using the parent header, not a partial child runtime', async () => {
    fixture('SCALE', true)
    const result = await getAttemptState('attempt', { userId: 'student' }, undefined, 'current-unit')
    expect(result.status).toBe('COMPLETED'); expect(result.currentItem).toBeNull()
    expect(mocks.finalize).toHaveBeenCalledTimes(1)
    const [, header, , graph] = mocks.finalize.mock.calls[0]
    expect(header.scaleAssessments).toEqual([{ id: 'child', compositeItemId: 'item' }]); expect(graph).toBeUndefined()
    expect(mocks.scale).not.toHaveBeenCalled()
  })
  it('rejects another participant before any child runtime is loaded', async () => {
    fixture('SCALE')
    await expect(getAttemptState('attempt', { userId: 'other' }, undefined, 'current-unit')).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.scale).not.toHaveBeenCalled(); expect(mocks.headers).not.toHaveBeenCalled()
  })
})
