/**
 * Goodman teacher impact scoring with overall-difficulties gating.
 * If overall difficulties answered No → impact = 0 as a **structural skip**.
 * Do NOT forge answeredItems for unanswered follow-ups.
 * overall ≠ No requires impact items.
 * Skip-induced missing_items / score_not_calculable must not limit quality.
 * Completeness must not require skipped impact follow-ups when overall=No.
 */
import type { ScaleDefinitionV2 } from '../scale-definition'
import type { ScaleAnswer, ScaleCustomScorer, ScaleQuality, ScaleScoreValue } from '../scale-scoring'
import { missingRequiredScaleItemCodes, scoreScale as defaultScoreScale } from '../scale-scoring'

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

/** Impact follow-ups structurally skipped when overall difficulties = No. */
export const sdqTeacherStructurallySkippedItemCodes = (answers: ScaleAnswer[]): string[] => (
  isOverallNo(answers) ? [...SDQ_TEACHER_IMPACT_ITEM_CODES] : []
)

/**
 * Completeness helper: when overall=No, impact follow-ups are not required.
 */
export const sdqTeacherMissingRequiredItemCodes = (
  definition: ScaleDefinitionV2,
  answers: ReadonlyArray<Pick<ScaleAnswer, 'itemCode'>> | ScaleAnswer[],
): string[] => {
  const skipped = new Set(sdqTeacherStructurallySkippedItemCodes(answers as ScaleAnswer[]))
  return missingRequiredScaleItemCodes(definition, answers).filter((code) => !skipped.has(code))
}

const stripSkipInducedQualityFlags = (
  baseQuality: ScaleQuality,
  scores: ScaleScoreValue[],
  gated: boolean,
): ScaleQuality => {
  if (!gated) return { status: baseQuality.status, flags: [...baseQuality.flags] }

  const canonical = scores.filter((score) => score.canonical)
  const derivedStatus: ScaleQuality['status'] = canonical.some((score) => score.status === 'not_calculable')
    ? 'invalid'
    : canonical.some((score) => score.status === 'limited')
      ? 'limited'
      : 'interpretable'

  // When overall=No forced impact to calculated, drop flags that were caused only by
  // those structurally skipped follow-ups. Keep flags if other scores still justify them.
  const otherScoresHaveMissing = scores.some((score) => (
    score.key !== 'impact'
    && score.answeredItems.length < score.expectedItems.length
  ))
  const otherScoresNotCalculable = scores.some((score) => (
    score.key !== 'impact' && score.status === 'not_calculable'
  ))
  const otherScoresInsufficient = scores.some((score) => (
    score.key !== 'impact'
    && score.status === 'not_calculable'
    && score.answeredItems.length < score.expectedItems.length
  ))

  const flags = baseQuality.flags.filter((flag) => {
    if (flag === 'missing_items') return otherScoresHaveMissing
    if (flag === 'score_not_calculable') return otherScoresNotCalculable
    if (flag === 'insufficient_items') return otherScoresInsufficient
    return true
  })

  return { status: derivedStatus, flags }
}

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
  const quality = stripSkipInducedQualityFlags(base.quality, scores, gated)
  return { scores, quality }
}
