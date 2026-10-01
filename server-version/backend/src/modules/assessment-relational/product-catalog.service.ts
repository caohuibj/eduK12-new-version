import type { UserRole } from '@prisma/client'
import { relationalFail } from './errors'
import {
  relationalProductRegistry,
  type RelationalProductEntryV1,
  type RelationalProductRegistryV1,
} from './product-registry'

export type RelationalProductJourneyV1 =
  | 'PARENT_SELF_SERVE'
  | 'TEACHER_ASSIGN_PARENT'
  | 'TEACHER_OBSERVER'
  | 'STUDENT_EXPERIENCE'
  | 'TEACHER_COHORT_REPORT'

const journeysFor = (entry: RelationalProductEntryV1): RelationalProductJourneyV1[] => {
  const a = entry.applicability
  const journeys: RelationalProductJourneyV1[] = []
  if (
    a.respondentRoles.includes('PARENT')
    && a.subjectRoles.includes('STUDENT')
    && a.relationshipKinds.includes('PARENT_CHILD')
    && a.perspectives.includes('OBSERVER_REPORT')
    && a.analysisMode === 'INDIVIDUAL_ONLY'
  ) {
    if (a.visibilityPolicyKey === 'observer_private_respondent_v1') journeys.push('PARENT_SELF_SERVE')
    if (a.visibilityPolicyKey === 'observer_assigning_teacher_v1') journeys.push('TEACHER_ASSIGN_PARENT')
  }
  if (
    a.respondentRoles.includes('TEACHER')
    && a.subjectRoles.includes('STUDENT')
    && a.relationshipKinds.includes('COURSE_TEACHER_STUDENT')
    && a.perspectives.includes('OBSERVER_REPORT')
    && a.analysisMode === 'INDIVIDUAL_ONLY'
    && a.visibilityPolicyKey === 'observer_assigning_teacher_v1'
  ) journeys.push('TEACHER_OBSERVER')
  if (
    a.respondentRoles.includes('STUDENT')
    && a.subjectRoles.includes('TEACHER')
    && a.relationshipKinds.includes('COURSE_TEACHER_STUDENT')
    && a.perspectives.includes('RELATIONAL_EXPERIENCE')
    && a.analysisMode === 'COHORT_AGGREGATE'
  ) {
    journeys.push('STUDENT_EXPERIENCE')
    if (['AGGREGATE_ONLY', 'DELAYED_AGGREGATE'].includes(entry.resultDisclosure?.audiences.SUBJECT.mode ?? 'NONE')) journeys.push('TEACHER_COHORT_REPORT')
  }
  return journeys
}

const publicProduct = (entry: RelationalProductEntryV1) => ({
  resourceKind: entry.applicability.resourceKind,
  resourceKey: entry.applicability.resourceKey,
  resourceVersion: entry.applicability.resourceVersion,
  title: entry.title,
  description: entry.description,
  scienceMaturity: entry.scienceMaturity,
  perspectives: entry.applicability.perspectives,
  analysisMode: entry.applicability.analysisMode,
  minimumRespondents: entry.applicability.minimumRespondents,
  journeys: journeysFor(entry),
})

export const createRelationalProductCatalogService = (
  registry: RelationalProductRegistryV1 = relationalProductRegistry,
) => ({
  catalog(role: UserRole) {
    // A teacher is both a possible respondent and the subject of Student→Teacher
    // cohort products. The catalog projects journeys after lookup, so adding the
    // STUDENT respondent lane here does not authorize teacher participation as a student.
    const roles = role === 'TEACHER'
      ? (['TEACHER', 'PARENT', 'STUDENT'] as const)
      : role === 'PARENT'
        ? (['PARENT'] as const)
        : role === 'STUDENT'
          ? (['STUDENT'] as const)
          : relationalFail('RELATIONAL_PRODUCT_ROLE', 'this account role cannot participate in relational assessment')
    const byIdentity = new Map<string, RelationalProductEntryV1>()
    for (const respondentRole of roles) {
      for (const entry of registry.listReleasedForRespondent(respondentRole)) {
        byIdentity.set(`${entry.applicability.resourceKind}:${entry.applicability.resourceKey}:${entry.applicability.resourceVersion}`, entry)
      }
    }
    const allowedJourneys = role === 'TEACHER'
      ? new Set<RelationalProductJourneyV1>(['TEACHER_ASSIGN_PARENT', 'TEACHER_OBSERVER', 'TEACHER_COHORT_REPORT'])
      : role === 'PARENT'
        ? new Set<RelationalProductJourneyV1>(['PARENT_SELF_SERVE'])
        : new Set<RelationalProductJourneyV1>(['STUDENT_EXPERIENCE'])
    return [...byIdentity.values()]
      .map(publicProduct)
      .filter((entry) => entry.journeys.some((journey) => allowedJourneys.has(journey)))
  },
})

export const relationalProductCatalogService = createRelationalProductCatalogService()
