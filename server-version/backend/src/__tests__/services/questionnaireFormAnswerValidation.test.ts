import { describe, expect, it } from 'vitest'
import {
  normalizeQuestionnaireFormAnswer,
  validateQuestionnaireFormAnswer,
} from '../../services/questionnaireFormAnswerValidation'

const options = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
]

describe('questionnaire form answer validation', () => {
  it('rejects an empty required multiple-choice array', () => {
    expect(validateQuestionnaireFormAnswer({ id: 'm', type: 'multiple_choice', required: true, options }, [])).toContain('必填')
    expect(validateQuestionnaireFormAnswer({ id: 'm', type: 'multiple_choice', required: true, options }, '[]')).toContain('必填')
  })

  it('deduplicates and validates every multiple-choice option', () => {
    expect(validateQuestionnaireFormAnswer({ id: 'm', type: 'multiple_choice', required: true, options }, ['a', 'a'])).toBeNull()
    expect(validateQuestionnaireFormAnswer({ id: 'm', type: 'multiple_choice', required: false, options }, ['unknown'])).toContain('选项值无效')
  })

  it('validates single-choice and year-month values', () => {
    expect(validateQuestionnaireFormAnswer({ id: 's', type: 'single_choice', required: true, options }, 'unknown')).toContain('选项值无效')
    expect(validateQuestionnaireFormAnswer({ id: 'd', type: 'year_month', required: true, options: null }, '2026-13')).toContain('YYYY-MM')
    expect(validateQuestionnaireFormAnswer({ id: 'd', type: 'year_month', required: true, options: null }, '2026-08')).toBeNull()
  })

  it('rejects optional blank answers so they must use explicit skip', () => {
    expect(validateQuestionnaireFormAnswer({ id: 't', type: 'text_input', required: false, options: null }, '   ')).toContain('选择跳过')
    expect(validateQuestionnaireFormAnswer({ id: 'm', type: 'multiple_choice', required: false, options }, [])).toContain('选择跳过')
    expect(validateQuestionnaireFormAnswer({ id: 'm', type: 'multiple_choice', required: false, options }, '[]')).toContain('选择跳过')
  })

  it('stores fill and text answers in their trimmed form', () => {
    expect(normalizeQuestionnaireFormAnswer({ id: 'f', type: 'fill_blank' }, '  hello  ')).toBe('hello')
    expect(normalizeQuestionnaireFormAnswer({ id: 't', type: 'text_input' }, '  notes  ')).toBe('notes')
  })
})
