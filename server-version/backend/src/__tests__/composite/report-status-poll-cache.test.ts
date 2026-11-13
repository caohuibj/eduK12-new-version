import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { db, state } = vi.hoisted(() => ({
  db: {
    $queryRaw: vi.fn(),
    compositeAssessmentAttempt: { findUnique: vi.fn() },
    compositeAssessment: { findUnique: vi.fn() },
    compositeReportJob: { findUnique: vi.fn() },
  },
  state: { parent: null as any, job: null as any },
}))
const waits = vi.hoisted(() => ({ begin: vi.fn(), prepare: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../services/reportReadyNotifications', () => ({
  prepareReportReadyNotifications: waits.prepare,
  beginReportReadyWait: waits.begin,
  reportReadyWaitAvailable: () => false,
  reportReadyNotificationSequence: () => 0,
  REPORT_READY_MAX_WAIT_MS: 4000,
}))

import { feedbackAttempt, readyFeedbackJob } from '../fixtures/training-feedback'
import { getCompositeReportStatus, getCompositeReportStatusForTeacher } from '../../modules/composite/composite.service'
import {
  clearReportStatusPollCacheForTest,
  readReportStatusPollCache,
  setReportStatusPollCacheNowForTest,
} from '../../modules/composite/report-status-poll-cache'

const attemptId = 'attempt-1'
const owner = { userId: 'student-1' }
const statusSnapshotLoads = () => db.compositeAssessmentAttempt.findUnique.mock.calls.filter((call) => {
  const select = call[0]?.select
  return select?.trainingFeedbackSnapshot === true && select?.trainingFlowSnapshotEncrypted !== true
})
const authLoads = () => db.compositeAssessmentAttempt.findUnique.mock.calls.filter((call) => {
  const select = call[0]?.select
  return select?.userId === true && select?.trainingFeedbackSnapshot !== true
})

const useJob = (status: string, parentStatus: 'IN_PROGRESS' | 'COMPLETED' = 'IN_PROGRESS') => {
  state.parent.status = parentStatus
  state.parent.completedAt = parentStatus === 'COMPLETED' ? new Date('2026-10-19T00:00:00Z') : null
  state.parent.asyncReportEpoch = state.parent.attemptEpoch
  state.job = {
    ...readyFeedbackJob(state.parent),
    status,
    completedAt: status === 'READY' ? new Date('2026-10-19T00:00:00Z') : null,
  }
}

beforeEach(() => {
  clearReportStatusPollCacheForTest()
  vi.clearAllMocks()
  vi.stubEnv('ASSESSMENT_REPORT_COMPACT_READ_ENABLED', 'false')
  vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'false')
  state.parent = feedbackAttempt()
  state.job = null
  db.compositeAssessmentAttempt.findUnique.mockImplementation(async () => state.parent)
  db.compositeAssessment.findUnique.mockImplementation(async () => ({ ...state.parent.compositeAssessment, createdBy: 'teacher-1' }))
  db.compositeReportJob.findUnique.mockImplementation(async () => state.job)
  db.$queryRaw.mockImplementation(async () => [{ parent: state.parent, job: state.job }])
})
afterEach(() => {
  clearReportStatusPollCacheForTest()
  vi.unstubAllEnvs()
})

