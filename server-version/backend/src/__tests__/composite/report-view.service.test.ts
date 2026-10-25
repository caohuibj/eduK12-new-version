import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'
const { db, state, bundle } = vi.hoisted(() => ({
  db: {
    cognitiveSession: { findMany: vi.fn() },
    situationalAttempt: { findMany: vi.fn() },
    compositeFormAnswer: { findMany: vi.fn() },
    compositeFormSectionAttempt: { findMany: vi.fn() },
 $queryRaw: vi.fn(), compositeAssessmentAttempt: { findUnique: vi.fn() }, compositeAssessment: { findUnique: vi.fn() },
    compositeReportJob: { findUnique: vi.fn() }, compositeAnalysisSnapshot: { findFirst: vi.fn() } },
  state: { parent: null as any, job: null as any }, bundle: { readReport: vi.fn(), processAnalysis: vi.fn() },
}))
const waits = vi.hoisted(() => ({ begin: vi.fn(), prepare: vi.fn() }))
vi.mock('../../services/reportReadyNotifications', () => ({ prepareReportReadyNotifications: waits.prepare,
  beginReportReadyWait: waits.begin, reportReadyWaitAvailable: () => true, reportReadyNotificationSequence: () => 0,
  REPORT_READY_MAX_WAIT_MS: 4000 }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/bundle-product/analysis', () => bundle)
import { feedbackAttempt, readyFeedbackJob } from '../fixtures/training-feedback'
import { encryptCompositeCollectionReport } from '../../modules/composite/composite-report-cache'
import { getReport, getPartialReport, getAnalysisExportForParticipant, getDefaultPackageAnalysisSnapshot, retryBundleForParticipant,
  getCompositeReportStatus, getCompositeReportStatusForTeacher, getReportForTeacher, getCompositeReportView } from '../../modules/composite/composite.service'
const setCache = () => {
  state.parent.asyncReportEpoch = state.parent.attemptEpoch
  const binding = { attemptId: state.parent.id, attemptEpoch: state.parent.attemptEpoch, slotSetHash: state.parent.frozenActiveSlotSetHash,
    contextHash: state.parent.contextSnapshotHash, aggregateInputHash: state.parent.aggregateInputHash }
  state.job = { ...readyFeedbackJob(state.parent), reportEncrypted: encryptCompositeCollectionReport({ id: state.parent.id,
    assessmentId: 'composite-1', name: 'Training', unitReports: [], backgroundValues: [{ label: 'fixture', value: 'PRIVATE_RESULT' }] }, binding) }
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64)); vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
  vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'false'); vi.stubEnv('ASSESSMENT_REPORT_COMPACT_READ_ENABLED', 'false')
  vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', 'false'); vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED', 'false')
  state.parent = feedbackAttempt(); state.job = null
  db.cognitiveSession.findMany.mockImplementation(async () => state.parent.cognitiveSessions ?? [])
  db.situationalAttempt.findMany.mockImplementation(async () => state.parent.situationalAttempts ?? [])
  db.compositeFormAnswer.findMany.mockImplementation(async () => state.parent.formAnswers ?? [])
  db.compositeFormSectionAttempt.findMany.mockImplementation(async () => state.parent.formSectionAttempts ?? [])

  db.compositeAssessmentAttempt.findUnique.mockImplementation(() => Promise.resolve(state.parent))
  db.compositeAssessment.findUnique.mockImplementation(() => Promise.resolve({ ...state.parent.compositeAssessment, createdBy: 'teacher-1' }))
  db.compositeReportJob.findUnique.mockImplementation(() => Promise.resolve(state.job))
  db.$queryRaw.mockImplementation(() => Promise.resolve(JSON.parse(JSON.stringify([{ parent: state.parent, job: state.job }]))))
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
describe('opt-in participant report view', () => {
  it('returns unopened generation without loading report relations', async () => {
    const view = await getCompositeReportView('attempt-1', { userId: 'student-1' })
    expect(view.generation.participantFeedback?.state).toBe('GENERATED_NOT_RELEASED')
    expect(view.report).toBeNull()
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
  })
  it('returns a ready synchronous report from one final authorized graph and current generation', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    const view = await getCompositeReportView('attempt-1', { userId: 'student-1' })
    expect(view.generation).toMatchObject({ attemptId: 'attempt-1', attemptEpoch: 1, reportStatus: { state: 'READY' }, participantFeedback: { state: 'AVAILABLE' } })
    expect(view.report).toHaveProperty('id', 'attempt-1')
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    expect(db.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(1)
    expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled()
  })
  it('keeps an unfinished attempt as WAITING without building a report', async () => {
    state.parent.status = 'IN_PROGRESS'; state.parent.completedAt = null
    const view = await getCompositeReportView('attempt-1', { userId: 'student-1' })
    expect(view.generation.reportStatus.state).toBe('WAITING'); expect(view.report).toBeNull()
    expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
  })
  it.each(['wrong-user', 'wrong-proof'])('rejects %s before report reads', async kind => {
    const context = kind === 'wrong-user' ? { userId: 'other' } : { recoveryTokenHash: 'other' }
    await expect(getCompositeReportView('attempt-1', context)).rejects.toMatchObject({ statusCode: 403 })
    expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
  })
  it('uses the original anonymous ownership check for the final graph', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    state.parent.userId = null; state.parent.recoveryTokenHash = 'current-proof'
    expect((await getCompositeReportView('attempt-1', { recoveryTokenHash: 'current-proof' })).report).toHaveProperty('id', 'attempt-1')
  })
  it('does not pair the initial READY with a restarted epoch', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    db.compositeAssessmentAttempt.findUnique.mockImplementationOnce(async () => feedbackAttempt({ attemptEpoch: 2, status: 'IN_PROGRESS', completedAt: null }))
    const view = await getCompositeReportView('attempt-1', { userId: 'student-1' })
    expect(view.generation).toMatchObject({ attemptEpoch: 2, reportStatus: { state: 'WAITING' } }); expect(view.report).toBeNull()
  })
  it('rechecks ownership after the initial READY hint', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    db.compositeAssessmentAttempt.findUnique.mockResolvedValueOnce({ ...state.parent, userId: 'other' })
    await expect(getCompositeReportView('attempt-1', { userId: 'student-1' })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('never uses an earlier open policy instead of the final graph release', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    db.compositeAssessmentAttempt.findUnique.mockResolvedValueOnce(feedbackAttempt({}, { schemaVersion: 1, mode: 'SCHEDULED', releaseAt: '2099-02-01T00:00:00.000Z' }))
    const view = await getCompositeReportView('attempt-1', { userId: 'student-1' })
    expect(view.generation.participantFeedback?.state).toBe('GENERATED_NOT_RELEASED'); expect(view.report).toBeNull()
  })
  it('loads the current materialization and full header only after READY', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true'); setCache()
    const view = await getCompositeReportView('attempt-1', { userId: 'student-1' })
    expect(view.report).toMatchObject({ backgroundValues: [{ value: 'PRIVATE_RESULT' }] })
    expect(db.compositeReportJob.findUnique).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ select: expect.objectContaining({ reportEncrypted: true, slotSetHash: true, wholeSubmissionId: true }) }))
    expect(db.$queryRaw.mock.calls[0][1]).toBe(false)
  })
  it('does not use a READY hint after the current job becomes failed', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true'); setCache()
    db.compositeReportJob.findUnique.mockResolvedValueOnce({ ...state.job, status: 'FAILED' })
    const view = await getCompositeReportView('attempt-1', { userId: 'student-1' })
    expect(view.generation.reportStatus.state).toBe('FAILED'); expect(view.report).toBeNull()
  })
  it('does not read the report after cancellation', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    const abort = new AbortController(); abort.abort()
    expect((await getCompositeReportView('attempt-1', { userId: 'student-1' }, { signal: abort.signal })).report).toBeNull()
    expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
  })
})

