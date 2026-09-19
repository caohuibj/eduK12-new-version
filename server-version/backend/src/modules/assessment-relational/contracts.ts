import { canonicalHash } from '../assessment-runtime/canonical'
import { relationalFail } from './errors'
import type {
  RelationalActorRoleV1,
  RelationalApplicabilityV1,
  RelationalPerspectiveV1,
  RelationalRelationshipKindV1,
} from './types'

const EXACT_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/
const ACTOR_ROLES = new Set<RelationalActorRoleV1>([
  'STUDENT', 'TEACHER', 'PARENT', 'COUNSELOR', 'CLIENT',
])
const RELATIONSHIP_KINDS = new Set<RelationalRelationshipKindV1>([
  'SELF',
  'PARENT_CHILD',
  'COURSE_TEACHER_STUDENT',
  'CLASS_TEACHER_STUDENT',
  'COUNSELOR_CLIENT',
])
const PERSPECTIVES = new Set<RelationalPerspectiveV1>([
  'SELF_REPORT',
  'OBSERVER_REPORT',
  'RELATIONAL_EXPERIENCE',
])

const uniqueNonEmpty = <T extends string>(values: T[], allowed: Set<T>, field: string): T[] => {
  if (!Array.isArray(values) || values.length === 0) {
    return relationalFail('RELATIONAL_APPLICABILITY', `${field} must be non-empty`)
  }
  const unique = new Set<T>()
  for (const value of values) {
    if (!allowed.has(value)) relationalFail('RELATIONAL_APPLICABILITY', `${field} contains unsupported value: ${value}`)
    if (unique.has(value)) relationalFail('RELATIONAL_APPLICABILITY', `${field} contains duplicate value: ${value}`)
    unique.add(value)
  }
  return [...unique]
}

export const validateRelationalApplicability = (input: RelationalApplicabilityV1): RelationalApplicabilityV1 => {
  if (input.schemaVersion !== 1) relationalFail('RELATIONAL_APPLICABILITY', 'schemaVersion must be 1')
  if (!['BUNDLE', 'SCALE', 'FORM', 'SITUATIONAL'].includes(input.resourceKind)) {
    relationalFail('RELATIONAL_APPLICABILITY', `unsupported resourceKind: ${String(input.resourceKind)}`)
  }
  if (!input.resourceKey.trim()) relationalFail('RELATIONAL_APPLICABILITY', 'resourceKey is required')
  if (!EXACT_VERSION.test(input.resourceVersion)) relationalFail('RELATIONAL_APPLICABILITY', 'resourceVersion must be exact semver')
  if (!input.visibilityPolicyKey.trim()) relationalFail('RELATIONAL_APPLICABILITY', 'visibilityPolicyKey is required')

  const subjectRoles = uniqueNonEmpty(input.subjectRoles, ACTOR_ROLES, 'subjectRoles')
  const respondentRoles = uniqueNonEmpty(input.respondentRoles, ACTOR_ROLES, 'respondentRoles')
  const relationshipKinds = uniqueNonEmpty(input.relationshipKinds, RELATIONSHIP_KINDS, 'relationshipKinds')
  const perspectives = uniqueNonEmpty(input.perspectives, PERSPECTIVES, 'perspectives')

  if (input.analysisMode === 'MULTI_INFORMANT_SYNTHESIS') {
    relationalFail('RELATIONAL_ANALYSIS_RESERVED', 'MULTI_INFORMANT_SYNTHESIS is reserved and not implemented in V1')
  }
  if (input.analysisMode === 'COHORT_AGGREGATE') {
    if (!Number.isInteger(input.minimumRespondents) || (input.minimumRespondents ?? 0) < 3) {
      relationalFail('RELATIONAL_MINIMUM_N', 'COHORT_AGGREGATE requires minimumRespondents >= 3')
    }
  } else if (input.minimumRespondents !== null) {
    relationalFail('RELATIONAL_MINIMUM_N', 'INDIVIDUAL_ONLY requires minimumRespondents=null')
  }

  if (perspectives.includes('SELF_REPORT') && !relationshipKinds.includes('SELF')) {
    relationalFail('RELATIONAL_APPLICABILITY', 'SELF_REPORT requires SELF relationship support')
  }
  if (perspectives.includes('RELATIONAL_EXPERIENCE') && relationshipKinds.includes('SELF')) {
    relationalFail('RELATIONAL_APPLICABILITY', 'RELATIONAL_EXPERIENCE cannot use SELF relationship')
  }

  return {
    ...input,
    subjectRoles,
    respondentRoles,
    relationshipKinds,
    perspectives,
  }
}

export const hashRelationalApplicability = (input: RelationalApplicabilityV1): string => (
  canonicalHash({
    schema: 'RelationalApplicabilityV1',
    applicability: validateRelationalApplicability(input),
  })
)

export const assertRelationalApplicabilityMatch = (input: {
  applicability: RelationalApplicabilityV1
  subjectRole: RelationalActorRoleV1
  respondentRole: RelationalActorRoleV1
  relationshipKind: RelationalRelationshipKindV1
  perspective: RelationalPerspectiveV1
}): void => {
  const applicability = validateRelationalApplicability(input.applicability)
  if (!applicability.subjectRoles.includes(input.subjectRole)) {
    relationalFail('RELATIONAL_SUBJECT_ROLE', 'subject role is not allowed by resource applicability')
  }
  if (!applicability.respondentRoles.includes(input.respondentRole)) {
    relationalFail('RELATIONAL_RESPONDENT_ROLE', 'respondent role is not allowed by resource applicability')
  }
  if (!applicability.relationshipKinds.includes(input.relationshipKind)) {
    relationalFail('RELATIONAL_RELATIONSHIP_KIND', 'relationship kind is not allowed by resource applicability')
  }
  if (!applicability.perspectives.includes(input.perspective)) {
    relationalFail('RELATIONAL_PERSPECTIVE', 'perspective is not allowed by resource applicability')
  }
}