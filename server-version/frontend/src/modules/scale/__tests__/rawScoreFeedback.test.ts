import { describe, expect, it } from 'vitest'
import { matchRawScoreFeedback, validateRawScoreFeedback, type RawScoreFeedback } from '../rawScoreFeedback'
const config = (): RawScoreFeedback => ({ schemaVersion: 1, rules: [{ scoreKey: 'total', ranges: [
  { key: 'a', min: 0, max: 2.5, includeMax: false, text: 'A' },
  { key: 'b', min: 2.5, max: 5, includeMax: true, text: 'B' },
] }] })
describe('raw score authoring contract', () => {
  it('matches unrounded boundaries, final inclusive maximum and no-match fallback', () => {
    const value = config()
    expect(matchRawScoreFeedback(value, 'total', 2.4999)?.text).toBe('A')
    expect(matchRawScoreFeedback(value, 'total', 2.5)?.text).toBe('B')
    expect(matchRawScoreFeedback(value, 'total', 5)?.text).toBe('B')
    expect(matchRawScoreFeedback(value, 'total', 5.1)).toBeNull()
    value.rules[0].fallback = { text: 'outside' }
    expect(matchRawScoreFeedback(value, 'total', 6)?.text).toBe('outside')
    expect(matchRawScoreFeedback(value, 'total', NaN)).toBeNull()
    expect(matchRawScoreFeedback(value, 'total', null)).toBeNull()
  })
  it('rejects overlap, interior gaps, duplicate keys and nonfinite ranges', () => {
    const value = config()
    expect(validateRawScoreFeedback(value, ['total'])).toEqual([])
    value.rules[0].ranges[1].min = 2
    expect(validateRawScoreFeedback(value, ['total']).join()).toContain('重叠')
    value.rules[0].ranges[1].min = 3
    expect(validateRawScoreFeedback(value, ['total']).join()).toContain('空档')
    value.rules[0].fallback = { text: 'fallback' }
    expect(validateRawScoreFeedback(value, ['total'])).toEqual([])
    value.rules[0].ranges[1].key = 'a'
    value.rules[0].ranges[0].includeMax = true
    value.rules[0].ranges[0].min = NaN
    expect(validateRawScoreFeedback(value, ['total']).join()).toContain('重复')
    expect(validateRawScoreFeedback(value, ['total']).join()).toContain('最后')
    expect(validateRawScoreFeedback(value, ['total']).join()).toContain('有限')
    expect(validateRawScoreFeedback(value, []).join()).toContain('不存在')
  })
})
