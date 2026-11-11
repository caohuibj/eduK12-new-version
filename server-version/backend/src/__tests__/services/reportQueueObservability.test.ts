import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { reportQueueObsEnabled, recordReportQueueEvent, recordReceiptCommit, reportQueueIdentityHash, sampleReportQueuePending, resetReportQueuePendingSamplerForTests, REPORT_QUEUE_PENDING_SAMPLE_MIN_INTERVAL_MS } from '../../services/reportQueueObservability'
import { prisma } from '../../config/database'
import { publishReportReady } from '../../services/reportReadyNotifications'

const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 24)

describe('reportQueueObservability', () => {
  const prev = process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH
  afterEach(() => {
    if (prev === undefined) delete process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH
    else process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH = prev
    resetReportQueuePendingSamplerForTests()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  it('is a no-op when the env path is unset', () => {
    delete process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH
    expect(reportQueueObsEnabled()).toBe(false)
    expect(() => recordReportQueueEvent({ kind: 'poll_tick' })).not.toThrow()
  })
  it('appends a jsonl event when the env path is set', () => {
    const dest = `/tmp/report-queue-obs-test-${process.pid}.jsonl`
    try { unlinkSync(dest) } catch { /* missing */ }
    process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH = dest
    expect(reportQueueObsEnabled()).toBe(true)
    recordReportQueueEvent({ kind: 'poll_tick', tick: 1, empty: true })
    const line = readFileSync(dest, 'utf8').trim()
    const ev = JSON.parse(line)
    expect(ev.v).toBe(1)
    expect(ev.kind).toBe('poll_tick')
    expect(ev.tick).toBe(1)
    expect(typeof ev.tMs).toBe('number')
    expect(typeof ev.pid).toBe('number')
    expect(existsSync(dest)).toBe(true)
    unlinkSync(dest)
  })
  it('writes timeline-style hashes instead of raw attempt or job identifiers', () => {
    const dest = `/tmp/report-queue-obs-hash-${process.pid}.jsonl`
    try { unlinkSync(dest) } catch { /* missing */ }
    process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH = dest
    const attemptId = 'attempt-raw-id'
    const jobId = 'job-raw-id'
    recordReceiptCommit({
      attemptId, attemptEpoch: 3, acceptedAt: new Date('2026-11-11T00:00:00Z'), queueDepth: 2, replayed: false,
    })
    recordReportQueueEvent({ kind: 'claim', attemptId, jobId, rows: 1 })
    const events = readFileSync(dest, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(reportQueueIdentityHash(attemptId)).toBe(digest(attemptId))
    expect(events[0]).toMatchObject({ kind: 'receipt_commit', attemptHash: digest(attemptId), attemptEpoch: 3, replayed: false })
    expect(events[1]).toMatchObject({ kind: 'claim', attemptHash: digest(attemptId), jobHash: digest(jobId), rows: 1 })
    for (const ev of events) {
      expect(ev).not.toHaveProperty('attemptId')
      expect(ev).not.toHaveProperty('jobId')
      expect(JSON.stringify(ev)).not.toContain(attemptId)
      expect(JSON.stringify(ev)).not.toContain(jobId)
    }
    unlinkSync(dest)
  })
  it('records publish_ready as skipped when the wait channel is off', async () => {
    const dest = `/tmp/report-queue-obs-publish-${process.pid}.jsonl`
    try { unlinkSync(dest) } catch { /* missing */ }
    process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH = dest
    const previous = process.env.ASSESSMENT_REPORT_READY_WAIT_ENABLED
    delete process.env.ASSESSMENT_REPORT_READY_WAIT_ENABLED
    try {
      await publishReportReady('attempt-raw-id', 4)
    } finally {
      if (previous === undefined) delete process.env.ASSESSMENT_REPORT_READY_WAIT_ENABLED
      else process.env.ASSESSMENT_REPORT_READY_WAIT_ENABLED = previous
    }
    const ev = JSON.parse(readFileSync(dest, 'utf8').trim())
    expect(ev).toMatchObject({ kind: 'publish_ready', attemptHash: digest('attempt-raw-id'), attemptEpoch: 4, outcome: 'skipped' })
    expect(ev).not.toHaveProperty('attemptId')
    unlinkSync(dest)
  })
  it('does not sample the pending queue when the obs path is unset', async () => {
    delete process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH
    const query = vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ pending: 4 }])
    await sampleReportQueuePending(1, 2)
    expect(query).not.toHaveBeenCalled()
  })
  it('single-flights pending samples and skips calls inside the minimum interval', async () => {
    const dest = `/tmp/report-queue-obs-sample-${process.pid}.jsonl`
    try { unlinkSync(dest) } catch { /* missing */ }
    process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH = dest
    let release!: (value: Array<{ pending: number }>) => void
    const query = vi.spyOn(prisma, '$queryRaw').mockImplementation(() => new Promise(resolve => { release = resolve }) as any)
    const first = sampleReportQueuePending(1, 6)
    await Promise.resolve()
    const overlapping = sampleReportQueuePending(2, 6)
    release([{ pending: 9 }])
    await Promise.all([first, overlapping])
    expect(query).toHaveBeenCalledTimes(1)
    const firstEvent = JSON.parse(readFileSync(dest, 'utf8').trim().split('\n')[0])
    expect(firstEvent).toMatchObject({ kind: 'pending_sample', pending: 9, slotsBusy: 1, concurrency: 6 })
    await sampleReportQueuePending(3, 6)
    expect(query).toHaveBeenCalledTimes(1)
    vi.useFakeTimers()
    vi.advanceTimersByTime(REPORT_QUEUE_PENDING_SAMPLE_MIN_INTERVAL_MS)
    query.mockResolvedValue([{ pending: 1 }])
    await sampleReportQueuePending(3, 6)
    expect(query).toHaveBeenCalledTimes(2)
    unlinkSync(dest)
  })
})
