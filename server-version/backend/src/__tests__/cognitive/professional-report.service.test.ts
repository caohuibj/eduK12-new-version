import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '../../types'

const mocks = vi.hoisted(() => ({
  assignment: vi.fn(), cohort: vi.fn(), count: vi.fn(), findMany: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: { cognitiveSession: { count: mocks.count, findMany: mocks.findMany } } }))
vi.mock('../../modules/cognitive/assignment.service', () => ({ getAssignmentForTeacher: mocks.assignment }))
vi.mock('../../modules/assessment-relational/result-authority', () => ({ isRelationalCohortOnlyCompositeAttempt: mocks.cohort }))
import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { listProfessionalReports } from '../../modules/cognitive/professional-report.service'
import { cognitiveProfessionalReportsQuerySchema } from '../../modules/cognitive/cognitive.schema'

const report = { title: '反应时', qualityState: 'limited', conclusion: '保留记录', disclaimer: '本次任务', practicalTips: [], headline: [{ key: 'validTrialCount', value: 5 }], user: [], detail: [], quality: [], method: { testType: 'reaction' } }
const snapshot = () => encryptCognitivePayload({ schemaVersion: 1, completedAt: new Date().toISOString(), testType: 'reaction', engineVersion: '1.0.0', scoringVersion: '1.1.0', configVersion: '1.1.0', protocolSignature: 'a'.repeat(64), profile: 'standard', metrics: { medianRtMs: 305, validTrialCount: 5 }, quality: { state: 'limited', flags: {}, reasons: [] }, report, references: [{ metricKey: 'medianRtMs' }, { metricKey: 'validTrialCount' }], assessmentContext: null })
const input = { userId: 'owner-teacher', role: UserRole.TEACHER, assignmentId: 'a1', offset: 0 }
beforeEach(() => {
  vi.clearAllMocks(); process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  mocks.assignment.mockResolvedValue({ id: 'a1', title: '任务', listedStandalone: true })
  mocks.count.mockResolvedValue(1); mocks.cohort.mockResolvedValue(false)
  mocks.findMany.mockResolvedValue([{ id: 'random-session-one', finishedAt: new Date('2026-10-01T08:30:00Z'), attemptNo: 1, compositeAttemptId: null, resultSnapshotEncrypted: snapshot() }])
})
describe('professional frozen report reading', () => {
  it('checks the existing teacher/admin assignment authority before querying records', async () => {
    mocks.assignment.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    await expect(listProfessionalReports(input)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.count).not.toHaveBeenCalled(); expect(mocks.findMany).not.toHaveBeenCalled()
    await listProfessionalReports(input)
    expect(mocks.assignment).toHaveBeenLastCalledWith('owner-teacher', UserRole.TEACHER, 'a1')
  })
  it('returns the exact persisted report, filters references and never queries participant identities or raw submissions', async () => {
    const result = await listProfessionalReports(input)
    expect(result.records[0].report).toEqual(report)
    expect(result.records[0].references).toEqual([{ metricKey: 'validTrialCount' }])
    expect(JSON.stringify(result)).not.toContain('305')
    const query = mocks.findMany.mock.calls[0][0]
    expect(query.take).toBe(10)
    expect(query.select).toEqual({ id: true, finishedAt: true, attemptNo: true, compositeAttemptId: true, resultSnapshotEncrypted: true })
    expect(result.records[0].reportId).toMatch(/^CR-[A-F0-9]{24}$/)
    expect(JSON.stringify(result)).not.toContain('random-session-one')
  })
  it('keeps record references stable when new records change their page position', async () => {
    const first = (await listProfessionalReports(input)).records[0]
    mocks.findMany.mockResolvedValueOnce([
      { id: 'random-session-two', finishedAt: new Date(), attemptNo: 1, compositeAttemptId: null, resultSnapshotEncrypted: snapshot() },
      { id: 'random-session-one', finishedAt: new Date(), attemptNo: 1, compositeAttemptId: null, resultSnapshotEncrypted: snapshot() },
    ])
    const second = await listProfessionalReports({ ...input, offset: 10 })
    expect(second.records[1].reportId).toBe(first.reportId)
    expect(second.records[1].label).toBe(first.label)
    expect(second.records[0].reportId).not.toBe(first.reportId)
    expect(first.finishedAt).toBeDefined()
  })
  it('rejects composite wrappers and excludes cohort-only attempts before decryption', async () => {
    mocks.assignment.mockResolvedValueOnce({ id: 'a1', listedStandalone: false })
    await expect(listProfessionalReports(input)).rejects.toMatchObject({ statusCode: 403 })
    mocks.findMany.mockResolvedValueOnce([{ attemptNo: 1, compositeAttemptId: 'cohort-only', resultSnapshotEncrypted: 'do-not-decrypt' }])
    mocks.cohort.mockResolvedValueOnce(true)
    expect((await listProfessionalReports(input)).records).toEqual([])
  })
  it('preserves legacy/unreadable outcomes and bounds pagination without an endless empty-page cursor', async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: 'random-session-one', finishedAt: null, attemptNo: 1, compositeAttemptId: null, resultSnapshotEncrypted: null }])
    expect((await listProfessionalReports(input)).records[0].report).toBeNull()
    mocks.count.mockResolvedValueOnce(50); mocks.findMany.mockResolvedValueOnce([])
    expect((await listProfessionalReports(input)).nextOffset).toBeNull()
    expect(cognitiveProfessionalReportsQuerySchema.safeParse({ offset: -1 }).success).toBe(false)
    expect(cognitiveProfessionalReportsQuerySchema.safeParse({ offset: 0, userId: 'someone' }).success).toBe(false)
  })
})
