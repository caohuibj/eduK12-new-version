import { MATERIALS_HASH, VOICE_ASSETS } from './materials'

export type Profile = 'research' | 'experience'
export const EMOTIONS = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'] as const
export type Emotion = typeof EMOTIONS[number]
export type Choice = Emotion | 'none'
export type Input = 'touch' | 'mouse' | 'pen' | 'keyboard' | 'assistive'
export const IDENTITY = { testType: 'voice-emotion-cues', engineVersion: '0.1.0', scoringVersion: '0.1.0', configVersion: '0.1.0' } as const
export const PROTOCOL = {
  schemaVersion: 1 as const, key: 'voice-emotion-cues/0.1.0/0.1.0', version: '0.1.0', clock: 'performance' as const,
  randomizationAlgorithmVersion: 'voice-fnv1a-utf16-xorshift32-24-cell-speaker-latin-v1', trialEnvelopeVersion: 1 as const,
  phases: [{ key: 'test' as const, persists: true, required: true }], measurementCriticalConfigPaths: ['*'],
}
export function config(profile: Profile) {
  if (!['research', 'experience'].includes(profile)) throw Error('Unknown voice profile')
  return {
    profile, totalTrials: profile === 'research' ? 96 : 24, trialsPerBlock: 24,
    materialsVersion: 'ravdess-1.0.0-speech-six-01-06-r1', materialsHash: MATERIALS_HASH,
    playback: 'whole-original-wav-once-native-ended' as const, response: 'fresh-first-complete-activation' as const,
    responseDeadlineMs: null, practice: { trials: 3, minimumMatches: 2, maxGroups: 2, repeatFullInstructions: true },
    profileDefinitionVersion: '0.1.0', parameterInterpretationVersion: '0.1.0', metricDefinitionVersion: '0.1.0',
    qualityDefinitionVersion: '0.1.0', reportDefinitionVersion: '0.1.0', presentationVersion: '0.1.0',
  }
}
export type VoiceConfig = ReturnType<typeof config>
export const canonical = (v: unknown): string => JSON.stringify(sorted(v))
function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted((v as Record<string, unknown>)[k])]))
  return v
}
export const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)
export function assertConfig(v: unknown): asserts v is VoiceConfig {
  const p = (v as VoiceConfig | null)?.profile
  if ((p !== 'research' && p !== 'experience') || !same(v, config(p))) throw Error('Unsupported frozen voice config')
}
export interface Plan {
  index: number; phase: 'practice' | 'test'; round: number; block: number; assetId: string;
  emotion: Emotion; intensity: 'normal' | 'strong'; statement: 1 | 2; actor: number; condition: string
}
export const cell = (emotion: Emotion, intensity: 'normal' | 'strong', statement: 1 | 2) => `${emotion}:${intensity}:${statement}`
export function asset(id: string) {
  const result = VOICE_ASSETS.find(a => a.id === id)
  if (!result) throw Error('Unknown frozen voice asset')
  return result
}
function random(seed: string) {
  let s = 2166136261
  for (let i = 0; i < seed.length; i++) s = Math.imul(s ^ seed.charCodeAt(i), 16777619) >>> 0
  if (!s) s = 0x9e3779b9
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
}
function shuffled<T>(a: readonly T[], r: () => number) {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
  return b
}
export function plan(c: VoiceConfig, seed: string, phase: 'practice' | 'test' = 'test', round = 0): Plan[] {
  assertConfig(c)
  if (!seed || seed.length > 256 || !['practice', 'test'].includes(phase) || !Number.isInteger(round) || round < 0 || round > 1 || (phase === 'test' && round !== 0)) throw Error('Invalid voice plan identity')
  const r = random(`${PROTOCOL.randomizationAlgorithmVersion}:${seed}:${phase}:${round}`)
  const convert = (id: string, index: number, block: number): Plan => {
    const a = asset(id)
    return { index, phase, round, block, assetId: a.id, emotion: a.emotion, intensity: a.intensity, statement: a.statement, actor: a.actor, condition: cell(a.emotion, a.intensity, a.statement) }
  }
  if (phase === 'practice') return EMOTIONS.slice(0, 3).map((e, i) => convert(VOICE_ASSETS.find(a => a.actor === round + 5 && a.emotion === e && a.intensity === 'strong' && a.statement === 1)!.id, i, 0))
  // Each block covers every emotion × intensity × sentence cell once. Rotating
  // speakers gives each cell all four actors in research; experience keeps one.
  const actorOrder = shuffled([1, 2, 3, 4], r), result: Plan[] = []
  for (let block = 0; block < c.totalTrials / 24; block++) {
    const ids: string[] = []
    EMOTIONS.forEach((e, ei) => (['normal', 'strong'] as const).forEach((intensity, ii) => ([1, 2] as const).forEach((statement, si) => {
      const actor = actorOrder[(ei + ii + 2 * si + block) % 4]
      ids.push(VOICE_ASSETS.find(a => a.actor === actor && a.emotion === e && a.intensity === intensity && a.statement === statement)!.id)
    })))
    shuffled(ids, r).forEach(id => result.push(convert(id, result.length, block)))
  }
  return result
}
export type Event =
  | { kind: 'play'; at: number }
  | { kind: 'ended'; at: number }
  | { kind: 'down' | 'up' | 'cancel'; at: number; token: string; choice: Choice; input: Input }
  | { kind: 'activate'; at: number; choice: Choice; input: 'assistive' }
  | { kind: 'skip'; at: number }
  | { kind: 'interrupt'; at: number; reason: string }
