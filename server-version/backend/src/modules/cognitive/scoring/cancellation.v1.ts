import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { CancellationConfig } from '../schemas/cancellation.config'
import { CancellationTrial } from '../schemas/cancellation.trial'
import {
  CANCELLATION_GRID_SIZE,
  CANCELLATION_STIMULUS_SET_VERSION,
  CANCELLATION_TARGET_COUNT,
  cancellationScan,
} from '../tasks/cancellation/generator'

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const EXCESSIVE_FALSE_ALARM = 0.3

/** Cancellation v1：目标集由服务端按 seed+scan 重建，命中/误报由服务端求交并推导。 */
export const scoreCancellationV1 = (input: {
  config: CancellationConfig
  trials: ScoringTrial<CancellationTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const { config } = input
  if (config.stimulusSetVersion !== CANCELLATION_STIMULUS_SET_VERSION) {
    throw new CognitiveScoringInputError(`cancellation v1 only scores stimulus set ${CANCELLATION_STIMULUS_SET_VERSION}`)
  }
  if (!input.randomSeed) throw new CognitiveScoringInputError('cancellation v1 requires randomSeed to regenerate grids')
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `cancellation v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `cancellation v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
    if (trial.payload.scanIndex !== index) {
      throw new CognitiveScoringInputError(
        `cancellation v1 trial ${index} scanIndex ${trial.payload.scanIndex} does not match the presentation order`
      )
    }
    const seen = new Set<number>()
    for (const cell of trial.payload.selectedCells) {
      if (cell >= CANCELLATION_GRID_SIZE) {
        throw new CognitiveScoringInputError(`cancellation v1 trial ${index} cell index ${cell} outside the grid`)
      }
      if (seen.has(cell)) {
        throw new CognitiveScoringInputError(`cancellation v1 trial ${index} selectedCells must be a set`)
      }
      seen.add(cell)
    }
  })

  let hitCount = 0
  let missCount = 0
  let falseAlarmCount = 0
  let selectedTotal = 0
  let targetTotal = 0

  for (const trial of sorted) {
    if (trial.payload.interrupted) continue
    const scan = cancellationScan(input.randomSeed as string, trial.payload.scanIndex)
    const selected = new Set(trial.payload.selectedCells)
    selectedTotal += selected.size
    targetTotal += CANCELLATION_TARGET_COUNT
    for (const cell of selected) {
      if (scan.targetCells.includes(cell)) hitCount += 1
      else falseAlarmCount += 1
    }
  }
  missCount = Math.max(0, targetTotal - hitCount)

  const hitRate = targetTotal === 0 ? null : round(hitCount / targetTotal)
  const falseAlarmRate = selectedTotal === 0 ? null : round(falseAlarmCount / selectedTotal)

  return {
    score: hitRate === null ? 0 : Math.max(0, Math.round((hitRate - (falseAlarmRate ?? 0)) * 100)),
    metrics: {
      hitRate,
      falseAlarmRate,
      hitCount,
      missCount,
      falseAlarmCount,
    },
    qualityFlags: {
      interpretable: targetTotal > 0 && (falseAlarmRate ?? 0) < EXCESSIVE_FALSE_ALARM,
      excessiveFalseAlarms: (falseAlarmRate ?? 0) >= EXCESSIVE_FALSE_ALARM,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
