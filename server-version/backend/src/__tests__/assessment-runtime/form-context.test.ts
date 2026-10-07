import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contextForNormalizedFormEntries } from '../../modules/assessment-runtime/form-context'
import { writeContextFormAnswer, readContextFormAnswer, hashAssessmentContext, type ContextFormItem } from '../../modules/assessment-context'
import { decryptAssessmentContext } from '../../modules/assessment-context/security'

const presets = [
  ['birthYearMonth', '2014-02', 'year_month'],
  ['sexAtBirth', 'female', 'single_choice'],
  ['gradeLevel', '7', 'single_choice'],
  ['primaryLanguage', 'zh-CN', 'single_choice'],
  ['countryOrRegion', 'CN', 'single_choice'],
] as const

beforeEach(() => {
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
  vi.stubEnv('ASSESSMENT_CONTEXT_HASH_KEY', 'b'.repeat(64))
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-07T00:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('normalized form context', () => {
  it.each(presets)('accepts %s plaintext while retaining encrypted storage', (key, value, type) => {
    const item: ContextFormItem = { id: key, contextKey: key, type, required: true, options: [{ value, label: value }] }
    const storedValue = writeContextFormAnswer(key, value)
    const result = contextForNormalizedFormEntries([{ item: { id: key, contextKey: key }, normalizedValue: value, storedValue }], [item])
    const context = decryptAssessmentContext(result.encrypted)
    expect(context.values[key]).toBe(value)
    expect(result.hash).toBe(hashAssessmentContext(context))
    expect(storedValue).not.toBe(value)
    expect(readContextFormAnswer(key, storedValue)).toBe(value)
    const again = contextForNormalizedFormEntries([{ item: { id: key, contextKey: key }, normalizedValue: value }], [item])
    expect(again.hash).toBe(result.hash)
    expect(again.encrypted).not.toBe(result.encrypted)
  })

  it.each(['K', ...Array.from({ length: 12 }, (_, index) => String(index + 1)), 'other', 'not_disclosed'])('accepts grade %s', value => {
    const item = { id: 'grade', contextKey: 'gradeLevel', type: 'single_choice', required: true, options: [{ value, label: value }] }
    expect(decryptAssessmentContext(contextForNormalizedFormEntries([{ item, normalizedValue: value }], [item]).encrypted).values.gradeLevel).toBe(value)
  })

  it('leaves optional context absent and rejects invalid required values before persistence', () => {
    const item = { id: 'grade', contextKey: 'gradeLevel', type: 'single_choice', required: false, options: [{ value: '7', label: '七年级' }] }
    expect(decryptAssessmentContext(contextForNormalizedFormEntries([{ item, normalizedValue: null }], [item]).encrypted).values).toEqual({})
    for (const value of ['invalid', ['7']]) {
      expect(() => contextForNormalizedFormEntries([{ item, normalizedValue: value }], [item])).toThrow(expect.objectContaining({ code: 'FORM_ANSWER_INVALID', statusCode: 400 }))
    }
    expect(() => contextForNormalizedFormEntries([{ item, normalizedValue: null }], [{ ...item, required: true }])).toThrow('必填项')
  })
})
