export interface CognitiveQualityRules {
  minReactionTimeMs?: number
  maxReactionTimeMs?: number
  maxMissingTrials?: number
}

export interface QualityEvaluation {
  interpretable: boolean
  reasons: string[]
}

/** Shared boundary check used by each RT-based scorer. */
export const isReactionTimeWithinBounds = (
  reactionTimeMs: number,
  rules: Pick<CognitiveQualityRules, 'minReactionTimeMs' | 'maxReactionTimeMs'>
): boolean =>
  (rules.minReactionTimeMs === undefined || reactionTimeMs >= rules.minReactionTimeMs) &&
  (rules.maxReactionTimeMs === undefined || reactionTimeMs <= rules.maxReactionTimeMs)

export function evaluateQuality(
  metrics: { reactionTimes?: number[]; missingTrials?: number },
  rules: CognitiveQualityRules,
): QualityEvaluation {
  const reasons: string[] = []
  const addReason = (reason: string) => {
    if (!reasons.includes(reason)) reasons.push(reason)
  }

  for (const rt of metrics.reactionTimes ?? []) {
    if (rules.minReactionTimeMs !== undefined && rt < rules.minReactionTimeMs) {
      addReason('reaction_time_below_floor')
    }
    if (rules.maxReactionTimeMs !== undefined && rt > rules.maxReactionTimeMs) {
      addReason('reaction_time_timeout')
    }
  }

  if (
    rules.maxMissingTrials !== undefined &&
    (metrics.missingTrials ?? 0) > rules.maxMissingTrials
  ) {
    addReason('too_many_missing_trials')
  }

  return {
    interpretable: reasons.length === 0,
    reasons,
  }
}
