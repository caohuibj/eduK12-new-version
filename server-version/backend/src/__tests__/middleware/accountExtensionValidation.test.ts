import { describe, expect, it } from 'vitest'
import { parsePositiveAccountExtensionMonths } from '../../middleware/accountExtensionValidation'

describe('account extension validation', () => {
  it('defaults to 12 months and accepts positive integers only', () => {
    expect(parsePositiveAccountExtensionMonths(undefined)).toBe(12)
    expect(parsePositiveAccountExtensionMonths(1)).toBe(1)
    expect(parsePositiveAccountExtensionMonths(24)).toBe(24)
    expect(parsePositiveAccountExtensionMonths(0)).toBeNull()
    expect(parsePositiveAccountExtensionMonths(-1)).toBeNull()
    expect(parsePositiveAccountExtensionMonths(-24)).toBeNull()
    expect(parsePositiveAccountExtensionMonths(1.5)).toBeNull()
    expect(parsePositiveAccountExtensionMonths('12')).toBeNull()
  })
})
