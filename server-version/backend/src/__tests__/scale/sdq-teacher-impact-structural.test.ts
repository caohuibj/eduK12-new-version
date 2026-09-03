import { describe, expect, it } from 'vitest'
import {
  SDQ_TEACHER_EN_T4_10_V1_DEFINITION,
  SDQ_TEACHER_EN_T4_10_V1_GOLDEN_CASES,
} from '../../modules/scale/packages/sdq-teacher-en-t4-10-v1'
import {
  SDQ_TEACHER_IMPACT_ITEM_CODES,
  SDQ_TEACHER_OVERALL_ITEM,
  sdqTeacherMissingRequiredItemCodes,
  sdqTeacherT410Scorer,
} from '../../modules/scale/packages/sdq-teacher-impact-scorer'
import { missingRequiredScaleItemCodes } from '../../modules/scale/scale-scoring'

const symptomAnswers = () => (
  SDQ_TEACHER_EN_T4_10_V1_DEFINITION.items
    .filter((item) => item.itemCode.startsWith('SDQ-') && !item.itemCode.startsWith('SDQ-IMPACT'))
    .map((item) => ({ itemCode: item.itemCode, responseValue: 'somewhat_true' }))
)

describe('SDQ teacher impact structural skip (Prep 15.1 / 17.1)', () => {
  it('overall=No → impact=0 without forging answeredItems for unanswered follow-ups', () => {
    const answers = [
      ...symptomAnswers(),
      { itemCode: SDQ_TEACHER_OVERALL_ITEM, responseValue: 'no' },
    ]
    const scored = sdqTeacherT410Scorer({
      definition: SDQ_TEACHER_EN_T4_10_V1_DEFINITION,
      answers,
    })
    const impact = scored.scores.find((row) => row.key === 'impact')
    expect(impact).toBeTruthy()
    expect(impact!.value).toBe(0)
    expect(impact!.status).toBe('calculated')
    for (const code of SDQ_TEACHER_IMPACT_ITEM_CODES) {
      expect(impact!.answeredItems).not.toContain(code)
    }
    expect(impact!.answeredItems).toEqual([])
  })

  it('overall=No + unanswered follow-ups → quality not limited by skip-induced flags', () => {
    const answers = [
      ...symptomAnswers(),
      { itemCode: SDQ_TEACHER_OVERALL_ITEM, responseValue: 'no' },
    ]
    const scored = sdqTeacherT410Scorer({
      definition: SDQ_TEACHER_EN_T4_10_V1_DEFINITION,
      answers,
    })
    expect(scored.quality.status).toBe('interpretable')
    expect(scored.quality.flags).not.toContain('missing_items')
    expect(scored.quality.flags).not.toContain('score_not_calculable')
    const impact = scored.scores.find((row) => row.key === 'impact')
    expect(impact!.value).toBe(0)
    expect(impact!.answeredItems).toEqual([])
  })

  it('overall=No completeness does not require skipped impact follow-ups', () => {
    const answers = [
      ...symptomAnswers(),
      { itemCode: SDQ_TEACHER_OVERALL_ITEM, responseValue: 'no' },
    ]
    const naive = missingRequiredScaleItemCodes(SDQ_TEACHER_EN_T4_10_V1_DEFINITION, answers)
    expect(naive.sort()).toEqual([...SDQ_TEACHER_IMPACT_ITEM_CODES].sort())
    expect(sdqTeacherMissingRequiredItemCodes(SDQ_TEACHER_EN_T4_10_V1_DEFINITION, answers)).toEqual([])
  })

  it('overall=No golden still scores 0 and keeps only real answeredItems', () => {
    const golden = SDQ_TEACHER_EN_T4_10_V1_GOLDEN_CASES.find((row) => row.name === 'overall-no-gates-impact-to-zero')
    expect(golden).toBeTruthy()
    const scored = sdqTeacherT410Scorer({
      definition: SDQ_TEACHER_EN_T4_10_V1_DEFINITION,
      answers: golden!.answers,
    })
    const impact = scored.scores.find((row) => row.key === 'impact')
    expect(impact!.value).toBe(0)
    expect(impact!.answeredItems).toEqual([...SDQ_TEACHER_IMPACT_ITEM_CODES])
  })

  it('overall≠No keeps impact items from base scoring', () => {
    const golden = SDQ_TEACHER_EN_T4_10_V1_GOLDEN_CASES.find((row) => row.name === 'symptoms-somewhat-impact-great')
    expect(golden).toBeTruthy()
    const scored = sdqTeacherT410Scorer({
      definition: SDQ_TEACHER_EN_T4_10_V1_DEFINITION,
      answers: golden!.answers,
    })
    const impact = scored.scores.find((row) => row.key === 'impact')
    expect(impact).toBeTruthy()
    expect(impact!.value).toBeGreaterThan(0)
    expect(impact!.answeredItems.length).toBeGreaterThan(0)
  })
})
