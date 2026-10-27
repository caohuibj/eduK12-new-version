export type Profile = 'research' | 'experience'
export type Side = 'left' | 'right'
export type Choice = 'sooner' | 'later'
export type Input = 'touch' | 'mouse' | 'pen' | 'keyboard' | 'assistive'
export const IDENTITY = { testType: 'delay-choice', engineVersion: '0.1.0', scoringVersion: '0.1.0', configVersion: '0.1.0' } as const
export const PROTOCOL = { schemaVersion: 1 as const, key: 'delay-choice/0.1.0/0.1.0', version: '0.1.0', clock: 'performance' as const, randomizationAlgorithmVersion: 'delay-fnv1a-utf16-xorshift32-block36-side-v1', trialEnvelopeVersion: 1 as const, phases: [{ key: 'test' as const, persists: true, required: true }], measurementCriticalConfigPaths: ['*'] }
export const RATIOS = [101, 105, 110, 115, 120, 125, 130, 150, 175] as const
export const DELAYS = [[0, 14], [0, 28], [14, 28], [14, 42]] as const
export function config(profile: Profile) {
  if (!['research', 'experience'].includes(profile)) throw Error('Unknown delay profile')
  return { profile, totalTrials: profile === 'research' ? 72 : 36, repetitions: profile === 'research' ? 2 : 1, blockTrials: 36, amountUnit: 'hypothetical-point-hundredths', soonerAmount: 2000, ratios: [...RATIOS], delays: DELAYS.map(v => [...v]), transitionMs: 500, responseDeadlineMs: null, incentive: 'hypothetical-no-payment-no-real-wait', inputPolicy: 'first-valid-full-activation-or-explicit-skip-v1', stimulus: { surface: '#FFFFFF', text: '#1F2937', border: '#526981', equalCardStyle: true }, practice: { trials: 2, quizQuestions: 2, maximumGroups: 3, criterion: 'operation-complete-and-two-rule-answers-not-preference' }, profileDefinitionVersion: '0.1.0', metricDefinitionVersion: '0.1.0', qualityDefinitionVersion: '0.1.0', reportDefinitionVersion: '0.1.0', presentationVersion: '0.1.0', parameterExplanationVersion: '0.1.0' } as const
}
export type Config = ReturnType<typeof config>
export function same(a: unknown, b: unknown): boolean { if (a === b) return true; if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false; const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(k => Object.prototype.hasOwnProperty.call(b, k) && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) }
export function assertConfig(v: unknown): asserts v is Config { const p = (v as Config | null)?.profile; if ((p !== 'research' && p !== 'experience') || !same(v, config(p))) throw Error('Unknown exact frozen delay config') }
export interface Plan { index: number; phase: 'practice' | 'test'; round: number; block: number; conditionId: string; ratioPercent: number; soonerDays: number; laterDays: number; soonerAmount: number; laterAmount: number; soonerSide: Side }
export const conditionId = (ratio: number, sooner: number, later: number) => `${ratio}:${sooner}:${later}`
function rng(seed: string) { let n = 2166136261; for (let i = 0; i < seed.length; i++) n = Math.imul(n ^ seed.charCodeAt(i), 16777619) >>> 0; if (!n) n = 0x9e3779b9; return () => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296 } }
function shuffle<T>(v: T[], random: () => number) { const a = [...v]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
export function plan(c: Config, seed: string, phase: 'practice' | 'test' = 'test', round = 0): Plan[] {
  assertConfig(c); if (!seed || seed.length > 256 || !['practice', 'test'].includes(phase) || !Number.isInteger(round) || round < 0 || round > 2 || phase === 'test' && round !== 0) throw Error('Unknown delay plan identity')
  if (phase === 'practice') return [{ index: 0, phase, round, block: 0, conditionId: 'practice-today-week', ratioPercent: 120, soonerDays: 0, laterDays: 7, soonerAmount: 1000, laterAmount: 1200, soonerSide: 'left' }, { index: 1, phase, round, block: 0, conditionId: 'practice-week-two', ratioPercent: 125, soonerDays: 7, laterDays: 14, soonerAmount: 800, laterAmount: 1000, soonerSide: 'right' }]
  const random = rng(`${PROTOCOL.randomizationAlgorithmVersion}:${seed}`), flip = random() < 0.5 ? 0 : 1, result: Plan[] = []
  for (let block = 0; block < c.repetitions; block++) {
    const cells = DELAYS.flatMap(([soonerDays, laterDays], group) => RATIOS.map((ratioPercent, i): Plan => ({ index: 0, phase, round, block, conditionId: conditionId(ratioPercent, soonerDays, laterDays), ratioPercent, soonerDays, laterDays, soonerAmount: 2000, laterAmount: 20 * ratioPercent, soonerSide: (group * 9 + i + flip + block) % 2 ? 'right' : 'left' })))
    result.push(...shuffle(cells, random))
  }
  return result.map((p, index) => ({ ...p, index }))
}
export interface Activation { kind: 'down' | 'up' | 'cancel' | 'activate'; atMs: number; target: Side | 'skip'; input: Input; token: string; key: 'Enter' | 'Space' | null; repeat: boolean }
export interface State { stage: 'choosing' | 'complete'; choice: Choice | null; side: Side | null; terminal: 'chosen' | 'skipped' | null; responseAtMs: number | null; rtMs: number | null; input: Input | null; held: { token: string; target: Activation['target']; input: Input; key: Activation['key']; eligible: boolean }[]; ignored: number }
export interface Raw { plan: Plan; startedAtPerfMs: number; endedAtPerfMs: number; status: 'complete' | 'interrupted'; stopReason: string | null; events: Activation[]; state: State; ignoredRepeatCount: number; overflow: boolean }
export const initialState = (): State => ({ stage: 'choosing', choice: null, side: null, terminal: null, responseAtMs: null, rtMs: null, input: null, held: [], ignored: 0 })
export function reduce(s: State, e: Activation, p: Plan, started: number) {
  if (s.stage !== 'choosing') throw Error('Events after first terminal response')
  const activate = () => { s.stage = 'complete'; s.terminal = e.target === 'skip' ? 'skipped' : 'chosen'; s.choice = e.target === 'skip' ? null : e.target === p.soonerSide ? 'sooner' : 'later'; s.side = e.target === 'skip' ? null : e.target; s.responseAtMs = e.atMs; s.rtMs = e.atMs - started; s.input = e.input; s.held = [] }
  if (e.kind === 'activate') { if (e.input === 'assistive' && e.key === null && !s.held.length && !e.repeat) activate(); else s.ignored++; return }
  if (e.repeat) { s.ignored++; return }
  const at = s.held.findIndex(h => h.token === e.token)
  if (e.kind === 'down') { if (at >= 0) { s.ignored++; return } const eligible = s.held.length === 0; if (!eligible) s.held.forEach(h => { h.eligible = false }); s.held.push({ token: e.token, target: e.target, input: e.input, key: e.key, eligible }); return }
  if (at < 0) { s.ignored++; return }
  const [h] = s.held.splice(at, 1)
  if (e.kind === 'up' && h.eligible && h.target === e.target && h.input === e.input && h.key === e.key) activate(); else s.ignored++
}
export function review(raw: Raw, expected: Plan): State {
  if (!same(raw.plan, expected) || !Number.isFinite(raw.startedAtPerfMs) || !Number.isFinite(raw.endedAtPerfMs) || raw.startedAtPerfMs < 0 || raw.endedAtPerfMs < raw.startedAtPerfMs || !Number.isInteger(raw.ignoredRepeatCount) || raw.ignoredRepeatCount < 0 || raw.events.length > 256) throw Error('Delay plan/clock differs')
  const s = initialState(); let last = raw.startedAtPerfMs
  for (const e of raw.events) {
    if (!Number.isFinite(e.atMs) || e.atMs < last || e.atMs > raw.endedAtPerfMs || !['down', 'up', 'cancel', 'activate'].includes(e.kind) || !['left', 'right', 'skip'].includes(e.target) || !['touch', 'mouse', 'pen', 'keyboard', 'assistive'].includes(e.input) || !e.token || e.token.length > 80 || e.input === 'keyboard' && !['Enter', 'Space'].includes(e.key ?? '') || e.input !== 'keyboard' && e.key !== null || e.repeat) throw Error('Delay activation differs')
    last = e.atMs; reduce(s, e, expected, raw.startedAtPerfMs)
  }
  if (!same(s, raw.state) || (raw.status === 'complete' ? s.stage !== 'complete' || raw.stopReason !== null || raw.overflow || raw.endedAtPerfMs !== s.responseAtMs : raw.status !== 'interrupted' || s.stage !== 'choosing' || !raw.stopReason || raw.stopReason.length > 100) || raw.overflow && (raw.events.length !== 256 || raw.stopReason !== 'input-log-bound')) throw Error('Delay raw outcome differs from first response')
  return s
}
export interface QuizRaw { round: number; startedAtPerfMs: number; endedAtPerfMs: number; answers: (number | null)[]; submitted: boolean }
export function quizPassed(q: QuizRaw) { return Number.isInteger(q.round) && q.round >= 0 && q.round < 3 && Number.isFinite(q.startedAtPerfMs) && q.startedAtPerfMs >= 0 && Number.isFinite(q.endedAtPerfMs) && q.endedAtPerfMs >= q.startedAtPerfMs && q.submitted && same(q.answers, [0, 1]) }
