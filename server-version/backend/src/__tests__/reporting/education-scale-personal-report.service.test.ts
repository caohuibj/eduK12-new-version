import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), scope: vi.fn(), source: vi.fn(), parent: vi.fn(), children: vi.fn(), final: vi.fn(),
  runtime: vi.fn(), admission: vi.fn(), slots: vi.fn(), canonical: vi.fn(), reader: vi.fn(), result: vi.fn(), report: vi.fn(), project: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { $transaction: (work: (tx: unknown) => unknown) => work({
  $executeRaw: m.execute, $queryRaw: m.query, compositeAssessmentAttempt: { findUnique: m.parent }, assessment: { findMany: m.children },
  assessmentUnitSnapshot: { findMany: m.final },
}) } }))
vi.mock('../../modules/organization/educationProductAccess', () => ({ resolveEducationProductMemberScope: m.scope }))
vi.mock('../../modules/assessment-run/educationScaleExecutionSource', () => ({ readEducationScaleExecutionSource: m.source }))
vi.mock('../../modules/assessment-runtime/runtime-snapshot', () => ({ loadFrozenScaleRuntimeSnapshot: m.runtime }))
vi.mock('../../modules/assessment-runtime/unit-admission', () => ({ loadStoredVersionedUnitAdmission: m.admission }))
vi.mock('../../modules/assessment-runtime/slot-set', () => ({ loadFrozenActiveSlotSet: m.slots, compositeItemSlotKey: (id: string) => 'scale:' + id }))
vi.mock('../../modules/assessment-runtime/compact-assessment-storage', () => ({ resolveStoredScaleResult: m.result, createStoredScaleFactsReader: m.reader, loadStoredCanonicalUnitResults: async (...args:unknown[]) => [await m.canonical(...args)] }))
vi.mock('../../modules/reporting/scale-unit-report', () => ({ buildScaleUnitReport: m.report }))
vi.mock('../../modules/reporting/education-scale-report.projector', () => ({ projectEducationScaleIndividualReport: m.project }))
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { resultAudiences, type ResultDisclosureContractV1 } from '../../modules/assessment-policy/result-disclosure'
import { readEducationRespondentScaleReport } from '../../modules/reporting/education-scale-personal-report.service'

