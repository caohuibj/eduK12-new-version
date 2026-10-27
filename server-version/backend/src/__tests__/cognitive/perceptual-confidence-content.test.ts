import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSnapshot } from '../../modules/cognitive/content-candidates/perceptual-confidence/package'
import { config, plan, stimulus, review, type Config, type Plan, type Raw, type Activation } from '../../modules/cognitive/content-candidates/perceptual-confidence/protocol'
import { PcCapture } from '../../modules/cognitive/content-candidates/perceptual-confidence/capture'
import { score, envelope } from '../../modules/cognitive/content-candidates/perceptual-confidence/scorer'
import { projectReport, isReport, download, takeHomeSvg, narrative } from '../../modules/cognitive/content-candidates/perceptual-confidence/report'
const seed = 'pc-synthetic-reference-records'
const action = (target: Activation['target'], atMs: number): Activation => ({ kind: 'activate', atMs, target, input: 'assistive', token: 'assistive', key: null, repeat: false })
function raw(c: Config, p: Plan, correct = true, rating = 1, mode: 'pair' | 'skip-side' | 'skip-confidence' | 'interrupt-confidence' | 'interrupt-fixation' = 'pair'): Raw {
  const start = 100 + p.index * 10_000, cap = new PcCapture(c, p, start)
  if (mode === 'interrupt-fixation') { cap.interrupt('synthetic-stop', start + 1); return cap.raw }
  cap.tick(start + 1000); cap.drawn(start + 1001); const ready = start + 1001 + (p.phase === 'practice' ? 500 : 200); cap.tick(ready)
  if (mode === 'skip-side') cap.input(action('skip', ready)); else { cap.input(action(correct ? p.target : p.target === 'left' ? 'right' : 'left', ready)); if (mode === 'interrupt-confidence') cap.interrupt('synthetic-stop', ready + 1); else cap.input(action(mode === 'skip-confidence' ? 'skip' : String(rating) as Activation['target'], ready)) }
  return cap.raw
}
function fixture(profile: 'research' | 'experience' = 'experience') { const snapshot = createSnapshot(profile), c = snapshot.config, plans = plan(c, seed); return { snapshot, c, plans, score: (records: Raw[]) => score({ session: snapshot, config: c, randomSeed: seed, trials: records.map(envelope) }) } }
describe('perceptual confidence native authority', () => {
  it('freezes 300/60 complete six-cell plans and four easier practice items without an adaptive staircase', () => {
    for (const profile of ['research', 'experience'] as const) { const f = fixture(profile), n = profile === 'research' ? 50 : 10; expect(f.plans).toHaveLength(n * 6); expect(plan(f.c, seed)).toEqual(f.plans); expect(plan(f.c, seed + 'other')).not.toEqual(f.plans)
      for (const side of ['left', 'right']) for (const strength of [4, 10, 20]) expect(f.plans.filter(p => p.target === side && p.strengthPercent === strength)).toHaveLength(n)
      for (let b = 0; b < f.c.blocks; b++) { const rows = f.plans.filter(p => p.block === b); expect(rows).toHaveLength(60); expect(new Set(rows.map(p => p.conditionId)).size).toBe(6) }
      for (let round = 0; round < 3; round++) { const rows = plan(f.c, seed, 'practice', round); expect(rows.map(p => p.target)).toEqual(['right', 'left', 'left', 'right']); expect(rows.every(p => p.strengthPercent === 45 && p.round === round)).toBe(true) }
      expect(f.c).toMatchObject({ fixationMs: 1000, stimulusMs: 200, interTrialMs: 1000, judgmentDeadlineMs: null, confidenceDeadlineMs: null, practice: { trials: 4, stimulusMs: 500, minimumCorrect: 3, confidencePreference: null } }); expect(() => plan(f.c, seed, 'practice', 3)).toThrow(); expect(() => plan({ ...f.c, totalTrials: 30 } as never, seed)).toThrow()
    }
    expect(plan(config('research'), seed).slice(0, 60)).toEqual(plan(config('experience'), seed))
  })
  it('produces original equal-channel pixels matching independent Python golden bytes and changes seeds without importing assets', () => {
    const c = config('experience'), p: Plan = { index: 0, phase: 'test', round: 0, block: 0, target: 'right', strengthPercent: 10, conditionId: 'right:10', stimulusSeed: 'pc-known-frame' }, frames = stimulus(p, c)
    expect(createHash('sha256').update(frames.left.rgba).digest('hex')).toBe('9d5139ac496670643eae304e43cad47e3b00ba7cfff7daaf0b9bc97179202739'); expect(createHash('sha256').update(frames.right.rgba).digest('hex')).toBe('ec7a2d8a0c793f0fdf96209ffaae740639b547bdf5867d30456e079316d750e3')
    for (const v of [frames.left, frames.right]) { expect(v.rgba).toHaveLength(65536); for (let i = 0; i < v.rgba.length; i += 4) { expect(v.rgba[i]).toBe(v.rgba[i + 1]); expect(v.rgba[i]).toBe(v.rgba[i + 2]); expect(v.rgba[i + 3]).toBe(255) } }
    expect(stimulus({ ...p, stimulusSeed: 'other' }, c).right.checksum).not.toBe(frames.right.checksum)
  })
  it('scores retained 300/60 software-capture originals into the approved descriptive worked report', () => {
    const d = resolve(process.cwd(), '../../docs/cognitive-library/scenario-roadmap-20261027/domains/occupational/perceptual-confidence-implementation'); mkdirSync(d, { recursive: true })
    for (const profile of ['research', 'experience'] as const) { const f = fixture(profile), records = f.plans.map(p => { const i = p.index % 60, rating = i < 12 ? 1 : i < 30 ? 2 : i < 48 ? 3 : 4, correct = i < 12 ? i < 6 : i < 30 ? i < 27 : i < 48 ? i < 43 : i < 59; return raw(f.c, p, correct, rating) }), scored = f.score(records), report = projectReport(scored), factor = profile === 'research' ? 5 : 1
      expect(report).toMatchObject({ state: 'interpretable', summary: { judged: 60 * factor, correct: 45 * factor, paired: 60 * factor } }); expect(report.summary!.ratings.map(r => r.n)).toEqual([12, 18, 18, 12].map(n => n * factor)); expect(report.summary!.ratings.map(r => r.correct)).toEqual([6, 15, 13, 11].map(n => n * factor)); expect(narrative(report, 'en')).toContain('confidence'); expect(scored.metrics).not.toHaveProperty('score')
      writeFileSync(resolve(d, `${profile}-synthetic-originals.json`), JSON.stringify({ kind: 'SYNTHETIC_SOFTWARE_CAPTURE_DRAW_ACK_NOT_PARTICIPANT_OR_PHYSICAL_EXPOSURE', snapshot: f.snapshot, randomSeed: seed, raw: records, envelopes: records.map(envelope), score: scored, report }, null, 2) + '\n'); writeFileSync(resolve(d, `${profile}-public-report.json`), download(report)! + '\n'); writeFileSync(resolve(d, `${profile}-public-summary.svg`), takeHomeSvg(report)!)
    }
  })
  it('preserves missing confidence, genuine zero RT/accuracy, signed negative differences and unpresented records', () => {
    const f = fixture(), none = projectReport(f.score([raw(f.c, f.plans[0], true, 1, 'interrupt-fixation')])); expect(none).toMatchObject({ state: 'invalid', started: 1, presented: 0, summary: null }); expect(download(none)).toBeNull(); expect(takeHomeSvg(none)).toBeNull()
    const p = projectReport(f.score([raw(f.c, f.plans[0], false, 1, 'skip-confidence'), raw(f.c, f.plans[1], true, 1, 'skip-side'), raw(f.c, f.plans[2], true, 1, 'interrupt-confidence')]))
    expect(p).toMatchObject({ state: 'limited', summary: { judged: 2, correct: 1, paired: 0, skippedJudgment: 1, skippedConfidence: 1, interruptions: 1 }, strongMinusWeakAccuracy: null }); expect(takeHomeSvg(p)).toContain('没有信心配对'); expect(p.conditions!.some(c => c.started === 0 && c.accuracy === null)).toBe(true)
    const zero = projectReport(f.score(f.plans.map(p => raw(f.c, p, false, 4)))); expect(zero).toMatchObject({ state: 'interpretable', summary: { correct: 0, accuracy: 0, paired: 60 }, strongMinusWeakAccuracy: 0 }); expect(review(raw(f.c, f.plans[0]), f.plans[0], f.c)).toMatchObject({ judgmentMs: 0, confidenceMs: 0 })
    const negative = projectReport(f.score(f.plans.map(p => raw(f.c, p, p.strengthPercent === 4)))); expect(negative.strongMinusWeakAccuracy).toBe(-1)
    expect(() => f.score([raw(f.c, f.plans[0], true, 1, 'interrupt-confidence'), raw(f.c, f.plans[1])])).toThrow()
  })
  it('separates stage activation, first responses, repeat/multi-contact, nominal timers and input bounds', () => {
    const f = fixture(), p = f.plans[0], cap = new PcCapture(f.c, p, 100), down: Activation = { kind: 'down', atMs: 101, target: 'left', input: 'keyboard', token: 'left', key: 'ArrowLeft', repeat: false }
    cap.input(down); cap.tick(1200); cap.drawn(1201); expect(() => cap.drawn(1202)).toThrow(); cap.tick(1300); expect(cap.raw.state.stage).toBe('stimulus'); cap.tick(1600); cap.input({ ...down, kind: 'up', atMs: 1601 }); expect(cap.raw.state.choice).toBeNull(); cap.input({ ...down, atMs: 1602 }); cap.input({ ...down, atMs: 1603, repeat: true }); cap.input({ ...down, kind: 'up', atMs: 1604 }); expect(cap.raw.state.choice).toBe('left'); cap.input(action('right', 1605)); expect(cap.raw.state.stage).toBe('confidence'); cap.input(action('1', 1606)); cap.input(action('4', 1607)); expect(review(cap.raw, p, f.c).rating).toBe(1); expect(cap.raw.ignoredRepeatCount).toBe(1)
    const multi = new PcCapture(f.c, p, 100); multi.tick(1100); multi.drawn(1101); multi.tick(1301); multi.input({ ...down, atMs: 1302 }); multi.input({ ...down, token: 'second', target: 'right', key: 'ArrowRight', atMs: 1303 }); multi.input({ ...down, kind: 'up', atMs: 1304 }); multi.input({ ...down, token: 'second', target: 'right', key: 'ArrowRight', kind: 'cancel', atMs: 1305 }); expect(multi.raw.state.choice).toBeNull(); multi.input(action('left', 1306)); multi.input(action('1', 1307)); expect(review(multi.raw, p, f.c).choice).toBe('left')
    const bound = new PcCapture(f.c, p, 100); for (let i = 0; i < 257; i++) bound.input(action('left', 101 + i)); expect(bound.raw.overflow).toBe(true); expect(review(bound.raw, p, f.c).choice).toBeNull()
  })
  it('rejects forged stimuli/states/clocks/envelopes/versions and scrubs every public channel', () => {
    const f = fixture(), records = f.plans.map(p => raw(f.c, p)), bad = structuredClone(records); bad[0].checksums.right = '00000000'; expect(() => f.score(bad)).toThrow(); const wrong = structuredClone(records); wrong[0].state.rating = 4; expect(() => f.score(wrong)).toThrow(); expect(() => f.score([...records].reverse())).toThrow()
    const e = envelope(records[0]); e.durationMs++; expect(() => score({ session: f.snapshot, config: f.c, randomSeed: seed, trials: [e] })).toThrow(); expect(() => score({ session: { ...f.snapshot, configVersion: 'next' }, config: f.c, randomSeed: seed, trials: [] })).toThrow()
    const scored = f.score(records); (scored.metrics.summary as Record<string, unknown>).privateMetric = 'DO_NOT_PUBLISH'; const r = projectReport(scored); expect(download({ ...r, privateMetric: 'DO_NOT_PUBLISH' } as never)).not.toContain('DO_NOT_PUBLISH'); expect(download(r)).not.toContain('observations'); expect(takeHomeSvg(r)).not.toContain('DO_NOT_PUBLISH'); expect(isReport({ ...r, presentationVersion: 'next' })).toBe(false); expect(isReport({ ...r, strongMinusWeakAccuracy: -100 })).toBe(false)
    const invalid = projectReport(f.score([])); expect(download(invalid)).toBeNull(); expect(takeHomeSvg(invalid)).toBeNull(); expect(narrative(invalid, 'en')).toBeNull()
  })
})