describe('participant report-status poll cache', () => {
  it('reuses an authorized status within TTL with zero DB queries on the next poll', async () => {
    useJob('READY', 'COMPLETED')
    const first = await getCompositeReportStatus(attemptId, owner)
    expect(first.reportStatus.state).toBe('READY')
    expect(first.participantFeedback?.state).toBe('GENERATED_NOT_RELEASED')
    expect(statusSnapshotLoads()).toHaveLength(1)
    // Cache miss performs exactly one Attempt findUnique: the merged header
    // read serves both authorization and the status snapshot.
    expect(db.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(1)
    expect(db.compositeReportJob.findUnique).toHaveBeenCalledTimes(1)
    const select = statusSnapshotLoads()[0][0].select
    expect(select).toMatchObject({
      id: true, status: true, completedAt: true, attemptEpoch: true, asyncReportEpoch: true,
      trainingFeedbackSnapshot: true, userId: true, recoveryTokenHash: true,
    })
    expect(select).not.toHaveProperty('trainingFlowSnapshotEncrypted')
    expect(select).not.toHaveProperty('trainingVariantAllocationEncrypted')
    expect(select).not.toHaveProperty('trainingTimingSnapshot')
    expect(select.compositeAssessment.select).not.toHaveProperty('items')
    expect(db.compositeReportJob.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.not.objectContaining({ reportEncrypted: true, wholeAnswersEncrypted: true }),
    }))

    first.reportStatus.state = 'FAILED'
    first.participantFeedback!.state = 'AVAILABLE'
    const auths = authLoads().length
    const second = await getCompositeReportStatus(attemptId, owner)
    expect(second.reportStatus.state).toBe('READY')
    expect(second.participantFeedback?.state).toBe('GENERATED_NOT_RELEASED')
    expect(second).not.toBe(first)
    expect(statusSnapshotLoads()).toHaveLength(1)
    expect(db.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(1)
    expect(db.compositeReportJob.findUnique).toHaveBeenCalledTimes(1)
    // Cache-first with an in-memory owner match: no new query of any kind.
    expect(authLoads().length).toBe(auths)
  })

  it('rejects a different user or recovery token without returning the cached payload', async () => {
    useJob('READY', 'COMPLETED')
    const cached = await getCompositeReportStatus(attemptId, owner)
    expect(readReportStatusPollCache(attemptId)).toMatchObject({ reportStatus: { state: 'READY' }, attemptId })
    const snaps = statusSnapshotLoads().length
    const jobs = db.compositeReportJob.findUnique.mock.calls.length
    const auths = authLoads().length
    await expect(getCompositeReportStatus(attemptId, { userId: 'other-student' })).rejects.toMatchObject({
      statusCode: 403, message: '无权限查看此综合测评记录',
    })
    await expect(getCompositeReportStatus(attemptId, { recoveryTokenHash: 'wrong-proof' })).rejects.toMatchObject({
      statusCode: 403, message: '无权限查看此综合测评记录',
    })
    // Owner mismatch never serves the cache: each request falls back to the
    // single merged header read and is rejected on it — one findUnique per
    // rejected poll, no separate auth query, and no job load (403 precedes it).
    expect(statusSnapshotLoads()).toHaveLength(snaps + 2)
    expect(db.compositeReportJob.findUnique).toHaveBeenCalledTimes(jobs)
    expect(authLoads().length).toBe(auths)
    expect(cached.reportStatus.state).toBe('READY')

    clearReportStatusPollCacheForTest()
    state.parent.userId = null
    state.parent.recoveryTokenHash = 'proof-a'
    await getCompositeReportStatus(attemptId, { recoveryTokenHash: 'proof-a' })
    const afterOwner = statusSnapshotLoads().length
    await expect(getCompositeReportStatus(attemptId, { recoveryTokenHash: 'proof-b' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(getCompositeReportStatus(attemptId, { userId: 'student-1' })).rejects.toMatchObject({ statusCode: 403 })
    expect(statusSnapshotLoads()).toHaveLength(afterOwner + 2)
    expect(readReportStatusPollCache(attemptId)).toMatchObject({ reportStatus: { state: 'READY' } })
  })

  it('expires PENDING and PROCESSING after 5000ms, and READY after 60s', async () => {
    let now = 1_000_000
    setReportStatusPollCacheNowForTest(() => now)
    for (const status of ['PENDING', 'PROCESSING'] as const) {
      clearReportStatusPollCacheForTest()
      setReportStatusPollCacheNowForTest(() => now)
      db.compositeAssessmentAttempt.findUnique.mockClear()
      db.compositeReportJob.findUnique.mockClear()
      useJob(status)
      await getCompositeReportStatus(attemptId, owner)
      expect(statusSnapshotLoads()).toHaveLength(1)
      // A PENDING entry survives a full 2s poll gap (the harness interval):
      // the next poll at +2000ms is still a cache hit with zero DB queries.
      now += 2000
      await getCompositeReportStatus(attemptId, owner)
      expect(statusSnapshotLoads()).toHaveLength(1)
      now += 2999
      await getCompositeReportStatus(attemptId, owner)
      expect(statusSnapshotLoads()).toHaveLength(1)
      now += 1
      await getCompositeReportStatus(attemptId, owner)
      expect(statusSnapshotLoads()).toHaveLength(2)
      now += 10_000
    }

    clearReportStatusPollCacheForTest()
    now = 5_000_000
    setReportStatusPollCacheNowForTest(() => now)
    db.compositeAssessmentAttempt.findUnique.mockClear()
    db.compositeReportJob.findUnique.mockClear()
    useJob('READY', 'COMPLETED')
    await getCompositeReportStatus(attemptId, owner)
    expect(statusSnapshotLoads()).toHaveLength(1)
    now += 59_000
    await getCompositeReportStatus(attemptId, owner)
    expect(statusSnapshotLoads()).toHaveLength(1)
    expect((await getCompositeReportStatus(attemptId, owner)).reportStatus.state).toBe('READY')
    now += 1_000
    await getCompositeReportStatus(attemptId, owner)
    expect(statusSnapshotLoads()).toHaveLength(2)
  })

  it.each(['FAILED', 'WAITING'])('does not store %s as READY or skip the later READY load', async (status) => {
    useJob(status)
    const first = await getCompositeReportStatus(attemptId, owner)
    expect(first.reportStatus.state).toBe(status)
    expect(readReportStatusPollCache(attemptId)).toBeNull()
    state.job = { ...state.job, status: 'READY', completedAt: new Date('2026-10-19T00:00:00Z') }
    state.parent.status = 'COMPLETED'
    state.parent.completedAt = new Date('2026-10-19T00:00:00Z')
    const second = await getCompositeReportStatus(attemptId, owner)
    expect(second.reportStatus.state).toBe('READY')
    expect(statusSnapshotLoads()).toHaveLength(2)
    expect(readReportStatusPollCache(attemptId)).toMatchObject({ reportStatus: { state: 'READY' } })
  })

  it('does not return a cached PENDING as READY when waitMs is set', async () => {
    let now = 8_000_000
    setReportStatusPollCacheNowForTest(() => now)
    useJob('PENDING')
    const primed = await getCompositeReportStatus(attemptId, owner)
    expect(primed.reportStatus.state).toBe('PENDING')
    expect(readReportStatusPollCache(attemptId)).toMatchObject({ reportStatus: { state: 'PENDING' } })

    const stillPending = await getCompositeReportStatus(attemptId, owner, { waitMs: 1000 })
    expect(stillPending.reportStatus.state).toBe('PENDING')

    const before = statusSnapshotLoads().length
    waits.begin.mockReturnValueOnce({
      cancel: vi.fn(),
      done: Promise.resolve().then(() => {
        state.job = { ...state.job, status: 'READY', completedAt: new Date('2026-10-19T00:00:00Z') }
        state.parent.status = 'COMPLETED'
        state.parent.completedAt = new Date('2026-10-19T00:00:00Z')
        return 'ready' as const
      }),
    })
    const waited = await getCompositeReportStatus(attemptId, owner, { waitMs: 1000 })
    expect(waited.reportStatus.state).toBe('READY')
    expect(statusSnapshotLoads().length).toBeGreaterThan(before)
    expect(readReportStatusPollCache(attemptId)).toMatchObject({ reportStatus: { state: 'READY' } })
  })

  it('does not let a teacher read the participant poll cache', async () => {
    const participant = await getCompositeReportStatus(attemptId, owner)
    expect(participant.participantFeedback).toEqual({ state: 'GENERATED_NOT_RELEASED', releaseAt: '2099-01-01T00:00:00.000Z' })
    expect(readReportStatusPollCache(attemptId)).toMatchObject({ participantFeedback: { state: 'GENERATED_NOT_RELEASED' } })
    const teacher = await getCompositeReportStatusForTeacher('teacher-1', UserRole.TEACHER, 'composite-1', attemptId)
    expect(teacher.reportStatus.state).toBe('READY')
    expect(teacher).not.toHaveProperty('participantFeedback')
  })
})
