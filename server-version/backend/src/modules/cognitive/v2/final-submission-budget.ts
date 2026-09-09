import type { FinalSubmissionDefinition } from '../cognitive.types'
import type { TaskDefinition } from './types'

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

const defineFinalSubmission = <TConfig = unknown>(resolver: MaxTrialsResolver): FinalSubmissionDefinition<TConfig> => ({
  maxTrials: (config) => resolver(asConfigRecord(config)),
})

export const fixedCountFinalSubmission = <TConfig = unknown>(key: string): FinalSubmissionDefinition<TConfig> =>
  defineFinalSubmission((config) => integerField(config, key))

export const spanTaskCountFinalSubmission = <TConfig = unknown>(
  startKey: string,
  maxKey: string,
  trialsPerLevelKey: string,
): FinalSubmissionDefinition<TConfig> => defineFinalSubmission((config) => {
  const start = integerField(config, startKey)
  const max = integerField(config, maxKey)
  const trialsPerLevel = integerField(config, trialsPerLevelKey)
  return trialsPerLevel * (max - start + 1)
})

export const phaseTaskCountFinalSubmission = <TConfig = unknown>(): FinalSubmissionDefinition<TConfig> =>
  defineFinalSubmission((config) => (
    integerField(config, 'learningRounds')
    + (booleanField(config, 'delayedEnabled') ? 1 : 0)
  ))

export const nbackTaskCountFinalSubmission = <TConfig = unknown>(): FinalSubmissionDefinition<TConfig> =>
  defineFinalSubmission((config) => {
    const nLevels = integerArrayField(config, 'nLevels')
    const trialCountByN = integerArrayField(config, 'trialCountByN')
    const blockCountByN = integerArrayField(config, 'blockCountByN')
    if (nLevels.length !== trialCountByN.length || nLevels.length !== blockCountByN.length) {
      throw new Error('Cognitive FINAL budget n-back arrays must have matching lengths')
    }
    return trialCountByN.reduce((total, trialCount, index) => total + trialCount * blockCountByN[index], 0)
  })

export const trailmakingTaskCountFinalSubmission = <TConfig = unknown>(): FinalSubmissionDefinition<TConfig> =>
  defineFinalSubmission((config) => {
    const form = config.form
    const partA = integerField(config, 'partAItemCount')
    const partB = integerField(config, 'partBItemCount')
    return partA + (form === 'AB' ? partB : 0)
  })

export const absoluteFallbackFinalSubmission = <TConfig = unknown>(): FinalSubmissionDefinition<TConfig> =>
  defineFinalSubmission(() => COGNITIVE_FINAL_ABSOLUTE_MAX_TRIALS)

/**
 * These factories describe protocol upper bounds, not scientific completion
 * criteria. The exact Cognitive RegistryEntry owns the resulting instance;
 * this module does not select a contract by task type.
 */
export type CognitiveFinalSubmissionConfigErrorCode =
  | 'MISSING_CONTRACT'
  | 'INVALID_DERIVED_MAX'
  | 'EXCEEDS_ABSOLUTE_LIMIT'

export class CognitiveFinalSubmissionConfigError extends Error {
  constructor(
    public readonly code: CognitiveFinalSubmissionConfigErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CognitiveFinalSubmissionConfigError'
  }
}

export const deriveCognitiveFinalSubmissionMaxTrials = <TConfig>(
  finalSubmission: FinalSubmissionDefinition<TConfig> | null | undefined,
  config: TConfig,
): number => {
  if (!finalSubmission || typeof finalSubmission.maxTrials !== 'function') {
    throw new CognitiveFinalSubmissionConfigError(
      'MISSING_CONTRACT',
      'No Cognitive FINAL budget contract is attached to the task definition',
    )
  }
  const derived = finalSubmission.maxTrials(config)
  if (!Number.isSafeInteger(derived) || derived < 1) {
    throw new CognitiveFinalSubmissionConfigError(
      'INVALID_DERIVED_MAX',
      'Cognitive FINAL budget must be a positive integer',
    )
  }
  return derived
}

/**
 * Resolve the effective admission ceiling only after the frozen config has
 * been validated. Scientific configs above the absolute ceiling fail closed
 * at snapshot creation; they are never silently truncated with Math.min.
 */
export const resolveCognitiveFinalMaxTrials = <TConfig>(
  definition: Pick<TaskDefinition<TConfig>, 'testType' | 'engineVersion' | 'scoringVersion' | 'finalSubmission'>,
  config: TConfig,
): number => {
  const derived = deriveCognitiveFinalSubmissionMaxTrials(definition.finalSubmission, config)
  if (derived > COGNITIVE_FINAL_ABSOLUTE_MAX_TRIALS) {
    throw new CognitiveFinalSubmissionConfigError(
      'EXCEEDS_ABSOLUTE_LIMIT',
      'Frozen Cognitive task configuration exceeds the global FINAL trial limit',
    )
  }
  return derived
}
