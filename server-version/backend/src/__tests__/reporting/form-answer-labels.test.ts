import { describe, expect, it } from 'vitest'
import { buildFormBackgroundReport } from '../../modules/reporting/scale-unit-report'
const options = [{ value: 'red', label: '红色' }, { value: 'green', label: '绿色' }, { value: 'blue', label: '蓝色' }]
describe('form choice report labels', () => {
  it('maps single and multiple choice values and preserves unknown values', () => {
    expect(buildFormBackgroundReport({ itemId: 'one', formType: 'single_choice', value: 'blue', options }).displayValue).toBe('蓝色')
    expect(buildFormBackgroundReport({ itemId: 'many', formType: 'multiple_choice', value: '["red","green"]', options }).displayValue).toBe('红色、绿色')
    expect(buildFormBackgroundReport({ itemId: 'unknown', formType: 'single_choice', value: 'purple', options }).value).toBe('purple')
  })
  it('preserves literal free text, malformed historical values, and null answers', () => {
    expect(buildFormBackgroundReport({ itemId: 'text', formType: 'text_input', value: '["red"]', options }).value).toBe('["red"]')
    expect(buildFormBackgroundReport({ itemId: 'bad', formType: 'multiple_choice', value: 'red,green', options }).value).toBe('red,green')
    expect(buildFormBackgroundReport({ itemId: 'empty', formType: 'single_choice', value: null, options }).value).toBeNull()
  })
})

it('keeps the canonical answer alongside the display label', () => {
  expect(buildFormBackgroundReport({ itemId: 'one', formType: 'single_choice', value: 'blue', options })).toMatchObject({ value: 'blue', displayValue: '蓝色' })
  expect(buildFormBackgroundReport({ itemId: 'many', formType: 'multiple_choice', value: '["red","green"]', options })).toMatchObject({ value: '["red","green"]', displayValue: '红色、绿色' })
})
