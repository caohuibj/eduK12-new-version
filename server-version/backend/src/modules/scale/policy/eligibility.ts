import { instrumentApplicabilityV1Schema } from './schema'
import type {
  InstrumentApplicabilityV1,
  ScaleEligibilityEvaluationV1,
  ScaleEligibilityFactsV1,
  ScaleEligibilityReasonV1,
  ScalePolicyGrade,
} from './types'

export const SCALE_ELIGIBILITY_EVALUATOR_VERSION = 'scale-eligibility-v1' as const

const addReason = (reasons: ScaleEligibilityReasonV1[], code: string, rule: string, field?: string): void => {
  reasons.push({ code, rule, ...(field ? { field } : {}) })
}

const invalidGrade = (grade: string | undefined): boolean => (
  grade === 'other' || grade === 'not_disclosed'
)

export const evaluateInstrumentEligibility = (
  inputPolicy: InstrumentApplicabilityV1,
  facts: ScaleEligibilityFactsV1,
): ScaleEligibilityEvaluationV1 => {
  const policy = instrumentApplicabilityV1Schema.parse(inputPolicy) as InstrumentApplicabilityV1
  const ineligible: ScaleEligibilityReasonV1[] = []
  const indeterminate: ScaleEligibilityReasonV1[] = []

  if (!facts.respondentType || facts.respondentType === 'UNKNOWN') {
    addReason(indeterminate, 'RESPONDENT_TYPE_MISSING', 'respondentType is required', 'respondentType')
  } else if (!policy.respondentTypes.includes(facts.respondentType)) {
    addReason(ineligible, 'RESPONDENT_TYPE_NOT_ALLOWED', `respondentType must be one of ${policy.respondentTypes.join(',')}`, 'respondentType')
  }

  if (policy.assessmentContexts && policy.assessmentContexts.length > 0) {
    if (!facts.assessmentContext) {
      addReason(indeterminate, 'ASSESSMENT_CONTEXT_MISSING', 'assessmentContext is required', 'assessmentContext')
    } else if (!policy.assessmentContexts.includes(facts.assessmentContext)) {
      addReason(ineligible, 'ASSESSMENT_CONTEXT_NOT_ALLOWED', 'assessmentContext is outside the declared applicability', 'assessmentContext')
    }
  }

  const ageRange = policy.subject?.ageMonths
  if (ageRange && (ageRange.minInclusive !== undefined || ageRange.maxExclusive !== undefined)) {
    const ageMonths = facts.subject?.ageMonths
    if (ageMonths === undefined || !Number.isInteger(ageMonths) || ageMonths < 0) {
      addReason(indeterminate, 'SUBJECT_AGE_MISSING', 'subject ageMonths is required', 'subject.ageMonths')
    } else {
      if (ageRange.minInclusive !== undefined && ageMonths < ageRange.minInclusive) {
        addReason(ineligible, 'SUBJECT_AGE_BELOW_MIN', `subject ageMonths must be >= ${ageRange.minInclusive}`, 'subject.ageMonths')
      }
      if (ageRange.maxExclusive !== undefined && ageMonths >= ageRange.maxExclusive) {
        addReason(ineligible, 'SUBJECT_AGE_AT_OR_ABOVE_MAX', `subject ageMonths must be < ${ageRange.maxExclusive}`, 'subject.ageMonths')
      }
    }
  }

  const grades = policy.subject?.grades
  if (grades && grades.length > 0) {
    const grade = facts.subject?.gradeLevel
    if (!grade || invalidGrade(grade)) {
      addReason(indeterminate, 'SUBJECT_GRADE_MISSING', 'a canonical subject grade is required', 'subject.gradeLevel')
    } else if (!grades.includes(grade as ScalePolicyGrade)) {
      addReason(ineligible, 'SUBJECT_GRADE_NOT_ALLOWED', `subject grade must be one of ${grades.join(',')}`, 'subject.gradeLevel')
    }
  }

  const availableContextKeys = new Set(facts.availableContextKeys)
  policy.requiredContextKeys.forEach((key) => {
    if (!availableContextKeys.has(key)) addReason(indeterminate, 'REQUIRED_CONTEXT_MISSING', `required context key is missing: ${key}`, key)
  })

  if (ineligible.length > 0) return { outcome: 'INELIGIBLE', reasons: [...ineligible, ...indeterminate] }
  if (indeterminate.length > 0) return { outcome: 'INDETERMINATE', reasons: indeterminate }
  return { outcome: 'ELIGIBLE', reasons: [] }
}
