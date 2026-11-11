import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logger } from '../../utils/logger'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import {
  markAssessmentTimeline, measureRequestPhase, traceAssessmentPhase,
  withAssessmentReportTimeline, tracePrismaInteractiveTransaction, withQueryRawLabel,
  recordPrismaCall,
} from '../../services/runtimeObservability'
const original = {
  isolated: process.env.PERF_ISOLATED_TEST_MODE,
  enabled: process.env.ASSESSMENT_TIMELINE_ENABLED,
  sink: process.env.CHAIN_TIMELINE_PATH,
}
afterEach(() => {
  if (original.isolated === undefined) delete process.env.PERF_ISOLATED_TEST_MODE; else process.env.PERF_ISOLATED_TEST_MODE = original.isolated
  if (original.enabled === undefined) delete process.env.ASSESSMENT_TIMELINE_ENABLED; else process.env.ASSESSMENT_TIMELINE_ENABLED = original.enabled
  if (original.sink === undefined) delete process.env.CHAIN_TIMELINE_PATH; else process.env.CHAIN_TIMELINE_PATH = original.sink
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

  it('emits no timeline or canonical output when flags are off', async () => {
    delete process.env.PERF_ISOLATED_TEST_MODE
    delete process.env.ASSESSMENT_TIMELINE_ENABLED
    delete process.env.CHAIN_TIMELINE_PATH
    const output = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    const value = { k: 'off-default' }
    expect(canonicalHash(value)).toMatch(/^[a-f0-9]{64}$/)
    expect(canonicalHash(value)).toBe(canonicalHash({ k: 'off-default' }))
    expect(await withAssessmentReportTimeline({ attemptId: 'secret-attempt' }, async () => {
      await traceAssessmentPhase('report.prepare.write', async () => 1)
      return 'ok'
    })).toBe('ok')
    expect(output).not.toHaveBeenCalled()
  })

  it('splits an interactive transaction into begin_wait, callback and commit', async () => {
    enabled(); const output = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    const client = {
      $transaction: async (fn: (tx: never) => Promise<unknown>) => {
        await new Promise(resolve => setTimeout(resolve, 5))
        const result = await fn({} as never)
        await new Promise(resolve => setTimeout(resolve, 5))
        return result
      },
    }
    await withAssessmentReportTimeline({ attemptId: 'technical-attempt' }, async () => {
      await tracePrismaInteractiveTransaction('whole', client, async () => {
        await traceAssessmentPhase('whole.tx.job_upsert_lock', async () => 'locked')
        return 'committed'
      })
    })
    const record = JSON.parse(String(output.mock.calls[0][0]).slice('ASSESSMENT_TIMELINE '.length))
    const names = record.events.map((event: { name: string }) => event.name)
    expect(names).toEqual(expect.arrayContaining(['whole.tx.begin_wait', 'whole.tx.callback', 'whole.tx.commit', 'whole.transaction_roundtrip', 'whole.tx.job_upsert_lock']))
    const byName = Object.fromEntries(record.events.map((event: { name: string; startNs: string; endNs: string }) => [event.name, event]))
    expect(BigInt(byName['whole.tx.begin_wait'].endNs)).toBe(BigInt(byName['whole.tx.callback'].startNs))
    expect(BigInt(byName['whole.tx.callback'].endNs)).toBe(BigInt(byName['whole.tx.commit'].startNs))
    expect(record.connAcquireOrBeginMs).toBeGreaterThanOrEqual(0)
  })

  it('counts canonical normalize calls by site and duplicate object identity', async () => {
    enabled(); const output = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    const payload = { items: [1, 2, 3], title: 'fixture' }
    await withAssessmentReportTimeline({ attemptId: 'technical-attempt' }, async () => {
      canonicalHash(payload)
      canonicalHash(payload)
      canonicalHash({ items: [1, 2, 3], title: 'fixture' })
    })
    const record = JSON.parse(String(output.mock.calls[0][0]).slice('ASSESSMENT_TIMELINE '.length))
    expect(record.canonical.totalCalls).toBeGreaterThanOrEqual(3)
    expect(record.canonical.duplicateIdentityCalls).toBeGreaterThanOrEqual(1)
    expect(record.canonical.uniqueSites).toBeGreaterThanOrEqual(1)
    expect(Object.keys(record.canonical.bySite).some(site => site.includes('assessment-timeline.test'))).toBe(true)
    expect(JSON.stringify(record)).not.toContain('technical-attempt')
  })

  it('labels queryRaw events and writes an optional sink only when enabled', async () => {
    enabled()
    const dir = mkdtempSync(join(tmpdir(), 'chain-timeline-'))
    const sink = join(dir, 'timeline.jsonl')
    process.env.CHAIN_TIMELINE_PATH = sink
    const output = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    await withAssessmentReportTimeline({ attemptId: 'secret-attempt-id', wholeAcceptedAt: new Date(Date.now() - 50) }, async () => {
      await withQueryRawLabel('start.raw.post_gate', async () => {
        recordPrismaCall(undefined, 'queryRaw', 3, process.hrtime.bigint() - 1_000_000n, process.hrtime.bigint())
      })
    })
    const record = JSON.parse(String(output.mock.calls[0][0]).slice('ASSESSMENT_TIMELINE '.length))
    expect(record.events.some((event: { name: string }) => event.name === 'start.raw.post_gate')).toBe(true)
    expect(record.events.some((event: { name: string }) => event.name === 'db.raw.queryRaw')).toBe(true)
    expect(JSON.stringify(record)).not.toContain('secret-attempt-id')
    const written = readFileSync(sink, 'utf8').trim()
    expect(written.length).toBeGreaterThan(0)
    expect(written).not.toContain('secret-attempt-id')
    rmSync(dir, { recursive: true, force: true })
  })
})
