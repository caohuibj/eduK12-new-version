import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { parseTrainingFeedbackPolicy, trainingFeedbackAvailability, trainingFeedbackPolicySchema,
  type TrainingFeedbackAvailability } from '../assessment-policy/training-feedback-policy'
import { compositeBadRequest } from './composite.errors'
import { trainingRoundPublicationIdentity } from './training-public-round'

/** These fields extend an existing authorized parent lookup; no extra query is
 * needed. Recruitment/retention windows deliberately do not enter this DTO. */
export const trainingFeedbackParentSelect = {
  id: true, productKind: true, questionnaireType: true, publishedAt: true,
  trainingFlowDigest: true, trainingVariantDigest: true,
  trainingFeedbackPolicy: true, trainingFeedbackPolicyHash: true,
} as const
export const trainingFeedbackAttemptSelect = {
  id: true, status: true, attemptEpoch: true, compositeAssessmentId: true,
  deliveryCourseId: true, accessTokenId: true, asyncReportEpoch: true,
  trainingFeedbackSnapshot: true, trainingFeedbackSnapshotHash: true,
  frozenActiveSlotSetHash: true, contextSnapshotHash: true, aggregateInputHash: true,
  compositeAssessment: { select: trainingFeedbackParentSelect },
} as const

const digest = z.string().regex(/^[0-9a-f]{64}$/)
const publicationSchema = z.object({
  schemaVersion: z.literal(1), compositeId: z.string().min(1), courseId: z.string().min(1),
  publishedAt: z.string().datetime(), productKind: z.literal('QUESTIONNAIRE'), questionnaireType: z.literal('COURSE'),
  trainingFlowDigest: z.string().nullable(), trainingVariantDigest: z.string().nullable(),
}).strict()
const snapshotSchema = z.object({
  schemaVersion: z.literal(1), attemptId: z.string().min(1), attemptEpoch: z.number().int().positive().safe(),
  compositeId: z.string().min(1), courseId: z.string().min(1),
  publicationIdentity: publicationSchema, publicationHash: digest,
  policy: trainingFeedbackPolicySchema, policyHash: digest, accessTokenId: z.string().min(1).nullable(), roundId: z.string().min(1).nullable(),
}).strict().refine(snapshot => snapshot.roundId === null || snapshot.accessTokenId !== null, 'Training round requires its frozen access token')
export type TrainingFeedbackSnapshot = z.infer<typeof snapshotSchema>
export type TrainingFeedbackBinding = Omit<TrainingFeedbackSnapshot, 'schemaVersion' | 'attemptId' | 'attemptEpoch' | 'publicationHash'>
export type TrainingFeedbackAttempt = {
  id?: string; status?: string; attemptEpoch?: number; compositeAssessmentId?: string;
  deliveryCourseId?: string | null; accessTokenId?: string | null; asyncReportEpoch?: number | null;
  trainingFeedbackSnapshot?: unknown; trainingFeedbackSnapshotHash?: string | null;
  compositeAssessment?: {
    id?: string; productKind?: string; questionnaireType?: string | null; publishedAt?: Date | string | null;
    trainingFlowDigest?: string | null; trainingVariantDigest?: string | null;
    trainingFeedbackPolicy?: unknown; trainingFeedbackPolicyHash?: string | null;
  } | null;
}

/** Pure admission binding. The caller holds the parent admission lock and has
 * checked the actual Training course, author, enrollment/public token and C21
 * round window using its existing reads. This rechecks frozen DTO identities. */
export function prepareTrainingFeedbackBinding(input: {
  composite: any; courseId: string; accessTokenId: string | null;
  round?: { id: string; compositeId: string; courseId: string; publicationIdentity: unknown; publicationHash: string } | null;
}): TrainingFeedbackBinding | null {
  const { composite, courseId, accessTokenId, round } = input
  if (composite.trainingFeedbackPolicy == null && composite.trainingFeedbackPolicyHash == null) return null
  try {
    if (composite.trainingFeedbackPolicy == null || composite.status !== 'PUBLISHED' || !composite.publishedAt ||
      composite.productKind !== 'QUESTIONNAIRE' || composite.questionnaireType !== 'COURSE' || composite.deliveryMode === 'LEGACY' ||
      composite.reportPackageKey || composite.analysisProtocolKey ||
      !(composite.questionnaireCourses ?? []).some((entry: { courseId: string }) => entry.courseId === courseId)) throw new Error('scope')
    if ((accessTokenId !== null && (typeof accessTokenId !== 'string' || !accessTokenId)) || (round && accessTokenId === null)) throw new Error('token')
    const policy = parseTrainingFeedbackPolicy(composite.trainingFeedbackPolicy)
    if (canonicalHash(policy) !== composite.trainingFeedbackPolicyHash) throw new Error('policy hash')
    const publicationIdentity = publicationSchema.parse(trainingRoundPublicationIdentity(composite, courseId))
    if (round && (round.compositeId !== composite.id || round.courseId !== courseId ||
      round.publicationHash !== canonicalHash(publicationIdentity) || canonicalHash(round.publicationIdentity) !== round.publicationHash)) throw new Error('round')
    return { compositeId: composite.id, courseId, publicationIdentity, policy, policyHash: composite.trainingFeedbackPolicyHash, accessTokenId, roundId: round?.id ?? null }
  } catch { throw compositeBadRequest('Training 反馈策略或发布绑定无效') }
}

