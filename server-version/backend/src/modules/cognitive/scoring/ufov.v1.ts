import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { UfovConfig } from '../schemas/ufov.config'
import { UfovTrial } from '../schemas/ufov.trial'
import { ufovStimulus } from '../tasks/ufov/generator'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const LOW_ACCURACY = 0.5
const MIN_VALID_CORRECT_RT = 2

/** Ufov v1：中心/周边目标由服务端按 seed+trialIndex 重建，双重正确率由服务端推导。 */
export const scoreUfovV1 = (input: {
  config: UfovConfig
  trials: ScoringTrial<UfovTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const { config } = input
  if (!input.randomSeed) throw new CognitiveScoringInputError('ufov v1 requires randomSeed to regenerate stimuli')
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `ufov v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `ufov v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  const centralIsCorrect = (t: ScoringTrial<UfovTrial>, stimulus: { centralTarget: 'circle' | 'triangle' }): boolean =>
    t.payload.centralResponse !== null && t.payload.centralResponse === (stimulus.centralTarget === 'circle' ? 0 : 1)
  const peripheralIsCorrect = (t: ScoringTrial<UfovTrial>, stimulus: { peripheralPosition: number }): boolean =>
    t.payload.peripheralResponse !== null && t.payload.peripheralResponse === stimulus.peripheralPosition

  let centralCorrect = 0
  let peripheralCorrect = 0
  let dualCorrect = 0
  const validRts: number[] = []

  for (const trial of sorted) {
    const stimulus = ufovStimulus(input.randomSeed as string, trial.trialIndex)
    if (trial.payload.centralTarget !== stimulus.centralTarget) {
      throw new CognitiveScoringInputError(`ufov v1 trial ${trial.trialIndex} centralTarget does not match the frozen stimulus`)
    }
    if (trial.payload.peripheralPosition !== stimulus.peripheralPosition) {
      throw new CognitiveScoringInputError(`ufov v1 trial ${trial.trialIndex} peripheralPosition does not match the frozen stimulus`)
    }
    if (trial.payload.interrupted) continue
    const cOk = centralIsCorrect(trial, stimulus)
    const pOk = peripheralIsCorrect(trial, stimulus)
    if (cOk) centralCorrect += 1
    if (pOk) peripheralCorrect += 1
    if (cOk && pOk) dualCorrect += 1
    if ((cOk || pOk) && trial.payload.rtMs !== null && trial.payload.rtMs >= config.validRtFloorMs) {
      validRts.push(trial.payload.rtMs)
    }
  }

  const centralAccuracy = round(centralCorrect / sorted.length)
  const peripheralAccuracy = round(peripheralCorrect / sorted.length)
  const dualCorrectRate = round(dualCorrect / sorted.length)
  const medianRtMs = median(validRts)

  const insufficientValidRt = validRts.length < MIN_VALID_CORRECT_RT
  const lowAccuracy = dualCorrectRate < LOW_ACCURACY

  return {
    score: Math.round(dualCorrectRate * 100),
    metrics: {
      dualCorrectRate,
      centralAccuracy,
      peripheralAccuracy,
      medianRtMs,
      dualCorrectCount: dualCorrect,
    },
    qualityFlags: {
      interpretable: !insufficientValidRt,
      insufficientValidRt,
      lowAccuracy,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
