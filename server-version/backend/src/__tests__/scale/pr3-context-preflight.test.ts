import { describe, expect, it } from 'vitest'
import { assertScaleContextCollectable, requiredScaleContextKeys } from '../../modules/scale/policy/context-preflight'
import type { InstrumentApplicabilityV1 } from '../../modules/scale/policy/types'
const policy: InstrumentApplicabilityV1 = { schemaVersion: 1, policyVersion: '1', respondentTypes: ['SELF'], requiredContextKeys: [], subject: { ageMonths: { minInclusive: 168 } } }
describe('PR3 context configuration', () => {
  it('collects only policy-required facts', () => {
    expect(requiredScaleContextKeys(policy)).toEqual(['birthYearMonth'])
    expect(requiredScaleContextKeys({ ...policy, subject: undefined })).toEqual([])
  })
  it('requires mandatory context collection before the measurement', () => {
    const section = { contextSection: true, position: 0, items: [{ contextKey: 'birthYearMonth', required: true }] }
    expect(() => assertScaleContextCollectable({ policy, scalePosition: 1, sections: [section] })).not.toThrow()
    expect(() => assertScaleContextCollectable({ policy, scalePosition: 0, sections: [section] })).toThrow('SCALE_CONTEXT_CONFIGURATION_MISSING')
    expect(() => assertScaleContextCollectable({ policy, scalePosition: 1, sections: [{ ...section, items: [{ contextKey: 'birthYearMonth', required: false }] }] })).toThrow()
  })
})
