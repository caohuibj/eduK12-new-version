import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { evaluateTrainingFeedbackForAttempt, freezeTrainingFeedbackSnapshot, prepareTrainingFeedbackBinding,
  readTrainingFeedbackSnapshot, trainingFeedbackAttemptSelect, type TrainingFeedbackAttempt } from '../../modules/composite/training-feedback-binding'
import { trainingRoundPublicationIdentity } from '../../modules/composite/training-public-round'
const now = new Date('2026-10-19T05:00:00.000Z')
const immediate = { schemaVersion: 1, mode: 'IMMEDIATE' }
const scheduled = { schemaVersion: 1, mode: 'SCHEDULED', releaseAt: '2026-10-19T06:00:00.000Z' }
const publication = (policy: unknown = scheduled) => ({ id: 'publication', status: 'PUBLISHED', productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE',
  deliveryMode: 'FINAL_ONLY', publishedAt: new Date('2026-10-18T00:00:00.000Z'), questionnaireCourses: [{ courseId: 'course' }],
  trainingFeedbackPolicy: policy, trainingFeedbackPolicyHash: policy == null ? null : canonicalHash(policy), trainingFlowDigest: null, trainingVariantDigest: null })
function fixture(policy: unknown = scheduled, roundId: string | null = null): TrainingFeedbackAttempt {
  const parent = publication(policy)
  const identity = trainingRoundPublicationIdentity(parent, 'course')
  const round = roundId ? { id: roundId, compositeId: parent.id, courseId: 'course', publicationIdentity: identity, publicationHash: canonicalHash(identity) } : null
  const binding = prepareTrainingFeedbackBinding({ composite: parent, courseId: 'course', accessTokenId: roundId ? 'token' : null, round })!
  const snapshot = freezeTrainingFeedbackSnapshot({ ...binding, attemptId: 'attempt', attemptEpoch: 2 })
  return { id: 'attempt', attemptEpoch: 2, compositeAssessmentId: parent.id, status: 'COMPLETED', deliveryCourseId: 'course',
    accessTokenId: roundId ? 'token' : null,
    asyncReportEpoch: null, compositeAssessment: parent,
    trainingFeedbackSnapshot: snapshot, trainingFeedbackSnapshotHash: canonicalHash(snapshot) }
}
const evaluate = (attempt: TrainingFeedbackAttempt, extra: { now?: Date; reportReady?: boolean } = {}) => evaluateTrainingFeedbackForAttempt(attempt, { now, ...extra })
describe('Training feedback immutable binding and loaded-attempt evaluator', () => {
  it('keeps historical absence on old whole-completed semantics even with no readiness metadata', () => {
    expect(evaluate({ status: 'COMPLETED' })).toEqual({ configured: false, allowed: true, state: 'AVAILABLE', releaseAt: null })
    for (const status of ['IN_PROGRESS', 'ABANDONED', undefined]) expect(evaluate({ status }).allowed).toBe(false)
    expect(prepareTrainingFeedbackBinding({ composite: { trainingFeedbackPolicy: null }, courseId: 'none', accessTokenId: null })).toBeNull()
  })
  it('binds exact attempt, epoch, publication, course, canonical policy and optional C21 round', () => {
    for (const roundId of [null, 'round']) {
      const attempt = fixture(scheduled, roundId)
      const snapshot = readTrainingFeedbackSnapshot(attempt)!
      expect(snapshot).toMatchObject({ attemptId: 'attempt', attemptEpoch: 2, compositeId: 'publication', courseId: 'course', roundId })
      expect(snapshot.publicationIdentity).toEqual(trainingRoundPublicationIdentity(attempt.compositeAssessment, 'course'))
      expect(snapshot.publicationIdentity).not.toHaveProperty('trainingFeedbackPolicyHash')
      expect(snapshot.policyHash).toBe(canonicalHash(scheduled))
      expect(snapshot.publicationHash).toBe(canonicalHash(snapshot.publicationIdentity))
    }
  })
  it('keeps completion, generation and scheduled release as independent prerequisites', () => {
    const attempt = fixture()
    expect(evaluate({ ...attempt, status: 'IN_PROGRESS' }, { reportReady: true }).state).toBe('WAITING_SUBMISSION')
    expect(evaluate(attempt, { reportReady: false }).state).toBe('REPORT_PROCESSING')
    expect(evaluate(attempt)).toMatchObject({ allowed: false, state: 'GENERATED_NOT_RELEASED', releaseAt: scheduled.releaseAt })
    const boundary = new Date(scheduled.releaseAt)
    expect(evaluate(attempt, { now: boundary })).toMatchObject({ allowed: true, state: 'AVAILABLE' })
    expect(evaluate(attempt, { now: boundary, reportReady: false }).state).toBe('REPORT_PROCESSING')
    expect(evaluate(attempt, { now: new Date(boundary.getTime() - 1) }).allowed).toBe(false)
    expect(evaluate(attempt, { now: new Date(boundary.getTime() + 1) }).allowed).toBe(true)
  })
  it('requires trusted current async generation readiness, including missing/stale metadata', () => {
    const attempt = fixture(immediate)
    expect(evaluate(attempt).allowed).toBe(true)
    for (const asyncReportEpoch of [2, 1, undefined]) {
      expect(evaluate({ ...attempt, asyncReportEpoch }).state).toBe('REPORT_PROCESSING')
      expect(evaluate({ ...attempt, asyncReportEpoch }, { reportReady: true }).allowed).toBe(true)
    }
  })
  it.each([
    { id: 'other' }, { attemptEpoch: 3 }, { compositeAssessmentId: 'other' }, { deliveryCourseId: 'other' },
    { trainingFeedbackSnapshot: null }, { trainingFeedbackSnapshotHash: null }, { trainingFeedbackSnapshotHash: '0'.repeat(64) },
    { trainingFeedbackSnapshot: {} }, { trainingFeedbackSnapshot: { schemaVersion: 2 } }, { compositeAssessment: null },
  ])('fails closed for missing/corrupt configured attempt fields %j', change => {
    expect(evaluate({ ...fixture(immediate), ...change })).toEqual({ configured: true, allowed: false, state: 'UNAVAILABLE', releaseAt: null })
  })
  it.each([
    { id: 'other' }, { publishedAt: new Date('2026-10-19') }, { productKind: 'LEGACY_COMPOSITE' }, { questionnaireType: 'GENERAL' },
    { trainingFeedbackPolicy: null }, { trainingFeedbackPolicy: {} }, { trainingFeedbackPolicyHash: null },
    { trainingFeedbackPolicyHash: '0'.repeat(64) }, { trainingFlowDigest: 'changed' }, { trainingVariantDigest: 'changed' },
  ])('fails closed for publication mutation %j', change => {
    const attempt = fixture(immediate)
    expect(evaluate({ ...attempt, compositeAssessment: { ...attempt.compositeAssessment, ...change } }).state).toBe('UNAVAILABLE')
  })
  it('binds frozen access-token identity without an extra mutable relation read', () => {
    const attempt = fixture(immediate, 'round')
    for (const accessTokenId of [undefined, null, 'other-token'])
      expect(evaluate({ ...attempt, accessTokenId }).state).toBe('UNAVAILABLE')
    expect(evaluate(attempt).allowed).toBe(true)
    expect(evaluate({ ...fixture(immediate), accessTokenId: 'anonymous-token' }).state).toBe('UNAVAILABLE')
    const parent = publication(immediate), identity = trainingRoundPublicationIdentity(parent, 'course')
    expect(() => prepareTrainingFeedbackBinding({ composite: parent, courseId: 'course', accessTokenId: null,
      round: { id: 'round', compositeId: parent.id, courseId: 'course', publicationIdentity: identity, publicationHash: canonicalHash(identity) } })).toThrow()
  })
  it('rejects unknown snapshot fields even when their hash is recomputed', () => {
    const attempt = fixture(immediate)
    const snapshot = { ...attempt.trainingFeedbackSnapshot as object, bypass: true }
    expect(evaluate({ ...attempt, trainingFeedbackSnapshot: snapshot, trainingFeedbackSnapshotHash: canonicalHash(snapshot) }).state).toBe('UNAVAILABLE')
  })
  it('does not couple release to archive, recruitment closure, disabled token or checkpoint expiry', () => {
    const attempt = fixture(immediate, 'round')
    const parent = { ...attempt.compositeAssessment, status: 'ARCHIVED', publicEnabled: false, expiresAt: new Date('2000-01-01') }
    expect(evaluate({ ...attempt, compositeAssessment: parent }).allowed).toBe(true)
  })
  it('exposes a bounded joined-parent select with no response/content payloads', () => {
    expect(trainingFeedbackAttemptSelect).toMatchObject({ accessTokenId: true, asyncReportEpoch: true })
    expect(trainingFeedbackAttemptSelect).not.toHaveProperty('accessToken')
    expect(JSON.stringify(trainingFeedbackAttemptSelect)).not.toMatch(/Encrypted|answers|items|checkpoints/)
  })
  it('fails closed on an invalid authoritative clock for configured policies', () => {
    expect(evaluate(fixture(immediate), { now: new Date(NaN) }).state).toBe('UNAVAILABLE')
  })
  it.each([
    { trainingFeedbackPolicy: {} }, { trainingFeedbackPolicyHash: null }, { status: 'DRAFT' }, { publishedAt: null },
    { productKind: 'LEGACY_COMPOSITE' }, { questionnaireType: 'GENERAL' }, { deliveryMode: 'LEGACY' },
    { reportPackageKey: 'package' }, { analysisProtocolKey: 'analysis' }, { questionnaireCourses: [] },
  ])('rejects invalid admission publication %j', change => {
    expect(() => prepareTrainingFeedbackBinding({ composite: { ...publication(), ...change }, courseId: 'course', accessTokenId: null })).toThrow()
  })
  it('rejects a round from another immutable publication without changing old C21 identities', () => {
    const composite = publication()
    const identity = trainingRoundPublicationIdentity(composite, 'course')
    const round = { id: 'round', compositeId: composite.id, courseId: 'course', publicationIdentity: identity, publicationHash: canonicalHash(identity) }
    for (const change of [{ compositeId: 'other' }, { courseId: 'other' }, { publicationHash: '0'.repeat(64) }, { publicationIdentity: {} }])
      expect(() => prepareTrainingFeedbackBinding({ composite, courseId: 'course', accessTokenId: 'token', round: { ...round, ...change } })).toThrow()
  })
})
