import { describe, expect, it } from 'vitest'
import {
  assertProtectedSubjectNotViewer,
  buildProtectedFeedbackProjection,
  type ReportingProtectedFeedbackSpecV1,
} from '../../modules/reporting/protectedFeedback'
import type { ReportingSeparatedMultiRaterV1, ReportingSeparatedRaterObservationV1 } from '../../modules/reporting/multiRater'
import type { ReportingObservationActorV1 } from '../../modules/reporting/resultSource'

const subject: ReportingObservationActorV1 = {
  userId: 'teacher-subject', membershipId: 'teacher-m1', actorRole: 'TEACHER', provenanceKind: 'ORG_MEMBER', externalRelationshipRef: null,
}
const respondent = (id: string): ReportingObservationActorV1 => ({
  userId: id, membershipId: `${id}-m1`, actorRole: 'STUDENT', provenanceKind: 'ORG_MEMBER', externalRelationshipRef: null,
})
const observation = (id: string, value: number, state: 'COMPLETED' | 'MISSING' = 'COMPLETED'): ReportingSeparatedRaterObservationV1 => ({
  executionId: `execution-${id}`,
  trackId: 'feedback-track',
  state,
  subject,
  respondent: respondent(id),
  relationshipKind: 'CLASS_TEACHER_STUDENT',
  relationshipRef: `class-relation-${id}`,
  perspective: 'RELATIONAL_EXPERIENCE',
  metrics: { score: state === 'COMPLETED' ? { state: 'present', value } : { state: 'missing' } },
})
const separated = (observations: ReportingSeparatedRaterObservationV1[]): ReportingSeparatedMultiRaterV1 => ({
  schemaVersion: 1,
  kind: 'MULTI_RATER_SEPARATED',
  subjectUserId: subject.userId,
  resource: { family: 'SCALE', key: 'teacher-feedback', version: '1.0.0' },
  observations,
  limitations: ['NO_CROSS_RATER_COMBINATION'],
})
const spec = (floor = 5): ReportingProtectedFeedbackSpecV1 => ({
  schemaVersion: 1,
  analysisKind: 'PROTECTED_FEEDBACK',
  engineKey: 'ORG_PROTECTED_FEEDBACK_V1',
  engineVersion: '1.0.0',
  privacyUnit: 'RESPONDENT',
  selectionPolicy: 'UNIQUE_OR_REJECT',
  minimumRespondentN: floor,
  minimumContributorN: floor,
  metricRules: [{
    metricId: 'score', sourceMetricKey: 'score', acceptedResultQuality: ['interpretable'], acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
    aggregations: ['MEAN'], missingnessRule: 'EXCLUDE', minimumMetricN: floor, observationUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT',
  }],
})

describe('protected Organization feedback', () => {
  it('denies subject access before any administrator allow basis can matter', () => {
    expect(() => assertProtectedSubjectNotViewer('same-user', 'same-user')).toThrowError(expect.objectContaining({ code: 'SUBJECT_EXCLUDED' }))
  })

  it('counts distinct respondents, ignores replay of the same authoritative execution, and exposes no respondent identities', () => {
    const rows = [1, 2, 3, 4, 5].map((index) => observation(`student-${index}`, index * 10))
    rows.push({ ...rows[0] })
    const built = buildProtectedFeedbackProjection({
      separated: separated(rows),
      subjectUserId: subject.userId,
      trackId: 'feedback-track',
      relationshipKind: 'CLASS_TEACHER_STUDENT',
      perspective: 'RELATIONAL_EXPERIENCE',
      sourceMinimumRespondents: 5,
      spec: spec(5),
    })
    expect(built.internalCounts).toEqual({ eligibleRespondentN: 5, resultContributorN: 5, metricValidN: { score: 5 } })
    expect(built.projection.state).toBe('present')
    expect(built.projection.metrics?.score.aggregations?.mean).toBe(30)
    expect(JSON.stringify(built.projection)).not.toContain('student-')
    expect(JSON.stringify(built.projection)).not.toContain('eligibleRespondentN')
  })

  it('suppresses the whole projection when the respondent contributor floor is not met', () => {
    const rows = [1, 2, 3, 4].map((index) => observation(`student-${index}`, index))
    rows.push(observation('student-5', 5, 'MISSING'))
    const built = buildProtectedFeedbackProjection({
      separated: separated(rows),
      subjectUserId: subject.userId,
      trackId: 'feedback-track',
      relationshipKind: 'CLASS_TEACHER_STUDENT',
      perspective: 'RELATIONAL_EXPERIENCE',
      sourceMinimumRespondents: 5,
      spec: spec(5),
    })
    expect(built.internalCounts.eligibleRespondentN).toBe(5)
    expect(built.internalCounts.resultContributorN).toBe(4)
    expect(built.projection).toMatchObject({ state: 'suppressed' })
    expect(built.projection.metrics).toBeUndefined()
  })

  it('rejects two different authoritative observations from the same respondent under one fixed source', () => {
    const first = observation('student-1', 10)
    const second = { ...first, executionId: 'different-execution', metrics: { score: { state: 'present' as const, value: 11 } } }
    expect(() => buildProtectedFeedbackProjection({
      separated: separated([first, second]),
      subjectUserId: subject.userId,
      trackId: 'feedback-track',
      relationshipKind: 'CLASS_TEACHER_STUDENT',
      perspective: 'RELATIONAL_EXPERIENCE',
      sourceMinimumRespondents: 1,
      spec: spec(1),
    })).toThrowError(expect.objectContaining({ code: 'AMBIGUOUS_OBSERVATION' }))
  })
})
