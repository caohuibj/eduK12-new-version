import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createFrozenUnitAdmissionV2, parseFrozenUnitAdmissionV2 } from '../../modules/assessment-runtime/admission-snapshot-v2'
import { resolveScalePolicyRespondentType } from '../../modules/scale/scale-admission.service'
import { evaluateInstrumentEligibility, SCALE_ELIGIBILITY_EVALUATOR_VERSION } from '../../modules/scale/policy/eligibility'
import type { InstrumentApplicabilityV1, ScaleEligibilityFactsV1 } from '../../modules/scale/policy/types'

const policyHash = canonicalHash({ policy: 'pr3-eligibility-fixture' })
const frozenAt = '2026-09-21T00:00:00.000Z'

const applicability: InstrumentApplicabilityV1 = {
  schemaVersion: 1,
  policyVersion: 'pr3-fixture-v1',
  respondentTypes: ['SELF'],
  subject: {
    ageMonths: { minInclusive: 72, maxExclusive: 156 },
    grades: ['6', '7'],
  },
  assessmentContexts: ['STANDALONE', 'QUESTIONNAIRE', 'PUBLIC_QUESTIONNAIRE', 'COMPOSITE'],
  requiredContextKeys: ['birthYearMonth', 'gradeLevel'],
}

const facts = (overrides: Partial<ScaleEligibilityFactsV1> = {}): ScaleEligibilityFactsV1 => ({
  respondentType: 'SELF',
  subject: { ageMonths: 120, gradeLevel: '6' },
  assessmentContext: 'STANDALONE',
  availableContextKeys: ['birthYearMonth', 'gradeLevel'],
  ...overrides,
})

