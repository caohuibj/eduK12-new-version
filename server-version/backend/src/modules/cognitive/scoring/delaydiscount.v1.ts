import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { DelaydiscountConfig } from '../schemas/delaydiscount.config'
import { DelaydiscountTrial } from '../schemas/delaydiscount.trial'

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const MIN_COMPLETE_BANDS = 1

/** Delaydiscount v1：无差异点轨迹由服务端按二分规则复核；AUC 与 Product Index 由服务端推导。 */
export const scoreDelaydiscountV1 = (input: {
  config: DelaydiscountConfig
  trials: ScoringTrial<DelaydiscountTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const totalTrials = config.delayBands.length * config.bisectionSteps
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== totalTrials) {
    throw new CognitiveScoringInputError(
      `delaydiscount v1 expects exactly ${totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `delaydiscount v1 requires contiguous trialIndex 0..${totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  const byBand = new Map<number, ScoringTrial<DelaydiscountTrial>[]>()
  for (const trial of sorted) {
    const delayDays = trial.payload.delayDays
    if (!config.delayBands.includes(delayDays)) {
      throw new CognitiveScoringInputError(`delaydiscount v1 trial delay ${delayDays} is not a configured delay band`)
    }
    if (trial.payload.delayedAmount !== config.delayedAmount) {
      throw new CognitiveScoringInputError(`delaydiscount v1 trial delayedAmount does not match the frozen config`)
    }
    const band = byBand.get(delayDays) ?? []
    band.push(trial)
    byBand.set(delayDays, band)
  }
  for (const [delayDays, band] of byBand) {
    if (band.length !== config.bisectionSteps) {
      throw new CognitiveScoringInputError(
        `delaydiscount v1 band ${delayDays} expects ${config.bisectionSteps} trials, got ${band.length}`
      )
    }
  }
  if (!config.delayBands.every((delayDays) => byBand.has(delayDays))) {
    throw new CognitiveScoringInputError('delaydiscount v1 requires every configured delay band to be present')
  }

  const indifferenceRates: Array<{ delayDays: number; rate: number }> = []
  let laterCount = 0
  let nowCount = 0
  let timeoutCount = 0
  let incompleteBand = false

  for (const delayDays of config.delayBands) {
    const band = byBand.get(delayDays)!
    let low = 0
    let high = config.delayedAmount
    for (const trial of band) {
      const payload = trial.payload
      const expectedImmediate = Math.round((low + high) / 2)
      if (payload.immediateAmount !== expectedImmediate) {
        throw new CognitiveScoringInputError(
          `delaydiscount v1 band ${delayDays} trial ${trial.trialIndex} immediateAmount ${payload.immediateAmount} violates the bisection trajectory (expected ${expectedImmediate})`
        )
      }
      if (payload.choice === 'later') { low = payload.immediateAmount; laterCount += 1 }
      else if (payload.choice === 'now') { high = payload.immediateAmount; nowCount += 1 }
      else {
        timeoutCount += 1
        incompleteBand = true
        // 超时按“未完成带”处理：不计入该带的无差异点，轨迹保留但不收敛更新。
      }
    }
    if (!incompleteBand || band.every((trial) => trial.payload.choice !== null)) {
      indifferenceRates.push({ delayDays, rate: round(((low + high) / 2) / config.delayedAmount) })
    }
  }

  indifferenceRates.sort((a, b) => a.delayDays - b.delayDays)
  const usableRates = incompleteBand ? [] : indifferenceRates

  let aucDelayDiscounting: number | null = null
  if (usableRates.length >= MIN_COMPLETE_BANDS) {
    const maxDelay = Math.max(...usableRates.map((band) => band.delayDays))
    const points = usableRates.map((band) => ({ x: band.delayDays / maxDelay, y: band.rate }))
    let auc = 0
    for (let index = 1; index < points.length; index += 1) {
      auc += ((points[index].x - points[index - 1].x) * (points[index].y + points[index - 1].y)) / 2
    }
    aucDelayDiscounting = round(auc)
  }
  const meanIndifferenceRate = usableRates.length === 0 ? null : round(usableRates.reduce((sum, band) => sum + band.rate, 0) / usableRates.length)
  const laterChoiceRate = laterCount + nowCount === 0 ? null : round(laterCount / (laterCount + nowCount))

  return {
    score: aucDelayDiscounting === null ? 0 : Math.round(aucDelayDiscounting * 100),
    metrics: {
      aucDelayDiscounting,
      meanIndifferenceRate,
      laterChoiceRate,
      timeoutCount,
      validTrialCount: laterCount + nowCount,
    },
    qualityFlags: {
      interpretable: !incompleteBand,
      incompleteDelayBand: incompleteBand,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
