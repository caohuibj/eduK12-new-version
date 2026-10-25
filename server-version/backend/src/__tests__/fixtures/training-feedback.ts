import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { freezeTrainingFeedbackSnapshot, prepareTrainingFeedbackBinding } from '../../modules/composite/training-feedback-binding'

export function feedbackAttempt(overrides: any = {}, policy: any = { schemaVersion: 1, mode: 'SCHEDULED', releaseAt: '2099-01-01T00:00:00.000Z' }) {
  const definition = { id: 'composite-1', name: 'Training', status: 'PUBLISHED', productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE',
    deliveryMode: 'FINAL_ONLY', publishedAt: new Date('2026-10-01T00:00:00.000Z'), questionnaireCourses: [{ courseId: 'course-1' }],
    trainingFeedbackPolicy: policy, trainingFeedbackPolicyHash: canonicalHash(policy),
    trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null,
    trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null,
    items: [], formSections: [], ...overrides.compositeAssessment }
  const row: any = { id: 'attempt-1', compositeAssessmentId: definition.id, status: 'COMPLETED', attemptEpoch: 1, asyncReportEpoch: null,
    trainingContentBindingHash: null, trainingReferenceBindingHash: null,
    userId: 'student-1', recoveryTokenHash: null, deliveryCourseId: 'course-1', accessTokenId: null, accessToken: null,
    frozenActiveSlotSetHash: 'slots', contextSnapshotHash: null, aggregateInputHash: 'aggregate',
    assignmentRef: null, respondentType: null, completedAt: new Date('2026-10-19T00:00:00Z'),
    trainingFlowSnapshotEncrypted: null, trainingFlowSnapshotHash: null, trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
    trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
    scaleAssessments: [], cognitiveSessions: [], situationalAttempts: [], formAnswers: [], formSectionAttempts: [],
    ...overrides, compositeAssessment: definition }
  const binding = prepareTrainingFeedbackBinding({ composite: definition, courseId: row.deliveryCourseId, accessTokenId: row.accessTokenId })!
  row.trainingFeedbackSnapshot = freezeTrainingFeedbackSnapshot({ ...binding, attemptId: row.id, attemptEpoch: row.attemptEpoch })
  row.trainingFeedbackSnapshotHash = canonicalHash(row.trainingFeedbackSnapshot)
  return row
}
export const readyFeedbackJob = (parent: any) => ({ id: 'job-1', status: 'READY', attemptEpoch: parent.attemptEpoch,
  slotSetHash: parent.frozenActiveSlotSetHash, contextHash: parent.contextSnapshotHash, aggregateInputHash: parent.aggregateInputHash,
  wholeSubmissionId: 'whole-1', requestedRevision: 1, completedAt: new Date(), errorCode: null })
