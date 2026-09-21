import { describe, expect, it } from 'vitest'
import { evaluateInstrumentEligibility } from '../../modules/scale/policy/eligibility'
import { instrumentApplicabilityV1Schema } from '../../modules/scale/policy/schema'
import type { InstrumentApplicabilityV1 } from '../../modules/scale/policy/types'

const policy = (overrides: Partial<InstrumentApplicabilityV1> = {}): InstrumentApplicabilityV1 => ({
  schemaVersion: 1,
  policyVersion: 'test-v1',
  respondentTypes: ['SELF'],
  requiredContextKeys: [],
  ...overrides,
})

describe('scale eligibility policy', () => {
  it('supports a one-sided 14+ month boundary without a synthetic max age', () => {
    const fourteenPlus = policy({ subject: { ageMonths: { minInclusive: 168 } } })
    expect(instrumentApplicabilityV1Schema.safeParse(fourteenPlus).success).toBe(true)
    expect(evaluateInstrumentEligibility(fourteenPlus, { respondentType: 'SELF', subject: { ageMonths: 168 }, availableContextKeys: [] }).outcome).toBe('ELIGIBLE')
    expect(evaluateInstrumentEligibility(fourteenPlus, { respondentType: 'SELF', subject: { ageMonths: 167 }, availableContextKeys: [] }).outcome).toBe('INELIGIBLE')
    expect(evaluateInstrumentEligibility(fourteenPlus, { respondentType: 'SELF', subject: {}, availableContextKeys: [] }).outcome).toBe('INDETERMINATE')
  })

  it('does not require birth data when age is unconstrained', () => {
    expect(evaluateInstrumentEligibility(policy(), { respondentType: 'SELF', availableContextKeys: [] })).toEqual({ outcome: 'ELIGIBLE', reasons: [] })
  })

  it('distinguishes respondent mismatch from unknown respondent', () => {
    expect(evaluateInstrumentEligibility(policy(), { respondentType: 'PARENT', availableContextKeys: [] }).outcome).toBe('INELIGIBLE')
    expect(evaluateInstrumentEligibility(policy(), { respondentType: 'UNKNOWN', availableContextKeys: [] }).outcome).toBe('INDETERMINATE')
  })

  it('treats missing canonical grade/context facts as indeterminate', () => {
    const constrained = policy({
      subject: { grades: ['6', '7'] },
      requiredContextKeys: ['gradeLevel'],
    })
    const result = evaluateInstrumentEligibility(constrained, { respondentType: 'SELF', subject: { gradeLevel: 'not_disclosed' }, availableContextKeys: [] })
    expect(result.outcome).toBe('INDETERMINATE')
    expect(result.reasons.map((reason) => reason.code)).toContain('SUBJECT_GRADE_MISSING')
    expect(result.reasons.map((reason) => reason.code)).toContain('REQUIRED_CONTEXT_MISSING')
  })

  it('uses an exclusive upper age bound', () => {
    const bounded = policy({ subject: { ageMonths: { minInclusive: 72, maxExclusive: 156 } } })
    expect(evaluateInstrumentEligibility(bounded, { respondentType: 'SELF', subject: { ageMonths: 155 }, availableContextKeys: [] }).outcome).toBe('ELIGIBLE')
    expect(evaluateInstrumentEligibility(bounded, { respondentType: 'SELF', subject: { ageMonths: 156 }, availableContextKeys: [] }).outcome).toBe('INELIGIBLE')
  })
})
