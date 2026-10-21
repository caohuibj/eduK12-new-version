import { calculateScoreRanges } from './scale-scoring'
import { matchRawScoreFeedback } from './raw-score-feedback'
import type { ScaleDefinitionV2 } from './scale-definition'

/** Author-only presentation simulation. No answers, attempts or scientific facts are written. */
export function previewScaleRawScoreFeedback(definition: ScaleDefinitionV2, rawScores: Record<string, number>) {
  const ranges = calculateScoreRanges(definition)
  const entries = Object.entries(rawScores)
  if (entries.length > definition.scoring.scores.length) throw new Error('模拟指标超出量表定义')
  for (const [key, value] of entries) {
    const range = ranges.get(key)
    if (!definition.scoring.scores.some(score => score.key === key) || !Number.isFinite(value)
      || !range || value < range.min || value > range.max) throw new Error('模拟分数必须属于已定义指标的理论范围')
  }
  return { previewOnly: true as const, rawScores,
    rawScoreFeedback: entries.flatMap(([key, value]) => {
      const matched = matchRawScoreFeedback(definition.report?.rawScoreFeedback, key, value)
      return matched ? [matched] : []
    }),
  }
}