export interface Raw { plan: Plan; startedAtPerfMs: number; endedAtPerfMs: number; events: Event[] }
export interface Observed {
  playedAt: number | null; answerEnabledAt: number | null; choice: Choice | null; responseAt: number | null;
  input: Input | null; outcome: 'answered' | 'skip' | 'interrupted' | null; reason: string | null
}
export function observe(raw: Raw): Observed {
  if (!Number.isFinite(raw.startedAtPerfMs) || raw.startedAtPerfMs < 0 || !Number.isFinite(raw.endedAtPerfMs) || raw.endedAtPerfMs < raw.startedAtPerfMs || raw.events.length > 65) throw Error('Invalid voice clock/budget')
  const s: Observed = { playedAt: null, answerEnabledAt: null, choice: null, responseAt: null, input: null, outcome: null, reason: null }
  const held = new Map<string, { choice: Choice; input: Input; eligible: boolean }>()
  let previous = raw.startedAtPerfMs
  for (const e of raw.events) {
    if (!Number.isFinite(e.at) || e.at < previous || e.at > raw.endedAtPerfMs || s.outcome !== null) throw Error('Voice event order or event after first response')
    previous = e.at
    if (e.kind === 'interrupt') { s.outcome = 'interrupted'; s.reason = e.reason; continue }
    if (e.kind === 'skip') { s.outcome = 'skip'; continue }
    if (e.kind === 'play') { if (s.playedAt !== null) throw Error('Formal voice replay'); s.playedAt = e.at; continue }
    if (e.kind === 'ended') { if (s.playedAt === null || s.answerEnabledAt !== null) throw Error('Voice ended without one playback'); s.answerEnabledAt = e.at; continue }
    if (e.kind === 'cancel') { held.delete(e.token); continue }
    if (e.kind === 'down') { if (!held.has(e.token)) held.set(e.token, { choice: e.choice, input: e.input, eligible: s.answerEnabledAt !== null }); continue }
    let accept = e.kind === 'activate' && s.answerEnabledAt !== null
    if (e.kind === 'up') { const h = held.get(e.token); held.delete(e.token); accept = !!h && h.eligible && h.choice === e.choice && h.input === e.input && s.answerEnabledAt !== null }
    if (accept) { s.choice = e.choice; s.responseAt = e.at; s.input = e.input; s.outcome = 'answered' }
  }
  if (s.outcome === null || previous !== raw.endedAtPerfMs) throw Error('Unexecuted voice trial has no terminal observation')
  return s
}
export const manifest = (c: VoiceConfig, seed: string) => ({ formal: plan(c, seed), practice: [0, 1].map(r => plan(c, seed, 'practice', r)) })
