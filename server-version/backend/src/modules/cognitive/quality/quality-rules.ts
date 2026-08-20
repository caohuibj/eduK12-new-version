export interface CognitiveQualityRules {
  minReactionTimeMs?: number
  maxReactionTimeMs?: number
  maxMissingTrials?: number
}

export interface QualityEvaluation {
  interpretable: boolean
  reasons: string[]
}

export function evaluateQuality(
  metrics: { reactionTimes?: number[]; missingTrials?: number },
  rules: CognitiveQualityRules,
): QualityEvaluation {
  const reasons: string[] = []

  for (const rt of metrics.reactionTimes ?? []) {
    if (rules.minReactionTimeMs !== undefined && rt < rules.minReactionTimeMs) {
      reasons.push('reaction_time_below_floor')
    }
    if (rules.maxReactionTimeMs !== undefined && rt > rules.maxReactionTimeMs) {
      reasons.push('reaction_time_timeout')
    }
  }

  if (
    rules.maxMissingTrials !== undefined &&
    (metrics.missingTrials ?? 0) > rules.maxMissingTrials
  ) {
    reasons.push('too_many_missing_trials')
  }

  return {
    interpretable: reasons.length === 0,
    reasons,
  }
}