const actorUserId = 'user-1', executionId = 'execution-1'
let own: { organizationId: string; resourceKey: string; resourceVersion: string; attemptId: string; assignmentId: string; policy: object; policyHash: string }
beforeEach(() => {
  vi.resetAllMocks()
  m.reader.mockResolvedValue({read:vi.fn(),find:vi.fn()})
  const contract: ResultDisclosureContractV1 = { schemaVersion: 1, policyKey: 'test', minimumRespondents: null,
    audiences: Object.fromEntries(resultAudiences.map(key => [key, { mode: key === 'RESPONDENT' ? 'INDIVIDUAL_SUMMARY' : 'NONE',
      metricKeys: key === 'RESPONDENT' ? ['score'] : [], longitudinalMetricKeys: [] }])) as unknown as ResultDisclosureContractV1['audiences'] }
  const policy = { analysisMode: 'INDIVIDUAL_ONLY', resultDisclosure: contract }
  own = { organizationId: 'org-1', resourceKey: 'library-scale:entry:TEACHER:TEACHER:SELF', resourceVersion: '1.0.0',
    attemptId: 'attempt-1', assignmentId: 'assignment-1', policy, policyHash: canonicalHash(policy) }
  m.query.mockImplementation(async () => [own]); m.scope.mockResolvedValue({ membershipId: 'member' })
  m.source.mockResolvedValue({ sourceKind: 'LIBRARY', scaleId: 'scale-1', compositeId: 'composite-1', compositeItemId: 'item-1', sourceDefinitionHash: 'source-hash',
    resultDisclosure: contract, resourceEntry: { title: 'Test' } })
  m.parent.mockResolvedValue({ id: 'attempt-1', status: 'COMPLETED', compositeAssessmentId: 'composite-1', userId: actorUserId,
    respondentUserId: actorUserId, subjectUserId: actorUserId, assignmentRef: 'assignment-1', attemptEpoch: 1,
    frozenActiveSlotSetEncrypted: 'slot-cipher', frozenActiveSlotSetHash: 'slot-hash', contextSnapshotHash: null })
  m.children.mockResolvedValue([{ id: 'assessment-1', scaleId: 'scale-1', status: 'COMPLETED', userId: actorUserId,
    respondentUserId: actorUserId, subjectUserId: actorUserId, submissionId: 'submission-1', attemptEpoch: 1,
    runtimeSnapshotEncrypted: 'runtime-cipher', compiledRuntimeHash: 'compiled-hash', frozenAdmissionSnapshotHash: 'admission-hash',
    compositeAttemptId: 'attempt-1', compositeItemId: 'item-1', result: 'result-reference' }])
  m.final.mockResolvedValue([{ compositeAttemptId: 'attempt-1', sourceSubmissionId: 'submission-1', sourceDefinitionHash: 'source-hash',
    compiledRuntimeHash: 'compiled-hash', canonicalResultEncrypted: 'canonical-reference' }])
  m.runtime.mockResolvedValue({ schemaVersion: 2, instrumentKey: 'test', sourceDefinitionHash: 'source-hash',
    compiledRuntime: { compiledRuntimeHash: 'compiled-hash' }, compiledPolicy: { disclosure: {}, runtimePolicyHash: 'policy-hash' } })
  m.admission.mockResolvedValue({ scale: { name: 'Frozen title' } }); m.slots.mockResolvedValue({})
  m.canonical.mockResolvedValue({ core: { unitType: 'SCALE', sourceDefinitionHash: 'source-hash', compiledRuntimeHash: 'compiled-hash',
    contextHash: null, quality: { status: 'interpretable' }, metrics: [{ key: 'score', value: 4, quality: 'calculated' }] },
    persistenceProvenance: { sourceType: 'ASSESSMENT', sourceAttemptId: 'assessment-1', sourceSubmissionId: 'submission-1' } })
  m.report.mockReturnValue({ result: { scores: [{ key: 'score', value: 4, status: 'calculated' }], quality: { status: 'interpretable' } } })
  m.project.mockReturnValue({ state: 'PROJECTED', unitReports: [{ type: 'SCALE', scores: [{ key: 'score', value: 4 }] }] })
})
describe('education personal report reader orchestration (mock storage)', () => {
  it('uses immutable HISTORY identity and independent persisted anchors, not publisher grants', async () => {
    expect(await readEducationRespondentScaleReport({ actorUserId, executionId, product: 'TEACHER' })).toMatchObject({ state: 'READY', unitReports: [{ type: 'SCALE' }] })
    expect(m.reader).toHaveBeenCalledTimes(1)
    const reader = await m.reader.mock.results[0].value
    expect(m.canonical.mock.calls[0][3]).toBe(reader)
    expect(m.result.mock.calls[0][1].reader).toBe(reader)
    expect(m.canonical.mock.calls[0][1]).toBe(m.result.mock.calls[0][1].db)
    expect(m.source).toHaveBeenCalledWith(expect.anything(), { product: 'TEACHER', organizationId: own.organizationId, resourceKey: own.resourceKey, resourceVersion: '1.0.0', purpose: 'HISTORY' })
    expect(m.project).toHaveBeenCalledWith(expect.objectContaining({ resultAudience: 'RESPONDENT',
      persistedFacts: expect.objectContaining({ actorUserId, parent: expect.objectContaining({ frozenActiveSlotSetHash: 'slot-hash' }) }),
      context: expect.objectContaining({ audience: 'respondent' }) }))
    expect(m.project.mock.calls[0][0]).not.toHaveProperty('binding')
    expect(m.query).toHaveBeenCalledTimes(2)
    expect(m.execute).toHaveBeenCalledTimes(1)
    expect(m.execute.mock.calls[0][0].join('')).toBe('SET LOCAL join_collapse_limit = 1')
    expect(m.execute.mock.invocationCallOrder[0]).toBeLessThan(m.query.mock.invocationCallOrder[0])
  })
  it('rechecks access after asynchronous result reads', async () => {
    m.query.mockReset().mockResolvedValueOnce([own]).mockResolvedValueOnce([])
    await expect(readEducationRespondentScaleReport({ actorUserId, executionId, product: 'TEACHER' })).rejects.toMatchObject({ statusCode: 404 })
  })
  it('does not read a canonical result for inaccessible or legacy lanes', async () => {
    m.query.mockResolvedValueOnce([])
    expect(await readEducationRespondentScaleReport({ actorUserId, executionId, product: 'SCHOOL' })).toBeNull()
    own.resourceKey = 'teacher-scale:old:INDIVIDUAL'
    expect(await readEducationRespondentScaleReport({ actorUserId, executionId, product: 'TEACHER' })).toBeNull()
    expect(m.source).not.toHaveBeenCalled(); expect(m.canonical).not.toHaveBeenCalled()
  })
  it('rejects result substitution inconsistent with the canonical FINAL', async () => {
    m.report.mockReturnValue({ result: { scores: [{ key: 'score', value: 99, status: 'calculated' }], quality: { status: 'interpretable' } } })
    await expect(readEducationRespondentScaleReport({ actorUserId, executionId, product: 'TEACHER' })).rejects.toMatchObject({ statusCode: 404 })
    expect(m.project).not.toHaveBeenCalled()
  })
  it('rejects a different subject or ambiguous child before loading report contents', async () => {
    m.parent.mockResolvedValueOnce({ ...(await m.parent()), subjectUserId: 'other' })
    await expect(readEducationRespondentScaleReport({ actorUserId, executionId, product: 'TEACHER' })).rejects.toMatchObject({ statusCode: 404 })
    expect(m.canonical).not.toHaveBeenCalled()
  })
})
