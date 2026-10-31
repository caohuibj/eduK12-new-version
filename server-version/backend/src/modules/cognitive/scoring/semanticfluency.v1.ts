import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { SemanticfluencyConfig } from '../schemas/semanticfluency.config'
import { SemanticfluencyTrial } from '../schemas/semanticfluency.trial'
import { SEMANTICFLUENCY_BANKS, SEMANTICFLUENCY_CATEGORIES, SEMANTICFLUENCY_STIMULUS_SET_VERSION } from '../tasks/semanticfluency/bank'

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const EXCESSIVE_INTRUSION = 0.5
const MIN_RESPONSES = 3

/** 与后端一致的词目归一化：NFKC + 小写 + 去空白标点。 */
export const normalizeFluencyResponse = (value: string): string => value
  .normalize('NFKC')
  .toLocaleLowerCase('en-US')
  .replace(/[\p{P}\p{S}]+/gu, '')
  .replace(/\s+/gu, '')

/** Semanticfluency v1：词库匹配、去重与侵入率由服务端推导。 */
export const scoreSemanticfluencyV1 = (input: {
  config: SemanticfluencyConfig
  trials: ScoringTrial<SemanticfluencyTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  if (config.stimulusSetVersion !== SEMANTICFLUENCY_STIMULUS_SET_VERSION) {
    throw new CognitiveScoringInputError(`semanticfluency v1 only scores stimulus set ${SEMANTICFLUENCY_STIMULUS_SET_VERSION}`)
  }
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `semanticfluency v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `semanticfluency v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
    if (!SEMANTICFLUENCY_CATEGORIES.includes(trial.payload.category)) {
      throw new CognitiveScoringInputError(`semanticfluency v1 category ${trial.payload.category} is not in the frozen set`)
    }
  })

  let uniqueValidCount = 0
  let duplicateCount = 0
  let intrusionCount = 0
  let totalCount = 0
  let emptyResponses = 0

  for (const trial of sorted) {
    const payload = trial.payload
    if (payload.interrupted) continue
    if (payload.responses.length === 0) emptyResponses += 1
    const bank = new Set(SEMANTICFLUENCY_BANKS[payload.category].map(normalizeFluencyResponse))
    const seen = new Set<string>()
    for (const raw of payload.responses) {
      const normalized = normalizeFluencyResponse(raw)
      if (!normalized) continue
      totalCount += 1
      if (seen.has(normalized)) { duplicateCount += 1; continue }
      seen.add(normalized)
      if (bank.has(normalized)) uniqueValidCount += 1
      else intrusionCount += 1
    }
  }

  const uniqueValidPerTrial = round(uniqueValidCount / config.totalTrials)
  const intrusionRate = totalCount === 0 ? null : round(intrusionCount / totalCount)
  const duplicateRate = totalCount === 0 ? null : round(duplicateCount / totalCount)

  return {
    score: Math.min(100, Math.round((uniqueValidCount / Math.max(1, config.totalTrials * MIN_RESPONSES)) * 100)),
    metrics: {
      uniqueValidCount,
      uniqueValidPerTrial,
      intrusionRate,
      duplicateRate,
      emptyTrialCount: emptyResponses,
    },
    qualityFlags: {
      interpretable: totalCount >= MIN_RESPONSES && (intrusionRate ?? 0) < EXCESSIVE_INTRUSION,
      insufficientResponses: totalCount < MIN_RESPONSES,
      excessiveIntrusions: (intrusionRate ?? 0) >= EXCESSIVE_INTRUSION,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