describe('PR3 frozen eligibility admission contract', () => {
  it('uses one eligibility evaluator for all four Scale delivery surfaces', () => {
    for (const assessmentContext of ['STANDALONE', 'QUESTIONNAIRE', 'PUBLIC_QUESTIONNAIRE', 'COMPOSITE']) {
      expect(evaluateInstrumentEligibility(applicability, facts({ assessmentContext }))).toEqual({
        outcome: 'ELIGIBLE',
        reasons: [],
      })
    }
  })

  it('enforces lower-inclusive and upper-exclusive month boundaries', () => {
    expect(evaluateInstrumentEligibility(applicability, facts({ subject: { ageMonths: 72, gradeLevel: '6' } })).outcome).toBe('ELIGIBLE')
    expect(evaluateInstrumentEligibility(applicability, facts({ subject: { ageMonths: 71, gradeLevel: '6' } })).outcome).toBe('INELIGIBLE')
    expect(evaluateInstrumentEligibility(applicability, facts({ subject: { ageMonths: 155, gradeLevel: '7' } })).outcome).toBe('ELIGIBLE')
    expect(evaluateInstrumentEligibility(applicability, facts({ subject: { ageMonths: 156, gradeLevel: '7' } })).outcome).toBe('INELIGIBLE')
  })

  it('fails closed for missing age/context, grade mismatch, respondent mismatch and wrong surface', () => {
    expect(evaluateInstrumentEligibility(applicability, facts({
      subject: { gradeLevel: '6' },
      availableContextKeys: ['gradeLevel'],
    })).outcome).toBe('INDETERMINATE')
    expect(evaluateInstrumentEligibility(applicability, facts({ subject: { ageMonths: 120, gradeLevel: '8' } })).outcome).toBe('INELIGIBLE')
    expect(evaluateInstrumentEligibility(applicability, facts({ respondentType: 'PARENT' })).outcome).toBe('INELIGIBLE')
    expect(evaluateInstrumentEligibility(applicability, facts({ assessmentContext: 'UNBOUND_SURFACE' })).outcome).toBe('INELIGIBLE')
  })

  it('never widens an ambiguous relational respondent into SELF', () => {
    expect(resolveScalePolicyRespondentType({ respondentType: null, subjectUserId: null, respondentUserId: null })).toBe('SELF')
    expect(resolveScalePolicyRespondentType({ respondentType: null, subjectUserId: 'student-1', respondentUserId: 'student-1' })).toBe('SELF')
    expect(resolveScalePolicyRespondentType({ respondentType: 'PARENT', subjectUserId: 'student-1', respondentUserId: 'parent-1' })).toBe('PARENT')
    const ambiguous = resolveScalePolicyRespondentType({
      respondentType: null,
      subjectUserId: 'student-1',
      respondentUserId: 'student-2',
    })
    expect(ambiguous).toBe('UNKNOWN')
    expect(evaluateInstrumentEligibility(applicability, facts({ respondentType: ambiguous })).outcome).toBe('INDETERMINATE')
  })

  it('canonicalizes a database-shaped Scale object before freezing V2 identity', () => {
    const snapshot = createFrozenUnitAdmissionV2({
      attemptEpoch: 1,
      scale: {
        id: 'scale-1',
        code: 'fixture_scale',
        name: 'Fixture',
        instrumentVersion: '1.0.0',
        instrumentClass: 'STANDARD',
        status: 'PUBLISHED',
      } as any,
      principal: { userId: 'student-1' },
      frozenAt: new Date(frozenAt),
      scalePolicy: {
        runtimePolicyHash: policyHash,
        eligibility: {
          schemaVersion: 1,
          evaluatorVersion: SCALE_ELIGIBILITY_EVALUATOR_VERSION,
          policyVersion: applicability.policyVersion,
          policyHash,
          contextHash: null,
          identityBindingHash: canonicalHash({ identity: 'scale-1' }),
          contextFrozenAt: null,
          evaluatedAt: frozenAt,
          outcome: 'ELIGIBLE',
          reasons: [],
          factProvenance: { subject: 'FROZEN_SUBJECT_BINDING', respondent: 'FROZEN_RESPONDENT_BINDING' },
        },
      },
    })
    expect(parseFrozenUnitAdmissionV2(snapshot).scale).toEqual({
      id: 'scale-1',
      code: 'fixture_scale',
      name: 'Fixture',
      instrumentVersion: '1.0.0',
    })
  })

  it('persists a HOLD decision together with deployment and identity provenance', () => {
    const contextHash = canonicalHash({ context: 'frozen' })
    const identityBindingHash = canonicalHash({ subjectUserId: 'student-1', respondentUserId: 'student-1' })
    const snapshot = createFrozenUnitAdmissionV2({
      attemptEpoch: 2,
      scale: { id: 'scale-1', code: 'fixture_scale', name: 'Fixture', instrumentVersion: '1.0.0' },
      principal: { userId: 'student-1' },
      requiresContext: true,
      contextSnapshotHash: contextHash,
      contextValues: { birthYearMonth: '2016-09', ageMonthsAtFreeze: 120, ageYearsAtFreeze: 10, gradeLevel: '8' },
      governance: { status: 'HOLD', holdReason: 'ELIGIBILITY_INELIGIBLE:SUBJECT_GRADE_NOT_ALLOWED' },
      frozenAt: new Date(frozenAt),
      scalePolicy: {
        runtimePolicyHash: policyHash,
        eligibility: {
          schemaVersion: 1,
          evaluatorVersion: SCALE_ELIGIBILITY_EVALUATOR_VERSION,
          policyVersion: applicability.policyVersion,
          policyHash,
          contextHash,
          identityBindingHash,
          contextFrozenAt: frozenAt,
          evaluatedAt: frozenAt,
          outcome: 'INELIGIBLE',
          reasons: [{ code: 'SUBJECT_GRADE_NOT_ALLOWED', rule: 'grade fixture', field: 'subject.gradeLevel' }],
          factProvenance: {
            subject: 'FROZEN_SUBJECT_BINDING',
            respondent: 'FROZEN_RESPONDENT_BINDING',
            ageBasis: 'birthYearMonth+context.frozenAt/month-precision',
          },
        },
        deployment: {
          revision: 3,
          policyHash: canonicalHash({ deployment: 3 }),
          authorizationId: 'auth-1',
          authorizationVersion: 4,
          evaluatedAt: frozenAt,
        },
      },
    })

    const parsed = parseFrozenUnitAdmissionV2(snapshot)
    expect(parsed.governance.status).toBe('HOLD')
    expect(parsed.scalePolicy?.eligibility.outcome).toBe('INELIGIBLE')
    expect(parsed.scalePolicy?.deployment).toMatchObject({
      revision: 3,
      authorizationId: 'auth-1',
      authorizationVersion: 4,
    })
    expect(parsed.contextSnapshotHash).toBe(contextHash)
  })
})
