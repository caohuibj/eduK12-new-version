import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { GamblingdeckConfig } from '../schemas/gamblingdeck.config'
import { GamblingdeckDeck, GamblingdeckTrial } from '../schemas/gamblingdeck.trial'

/**
 * 奖惩计划由 scoringVersion 1.0.0 钉死（经典 IGT 结构，±250/10 张；儿童点数化）：
 * A（频发小损失）与 B（罕见巨额损失）每 10 张净 -250，为劣势箱；
 * C（频发小损失）与 D（无损失、小额稳定收益）每 10 张净 +250，为优势箱。
 */
const DECK_SCHEDULE: Record<GamblingdeckDeck, number[]> = {
  A: [100, 100, 100, 100, 100, -150, -150, -150, -150, -150],
  B: [100, 100, 100, 100, 100, 100, 100, 100, 100, -1150],
  C: [50, 50, 50, 50, 50, 50, 50, 50, 50, -200],
  D: [25, 25, 25, 25, 25, 25, 25, 25, 25, 25],
}

const ADVANTAGEOUS: ReadonlySet<GamblingdeckDeck> = new Set(['C', 'D'])

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion。 */
const MIN_BLOCK_FOR_SLOPE = 2

/** Gamblingdeck v1：净结果、优势选择与学习趋势均由服务端按冻结计划推导。 */
export const scoreGamblingdeckV1 = (input: {
  config: GamblingdeckConfig
  trials: ScoringTrial<GamblingdeckTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `gamblingdeck v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `gamblingdeck v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  const deckCounts: Record<GamblingdeckDeck, number> = { A: 0, B: 0, C: 0, D: 0 }
  let netScore = 0
  let interrupted = false
  const blockEntries: Array<{ advantageous: number; total: number }> = []
  let currentBlockAdvantageous = 0
  let currentBlockTotal = 0

  sorted.forEach((trial, index) => {
    const deck = trial.payload.deck
    const position = deckCounts[deck] % DECK_SCHEDULE[deck].length
    netScore += DECK_SCHEDULE[deck][position]
    deckCounts[deck] += 1
    if (trial.payload.interrupted) interrupted = true
    if (ADVANTAGEOUS.has(deck)) currentBlockAdvantageous += 1
    currentBlockTotal += 1
    const isBlockEnd = (index + 1) % config.blockSize === 0 || index + 1 === config.totalTrials
    if (isBlockEnd) {
      blockEntries.push({ advantageous: currentBlockAdvantageous, total: currentBlockTotal })
      currentBlockAdvantageous = 0
      currentBlockTotal = 0
    }
  })

  const advantageousChoiceRate = round(blockEntries.reduce((sum, block) => sum + block.advantageous, 0) / sorted.length)
  const blockRates = blockEntries.map((block) => block.advantageous / block.total)
  let blockTrendSlope: number | null = null
  if (blockRates.length >= MIN_BLOCK_FOR_SLOPE) {
    const meanX = (blockRates.length - 1) / 2
    const meanY = blockRates.reduce((sum, rate) => sum + rate, 0) / blockRates.length
    const covariance = blockRates.reduce((sum, rate, index) => sum + (index - meanX) * (rate - meanY), 0)
    const variance = blockRates.reduce((sum, _rate, index) => sum + (index - meanX) ** 2, 0)
    blockTrendSlope = variance === 0 ? null : round(covariance / variance)
  }

  return {
    score: Math.round(advantageousChoiceRate * 100),
    metrics: {
      advantageousChoiceRate,
      netScore,
      blockTrendSlope,
      deckChoiceRates: {
        A: round(deckCounts.A / sorted.length),
        B: round(deckCounts.B / sorted.length),
        C: round(deckCounts.C / sorted.length),
        D: round(deckCounts.D / sorted.length),
      },
    },
    qualityFlags: {
      interpretable: true,
      interrupted,
    },
  }
}
