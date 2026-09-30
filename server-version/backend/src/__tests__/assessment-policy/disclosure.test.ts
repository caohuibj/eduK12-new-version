import { describe, expect, it } from 'vitest'
import {
  assertDisclosureNarrowing,
  disclosureFromRelationalDisposition,
  disclosureFromScaleCapabilities,
} from '../../modules/assessment-policy/disclosure'
import { DISCLOSURE_PRESETS } from '../../modules/scale/policy/disclosure'

describe('normalized assessment disclosure contract', () => {
  it('maps Scale audience capabilities without turning a report into raw-data access', () => {
    const report = disclosureFromScaleCapabilities({
      audience: 'respondent',
      capabilities: DISCLOSURE_PRESETS.FULL_REPORT(),
      policyKey: 'scale-demo-v1',
    })
    expect(report).toMatchObject({
      audience: 'RESPONDENT',
      mode: 'INDIVIDUAL_REPORT',
      rawAnswers: false,
      researchExport: false,
    })

    expect(disclosureFromScaleCapabilities({
      audience: 'subject',
      capabilities: DISCLOSURE_PRESETS.EDUCATIONAL_ONLY(),
      policyKey: 'scale-demo-v1',
    }).mode).toBe('EDUCATIONAL_SUMMARY')
    expect(disclosureFromScaleCapabilities({
      audience: 'teacher',
      capabilities: DISCLOSURE_PRESETS.NONE(),
      policyKey: 'scale-demo-v1',
    }).mode).toBe('NONE')
  })

  it('keeps cohort-only respondent FINAL completion-only', () => {
    expect(disclosureFromRelationalDisposition({
      disposition: 'COHORT_ONLY',
      audience: 'RESPONDENT',
      policyKey: 'student_teacher_aggregate_only_v1',
      minimumRespondents: 5,
    })).toMatchObject({
      mode: 'COMPLETION_ONLY',
      minimumRespondents: null,
      rawAnswers: false,
    })
  })

  it('requires explicit aggregate permission and a privacy floor for subject-facing reports', () => {
    expect(disclosureFromRelationalDisposition({
      disposition: 'COHORT_ONLY',
      audience: 'SUBJECT',
      policyKey: 'student_teacher_aggregate_only_v1',
      minimumRespondents: 5,
      aggregateAllowed: true,
    })).toMatchObject({ mode: 'AGGREGATE_REPORT', minimumRespondents: 5 })

    expect(disclosureFromRelationalDisposition({
      disposition: 'COHORT_ONLY',
      audience: 'SUBJECT',
      policyKey: 'protected_feedback_v1',
      minimumRespondents: 5,
      aggregateAllowed: false,
    }).mode).toBe('NONE')

    expect(() => disclosureFromRelationalDisposition({
      disposition: 'COHORT_ONLY',
      audience: 'SUBJECT',
      policyKey: 'unsafe',
      minimumRespondents: 2,
      aggregateAllowed: true,
    })).toThrow(/at least 3/)
  })

  it('allows downstream configuration to narrow but never widen disclosure', () => {
    const source = disclosureFromRelationalDisposition({
      disposition: 'COHORT_ONLY',
      audience: 'SUBJECT',
      policyKey: 'student_teacher_aggregate_only_v1',
      minimumRespondents: 5,
      aggregateAllowed: true,
    })
    expect(assertDisclosureNarrowing(source, {
      ...source,
      mode: 'DELAYED_AGGREGATE_REPORT',
      minimumRespondents: 10,
    }).minimumRespondents).toBe(10)
    expect(() => assertDisclosureNarrowing(source, {
      ...source,
      mode: 'INDIVIDUAL_REPORT',
      minimumRespondents: null,
    })).toThrow()
  })
})
