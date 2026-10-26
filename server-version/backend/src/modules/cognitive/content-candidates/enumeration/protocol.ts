/** Internal pure logic candidate. This file renders no stimuli and establishes no timing tolerance. */
export const ENUMERATION_IDENTITY = Object.freeze({
  candidateId: 'attention-enumeration-flower', testType: 'enumeration',
  engineVersion: '0.1.0', scoringVersion: '0.2.0', configVersion: '0.2.0',
  metricDefinitionVersion: '0.2.0', qualityDefinitionVersion: '0.2.0',
  reportDefinitionVersion: '0.2.0', presentationVersion: '0.1.0',
  protocolKey: 'enumeration/0.1.0/0.1.0',
  randomizationAlgorithmVersion: 'enumeration-fnv1a-utf16-mulberry32-fisher-yates-v1',
})
/** New complete-recipe configuration; historical exports above deliberately keep their frozen tuple. */
export const ENUMERATION_RECIPE_IDENTITY = Object.freeze({ ...ENUMERATION_IDENTITY,
  engineVersion: '0.2.0', configVersion: '0.3.0' })
export type EnumerationIdentity = typeof ENUMERATION_IDENTITY | typeof ENUMERATION_RECIPE_IDENTITY
export function getEnumerationIdentity(engineVersion: string, scoringVersion: string, configVersion?: string): EnumerationIdentity | undefined {
  return [ENUMERATION_IDENTITY, ENUMERATION_RECIPE_IDENTITY].find(id => id.engineVersion === engineVersion
    && id.scoringVersion === scoringVersion && (configVersion === undefined || id.configVersion === configVersion))
}
/** Approved candidate recipe content. It is configuration, not an extra id/hash wrapper or physical validation. */
export interface EnumerationStimulusRecipe {
  id: 'enumeration-square5deg-circle-white-grey-mask48-r1'
  source: 'host_reviewed_candidate'
  status: 'CANDIDATE_RECIPE_NOT_VALIDATED'
  fieldShape: 'square_background_circular_sampling_proposal'
  fieldDiameterDeg: 5; dotDiameterDeg: 0.5; fieldColor: '#808080'; dotColor: '#FFFFFF'
  mask: { rows: 48; columns: 48; values: ['#141414', '#EBEBEB']; seed: 20261026;
    algorithm: 'lcg1664525-1013904223-u32-topbit'; scope: 'session_fixed' }
  fixationMs: 1000; formalExposureMs: 50; practiceExposureMs: 1000; maskMs: 1000
}
export function enumerationStimulusRecipe(): EnumerationStimulusRecipe {
  return { id: 'enumeration-square5deg-circle-white-grey-mask48-r1', source: 'host_reviewed_candidate',
    status: 'CANDIDATE_RECIPE_NOT_VALIDATED', fieldShape: 'square_background_circular_sampling_proposal',
    fieldDiameterDeg: 5, dotDiameterDeg: 0.5, fieldColor: '#808080', dotColor: '#FFFFFF',
    mask: { rows: 48, columns: 48, values: ['#141414', '#EBEBEB'], seed: 20261026,
      algorithm: 'lcg1664525-1013904223-u32-topbit', scope: 'session_fixed' },
    fixationMs: 1000, formalExposureMs: 50, practiceExposureMs: 1000, maskMs: 1000 }
}
/** JSON content equality: own keys and array order matter; object insertion order does not. */
export function enumerationValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && Array.from({ length: left.length }, (_, i) => i).every(i => enumerationValuesEqual(left[i], right[i]))
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key =>
    Object.prototype.hasOwnProperty.call(b, key) && enumerationValuesEqual(a[key], b[key]))
}
export const enumerationConfigEqual = enumerationValuesEqual
export type EnumerationProfile = 'research' | 'experience'
export type EnumerationInput = 'touch' | 'pointer' | 'keyboard'
export const ENUMERATION_QUANTITIES = [5, 6, 7, 8, 9] as const
export const ENUMERATION_PRACTICE_QUANTITIES = [3, 4, 5] as const
/** Approved practice exposure count; one source for plan generation and the client seal check. */
export const ENUMERATION_PRACTICE_TRIAL_COUNT = ENUMERATION_PRACTICE_QUANTITIES.length
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
  stimulusRecipe: EnumerationStimulusRecipe | null
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
export type EnumerationRecipeConfig = EnumerationConfig & { stimulusRecipe: EnumerationStimulusRecipe }
export function enumerationRecipeConfig(profile: EnumerationProfile): EnumerationRecipeConfig {
  return { ...enumerationConfig(profile), stimulusRecipe: enumerationStimulusRecipe() }
}
export function enumerationConfigForIdentity(profile: EnumerationProfile, identity: EnumerationIdentity): EnumerationConfig {
  return identity.engineVersion === ENUMERATION_IDENTITY.engineVersion ? enumerationConfig(profile) : enumerationRecipeConfig(profile)
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
function generateEnumerationPlan(config: EnumerationConfig, canonical: EnumerationConfig, seed: string, trialIndex: number,
  phase: 'test' | 'practice'): EnumerationPlan {
  assertEnumerationSeed(seed)
  if (phase !== 'test' && phase !== 'practice') throw new Error('Unsupported enumeration phase')
  // Fixed approved count proposal; no hidden adaptation or omission of a quantity.
  for (const key of Object.keys(canonical) as Array<keyof EnumerationConfig>) {
    if (!enumerationValuesEqual(config[key], canonical[key])) throw new Error('Unsupported enumeration configuration')
  }
  if (!Number.isInteger(trialIndex) || trialIndex < 0 || trialIndex >= (phase === 'practice' ? ENUMERATION_PRACTICE_TRIAL_COUNT : config.totalTrials))
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
/** Historical null-recipe generator remains bound to its historical configuration contract. */
export function enumerationPlan(config: EnumerationConfig, seed: string, trialIndex: number,
  phase: 'test' | 'practice' = 'test'): EnumerationPlan {
  return generateEnumerationPlan(config, enumerationConfig(config.profile), seed, trialIndex, phase)
}
export function enumerationRecipePlan(config: EnumerationRecipeConfig, seed: string, trialIndex: number,
  phase: 'test' | 'practice' = 'test'): EnumerationPlan {
  return generateEnumerationPlan(config, enumerationRecipeConfig(config.profile), seed, trialIndex, phase)
}
export function enumerationRecipeSequence(config: EnumerationRecipeConfig, seed: string, phase: 'test' | 'practice' = 'test') {
  return Array.from({ length: phase === 'practice' ? ENUMERATION_PRACTICE_TRIAL_COUNT : config.totalTrials },
    (_, index) => enumerationRecipePlan(config, seed, index, phase))
}
export function enumerationSequence(config: EnumerationConfig, seed: string, phase: 'test' | 'practice' = 'test') {
  return Array.from({ length: phase === 'practice' ? ENUMERATION_PRACTICE_TRIAL_COUNT : config.totalTrials },
    (_, index) => enumerationPlan(config, seed, index, phase))
}
