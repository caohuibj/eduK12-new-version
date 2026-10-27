import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSnapshot } from '../../modules/cognitive/content-candidates/delay-choice/package'
import { config, plan, review, RATIOS, DELAYS, type Plan, type Config, type Raw, type Activation, quizPassed } from '../../modules/cognitive/content-candidates/delay-choice/protocol'
import { score, envelope } from '../../modules/cognitive/content-candidates/delay-choice/scorer'
import { projectReport, isReport, download, takeHomeSvg, narrative } from '../../modules/cognitive/content-candidates/delay-choice/report'
import { DelayCapture } from '../../modules/cognitive/content-candidates/delay-choice/capture'
const seed = 'delay-synthetic-research-records'
const event = (target: Activation['target'], atMs: number): Activation => ({ kind: 'activate', target, atMs, input: 'assistive', token: 'assistive', key: null, repeat: false })
function capture(c: Config, p: Plan, answer: 'sooner' | 'later' | 'skip' | 'interrupt', zeroRt = false): Raw { const start = 100 + p.index * 10_000, cap = new DelayCapture(c, p, start); if (answer === 'interrupt') cap.interrupt('synthetic-interruption', start + 200); else cap.input(event(answer === 'skip' ? 'skip' : answer === 'sooner' ? p.soonerSide : p.soonerSide === 'left' ? 'right' : 'left', start + (zeroRt ? 0 : 200))); return cap.raw }
function fixture(profile: 'research' | 'experience' = 'experience') { const snapshot = createSnapshot(profile), c = snapshot.config, plans = plan(c, seed); return { snapshot, c, plans, score: (rows: Raw[]) => score({ session: snapshot, config: c, randomSeed: seed, trials: rows.map(envelope) }) } }
describe('delay choice content authority', () => {
  it('freezes all 36 amount/date cells in both profiles with exact money, complete blocks and honest side balance', () => {
    for (const profile of ['research', 'experience'] as const) {
      const f = fixture(profile), repeats = profile === 'research' ? 2 : 1
      expect(f.plans).toHaveLength(36 * repeats); expect(plan(f.c, seed)).toEqual(f.plans); expect(plan(f.c, seed + 'other')).not.toEqual(f.plans)
      for (const [s, l] of DELAYS) for (const ratio of RATIOS) { const rows = f.plans.filter(p => p.soonerDays === s && p.laterDays === l && p.ratioPercent === ratio); expect(rows).toHaveLength(repeats); expect(rows.every(p => p.soonerAmount === 2000 && p.laterAmount === ratio * 20)).toBe(true); if (repeats === 2) expect(new Set(rows.map(p => p.soonerSide)).size).toBe(2) }
      for (let block = 0; block < repeats; block++) { const rows = f.plans.filter(p => p.block === block); expect(new Set(rows.map(p => p.conditionId)).size).toBe(36); expect(rows.filter(p => p.soonerSide === 'left')).toHaveLength(18) }
      for (let round = 0; round < 3; round++) { const practice = plan(f.c, seed, 'practice', round); expect(practice.map(p => [p.soonerAmount, p.laterAmount, p.soonerDays, p.laterDays])).toEqual([[1000, 1200, 0, 7], [800, 1000, 7, 14]]); expect(practice.every(p => p.round === round)).toBe(true) }
      expect(() => plan(f.c, seed, 'practice', 3)).toThrow(); expect(quizPassed({ round: 0, startedAtPerfMs: 100, endedAtPerfMs: Infinity, answers: [0, 1], submitted: true })).toBe(false); expect(() => plan(f.c, seed, 'test', 1)).toThrow(); expect(() => plan({ ...f.c, totalTrials: 1 } as never, seed)).toThrow()
      expect(f.c).toMatchObject({ responseDeadlineMs: null, transitionMs: 500, incentive: 'hypothetical-no-payment-no-real-wait', practice: { trials: 2, quizQuestions: 2, maximumGroups: 3 } })
    }
  })
  it('scores actual capture originals into signed reports and retains inspectable 72/36 synthetic evidence', () => {
    const output = resolve(process.cwd(), '../../docs/cognitive-library/scenario-roadmap-20261027/domains/occupational/delay-choice-implementation'); mkdirSync(output, { recursive: true })
    for (const profile of ['research', 'experience'] as const) {
      const f = fixture(profile), thresholds = [5, 3, 6, 4], raws = f.plans.map(p => capture(f.c, p, RATIOS.indexOf(p.ratioPercent as typeof RATIOS[number]) < thresholds[DELAYS.findIndex(v => v[0] === p.soonerDays && v[1] === p.laterDays)] ? 'later' : 'sooner')), scored = f.score(raws), report = projectReport(scored)
      expect(report).toMatchObject({ state: 'interpretable', summary: { answered: f.c.totalTrials, later: f.c.totalTrials / 2, sooner: f.c.totalTrials / 2, laterRate: .5 } }); expect(report.contrasts!.atToday28Minus14).toBeCloseTo(-2 / 9); expect(report.contrasts!.atDay14_42Minus28).toBeCloseTo(-2 / 9)
      expect(narrative(report, 'zh')).toContain(`${f.c.totalTrials / 2}次选择较晚`); expect(narrative(report, 'en')).toContain('choices'); expect(isReport(report)).toBe(true); expect(scored.metrics).not.toHaveProperty('score')
      writeFileSync(resolve(output, `${profile}-synthetic-originals.json`), JSON.stringify({ kind: 'SYNTHETIC_SOFTWARE_CAPTURE_NOT_PARTICIPANT_DATA', snapshot: f.snapshot, randomSeed: seed, raw: raws, envelopes: raws.map(envelope), score: scored, report }, null, 2) + '\n'); writeFileSync(resolve(output, `${profile}-public-report.json`), download(report)! + '\n'); writeFileSync(resolve(output, `${profile}-public-summary.svg`), takeHomeSvg(report)!)
    }
  })
  it('preserves actual zeros, nulls, explicit skips and unexecuted items without judging preferences', () => {
    const f = fixture(), allSooner = f.plans.map(p => capture(f.c, p, 'sooner', true)), zero = projectReport(f.score(allSooner))
    expect(zero).toMatchObject({ state: 'interpretable', summary: { later: 0, laterRate: 0 }, contrasts: { atToday28Minus14: 0, atDay14_42Minus28: 0 } }); expect(review(allSooner[0], f.plans[0]).rtMs).toBe(0)
    for (const rows of [[], [capture(f.c, f.plans[0], 'interrupt')], f.plans.map(p => capture(f.c, p, 'skip'))]) { const r = projectReport(f.score(rows)); expect(r.state).toBe('invalid'); expect(r.summary).toBeNull(); expect(download(r)).toBeNull(); expect(takeHomeSvg(r)).toBeNull(); expect(narrative(r, 'en')).toBeNull() }
    const partial = projectReport(f.score([capture(f.c, f.plans[0], 'sooner'), capture(f.c, f.plans[1], 'skip'), capture(f.c, f.plans[2], 'interrupt')]))
    expect(partial).toMatchObject({ state: 'limited', presented: 3, summary: { answered: 1, sooner: 1, later: 0, laterRate: 0, skipped: 1, interrupted: 1 }, contrasts: { atToday28Minus14: null, atDay14_42Minus28: null } }); expect(partial.conditions!.some(c => c.presented === 0 && c.laterRate === null)).toBe(true)
    expect(() => f.score([capture(f.c, f.plans[0], 'interrupt'), capture(f.c, f.plans[1], 'sooner')])).toThrow()
  })
  it('replays first complete activations, cancellations, multi-contact and bounded repeat input', () => {
    const f = fixture(), p = f.plans[0], cap = new DelayCapture(f.c, p, 100), down: Activation = { kind: 'down', atMs: 101, target: 'left', input: 'keyboard', token: 'key:Enter', key: 'Enter', repeat: false }
    cap.input(down); cap.input({ ...down, repeat: true, atMs: 102 }); cap.input({ ...down, kind: 'up', atMs: 103 }); cap.input(event('right', 104)); expect(cap.raw.events).toHaveLength(2); expect(cap.raw.ignoredRepeatCount).toBe(1); expect(review(cap.raw, p).side).toBe('left')
    for (const input of ['touch', 'mouse', 'pen'] as const) { const c = new DelayCapture(f.c, p, 100); c.input({ ...down, input, key: null, token: 'pointer:1' }); c.input({ ...down, kind: 'up', input, key: null, token: 'pointer:1', atMs: 102 }); expect(review(c.raw, p).side).toBe('left') }
    const multi = new DelayCapture(f.c, p, 100); multi.input(down); multi.input({ ...down, token: 'second', target: 'right', atMs: 102 }); multi.input({ ...down, kind: 'up', atMs: 103 }); multi.input({ ...down, kind: 'cancel', token: 'second', target: 'right', atMs: 104 }); expect(multi.done).toBe(false); multi.input(event('right', 105)); expect(review(multi.raw, p).side).toBe('right')
    const bound = new DelayCapture(f.c, p, 100); for (let i = 0; i < 257; i++) bound.input({ ...down, kind: i % 2 ? 'cancel' : 'down', atMs: 101 + i }); expect(bound.raw).toMatchObject({ overflow: true, status: 'interrupted', stopReason: 'input-log-bound' }); expect(review(bound.raw, p).choice).toBeNull()
    expect(() => new DelayCapture(f.c, p, -1)).toThrow()
  })
  it('rejects forged sequence/state/envelope/version and scrubs internal fields from all public channels', () => {
    const f = fixture(), rows = f.plans.map(p => capture(f.c, p, 'later')), altered = structuredClone(rows); altered[0].state.choice = 'sooner'; expect(() => f.score(altered)).toThrow()
    const amount = structuredClone(rows); amount[0].plan.laterAmount++; expect(() => f.score(amount)).toThrow(); expect(() => f.score([...rows].reverse())).toThrow()
    const time = envelope(rows[0]); time.durationMs++; expect(() => score({ session: f.snapshot, config: f.c, randomSeed: seed, trials: [time] })).toThrow()
    expect(() => score({ session: { ...f.snapshot, configVersion: 'next' }, config: f.c, randomSeed: seed, trials: [] })).toThrow(); expect(() => score({ session: f.snapshot, config: config('research'), randomSeed: seed, trials: [] })).toThrow()
    const scored = f.score(rows); (scored.metrics.summary as object as Record<string, unknown>).privateValue = 'DO_NOT_PUBLISH'; (scored.metrics.conditions as Record<string, unknown>[])[0].privateValue = 'DO_NOT_PUBLISH'; scored.metrics.privateValue = 'DO_NOT_PUBLISH'
    const r = projectReport(scored); expect(download({ ...r, privateValue: 'DO_NOT_PUBLISH' } as never)).not.toContain('DO_NOT_PUBLISH'); expect(takeHomeSvg(r)).not.toContain('DO_NOT_PUBLISH'); expect(download(r)).not.toContain('observations'); expect(isReport({ ...r, presentationVersion: 'next' })).toBe(false); expect(isReport({ ...r, contrasts: { ...r.contrasts, atToday28Minus14: -10 } })).toBe(false)
  })
})
