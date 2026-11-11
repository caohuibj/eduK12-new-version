import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { reportQueueObsEnabled, recordReportQueueEvent } from '../../services/reportQueueObservability'

describe('reportQueueObservability', () => {
  const prev = process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH
  afterEach(() => {
    if (prev === undefined) delete process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH
    else process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH = prev
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
})
