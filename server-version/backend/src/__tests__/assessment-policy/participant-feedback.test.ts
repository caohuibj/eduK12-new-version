import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCompositeParticipantFeedbackDeferred, isLoadedCompositeParticipantFeedbackDeferred, trainingFeedbackReportReady } from '../../modules/assessment-policy/participant-feedback'
import { projectRelationalUnitFinalResponse } from '../../modules/assessment-relational/result-authority'
import { feedbackAttempt, readyFeedbackJob } from '../fixtures/training-feedback'

const data = { submissionId: 'final', payloadHash: 'hash', replayed: true, response: { report: 'PRIVATE_FEEDBACK', metrics: { fixture: 1 } } }
const receipt = { submissionId: 'final', payloadHash: 'hash', replayed: true, completed: true, feedbackDeferred: true }
const dbFor = (parent: any, job: any = null) => ({ $queryRaw: vi.fn().mockResolvedValue(parent ? [{ parent, job }] : []), compositeReportJob: { findUnique: vi.fn().mockResolvedValue(job) } })
afterEach(() => vi.useRealTimers())
describe('participant feedback after the whole composite completes', () => {
  it('retains standalone feedback without reading a parent', async () => {
    const db = dbFor(null)
    expect(await isCompositeParticipantFeedbackDeferred(null, db)).toBe(false)
    expect(await projectRelationalUnitFinalResponse(null, data, db)).toEqual(data)
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })
  it.each(['IN_PROGRESS', 'ABANDONED', null])('returns only durable acknowledgement for parent %s', async status => {
    const db = dbFor(status ? { status, assignmentRef: null } : null)
    expect(await projectRelationalUnitFinalResponse('parent', data, db)).toEqual(receipt)
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
  })
  it('opens legacy completed feedback but keeps cohort-only completed feedback withheld', async () => {
    expect(await projectRelationalUnitFinalResponse('parent', data, dbFor({ status: 'COMPLETED', assignmentRef: null }))).toEqual(data)
    expect(await projectRelationalUnitFinalResponse('parent', data, dbFor({ status: 'COMPLETED', assignmentRef: 'relational', respondentType: null })))
      .toEqual({ submissionId: 'final', payloadHash: 'hash', replayed: true, completed: true })
  })
  it.each([false, true])('withholds initial/replayed FINAL %s but preserves submission identity', async replayed => {
    const parent = feedbackAttempt(), db = dbFor(parent)
    expect(await projectRelationalUnitFinalResponse(parent.id, { ...data, replayed }, db)).toEqual({ ...receipt, replayed })
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled()
    const query = db.$queryRaw.mock.calls[0][0].join(' ')
    expect(query).toContain('LEFT JOIN composite_report_jobs')
    expect(query).toContain("AT TIME ZONE 'UTC'")
    expect(query).not.toMatch(/FOR (UPDATE|SHARE)|report_encrypted|answers|is_active|expires_at/)
  })
  it('uses the exact release boundary without a job, scoring, clock task or extra query', async () => {
    const parent = feedbackAttempt(), db = dbFor(parent)
    vi.useFakeTimers(); vi.setSystemTime(new Date('2098-12-31T23:59:59.999Z'))
    expect(await isCompositeParticipantFeedbackDeferred(parent.id, db)).toBe(true)
    vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z'))
    expect(await isCompositeParticipantFeedbackDeferred(parent.id, db)).toBe(false)
    expect(db.$queryRaw).toHaveBeenCalledTimes(2)
  })
  it.each(['PENDING', 'PROCESSING', 'FAILED', 'CANCELLED', 'WAITING'])('does not release current async %s even after the preset time', async status => {
    const parent = feedbackAttempt({ asyncReportEpoch: 1 }, { schemaVersion: 1, mode: 'IMMEDIATE' })
    const db = dbFor(parent, { ...readyFeedbackJob(parent), status })
    expect(await projectRelationalUnitFinalResponse(parent.id, data, db)).toEqual(receipt)
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled()
  })
  it('allows current READY while rejecting a stale materialization binding', async () => {
    const parent = feedbackAttempt({ asyncReportEpoch: 1 }, { schemaVersion: 1, mode: 'IMMEDIATE' }), job = readyFeedbackJob(parent)
    expect(await projectRelationalUnitFinalResponse(parent.id, data, dbFor(parent, job))).toEqual(data)
    for (const change of [{ attemptEpoch: 0 }, { slotSetHash: 'old' }, { contextHash: 'old' }, { aggregateInputHash: 'old' }]) {
      expect(trainingFeedbackReportReady(parent, { ...job, ...change })).toBe(false)
      expect(await isCompositeParticipantFeedbackDeferred(parent.id, dbFor(parent, { ...job, ...change }))).toBe(true)
    }
  })
  it('reads one native async header only when timing and completion already permit', async () => {
    const parent = feedbackAttempt({ asyncReportEpoch: 1 }, { schemaVersion: 1, mode: 'IMMEDIATE' }), db = dbFor(parent, readyFeedbackJob(parent))
    expect(await isLoadedCompositeParticipantFeedbackDeferred(parent, db)).toBe(false)
    expect(db.compositeReportJob.findUnique).toHaveBeenCalledTimes(1)
    db.compositeReportJob.findUnique.mockClear()
    for (const value of [feedbackAttempt(), { ...parent, status: 'IN_PROGRESS' }, { ...parent, trainingFeedbackSnapshotHash: 'bad' }])
      expect(await isLoadedCompositeParticipantFeedbackDeferred(value, db)).toBe(true)
    expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled()
  })
  it('keeps malformed configured policy and omitted/stale generation markers closed', async () => {
    const parent = feedbackAttempt({}, { schemaVersion: 1, mode: 'IMMEDIATE' })
    for (const change of [{ trainingFeedbackSnapshot: {} }, { trainingFeedbackSnapshotHash: null }, { asyncReportEpoch: undefined }, { asyncReportEpoch: 4 }])
      expect(await isLoadedCompositeParticipantFeedbackDeferred({ ...parent, ...change }, dbFor(null))).toBe(true)
  })
})