export function freezeTrainingFeedbackSnapshot(input: TrainingFeedbackBinding & { attemptId: string; attemptEpoch: number }): TrainingFeedbackSnapshot {
  try {
    const snapshot = snapshotSchema.parse({ ...input, schemaVersion: 1, publicationHash: canonicalHash(input.publicationIdentity) })
    if (snapshot.publicationIdentity.compositeId !== snapshot.compositeId || snapshot.publicationIdentity.courseId !== snapshot.courseId ||
      canonicalHash(snapshot.policy) !== snapshot.policyHash) throw new Error('identity')
    return snapshot
  } catch { throw compositeBadRequest('Training 反馈冻结身份不完整或不匹配') }
}

/** Undefined is legacy only when BOTH publication and attempt configuration
 * are absent. A configured but missing/malformed snapshot always fails closed. */
export function readTrainingFeedbackSnapshot(attempt: TrainingFeedbackAttempt): TrainingFeedbackSnapshot | null {
  const parent = attempt.compositeAssessment
  if (attempt.trainingFeedbackSnapshot == null && attempt.trainingFeedbackSnapshotHash == null &&
    parent?.trainingFeedbackPolicy == null && parent?.trainingFeedbackPolicyHash == null) return null
  const snapshot = snapshotSchema.parse(attempt.trainingFeedbackSnapshot)
  if (!parent?.publishedAt || parent.trainingFeedbackPolicy == null || !parent.trainingFeedbackPolicyHash ||
    canonicalHash(snapshot) !== attempt.trainingFeedbackSnapshotHash || snapshot.attemptId !== attempt.id ||
    snapshot.attemptEpoch !== attempt.attemptEpoch || snapshot.compositeId !== attempt.compositeAssessmentId ||
    snapshot.courseId !== attempt.deliveryCourseId || parent.id !== snapshot.compositeId ||
    canonicalHash(snapshot.policy) !== snapshot.policyHash || snapshot.policyHash !== parent.trainingFeedbackPolicyHash ||
    canonicalHash(parseTrainingFeedbackPolicy(parent.trainingFeedbackPolicy)) !== snapshot.policyHash ||
    canonicalHash(snapshot.publicationIdentity) !== snapshot.publicationHash ||
    canonicalHash(trainingRoundPublicationIdentity(parent, snapshot.courseId)) !== snapshot.publicationHash ||
    snapshot.publicationIdentity.compositeId !== snapshot.compositeId || snapshot.publicationIdentity.courseId !== snapshot.courseId ||
    snapshot.accessTokenId !== (attempt.accessTokenId ?? null)) throw new Error('Training feedback frozen identity mismatch')
  return snapshot
}

export type TrainingFeedbackDecision = {
  configured: boolean; allowed: boolean; state: TrainingFeedbackAvailability | 'UNAVAILABLE'; releaseAt: string | null;
}
/** Caller authentication and content disclosure remain authoritative. Teacher
 * reads do not invoke this participant-only gate. No decryption/scoring/query. */
export function evaluateTrainingFeedbackForAttempt(attempt: TrainingFeedbackAttempt,
  options: { reportReady?: boolean; now?: Date } = {}): TrainingFeedbackDecision {
  try {
    const snapshot = readTrainingFeedbackSnapshot(attempt)
    if (!snapshot) return { configured: false, allowed: attempt.status === 'COMPLETED',
      state: attempt.status === 'COMPLETED' ? 'AVAILABLE' : 'WAITING_SUBMISSION', releaseAt: null }
    const completed = attempt.status === 'COMPLETED'
    // Synchronous completion already generated authoritative unit results;
    // asynchronous attempts require a trusted, current job-readiness fact.
    const reportReady = options.reportReady ?? (completed && attempt.asyncReportEpoch === null)
    const result = trainingFeedbackAvailability({ policy: snapshot.policy, completed, reportReady, now: options.now ?? new Date() })
    return { configured: true, allowed: result.state === 'AVAILABLE', ...result }
  } catch { return { configured: true, allowed: false, state: 'UNAVAILABLE', releaseAt: null } }
}
