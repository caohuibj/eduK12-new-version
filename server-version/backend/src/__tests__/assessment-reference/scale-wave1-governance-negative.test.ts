import { describe, expect, it } from 'vitest'
import { testReference } from './wave1-reference.fixture'
import { validateReferenceSetDefinition } from '../../modules/assessment-reference/reference'

describe('governed reference malformed publication input', () => {
  it.each([null, false, 'invalid', { bands: [null] }])('rejects invalid governance without throwing: %j', governance => {
    const candidate = testReference()
    ;(candidate.entries[0] as any).governance = governance
    expect(() => validateReferenceSetDefinition(candidate)).not.toThrow()
    expect(validateReferenceSetDefinition(candidate).issues.some(i => i.severity === 'error')).toBe(true)
  })
  it('rejects empirical claims disguised as theoretical bands exactly once', () => {
    const candidate = testReference()
    candidate.entries[0].governance!.kind = 'LOCAL_REFERENCE'
    const issues = validateReferenceSetDefinition(candidate).issues
    expect(issues.filter(i => i.message === 'REFERENCE_KIND_SOURCE_MISMATCH')).toHaveLength(1)
  })
})
