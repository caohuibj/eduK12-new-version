export type Profile = 'research' | 'experience'
export type Side = 'left' | 'right'
export type Rating = 1 | 2 | 3 | 4
export type Input = 'touch' | 'mouse' | 'pen' | 'keyboard' | 'assistive'
export const IDENTITY = { testType: 'perceptual-confidence', engineVersion: '0.1.0', scoringVersion: '0.1.0', configVersion: '0.1.0' } as const
export const PROTOCOL = { schemaVersion: 1 as const, key: 'perceptual-confidence/0.1.0/0.1.0', version: '0.1.0', clock: 'performance' as const, randomizationAlgorithmVersion: 'pc-fnv1a-xorshift32-block60-v1', trialEnvelopeVersion: 1 as const, phases: [{ key: 'test' as const, persists: true, required: true }], measurementCriticalConfigPaths: ['*'] }
export const STRENGTHS = [4, 10, 20] as const
// S(x)=127.5*(1+cos(2πx/16)), quantized to a frozen millionth of a gray level.
export const WAVE = [255000000,245294640,217656115,176292138,127500000,78707862,37343885,9705360,0,9705360,37343885,78707862,127500000,176292138,217656115,245294640] as const
export function config(profile: Profile) {
  if (!['research', 'experience'].includes(profile)) throw Error('Unknown confidence profile')
  return { profile, totalTrials: profile === 'research' ? 300 : 60, blocks: profile === 'research' ? 5 : 1, perCondition: profile === 'research' ? 50 : 10, blockTrials: 60, strengthsPercent: [...STRENGTHS], fixationMs: 1000, stimulusMs: 200, interTrialMs: 1000, judgmentDeadlineMs: null, confidenceDeadlineMs: null, inputPolicy: 'separate-first-full-activation-v1', stimulus: { generatorVersion: 'pc-gray-uniform-fixed-sinusoid-micro-v1', patchPx: 128, gapPx: 24, periodPx: 16, waveMicrogray: [...WAVE], externalBackground: '#F8FAFC', fieldBackground: '#E8E8E8', grayChannelsEqual: true }, practice: { trials: 4, left: 2, right: 2, strengthPercent: 45, stimulusMs: 500, minimumCorrect: 3, maximumGroups: 3, pairedRequired: 4, confidencePreference: null }, profileDefinitionVersion: '0.1.0', metricDefinitionVersion: '0.1.0', qualityDefinitionVersion: '0.1.0', reportDefinitionVersion: '0.1.0', presentationVersion: '0.1.0', parameterExplanationVersion: '0.1.0' } as const
}
export type Config = ReturnType<typeof config>
export function same(a: unknown, b: unknown): boolean { if (a === b) return true; if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false; const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(k => Object.prototype.hasOwnProperty.call(b, k) && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) }
export function assertConfig(v: unknown): asserts v is Config { const p = (v as Config | null)?.profile; if ((p !== 'research' && p !== 'experience') || !same(v, config(p))) throw Error('Unknown exact confidence config') }
function hash(seed: string) { let h = 2166136261; for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0; return h || 0x9e3779b9 }
function rng(seed: string) { let n = hash(seed); return () => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296 } }
function shuffle<T>(items: T[], r: () => number) { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
export interface Plan { index: number; phase: 'practice' | 'test'; round: number; block: number; target: Side; strengthPercent: number; conditionId: string; stimulusSeed: string }
export const conditionId = (target: Side, strength: number) => `${target}:${strength}`
export function plan(c: Config, seed: string, phase: 'practice' | 'test' = 'test', round = 0): Plan[] {
  assertConfig(c); if (!seed || seed.length > 256 || !['practice', 'test'].includes(phase) || !Number.isInteger(round) || round < 0 || round > 2 || phase === 'test' && round !== 0) throw Error('Unknown confidence plan identity')
  if (phase === 'practice') return (['right', 'left', 'left', 'right'] as const).map((target, index) => ({ index, phase, round, block: 0, target, strengthPercent: 45, conditionId: conditionId(target, 45), stimulusSeed: `${seed}:practice:${round}:${index}` }))
  const result: Plan[] = []
  for (let block = 0; block < c.blocks; block++) { const cells: Plan[] = []; for (const target of ['left', 'right'] as const) for (const strengthPercent of STRENGTHS) for (let rep = 0; rep < 10; rep++) cells.push({ index: 0, phase, round, block, target, strengthPercent, conditionId: conditionId(target, strengthPercent), stimulusSeed: `${seed}:formal:${block}:${target}:${strengthPercent}:${rep}` }); result.push(...shuffle(cells, rng(`${PROTOCOL.randomizationAlgorithmVersion}:${seed}:${block}`))) }
  return result.map((p, index) => ({ ...p, index }))
}
/** Independent original grayscale generator. Checksums are byte audit checks, not authentication. */
export function stimulus(p: Plan, c: Config) {
  const generate = (side: Side) => { const random = rng(`${c.stimulus.generatorVersion}:${p.stimulusSeed}:${side}`), rgba = new Uint8ClampedArray(128 * 128 * 4); let checksum = 2166136261
    for (let i = 0; i < 128 * 128; i++) { const n = Math.floor(random() * 256), weight = side === p.target ? p.strengthPercent : 0, numerator = n * (100 - weight) * 1_000_000 + weight * WAVE[i % 16], gray = Math.floor((numerator + 50_000_000) / 100_000_000); rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = gray; rgba[i * 4 + 3] = 255; checksum = Math.imul(checksum ^ gray, 16777619) >>> 0 }
    return { rgba, checksum: checksum.toString(16).padStart(8, '0') }
  }
  return { left: generate('left'), right: generate('right') }
}
export type Target = Side | '1' | '2' | '3' | '4' | 'skip'
export interface Activation { kind: 'down' | 'up' | 'cancel' | 'activate'; atMs: number; target: Target; input: Input; token: string; key: 'ArrowLeft' | 'ArrowRight' | 'Digit1' | 'Digit2' | 'Digit3' | 'Digit4' | 'Enter' | 'Space' | null; repeat: boolean }
export type Event = Activation | { kind: 'fixation-ended' | 'stimulus-drawn' | 'stimulus-ended'; atMs: number }
export interface State { stage: 'fixation' | 'stimulus' | 'judgment' | 'confidence' | 'complete'; requestedAtMs: number | null; drawnAtMs: number | null; judgmentAtMs: number | null; choice: Side | null; choiceAtMs: number | null; judgmentMs: number | null; choiceInput: Input | null; rating: Rating | null; ratingAtMs: number | null; confidenceMs: number | null; ratingInput: Input | null; terminal: 'paired' | 'skip-judgment' | 'skip-confidence' | null; terminalAtMs: number | null; held: { token: string; target: Target; input: Input; key: Activation['key']; eligible: boolean }[]; ignored: number }
export interface Raw { plan: Plan; startedAtPerfMs: number; endedAtPerfMs: number; status: 'complete' | 'interrupted'; stopReason: string | null; checksums: { left: string; right: string }; events: Event[]; state: State; ignoredRepeatCount: number; overflow: boolean }
export const initialState = (): State => ({ stage: 'fixation', requestedAtMs: null, drawnAtMs: null, judgmentAtMs: null, choice: null, choiceAtMs: null, judgmentMs: null, choiceInput: null, rating: null, ratingAtMs: null, confidenceMs: null, ratingInput: null, terminal: null, terminalAtMs: null, held: [], ignored: 0 })
export function reduce(s: State, e: Event, p: Plan, c: Config, start: number) {
  if (s.stage === 'complete') throw Error('Confidence event after terminal response')
  if (e.kind === 'fixation-ended') { if (s.stage !== 'fixation' || e.atMs < start + c.fixationMs) throw Error('Incomplete fixation'); s.stage = 'stimulus'; s.requestedAtMs = e.atMs; return }
  if (e.kind === 'stimulus-drawn') { if (s.stage !== 'stimulus' || s.drawnAtMs !== null || s.requestedAtMs === null || e.atMs < s.requestedAtMs) throw Error('Unknown stimulus draw'); s.drawnAtMs = e.atMs; return }
  if (e.kind === 'stimulus-ended') { if (s.stage !== 'stimulus' || s.drawnAtMs === null || e.atMs < s.drawnAtMs + (p.phase === 'practice' ? c.practice.stimulusMs : c.stimulusMs)) throw Error('Incomplete stimulus'); s.stage = 'judgment'; s.judgmentAtMs = e.atMs; s.held = []; return }
  if (!('target' in e)) throw Error('Unknown confidence stage event')
  if (!['judgment', 'confidence'].includes(s.stage)) { s.ignored++; return }
  const legal = e.target === 'skip' || (s.stage === 'judgment' ? ['left', 'right'].includes(e.target) : ['1', '2', '3', '4'].includes(e.target))
  if (!legal) { s.ignored++; return }
  const activate = () => { s.held = []; if (e.target === 'skip') { s.terminal = s.stage === 'judgment' ? 'skip-judgment' : 'skip-confidence'; s.stage = 'complete'; s.terminalAtMs = e.atMs } else if (s.stage === 'judgment') { s.choice = e.target as Side; s.choiceAtMs = e.atMs; s.judgmentMs = e.atMs - s.judgmentAtMs!; s.choiceInput = e.input; s.stage = 'confidence' } else { s.rating = Number(e.target) as Rating; s.ratingAtMs = e.atMs; s.confidenceMs = e.atMs - s.choiceAtMs!; s.ratingInput = e.input; s.terminal = 'paired'; s.terminalAtMs = e.atMs; s.stage = 'complete' } }
  if (e.kind === 'activate') { if (e.input === 'assistive' && e.key === null && !e.repeat && !s.held.length) activate(); else s.ignored++; return }
  if (e.repeat) { s.ignored++; return }
  const at = s.held.findIndex(h => h.token === e.token)
  if (e.kind === 'down') { if (at >= 0) { s.ignored++; return } const eligible = s.held.length === 0; if (!eligible) s.held.forEach(h => { h.eligible = false }); s.held.push({ token: e.token, target: e.target, input: e.input, key: e.key, eligible }); return }
  if (at < 0) { s.ignored++; return }
  const [h] = s.held.splice(at, 1); if (e.kind === 'up' && h.eligible && h.target === e.target && h.input === e.input && h.key === e.key) activate(); else s.ignored++
}
export function review(raw: Raw, expected: Plan, c: Config): State {
  const img = stimulus(expected, c)
  if (!same(raw.plan, expected) || !same(raw.checksums, { left: img.left.checksum, right: img.right.checksum }) || !Number.isFinite(raw.startedAtPerfMs) || raw.startedAtPerfMs < 0 || !Number.isFinite(raw.endedAtPerfMs) || raw.endedAtPerfMs < raw.startedAtPerfMs || !Number.isInteger(raw.ignoredRepeatCount) || raw.ignoredRepeatCount < 0 || raw.events.length > 256) throw Error('Confidence raw identity differs')
  const s = initialState(); let last = raw.startedAtPerfMs
  for (const e of raw.events) { if (!Number.isFinite(e.atMs) || e.atMs < last || e.atMs > raw.endedAtPerfMs) throw Error('Confidence clock differs'); last = e.atMs; if ('target' in e && (e.repeat || e.input === 'keyboard' && e.key === null || e.input !== 'keyboard' && e.key !== null)) throw Error('Confidence input provenance differs'); if ('target' in e && e.input === 'keyboard' && e.key !== 'Enter' && e.key !== 'Space' && ({ ArrowLeft: 'left', ArrowRight: 'right', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4' } as Record<string, string>)[e.key!] !== e.target) throw Error('Confidence key mapping differs'); reduce(s, e, expected, c, raw.startedAtPerfMs) }
  if (!same(s, raw.state) || (raw.status === 'complete' ? s.stage !== 'complete' || raw.endedAtPerfMs !== s.terminalAtMs || raw.stopReason !== null || raw.overflow : raw.status !== 'interrupted' || s.stage === 'complete' || !raw.stopReason || raw.stopReason.length > 100) || raw.overflow && (raw.events.length !== 256 || raw.stopReason !== 'input-log-bound')) throw Error('Confidence claimed outcome differs')
  return s
}
