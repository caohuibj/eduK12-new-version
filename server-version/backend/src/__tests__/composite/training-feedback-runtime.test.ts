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
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/bundle-product/analysis', () => bundle)
import { feedbackAttempt, readyFeedbackJob } from '../fixtures/training-feedback'
import { encryptCompositeCollectionReport } from '../../modules/composite/composite-report-cache'
import { getReport, getPartialReport, getAnalysisExportForParticipant, getDefaultPackageAnalysisSnapshot, retryBundleForParticipant,
  getCompositeReportStatus, getCompositeReportStatusForTeacher, getReportForTeacher } from '../../modules/composite/composite.service'
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
  db.$queryRaw.mockImplementation(() => Promise.resolve([{ parent: state.parent, job: state.job }]))
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
describe('Training participant release at every parent report boundary', () => {
  it.each(['getReport', 'getPartialReport', 'export', 'package'] as const)('gates %s before projecting frozen facts or package data', async method => {
    const call = method === 'getReport' ? () => getReport('attempt-1', { userId: 'student-1' })
      : method === 'getPartialReport' ? () => getPartialReport('attempt-1', 'student-1')
      : method === 'export' ? () => getAnalysisExportForParticipant('attempt-1', { userId: 'student-1' })
      : () => getDefaultPackageAnalysisSnapshot('attempt-1', { userId: 'student-1' })
    await expect(call()).rejects.toMatchObject({ statusCode: 403 })
    expect(db.compositeAnalysisSnapshot.findFirst).not.toHaveBeenCalled()
    expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled()
  })
  it.each([false, true])('keeps cached async report gated with compact read %s', async compact => {
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED', String(compact)); vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED', String(compact))
    setCache()
    await expect(getReport('attempt-1', { userId: 'student-1' })).rejects.toMatchObject({ statusCode: 403 })
    if (compact) { expect(db.$queryRaw).toHaveBeenCalledTimes(1); expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled(); expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled() }
    else { expect(db.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(1); expect(db.compositeReportJob.findUnique).toHaveBeenCalledTimes(1) }
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    expect(await getReport('attempt-1', { userId: 'student-1' })).toMatchObject({ id: 'attempt-1', backgroundValues: [{ value: 'PRIVATE_RESULT' }] })
  })
  it('honors release after flag rollback without discarding the accepted async job', async () => {
    setCache()
    await expect(getReport('attempt-1', { userId: 'student-1' })).rejects.toMatchObject({ statusCode: 403 })
    expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled()
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    expect(await getReport('attempt-1', { userId: 'student-1' })).toHaveProperty('id', 'attempt-1')
    expect(db.compositeReportJob.findUnique).toHaveBeenCalledTimes(1)
  })
  it('opens synchronous frozen-facts report exactly at the boundary', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    expect(await getReport('attempt-1', { userId: 'student-1' })).toHaveProperty('id', 'attempt-1')
    expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled()
  })
  it.each([false, true])('checks actual authenticated/anonymous ownership first (%s)', async anonymous => {
    if (anonymous) { state.parent.userId = null; state.parent.recoveryTokenHash = 'valid-recovery' }
    const context = anonymous ? { recoveryTokenHash: 'wrong' } : { userId: 'other' }
    await expect(getReport('attempt-1', context)).rejects.toMatchObject({ statusCode: 403, message: '无权限查看此综合测评记录' })
    expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled()
    if (anonymous) {
      vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
      expect(await getReport('attempt-1', { recoveryTokenHash: 'valid-recovery' })).toHaveProperty('id', 'attempt-1')
    }
  })
  it('rejects old cache/report data when configured binding is malformed', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true'); setCache(); state.parent.trainingFeedbackSnapshotHash = 'old'
    await expect(getReport('attempt-1', { userId: 'student-1' })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('keeps bundle retry behind release validation before analysis starts', async () => {
    state.parent.compositeAssessment.productKind = 'ASSESSMENT_BUNDLE'
    await expect(retryBundleForParticipant('attempt-1', { userId: 'student-1' })).rejects.toMatchObject({ statusCode: 403 })
    expect(bundle.readReport).not.toHaveBeenCalled(); expect(bundle.processAnalysis).not.toHaveBeenCalled()
  })
  it('preserves teacher report generation/read permissions during participant delay', async () => {
    expect(await getReportForTeacher('teacher-1', UserRole.TEACHER, 'composite-1', 'attempt-1')).toHaveProperty('id', 'attempt-1')
    await expect(getReportForTeacher('other', UserRole.TEACHER, 'composite-1', 'attempt-1')).rejects.toMatchObject({ statusCode: 403 })
    const status = await getCompositeReportStatusForTeacher('teacher-1', UserRole.TEACHER, 'composite-1', 'attempt-1')
    expect(status.reportStatus.state).toBe('READY'); expect(status).not.toHaveProperty('participantFeedback')
  })
  it.each([false, true])('separates generated state from release state with compact status %s', async compact => {
    vi.stubEnv('ASSESSMENT_REPORT_COMPACT_READ_ENABLED', String(compact)); setCache()
    const result = await getCompositeReportStatus('attempt-1', { userId: 'student-1' }, { waitMs: 100 })
    expect(result.reportStatus.state).toBe('READY')
    expect(result.participantFeedback).toEqual({ state: 'GENERATED_NOT_RELEASED', releaseAt: '2099-01-01T00:00:00.000Z' })
    expect(result).toMatchObject({ wholeSubmissionReceived: true, wholeSubmissionId: 'whole-1' })
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_RESULT|reportEncrypted|aggregateInputHash|backgroundValues|metrics/)
    if (compact) { expect(db.$queryRaw).toHaveBeenCalledTimes(1); expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled() }
  })
  it.each(['PENDING', 'PROCESSING', 'FAILED'])('preserves accepted whole FINAL and generation %s before aggregate completion', async status => {
    state.parent.status = 'IN_PROGRESS'; state.parent.asyncReportEpoch = 1; state.job = { ...readyFeedbackJob(state.parent), status }
    const result = await getCompositeReportStatus('attempt-1', { userId: 'student-1' })
    expect(result.reportStatus.state).toBe(status); expect(result.wholeSubmissionReceived).toBe(true)
    expect(result.participantFeedback?.state).toBe('REPORT_PROCESSING')
  })
  it('preserves legacy status contract without inventing release metadata', async () => {
    state.parent.trainingFeedbackSnapshot = null; state.parent.trainingFeedbackSnapshotHash = null
    state.parent.compositeAssessment.trainingFeedbackPolicy = null; state.parent.compositeAssessment.trainingFeedbackPolicyHash = null
    expect(await getCompositeReportStatus('attempt-1', { userId: 'student-1' })).not.toHaveProperty('participantFeedback')
    expect(await getReport('attempt-1', { userId: 'student-1' })).toHaveProperty('id', 'attempt-1')
  })
})
