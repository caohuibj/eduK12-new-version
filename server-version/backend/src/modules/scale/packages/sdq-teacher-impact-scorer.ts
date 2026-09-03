/**
 * Goodman teacher impact scoring with overall-difficulties gating.
 * If overall difficulties answered No → impact = 0 as a **structural skip**.
 * Do NOT forge answeredItems for unanswered follow-ups.
 * overall ≠ No requires impact items.
 */
import type { ScaleAnswer, ScaleCustomScorer, ScaleScoreValue } from '../scale-scoring'
import { scoreScale as defaultScoreScale } from '../scale-scoring'

export const SDQ_TEACHER_OVERALL_ITEM = 'SDQ-IMPACT-OVERALL'
export const SDQ_TEACHER_IMPACT_ITEM_CODES = [
  'SDQ-IMPACT-DISTRESS',
  'SDQ-IMPACT-PEER',
  'SDQ-IMPACT-CLASSROOM',
] as const

export const SDQ_TEACHER_SCORER_KEY = 'sdq.teacher.t4_10.v1' as const

const isOverallNo = (answers: ScaleAnswer[]): boolean => {
  const overall = answers.find((row) => row.itemCode === SDQ_TEACHER_OVERALL_ITEM)
  if (!overall) return false
  return overall.responseValue === 'no'
}

const answeredImpactCodes = (answers: ScaleAnswer[]): string[] => (
  SDQ_TEACHER_IMPACT_ITEM_CODES.filter((code) => (
    answers.some((row) => row.itemCode === code && row.responseValue != null && row.responseValue !== '')
  ))
)

/**
 * Custom scorer: compute base scores then force impact=0 when overall=No.
 * Chronicity and burden are never included in impact.
 * Structural skip: answeredItems lists only actually-answered impact items (may be empty).
 */
export const sdqTeacherT410Scorer: ScaleCustomScorer = ({ definition, answers }) => {
  const { scorerKey: _ignored, ...scoringRest } = definition.scoring
  const baseDefinition = {
    ...definition,
    scoring: { ...scoringRest },
  }
  const base = defaultScoreScale(baseDefinition, answers)
  const gated = isOverallNo(answers)
  const scores: ScaleScoreValue[] = base.scores.map((score) => {
    if (score.key !== 'impact') return score
    if (!gated) {
      // overall ≠ No requires impact items — keep base status/answeredItems as-is.
      return score
    }
    // Structural skip: impact=0 without forging unanswered follow-ups as answered.
    return {
      ...score,
      value: 0,
      status: 'calculated',
      answeredItems: answeredImpactCodes(answers),
      expectedItems: [...SDQ_TEACHER_IMPACT_ITEM_CODES],
    }
  })
  return { scores, quality: base.quality }
}
