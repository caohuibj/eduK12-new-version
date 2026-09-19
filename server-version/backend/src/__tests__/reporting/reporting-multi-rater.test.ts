import { describe, expect, it } from 'vitest'
import { buildSeparatedMultiRaterObservations } from '../../modules/reporting/multiRater'
import type {
  ReportingObservationActorV1,
  ReportingObservationBatchV1,
  ReportingResolvedObservationV1,
} from '../../modules/reporting/resultSource'
import type { ReportingMetricRuleV1 } from '../../modules/reporting/types'

const subject: ReportingObservationActorV1 = {
  userId: 'student-1', membershipId: 'student-m1', actorRole: 'STUDENT', provenanceKind: 'ORG_MEMBER', externalRelationshipRef: null,
}
const actor = (userId: string, membershipId: string | null, actorRole: ReportingObservationActorV1['actorRole']): ReportingObservationActorV1 => ({
  userId,
  membershipId,
  actorRole,
  provenanceKind: actorRole === 'PARENT' ? 'EXTERNAL_PARENT' : 'ORG_MEMBER',
  externalRelationshipRef: actorRole === 'PARENT' ? `parent-rel-${userId}` : null,
})
const metricRule: ReportingMetricRuleV1 = {
  metricId: 'score', sourceMetricKey: 'score', acceptedResultQuality: ['interpretable'], acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
  aggregations: ['MEAN'], missingnessRule: 'EXCLUDE', minimumMetricN: 1, observationUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT',
}
const resolved = (input: {
  executionId: string
  trackId: string
  respondent: ReportingObservationActorV1
  relationshipKind: string
  perspective: 'SELF_REPORT' | 'OBSERVER_REPORT' | 'RELATIONAL_EXPERIENCE'
  value: number
}): ReportingResolvedObservationV1 => ({
  executionId: input.executionId,
  trackId: input.trackId,
  subject,
  respondent: input.respondent,
  relationshipKind: input.relationshipKind,
  relationshipRef: input.relationshipKind === 'SELF' ? null : `rel-${input.executionId}`,
  perspective: input.perspective,
  policyDomain: 'ORGANIZATION_RUN',
  canonicalResultHash: input.executionId.padEnd(64, 'a').slice(0, 64),
  metrics: [{ key: 'score', value: input.value, resultQuality: 'interpretable', metricQuality: null }],
  scientificMaturity: 'PILOT', provenanceState: 'FROZEN', scientificProvenanceHash: 'b'.repeat(64),
})
const batch = (trackId: string, observation: ReportingResolvedObservationV1): ReportingObservationBatchV1 => ({
  organizationId: 'org-1', runId: 'run-1', trackId,
  resourceFamily: 'SCALE', resourceKey: 'wellbeing', resourceVersion: '1.0.0', resourceMinimumN: 3,
  resolved: [observation], unresolved: [],
})

describe('separated multi-rater reporting', () => {
  it('keeps SELF, teacher and Parent observations separated without averaging them', () => {
    const self = resolved({ executionId: 'self-e', trackId: 'self-t', respondent: subject, relationshipKind: 'SELF', perspective: 'SELF_REPORT', value: 10 })
    const teacher = resolved({ executionId: 'teacher-e', trackId: 'teacher-t', respondent: actor('teacher-1', 'teacher-m1', 'TEACHER'), relationshipKind: 'CLASS_TEACHER_STUDENT', perspective: 'OBSERVER_REPORT', value: 20 })
    const parent = resolved({ executionId: 'parent-e', trackId: 'parent-t', respondent: actor('parent-1', null, 'PARENT'), relationshipKind: 'PARENT_CHILD', perspective: 'OBSERVER_REPORT', value: 30 })
    const projection = buildSeparatedMultiRaterObservations({
      subjectUserId: subject.userId,
      batches: [batch('self-t', self), batch('teacher-t', teacher), batch('parent-t', parent)],
      metricRules: [metricRule],
      allowedExecutionIds: new Set(['self-e', 'teacher-e', 'parent-e']),
    })
    expect(projection.limitations).toEqual(['NO_CROSS_RATER_COMBINATION'])
    expect(projection.observations).toHaveLength(3)
    expect(projection.observations.map((item) => ({
      trackId: item.trackId,
      respondent: item.respondent.userId,
      relationship: item.relationshipKind,
      perspective: item.perspective,
      value: item.metrics.score.value,
    }))).toEqual([
      { trackId: 'parent-t', respondent: 'parent-1', relationship: 'PARENT_CHILD', perspective: 'OBSERVER_REPORT', value: 30 },
      { trackId: 'self-t', respondent: 'student-1', relationship: 'SELF', perspective: 'SELF_REPORT', value: 10 },
      { trackId: 'teacher-t', respondent: 'teacher-1', relationship: 'CLASS_TEACHER_STUDENT', perspective: 'OBSERVER_REPORT', value: 20 },
    ])
  })

  it('drops sources not admitted by the caller policy instead of treating them as missing data', () => {
    const teacher = resolved({ executionId: 'teacher-e', trackId: 'teacher-t', respondent: actor('teacher-1', 'teacher-m1', 'TEACHER'), relationshipKind: 'CLASS_TEACHER_STUDENT', perspective: 'OBSERVER_REPORT', value: 20 })
    const parent = resolved({ executionId: 'parent-e', trackId: 'parent-t', respondent: actor('parent-1', null, 'PARENT'), relationshipKind: 'PARENT_CHILD', perspective: 'OBSERVER_REPORT', value: 30 })
    const projection = buildSeparatedMultiRaterObservations({
      subjectUserId: subject.userId,
      batches: [batch('teacher-t', teacher), batch('parent-t', parent)],
      metricRules: [metricRule],
      allowedExecutionIds: new Set(['teacher-e']),
    })
    expect(projection.observations.map((item) => item.executionId)).toEqual(['teacher-e'])
  })

  it('rejects duplicate Track/relationship/perspective/respondent tuples rather than combining them', () => {
    const one = resolved({ executionId: 'e1', trackId: 'teacher-t', respondent: actor('teacher-1', 'teacher-m1', 'TEACHER'), relationshipKind: 'CLASS_TEACHER_STUDENT', perspective: 'OBSERVER_REPORT', value: 20 })
    const duplicate = { ...one, executionId: 'e2', canonicalResultHash: 'c'.repeat(64) }
    expect(() => buildSeparatedMultiRaterObservations({
      subjectUserId: subject.userId,
      batches: [batch('teacher-t', one), batch('teacher-t', duplicate)],
      metricRules: [metricRule],
      allowedExecutionIds: new Set(['e1', 'e2']),
    })).toThrow()
  })
})
