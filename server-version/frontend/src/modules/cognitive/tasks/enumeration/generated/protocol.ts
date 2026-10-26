// Generated from frozen pure enumeration protocol. Source SHA256: b7c61565dfc2182327fa8d25368d4435d75669452d30c50240915a5f3080ad69
/** Internal pure logic candidate. This file renders no stimuli and establishes no timing tolerance. */
export const ENUMERATION_IDENTITY = Object.freeze({
  candidateId: 'attention-enumeration-flower', testType: 'enumeration',
  engineVersion: '0.1.0', scoringVersion: '0.2.0', configVersion: '0.2.0',
  metricDefinitionVersion: '0.2.0', qualityDefinitionVersion: '0.2.0',
  reportDefinitionVersion: '0.2.0', presentationVersion: '0.1.0',
  protocolKey: 'enumeration/0.1.0/0.1.0',
  randomizationAlgorithmVersion: 'enumeration-fnv1a-utf16-mulberry32-fisher-yates-v1',
})
export type EnumerationProfile = 'research' | 'experience'
export type EnumerationInput = 'touch' | 'pointer' | 'keyboard'
export const ENUMERATION_QUANTITIES = [5, 6, 7, 8, 9] as const
export const ENUMERATION_PRACTICE_QUANTITIES = [3, 4, 5] as const
export interface EnumerationConfig {
  status: 'DESIGN_PROPOSAL'
  profile: EnumerationProfile
  sequenceKey: 'research100' | 'experience25'
  totalTrials: 100 | 25
  blocks: 4 | 1
  repetitionsPerQuantityPerBlock: 5
  responseMin: 1
  responseMax: 15
  interpretationPolicy: 'session_descriptive_v1'
  metricDefinitionVersion: '0.2.0'
  qualityDefinitionVersion: '0.2.0'
  reportDefinitionVersion: '0.2.0'
  presentationVersion: '0.1.0'
  /** No normative or minimum-valid-count inference is made. */
  minimumValidPerCondition: null
  timingToleranceMs: null
  stimulusRecipe: null
}
export function enumerationConfig(profile: EnumerationProfile): EnumerationConfig {
  if (profile !== 'research' && profile !== 'experience') throw new Error('Unsupported enumeration profile')
  return { status: 'DESIGN_PROPOSAL', profile,
    sequenceKey: profile === 'research' ? 'research100' : 'experience25',
    totalTrials: profile === 'research' ? 100 : 25, blocks: profile === 'research' ? 4 : 1,
    repetitionsPerQuantityPerBlock: 5, responseMin: 1, responseMax: 15,
    interpretationPolicy: 'session_descriptive_v1',
    metricDefinitionVersion: ENUMERATION_IDENTITY.metricDefinitionVersion,
    qualityDefinitionVersion: ENUMERATION_IDENTITY.qualityDefinitionVersion,
    reportDefinitionVersion: ENUMERATION_IDENTITY.reportDefinitionVersion,
    presentationVersion: ENUMERATION_IDENTITY.presentationVersion, minimumValidPerCondition: null,
    timingToleranceMs: null, stimulusRecipe: null }
}
export interface EnumerationPlan {
  phase: 'test' | 'practice'
  trialIndex: number
  blockIndex: number
  positionInBlock: number
  targetValue: number
  sliderInitialValue: number
  sequenceSeed: string
  randomizationAlgorithmVersion: typeof ENUMERATION_IDENTITY.randomizationAlgorithmVersion
}
export interface EnumerationTrial {
  phase: 'test'
  plan: EnumerationPlan
  recordOrigin: 'live' | 'recovered_without_timing'
  startedAtPerfMs: number
  stimulusOnsetPerfMs: number | null
  maskOnsetPerfMs: number | null
  responseStartedAtPerfMs: number | null
  confirmedAtPerfMs: number | null
  endedAtPerfMs: number
  responseValue: number | null
  responseInput: EnumerationInput | null
  sliderChanges: Array<{ value: number; atPerfMs: number; input: EnumerationInput }>
  prematureInputs: number
  timedOut: boolean
  interruptions: Array<'visibility_lost' | 'window_blur' | 'viewport_changed' | 'runner_restart'>
  timingFacts: {
    source: 'client_reported'
    stimulusFrameCount: number | null
    maskFrameCount: number | null
    stimulusMaxFrameGapMs: number | null
    maskMaxFrameGapMs: number | null
    incomplete: boolean
    overflow: boolean
  }
  /** References only: physical calibration and actual stimulus recipe remain separate pending work. */
  calibrationReference: string | null
  renderedStimulusReference: string | null
}
/** FNV-1a over UTF-16 code units; Mulberry32; half-open [0,1). Not a security primitive. */
function randomFor(seed: string): () => number {
  let state = 2166136261
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619)
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function shuffle(values: number[], random: () => number): number[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
export function assertEnumerationSeed(seed: string): void {
  if (typeof seed !== 'string' || seed.length === 0 || seed.length > 256)
    throw new Error('Enumeration requires an explicit bounded seed')
}
export function enumerationPlan(config: EnumerationConfig, seed: string, trialIndex: number,
  phase: 'test' | 'practice' = 'test'): EnumerationPlan {
  assertEnumerationSeed(seed)
  if (phase !== 'test' && phase !== 'practice') throw new Error('Unsupported enumeration phase')
  // Fixed approved count proposal; no hidden adaptation or omission of a quantity.
  const canonical = enumerationConfig(config.profile)
  for (const key of Object.keys(canonical) as Array<keyof EnumerationConfig>) {
    if (config[key] !== canonical[key]) throw new Error('Unsupported enumeration configuration')
  }
  if (!Number.isInteger(trialIndex) || trialIndex < 0 || trialIndex >= (phase === 'practice' ? 3 : config.totalTrials))
    throw new Error('Enumeration index exceeds the frozen phase budget')
  const blockIndex = phase === 'practice' ? 0 : Math.floor(trialIndex / 25)
  const positionInBlock = phase === 'practice' ? trialIndex : trialIndex % 25
  // Independent streams: generating/repeating practice never consumes formal randomness.
  const quantities = phase === 'practice' ? [...ENUMERATION_PRACTICE_QUANTITIES]
    : shuffle(ENUMERATION_QUANTITIES.flatMap(q => Array<number>(5).fill(q)),
      randomFor(seed + ':formal:block:' + blockIndex))
  const sliderInitialValue = 1 + Math.floor(randomFor(seed + ':' + phase + ':slider:' + trialIndex)() * 15)
  return { phase, trialIndex, blockIndex, positionInBlock, targetValue: quantities[positionInBlock],
    sliderInitialValue, sequenceSeed: seed,
    randomizationAlgorithmVersion: ENUMERATION_IDENTITY.randomizationAlgorithmVersion }
}
export function enumerationSequence(config: EnumerationConfig, seed: string, phase: 'test' | 'practice' = 'test') {
  return Array.from({ length: phase === 'practice' ? 3 : config.totalTrials },
    (_, index) => enumerationPlan(config, seed, index, phase))
}
