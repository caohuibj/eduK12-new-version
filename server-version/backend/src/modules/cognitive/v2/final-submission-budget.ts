import type { FinalSubmissionDefinition, TaskDefinition } from './types'

/** Last-resort protection for every Cognitive FINAL submission. */
export const COGNITIVE_FINAL_ABSOLUTE_MAX_TRIALS = 1000 as const

type ConfigRecord = Record<string, unknown>
type MaxTrialsResolver = (config: ConfigRecord) => number

const asConfigRecord = (config: unknown): ConfigRecord => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Cognitive FINAL budget requires an object config')
  }
  return config as ConfigRecord
}

const integerField = (config: ConfigRecord, key: string): number => {
  const value = config[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('Cognitive FINAL budget config field is not an integer: ' + key)
  }
  return value
}

const booleanField = (config: ConfigRecord, key: string): boolean => {
  const value = config[key]
  if (typeof value !== 'boolean') {
    throw new Error('Cognitive FINAL budget config field is not a boolean: ' + key)
  }
  return value
}

const integerArrayField = (config: ConfigRecord, key: string): number[] => {
  const value = config[key]
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'number' && Number.isSafeInteger(item))) {
    throw new Error('Cognitive FINAL budget config field is not an integer array: ' + key)
  }
  return value as number[]
}

const fixedCount = (key: string): MaxTrialsResolver => (config) => integerField(config, key)

const spanTaskCount = (startKey: string, maxKey: string, trialsPerLevelKey: string): MaxTrialsResolver => (config) => {
  const start = integerField(config, startKey)
  const max = integerField(config, maxKey)
  const trialsPerLevel = integerField(config, trialsPerLevelKey)
  return trialsPerLevel * (max - start + 1)
}

const phaseTaskCount: MaxTrialsResolver = (config) => (
  integerField(config, 'learningRounds')
  + (booleanField(config, 'delayedEnabled') ? 1 : 0)
)

const nbackTaskCount: MaxTrialsResolver = (config) => {
  const nLevels = integerArrayField(config, 'nLevels')
  const trialCountByN = integerArrayField(config, 'trialCountByN')
  const blockCountByN = integerArrayField(config, 'blockCountByN')
  if (nLevels.length !== trialCountByN.length || nLevels.length !== blockCountByN.length) {
    throw new Error('Cognitive FINAL budget n-back arrays must have matching lengths')
  }
  return trialCountByN.reduce((total, trialCount, index) => total + trialCount * blockCountByN[index], 0)
}

const trailmakingTaskCount: MaxTrialsResolver = (config) => {
  const form = config.form
  const partA = integerField(config, 'partAItemCount')
  const partB = integerField(config, 'partBItemCount')
  return partA + (form === 'AB' ? partB : 0)
}

/**
 * These resolvers are the versioned Cognitive definition's admission contract.
 * They deliberately describe protocol upper bounds, not scientific completion
 * criteria. The service never owns a task-type switch.
 */
const resolvers: Readonly<Record<string, MaxTrialsResolver>> = Object.freeze({
  fake: fixedCount('trialCount'),
  reaction: fixedCount('totalTrials'),
  memory: spanTaskCount('startLength', 'maxLength', 'trialsPerLevel'),
  stroop: fixedCount('totalTrials'),
  gonogo: fixedCount('totalTrials'),
  cpt: fixedCount('totalTrials'),
  nback: nbackTaskCount,
  corsi: spanTaskCount('startSpan', 'maxSpan', 'trialsPerLevel'),
  sst: fixedCount('totalTrials'),
  taskswitch: fixedCount('totalTrials'),
  // No protocol-level count exists today; keep the global fallback.
  patterncompare: () => COGNITIVE_FINAL_ABSOLUTE_MAX_TRIALS,
  flanker: fixedCount('totalTrials'),
  cardsort: fixedCount('totalTrials'),
  digitbackward: spanTaskCount('startSpan', 'maxSpan', 'trialsPerLevel'),
  picturesequence: phaseTaskCount,
  pairedassociate: phaseTaskCount,
  matrix: fixedCount('itemCount'),
  mentalrotation: fixedCount('totalTrials'),
  tower: fixedCount('problemCount'),
  trailmaking: trailmakingTaskCount,
  reversallearning: fixedCount('totalTrials'),
  bart: fixedCount('balloonCount'),
  wordlist: phaseTaskCount,
  lexicaldecision: fixedCount('totalTrials'),
  emotionrecognition: fixedCount('totalTrials'),
})

export class CognitiveFinalSubmissionConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CognitiveFinalSubmissionConfigError'
  }
}

export const deriveCognitiveFinalSubmissionMaxTrials = (
  testType: string,
  config: unknown,
): number => {
  const resolver = resolvers[testType]
  if (!resolver) {
    throw new CognitiveFinalSubmissionConfigError(
      'No Cognitive FINAL budget contract for task definition ' + testType,
    )
  }
  const derived = resolver(asConfigRecord(config))
  if (!Number.isSafeInteger(derived) || derived < 1) {
    throw new CognitiveFinalSubmissionConfigError(
      'Cognitive FINAL budget must be a positive integer for task definition ' + testType,
    )
  }
  return derived
}

export const createCognitiveFinalSubmissionDefinition = <TConfig>(
  testType: string,
): FinalSubmissionDefinition<TConfig> => ({
  maxTrials: (config: TConfig) => deriveCognitiveFinalSubmissionMaxTrials(testType, config),
})

/**
 * Resolve the effective admission ceiling only after the frozen config has
 * been validated. Scientific configs above the absolute ceiling fail closed
 * at snapshot creation; they are never silently truncated with Math.min.
 */
export const resolveCognitiveFinalMaxTrials = <TConfig>(
  definition: Pick<TaskDefinition<TConfig>, 'testType' | 'finalSubmission'>,
  config: TConfig,
): number => {
  const derived = definition.finalSubmission.maxTrials(config)
  if (!Number.isSafeInteger(derived) || derived < 1) {
    throw new CognitiveFinalSubmissionConfigError(
      'Cognitive FINAL budget must be a positive integer for task definition ' + definition.testType,
    )
  }
  if (derived > COGNITIVE_FINAL_ABSOLUTE_MAX_TRIALS) {
    throw new CognitiveFinalSubmissionConfigError(
      'Frozen Cognitive task configuration exceeds the global FINAL trial limit',
    )
  }
  return Math.min(derived, COGNITIVE_FINAL_ABSOLUTE_MAX_TRIALS)
}
