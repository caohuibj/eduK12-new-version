import { describe, expect, it } from 'vitest'
import {
  ageMonthsAt,
  buildAssessmentContext,
  hashAssessmentContext,
  validateContextAnswer,
  validateContextFormItems,
} from '../../modules/assessment-context'

const birthItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'birth-month',
  type: 'year_month',
  label: '出生年月',
  required: true,
  position: 0,
  contextKey: 'birthYearMonth',
  ...overrides,
})

describe('AssessmentContextV1', () => {
  it('derives age from UTC calendar months and keeps the frozen point reproducible', () => {
    expect(ageMonthsAt('2014-02', new Date('2026-08-01T00:00:00Z'))).toBe(150)
    const context = buildAssessmentContext({
      items: [birthItem()],
      answers: [{ formItemId: 'birth-month', value: '2014-02' }],
      frozenAt: new Date('2026-08-01T12:34:56Z'),
    })
    expect(context).toEqual({
      schemaVersion: 1,
      frozenAt: '2026-08-01T12:34:56.000Z',
      values: {
        birthYearMonth: '2014-02',
        ageMonthsAtFreeze: 150,
        ageYearsAtFreeze: 12,
      },
    })
  })

  it('rejects a future birth month and invalid bound answers', () => {
    expect(() => ageMonthsAt('2026-09', new Date('2026-08-01T00:00:00Z'))).toThrow('不能晚于冻结月份')
    expect(validateContextAnswer(birthItem(), '2014-2')).toContain('YYYY-MM')
    expect(validateContextAnswer({
      id: 'sex',
      type: 'single_choice',
      label: '性别',
      required: true,
      contextKey: 'sexAtBirth',
      options: [{ value: 'female', label: '女' }, { value: 'male', label: '男' }],
    }, 'unknown')).toContain('选项值无效')
  })

  it('validates unique context keys, field ordering, and stable hashes', () => {
    expect(validateContextFormItems([
      birthItem(),
      { ...birthItem(), id: 'birth-month-2', position: 1 },
    ], [2]).map((issue) => issue.message)).toContain('同一父级测评中 contextKey 不能重复')
    expect(validateContextFormItems([{ ...birthItem(), position: 3 }], [2]).map((issue) => issue.message)).toContain('context 表单必须排在第一个测评模块之前')

    const first = buildAssessmentContext({
      items: [birthItem()],
      answers: [{ formItemId: 'birth-month', value: '2014-02' }],
      frozenAt: new Date('2026-08-01T00:00:00Z'),
    })
    const second = { ...first, values: { ageYearsAtFreeze: 12, ageMonthsAtFreeze: 150, birthYearMonth: '2014-02' } }
    expect(hashAssessmentContext(first)).toBe(hashAssessmentContext(second))
  })

  it('allows optional context fields to freeze without a value', () => {
    const context = buildAssessmentContext({
      items: [{ ...birthItem(), required: false }],
      answers: [],
      frozenAt: new Date('2026-08-01T00:00:00Z'),
    })
    expect(context.values).toEqual({})
    expect(validateContextAnswer({ ...birthItem(), required: false }, '')).toBeNull()
  })
})
