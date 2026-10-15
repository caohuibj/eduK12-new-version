import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger } from '../../utils/logger'
import { markAssessmentTimeline, measureRequestPhase, traceAssessmentPhase, withAssessmentReportTimeline } from '../../services/runtimeObservability'
const original = { isolated: process.env.PERF_ISOLATED_TEST_MODE, enabled: process.env.ASSESSMENT_TIMELINE_ENABLED }
afterEach(() => {
  if (original.isolated === undefined) delete process.env.PERF_ISOLATED_TEST_MODE; else process.env.PERF_ISOLATED_TEST_MODE = original.isolated
  if (original.enabled === undefined) delete process.env.ASSESSMENT_TIMELINE_ENABLED; else process.env.ASSESSMENT_TIMELINE_ENABLED = original.enabled
  vi.restoreAllMocks()
})
const enabled = () => { process.env.PERF_ISOLATED_TEST_MODE = '1'; process.env.ASSESSMENT_TIMELINE_ENABLED = 'true' }
describe('bounded technical assessment timelines', () => {
  it('keeps raw request properties out of logs and records monotonic spans', async () => {
    enabled(); const output = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    await withAssessmentReportTimeline({ attemptId: 'private-participant-label', answers: 'private-answers', cookie: 'private-cookie', leaseToken: 'private-lease' } as any, async () => {
      await traceAssessmentPhase('report.unit', () => measureRequestPhase('final_submit_scoring', async () => 42), 'private-unit-id')
      markAssessmentTimeline('report.ready_commit_confirmed')
    })
    expect(output).toHaveBeenCalledTimes(1)
    const text = String(output.mock.calls[0][0])
    for (const value of ['private-participant-label', 'private-answers', 'private-cookie', 'private-lease', 'private-unit-id']) expect(text).not.toContain(value)
    const record = JSON.parse(text.slice('ASSESSMENT_TIMELINE '.length))
    expect(record.events.map((event: { name: string }) => event.name)).toContain('final_submit_scoring')
    expect(record.events.every((event: { startNs: string; endNs: string }) => BigInt(event.endNs) >= BigInt(event.startNs))).toBe(true)
    expect(record.dropped).toBe(0)
  })
  it('caps collection and never lets diagnostic output failure change a report result', async () => {
    enabled(); const output = vi.spyOn(logger, 'info').mockImplementation(() => { throw new Error('diagnostics unavailable') })
    expect(await withAssessmentReportTimeline({ attemptId: 'technical-attempt' }, async () => { for (let i = 0; i < 700; i++) markAssessmentTimeline('report.unit'); return 'durable' })).toBe('durable')
    expect(output).toHaveBeenCalledTimes(1)
    const record = JSON.parse(String(output.mock.calls[0][0]).slice('ASSESSMENT_TIMELINE '.length))
    expect(record.events).toHaveLength(512); expect(record.dropped).toBeGreaterThan(0)
  })
  it('requires both explicit isolated mode and timeline enablement', async () => {
    process.env.PERF_ISOLATED_TEST_MODE = '0'; process.env.ASSESSMENT_TIMELINE_ENABLED = 'true'
    const output = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    expect(await withAssessmentReportTimeline({ attemptId: 'technical-attempt' }, async () => { markAssessmentTimeline('report.unit'); return 9 })).toBe(9)
    expect(output).not.toHaveBeenCalled()
  })
})
