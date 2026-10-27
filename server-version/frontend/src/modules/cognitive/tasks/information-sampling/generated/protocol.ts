/** Independent original colour/shape implementation informed by Experiment Factory's MIT IST. */
export type Profile = 'research' | 'experience'
export type Rule = 'fixed' | 'decreasing'
export type Category = 'blue-circle' | 'orange-triangle'
export type Input = 'touch' | 'mouse' | 'pen' | 'keyboard' | 'assistive'
export const IST_IDENTITY = { testType: 'information-sampling', engineVersion: '0.1.0', scoringVersion: '0.1.0', configVersion: '0.1.0' } as const
export const IST_PROTOCOL = { schemaVersion: 1 as const, key: 'information-sampling/0.1.0/0.1.0', version: '0.1.0', clock: 'performance' as const, randomizationAlgorithmVersion: 'ist-fnv1a-utf16-xorshift32-balanced-v1', trialEnvelopeVersion: 1 as const, phases: [{ key: 'test' as const, persists: true, required: true }], measurementCriticalConfigPaths: ['*'] }
export function istConfig(profile: Profile) {
  if (profile !== 'research' && profile !== 'experience') throw Error('Unknown IST profile')
  return {
    profile, totalTrials: profile === 'research' ? 20 : 10, majorityCounts: [13, 14, 15, 16, 17], repetitions: profile === 'research' ? 2 : 1,
    grid: { rows: 5, columns: 5, tilePx: 48, gapPx: 6, blue: '#176B9A', orange: '#A84D12' },
    feedbackMs: 2000, incentive: 'hypothetical-task-points-no-cash', choiceDeadlineMs: null,
    reward: { fixedCorrect: 100, decreasingStart: 250, perReveal: 10, incorrect: -100 },
    practice: { trials: 2, majorityCount: 21, quizQuestions: 3, maximumGroups: 3, criterion: 'complete-two-judgments-and-three-rule-questions-correct-not-preference-or-reward' },
    profileDefinitionVersion: '0.1.0', parameterExplanationVersion: '0.1.0', metricDefinitionVersion: '0.1.0', qualityDefinitionVersion: '0.1.0', reportDefinitionVersion: '0.1.0', presentationVersion: '0.1.0',
  } as const
}
export type IstConfig = ReturnType<typeof istConfig>
function ordered(v: unknown): unknown { if (Array.isArray(v)) return v.map(ordered); if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, ordered((v as Record<string, unknown>)[k])])); return v }
export const same = (a: unknown, b: unknown) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b))
export function assertIstConfig(v: unknown): asserts v is IstConfig { if (!v || typeof v !== 'object' || !same(v, istConfig((v as IstConfig).profile))) throw Error('Unknown exact IST configuration') }
export const other = (c: Category): Category => c === 'blue-circle' ? 'orange-triangle' : 'blue-circle'
function random(seed: string) { let s = 2166136261; for (let i = 0; i < seed.length; i++) s = Math.imul(s ^ seed.charCodeAt(i), 16777619); s = s >>> 0 || 0x9e3779b9; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 } }
function shuffled<T>(a: readonly T[], r: () => number): T[] { const v = [...a]; for (let i = v.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [v[i], v[j]] = [v[j], v[i]] } return v }
export interface IstPlan { index: number; phase: 'practice' | 'test'; round: number; block: number; rule: Rule; majorityCount: number; majority: Category; board: Category[]; optionOrder: Category[] }
export function istPlan(config: IstConfig, seed: string, phase: 'practice' | 'test' = 'test', round = 0): IstPlan[] {
  assertIstConfig(config)
  if (!seed || seed.length > 256 || !['practice', 'test'].includes(phase) || !Number.isInteger(round) || round < 0 || round > 2 || (phase === 'test' && round !== 0)) throw Error('Invalid IST seed/phase/round')
  const r = random(`${IST_PROTOCOL.randomizationAlgorithmVersion}|${seed}|${phase}|${round}`), offset = Math.floor(r() * 2)
  const board = (n: number, majority: Category) => shuffled(Array.from({ length: 25 }, (_, i) => i < n ? majority : other(majority)), r)
  if (phase === 'practice') return (['fixed', 'decreasing'] as const).map((rule, index) => { const majority: Category = index === 0 ? 'blue-circle' : 'orange-triangle'; return { index, phase, round, block: index, rule, majorityCount: 21, majority, board: board(21, majority), optionOrder: ['blue-circle', 'orange-triangle'] } })
  const rules: Rule[] = r() < 0.5 ? ['fixed', 'decreasing'] : ['decreasing', 'fixed'], result: IstPlan[] = []
  rules.forEach((rule, block) => {
    const cells: Omit<IstPlan, 'index' | 'board'>[] = []
    config.majorityCounts.forEach((n, m) => { for (let rep = 0; rep < config.repetitions; rep++) { const majority: Category = (m + rep + offset + block) % 2 ? 'orange-triangle' : 'blue-circle'; cells.push({ phase, round: 0, block, rule, majorityCount: n, majority, optionOrder: ['blue-circle', 'orange-triangle'] }) } })
    for (const cell of shuffled(cells, r)) result.push({ ...cell, index: result.length, board: board(cell.majorityCount, cell.majority) })
  })
  return result
}
export interface IstActivation { kind: 'down' | 'up' | 'cancel' | 'activate'; atMs: number; target: string; input: Input; token: string; key: string | null; repeat: boolean }
export type IstEvent = IstActivation | { kind: 'feedback-ended'; atMs: number }
export interface IstReveal { cell: number; category: Category; atMs: number; input: Input }
export interface IstDecision { category: Category; atMs: number; rtMs: number; input: Input; revealedCount: number; correct: boolean; points: number }
export interface IstState { stage: 'sampling' | 'feedback' | 'complete'; reveals: IstReveal[]; decision: IstDecision | null; held: { token: string; target: string; input: Input; key: string | null; startedAtMs: number; eligible: boolean }[]; feedbackUntilMs: number | null; completeAtMs: number | null; ignored: { duplicate: number; inactive: number; unmatched: number; multiContact: number } }
export interface IstRaw { plan: IstPlan; startedAtPerfMs: number; endedAtPerfMs: number; status: 'complete' | 'interrupted'; stopReason: string | null; events: IstEvent[]; state: IstState; ignoredRepeatCount: number; overflow: boolean }
export function initialIstState(): IstState { return { stage: 'sampling', reveals: [], decision: null, held: [], feedbackUntilMs: null, completeAtMs: null, ignored: { duplicate: 0, inactive: 0, unmatched: 0, multiContact: 0 } } }
export function istPoints(rule: Rule, correct: boolean, n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 25) throw Error('Invalid distinct reveal count')
  return !correct ? -100 : rule === 'fixed' ? 100 : 250 - 10 * n
}
export function isIstTarget(target: string) { return /^cell:(?:[0-9]|1[0-9]|2[0-4])$/.test(target) || target === 'choice:blue-circle' || target === 'choice:orange-triangle' }
export function reduceIstEvent(s: IstState, e: IstEvent, plan: IstPlan, c: IstConfig, started: number) {
  if (e.kind === 'feedback-ended') {
    if (s.stage !== 'feedback' || s.feedbackUntilMs === null || e.atMs < s.feedbackUntilMs) throw Error('IST feedback was not completed')
    s.stage = 'complete'; s.completeAtMs = e.atMs; return
  }
  if (!isIstTarget(e.target) || !['touch', 'mouse', 'pen', 'keyboard', 'assistive'].includes(e.input)) throw Error('Invalid IST input target')
  if (e.input === 'keyboard') { if (!['Enter', 'Space'].includes(e.key ?? '') || e.token !== 'key:' + e.key || e.kind === 'activate') throw Error('IST keyboard mapping differs') }
  else if (e.key !== null || (e.input === 'assistive' ? e.kind !== 'activate' || e.token !== 'assistive' : e.kind === 'activate' || !/^pointer:[0-9]+$/.test(e.token))) throw Error('IST pointer/assistive mapping differs')
  if (e.repeat) throw Error('Repeated keys belong to the bounded repeat aggregate')
  const existing = s.held.find(x => x.token === e.token)
  if (e.kind === 'cancel') { s.held = s.held.filter(x => x.token !== e.token); return }
  if (e.kind === 'down') {
    if (existing) { s.ignored.duplicate++; return }
    const eligible = s.stage === 'sampling' && s.held.length === 0
    if (s.held.length) { s.ignored.multiContact++; for (const h of s.held) h.eligible = false }
    s.held.push({ token: e.token, target: e.target, input: e.input, key: e.key, startedAtMs: e.atMs, eligible }); return
  }
  if (e.kind === 'up') {
    s.held = s.held.filter(x => x.token !== e.token)
    if (!existing || !existing.eligible || existing.target !== e.target || existing.input !== e.input || existing.key !== e.key || e.atMs < existing.startedAtMs) { s.ignored.unmatched++; return }
  } else if (s.held.length) { s.ignored.multiContact++; return }
  if (s.stage !== 'sampling') { s.ignored.inactive++; return }
  if (e.target.startsWith('cell:')) {
    const cell = Number(e.target.slice(5)); if (s.reveals.some(x => x.cell === cell)) { s.ignored.duplicate++; return }
    s.reveals.push({ cell, category: plan.board[cell], atMs: e.atMs, input: e.input }); return
  }
  const category = e.target.slice(7) as Category, correct = category === plan.majority, n = s.reveals.length
  s.decision = { category, correct, revealedCount: n, points: istPoints(plan.rule, correct, n), atMs: e.atMs, rtMs: e.atMs - started, input: e.input }
  s.stage = 'feedback'; s.feedbackUntilMs = e.atMs + c.feedbackMs
}
export function reviewIst(raw: IstRaw, plan: IstPlan, c: IstConfig) {
  if (!same(raw.plan, plan) || !Number.isFinite(raw.startedAtPerfMs) || raw.startedAtPerfMs < 0 || !Number.isFinite(raw.endedAtPerfMs) || raw.endedAtPerfMs < raw.startedAtPerfMs || raw.events.length > 256 || !Number.isInteger(raw.ignoredRepeatCount) || raw.ignoredRepeatCount < 0) throw Error('IST frozen plan/clock differs')
  const s = initialIstState(); let last = raw.startedAtPerfMs
  for (const e of raw.events) { if (!Number.isFinite(e.atMs) || e.atMs < last || e.atMs > raw.endedAtPerfMs) throw Error('IST event clock differs'); last = e.atMs; reduceIstEvent(s, e, plan, c, raw.startedAtPerfMs) }
  if (!same(s, raw.state)) throw Error('IST state differs from authoritative event replay')
  if (raw.status === 'complete') { if (s.stage !== 'complete' || s.completeAtMs !== raw.endedAtPerfMs || raw.stopReason !== null || raw.overflow) throw Error('Unexecuted IST round claimed complete') }
  else if (raw.status !== 'interrupted' || !raw.stopReason || s.stage === 'complete') throw Error('Invalid IST interruption')
  return { decision: s.decision, completed: s.stage === 'complete', openedWithoutDecision: s.decision === null ? s.reveals.length : null }
}
export const IST_QUIZ_ANSWERS = [0, 1, 1] as const
export interface IstQuizRaw { round: number; startedAtPerfMs: number; endedAtPerfMs: number; answers: (number | null)[]; submitted: boolean }
export function quizPassed(q: IstQuizRaw) { return q.submitted && q.answers.length === 3 && q.answers.every((v, i) => v === IST_QUIZ_ANSWERS[i]) }
