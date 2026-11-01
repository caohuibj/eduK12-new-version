import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { SeqlearnConfig } from '../schemas/seqlearn.config'
import { SeqlearnTrial } from '../schemas/seqlearn.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const LOW_ACCURACY = 0.5
const MIN_VALID_RT_PER_CONDITION = 2

/** Seqlearn v1：模式块位置合法性、条件划分与序列学习指标均由服务端推导。 */
export const scoreSeqlearnV1 = (input: {
  config: SeqlearnConfig
  trials: ScoringTrial<SeqlearnTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `seqlearn v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `seqlearn v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  const randomBlocks = new Set(config.randomBlockIndices)
  const blockOf = (trialIndex: number): number => Math.floor(trialIndex / config.trialsPerBlock) + 1
  const isRandom = (trialIndex: number): boolean => randomBlocks.has(blockOf(trialIndex))

  sorted.forEach((trial, index) => {
    if (!isRandom(index)) {
      const expectedPosition = config.patternSequence[index % config.patternSequence.length]
      if (trial.payload.position !== expectedPosition) {
        throw new CognitiveScoringInputError(
          `seqlearn v1 pattern block trial ${index} position ${trial.payload.position} violates the frozen sequence (expected ${expectedPosition})`
        )
      }
    }
  })

  const isCorrect = (trial: SeqlearnTrial): boolean => trial.response !== null && trial.response === trial.position
  const correctCount = sorted.filter((trial) => isCorrect(trial.payload)).length
  const accuracy = correctCount / sorted.length

  const validRts = (trials: ScoringTrial<SeqlearnTrial>[]): number[] =>
    trials
      .filter((trial) => isCorrect(trial.payload) && trial.payload.rtMs !== null)
      .map((trial) => trial.payload.rtMs as number)
      .filter((rt) => rt >= config.validRtFloorMs)

  const patternTrials = sorted.filter((trial) => !isRandom(trial.trialIndex))
  const randomTrials = sorted.filter((trial) => isRandom(trial.trialIndex))

  const latePattern = patternTrials.slice(-config.trialsPerBlock * 2)
  const earlyPattern = patternTrials.slice(0, config.trialsPerBlock)
  const medianRtEarlyPatternMs = median(validRts(earlyPattern))
  const medianRtLatePatternMs = median(validRts(latePattern))
  const medianRtRandomMs = median(validRts(randomTrials))
  const randomBlockAccuracy = randomTrials.length === 0 ? null : round(randomTrials.filter((trial) => isCorrect(trial.payload)).length / randomTrials.length)

  const srtPatternAdvantageMs =
    medianRtLatePatternMs === null || medianRtRandomMs === null
      ? null
      : round(medianRtRandomMs - medianRtLatePatternMs)

  const insufficientRandomRt = validRts(randomTrials).length < MIN_VALID_RT_PER_CONDITION
  const insufficientPatternRt = validRts(latePattern).length < MIN_VALID_RT_PER_CONDITION
  const lowAccuracy = accuracy < LOW_ACCURACY

  return {
    score: Math.round(accuracy * 100),
    metrics: {
      srtPatternAdvantageMs,
      accuracy,
      randomBlockAccuracy,
      medianRtLatePatternMs,
      medianRtRandomMs,
      medianRtEarlyPatternMs,
    },
    qualityFlags: {
      interpretable: !insufficientRandomRt && !insufficientPatternRt,
      insufficientRandomRt,
      insufficientPatternRt,
      lowAccuracy,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
