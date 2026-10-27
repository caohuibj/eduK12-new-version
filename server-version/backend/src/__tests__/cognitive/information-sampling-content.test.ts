import { describe, it, expect } from 'vitest'
import { createIstSnapshot } from '../../modules/cognitive/content-candidates/information-sampling/package'
import { istConfig, istPlan, initialIstState, reduceIstEvent, reviewIst, other, type IstRaw, type IstPlan, type IstConfig, type IstEvent } from '../../modules/cognitive/content-candidates/information-sampling/protocol'
import { scoreIst, istEnvelope } from '../../modules/cognitive/content-candidates/information-sampling/scorer'
import { projectIstReport, istDownload, istTakeHomeSvg, isIstReport } from '../../modules/cognitive/content-candidates/information-sampling/report'
const seed = 'ist-synthetic-evidence'
function raw(c: IstConfig, p: IstPlan, opened: number, correct = true, stop: 'none' | 'before' | 'after' = 'none'): IstRaw {
  const start = 100 + p.index * 10_000, result: IstRaw = { plan: structuredClone(p), startedAtPerfMs: start, endedAtPerfMs: start, status: 'interrupted', stopReason: null, events: [], state: initialIstState(), ignoredRepeatCount: 0, overflow: false }; let now = start
  const event = (e: IstEvent) => { result.events.push(e); reduceIstEvent(result.state, e, p, c, start) }
  for (let i = 0; i < opened; i++) event({ kind: 'activate', atMs: ++now, target: 'cell:' + i, input: 'assistive', token: 'assistive', key: null, repeat: false })
  if (stop !== 'before') event({ kind: 'activate', atMs: ++now, target: 'choice:' + (correct ? p.majority : other(p.majority)), input: 'assistive', token: 'assistive', key: null, repeat: false })
  if (stop === 'none') { now += 2000; event({ kind: 'feedback-ended', atMs: now }); result.status = 'complete' } else result.stopReason = 'synthetic-interruption'
  result.endedAtPerfMs = now; return result
}
function session(profile: 'research' | 'experience' = 'experience') { const snapshot = createIstSnapshot(profile), config = snapshot.config, plan = istPlan(config, seed); return { snapshot, config, plan, score: (records: IstRaw[]) => scoreIst({ session: snapshot, config, randomSeed: seed, trials: records.map(istEnvelope) }) } }
describe('information sampling content authority', () => {
  it('freezes 20/10 complete conditions, original geometry and reproducible independent practice groups', () => {
    for (const profile of ['research', 'experience'] as const) { const f = session(profile), repeats = profile === 'research' ? 2 : 1
      expect(f.plan).toHaveLength(profile === 'research' ? 20 : 10); expect(istPlan(f.config, seed)).toEqual(f.plan); expect(istPlan(f.config, seed + '-other')).not.toEqual(f.plan)
      for (const rule of ['fixed', 'decreasing']) for (let m = 13; m <= 17; m++) { const rows = f.plan.filter(p => p.rule === rule && p.majorityCount === m); expect(rows).toHaveLength(repeats); expect(rows.every(p => p.board.length === 25 && p.board.filter(x => x === p.majority).length === m)).toBe(true) }
      for (const rule of ['fixed', 'decreasing']) { const rows = f.plan.filter(p => p.rule === rule), left = rows.filter(p => p.majority === p.optionOrder[0]).length; expect(Math.abs(left - (rows.length - left))).toBeLessThanOrEqual(1) }
      const practice = istPlan(f.config, seed, 'practice', 1); expect(practice.map(p => p.rule)).toEqual(['fixed', 'decreasing']); expect(practice.every(p => p.majorityCount === 21)).toBe(true); expect(practice).not.toEqual(istPlan(f.config, seed, 'practice', 0)); expect(f.config).toMatchObject({ feedbackMs: 2000, choiceDeadlineMs: null, practice: { trials: 2, quizQuestions: 3, maximumGroups: 3 } })
      expect(() => istPlan(f.config, seed, 'test', 1)).toThrow()
    }
  })
  it('replays exact first judgments and reproduces the approved signed worked report without a fabricated ability score', () => {
    const f = session(), ordinal = { fixed: 0, decreasing: 0 }, records = f.plan.map(p => { const i = ordinal[p.rule]++; return raw(f.config, p, (p.rule === 'fixed' ? 7 : 5) + i, p.rule === 'fixed' ? i !== 4 : i !== 2) }), score = f.score(records), report = projectIstReport(score)
    expect(report).toMatchObject({ state: 'interpretable', planned: 10, presented: 10, completed: 10, decreasingMinusFixedReveals: -2, groups: { fixed: { meanReveals: 9, correct: 4, decided: 5, points: 300 }, decreasing: { meanReveals: 7, correct: 4, decided: 5, points: 620 } } })
    expect(score.metrics).not.toHaveProperty('score'); expect(isIstReport(report)).toBe(true)
    const altered = structuredClone(records); altered[0].state.decision!.points = 999; expect(() => f.score(altered)).toThrow()
    const board = structuredClone(records); board[0].plan.board.reverse(); expect(() => f.score(board)).toThrow()
    const order = [...records].reverse(); expect(() => f.score(order)).toThrow()
    expect(() => scoreIst({ session: f.snapshot, config: istConfig('research'), randomSeed: seed, trials: [] })).toThrow()
    expect(() => scoreIst({ session: { ...f.snapshot, configVersion: 'next' }, config: f.config, randomSeed: seed, trials: [] })).toThrow()
  })
  it('preserves zero, null, wrong answers and judgments before a later interruption with actual condition denominators', () => {
    const f = session(), dw = f.plan.find(p => p.rule === 'decreasing')!, fw = f.plan.find(p => p.rule === 'fixed')!
    expect(reviewIst(raw(f.config, dw, 25), dw, f.config).decision).toMatchObject({ points: 0, revealedCount: 25, correct: true })
    expect(reviewIst(raw(f.config, dw, 0), dw, f.config).decision).toMatchObject({ points: 250, revealedCount: 0 })
    expect(reviewIst(raw(f.config, fw, 0, false), fw, f.config).decision).toMatchObject({ points: -100, correct: false })
    const first = f.plan[0], none = projectIstReport(f.score([raw(f.config, first, 3, true, 'before')]))
    expect(none).toMatchObject({ state: 'invalid', presented: 1, groups: null, decreasingMinusFixedReveals: null }); expect(istDownload(none)).toBeNull(); expect(istTakeHomeSvg(none)).toBeNull()
    const after = projectIstReport(f.score([raw(f.config, first, 3, false, 'after')]))
    expect(after).toMatchObject({ state: 'limited', completed: 0, decreasingMinusFixedReveals: null }); expect(after.groups![first.rule]).toMatchObject({ decided: 1, correct: 0, omissions: 0, interruptions: 1, points: -100 })
    expect(after.groups![first.rule === 'fixed' ? 'decreasing' : 'fixed']).toMatchObject({ decided: 0, meanReveals: null, points: null })
    const rows = [raw(f.config, first, 2), raw(f.config, f.plan[1], 4, true, 'before')], partial = projectIstReport(f.score(rows))
    expect(partial.groups![first.rule]).toMatchObject({ presented: 2, decided: 1, omissions: 1, interruptions: 1 }); expect(partial.decreasingMinusFixedReveals).toBeNull()
    expect(() => f.score([raw(f.config, first, 2, true, 'after'), raw(f.config, f.plan[1], 2)])).toThrow()
  })
  it('does not accept invented feedback completion, altered raw state, envelopes or conditions', () => {
    const f = session(), r = raw(f.config, f.plan[0], 7), e = istEnvelope(r)
    const incomplete = structuredClone(r); incomplete.events.pop(); expect(() => f.score([incomplete])).toThrow()
    const duplicate = structuredClone(r); duplicate.state.reveals.push(duplicate.state.reveals[0]); expect(() => f.score([duplicate])).toThrow()
    expect(() => scoreIst({ session: f.snapshot, config: f.config, randomSeed: seed, trials: [{ ...e, flags: { timeout: true, premature: false } }] })).toThrow()
    expect(() => scoreIst({ session: f.snapshot, config: f.config, randomSeed: seed, trials: [{ ...e, condition: 'fixed:99' }] })).toThrow()
    const otherPhase = structuredClone(r); otherPhase.plan.phase = 'practice'; expect(() => f.score([otherPhase])).toThrow()
  })
  it('scrubs internal metrics from every public channel and refuses unknown report combinations', () => {
    const f = session(), score = f.score(f.plan.map(p => raw(f.config, p, 25))), internal = score.metrics.groups as Record<string, Record<string, unknown>>
    internal.fixed.privateMetric = 'DO_NOT_PUBLISH'; score.metrics.privateMetric = 'DO_NOT_PUBLISH'
    const report = projectIstReport(score), text = istDownload({ ...report, privateMetric: 'DO_NOT_PUBLISH' } as never)!, svg = istTakeHomeSvg(report)!
    expect(text).not.toContain('DO_NOT_PUBLISH'); expect(text).not.toContain('observations'); expect(svg).not.toContain('DO_NOT_PUBLISH'); expect(svg).toContain('EDUK12.TOP'); expect(report.groups!.decreasing.points).toBe(0)
    expect(isIstReport({ ...report, presentationVersion: 'next' })).toBe(false); expect(isIstReport({ ...report, decreasingMinusFixedReveals: 99 })).toBe(false)
    const invalid = projectIstReport(f.score([])); expect(invalid.groups).toBeNull(); expect(istDownload(invalid)).toBeNull(); expect(istTakeHomeSvg(invalid, 'en')).toBeNull()
    expect(() => projectIstReport({ ...score, metrics: { ...score.metrics, reportBinding: { ...(score.metrics.reportBinding as object), parameterExplanationVersion: 'next' } } })).toThrow()
  })
})