describe('lazy FINAL detail after current disclosure', () => {
  it.each([false, true])('skips detail for initial/replayed deferred receipt %s', async replayed => {
    const build = vi.fn().mockRejectedValue(new Error('must not run'))
    expect(await projectRelationalUnitFinalResponse('parent', { ...data, replayed }, dbFor({ status: 'IN_PROGRESS', assignmentRef: null }), build))
      .toEqual({ ...receipt, replayed })
    expect(build).not.toHaveBeenCalled()
  })
  it('also skips details for completed cohort-only participants', async () => {
    const build = vi.fn()
    expect(await projectRelationalUnitFinalResponse('parent', data, dbFor({ status: 'COMPLETED', assignmentRef: 'relational', respondentType: null }), build))
      .toEqual({ submissionId: 'final', payloadHash: 'hash', replayed: true, completed: true })
    expect(build).not.toHaveBeenCalled()
  })
  it('builds permitted details only after the fresh policy read', async () => {
    const db = dbFor({ status: 'COMPLETED', assignmentRef: null })
    const build = vi.fn(async () => { expect(db.$queryRaw).toHaveBeenCalledTimes(1); return data })
    expect(await projectRelationalUnitFinalResponse('parent', { ...data, response: undefined }, db, build)).toEqual(data)
    expect(build).toHaveBeenCalledTimes(1)
  })
  it('rechecks current disclosure after an awaited detail build', async () => {
    const db = dbFor({ status: 'COMPLETED', assignmentRef: null })
    const build = vi.fn(async () => {
      db.$queryRaw.mockResolvedValue([{ parent: { status: 'IN_PROGRESS', assignmentRef: null }, job: null }])
      return data
    })
    expect(await projectRelationalUnitFinalResponse('parent', data, db, build)).toEqual(receipt)
    expect(build).toHaveBeenCalledTimes(1)
    expect(db.$queryRaw).toHaveBeenCalledTimes(2)
  })
  it('keeps durable success when permitted detail loading fails without claiming policy deferral', async () => {
    expect(await projectRelationalUnitFinalResponse('parent', data, dbFor({ status: 'COMPLETED', assignmentRef: null }), async () => { throw new Error('private decoder error') }))
      .toEqual({ submissionId: 'final', payloadHash: 'hash', replayed: true, completed: true, detailUnavailable: true })
  })
  it('does not build or leak details when fresh policy reading fails', async () => {
    const db = dbFor(null), failure = new Error('policy read unavailable'), build = vi.fn()
    db.$queryRaw.mockRejectedValue(failure)
    await expect(projectRelationalUnitFinalResponse('parent', data, db, build)).rejects.toBe(failure)
    expect(build).not.toHaveBeenCalled()
  })
})