describe('report view final read and wait boundaries', () => {
  it('reauthorizes after a readiness wake and always cancels the wait', async () => {
    state.parent.asyncReportEpoch = 1; state.parent.status = 'IN_PROGRESS';
    state.job = { ...readyFeedbackJob(state.parent), status: 'PROCESSING' }
    const cancel = vi.fn()
    waits.begin.mockReturnValue({ cancel, get done() { return Promise.resolve().then(() => { state.parent.userId = 'other'; return 'ready' }) } })
    await expect(getCompositeReportView('attempt-1', { userId: 'student-1' }, { waitMs: 4000 })).rejects.toMatchObject({ statusCode: 403 })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
  })
  it('normalizes explicit-offset status dates without changing frozen publication identity', async () => {
    const raw = JSON.parse(JSON.stringify({ parent: state.parent, job: null }))
    raw.parent.completedAt = '2026-10-19T08:00:00+08:00'
    raw.parent.compositeAssessment.publishedAt = '2026-10-01T08:00:00+08:00'
    db.$queryRaw.mockResolvedValueOnce([raw])
    const view = await getCompositeReportView('attempt-1', { userId: 'student-1' })
    expect(view.generation.reportStatus.completedAt).toEqual(new Date('2026-10-19T00:00:00Z'))
    expect(view.generation.participantFeedback?.state).toBe('GENERATED_NOT_RELEASED')
    expect(view.report).toBeNull()
  })
})

it('never projects an unfinished parent merely because an unconfigured job says READY', async () => {
  state.parent = feedbackAttempt({ status: 'IN_PROGRESS', asyncReportEpoch: 1 })
  state.parent.trainingFeedbackSnapshot = null; state.parent.trainingFeedbackSnapshotHash = null
  state.parent.compositeAssessment.trainingFeedbackPolicy = null; state.parent.compositeAssessment.trainingFeedbackPolicyHash = null
  state.job = readyFeedbackJob(state.parent)
  await expect(getCompositeReportView('attempt-1', { userId: 'student-1' })).rejects.toMatchObject({ statusCode: 400 })
})
it.each([null, '2026-10-19T00:00:00Z'])('preserves compact status completed date %s', async date => {
  const raw = JSON.parse(JSON.stringify({ parent: state.parent, job: null })); raw.parent.completedAt = date
  db.$queryRaw.mockResolvedValueOnce([raw])
  const view = await getCompositeReportView('attempt-1', { userId: 'student-1' })
  expect(view.generation.reportStatus.completedAt).toEqual(date ? new Date(date) : null)
})
