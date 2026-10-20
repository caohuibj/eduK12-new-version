import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { db } = vi.hoisted(() => ({ db: { situationalAttempt: { findUnique: vi.fn() },
  compositeAssessmentAttempt: { findUnique: vi.fn() }, compositeReportJob: { findUnique: vi.fn() }, $queryRaw: vi.fn() } }))
vi.mock('../../config/database', () => ({ prisma: db }))
import { resumeSituationalAttempt, getSituationalAttemptResult, SITUATIONAL_ATTEMPT_COMMIT_SELECT } from '../../modules/situational/situational-runtime.service'
import { feedbackAttempt } from '../fixtures/training-feedback'
import { freezeSituationalRuntimeAtAttemptStart, encryptFrozenSituationalRuntimeSnapshot } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE as pkg } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { getParticipantKey } from '../../modules/assessment-runtime/participant-key'
import { scoreSituational } from '../../modules/situational/situation-scoring'
import { projectSituationCanonicalUnitResult, createCanonicalUnitResultEnvelope } from '../../modules/assessment-runtime/unit-result'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
let parent: any, row: any, snapshot: any
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64)); vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
  parent = feedbackAttempt()
  snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: pkg.key, instrumentVersion: pkg.instrumentVersion,
    definition: pkg.definition, frozenAt: new Date('2026-10-01T00:00:00Z') })
  row = { id: 'sjt-1', userId: 'student-1', participantKey: getParticipantKey('student-1'), compositeAttemptId: parent.id, compositeAttempt: parent,
    status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
    instrumentKey: snapshot.instrumentKey, instrumentVersion: snapshot.instrumentVersion, definitionHash: snapshot.definitionHash,
    compiledRuntimeHash: snapshot.compiledRuntimeHash, scorerKey: snapshot.scorerKey, scoringVersion: snapshot.scoringVersion,
    frozenAt: new Date(snapshot.frozenAt), runtimeSnapshotEncrypted: encryptFrozenSituationalRuntimeSnapshot(snapshot),
    submissionId: 'receipt-1', submissionPayloadHash: 'receipt-hash', resultEncrypted: 'PRIVATE_INVALID_CIPHERTEXT', canonicalResultEncrypted: 'PRIVATE_INVALID_CIPHERTEXT' }
  db.situationalAttempt.findUnique.mockImplementation(async () => row)
  db.compositeAssessmentAttempt.findUnique.mockImplementation(async () => parent)
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
describe('native SJT Training feedback reads', () => {
  it.each([resumeSituationalAttempt, getSituationalAttemptResult])('withholds results but preserves terminal receipt with one existing parent projection', async read => {
    const result = await read(row.id, 'student-1')
    expect(result).toMatchObject({ feedbackDeferred: true, attempt: { status: 'COMPLETED', submissionId: 'receipt-1', submissionPayloadHash: 'receipt-hash' } })
    expect(result).not.toHaveProperty('result'); expect(result).not.toHaveProperty('canonicalResult')
    expect(db.$queryRaw).not.toHaveBeenCalled(); expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
    expect(db.situationalAttempt.findUnique.mock.calls[0][0].select.compositeAttempt.select).toMatchObject({ trainingFeedbackSnapshot: true, trainingFeedbackSnapshotHash: true })
    expect(SITUATIONAL_ATTEMPT_COMMIT_SELECT.compositeAttempt.select).not.toHaveProperty('trainingFeedbackSnapshot')
  })
  it('releases the existing frozen scored result at the exact boundary', async () => {
    const result = scoreSituational(pkg.definition, pkg.goldenCases[0].responses)
    const canonical = createCanonicalUnitResultEnvelope({ core: projectSituationCanonicalUnitResult({ result, runtime: snapshot.compiledRuntime, contextHash: null }),
      completedAt: new Date(), persistenceProvenance: { sourceType: 'SITUATIONAL_ATTEMPT', sourceAttemptId: row.id, sourceSubmissionId: row.submissionId } })
    row.resultEncrypted = encryptUnifiedRuntimePayload(result); row.canonicalResultEncrypted = encryptUnifiedRuntimePayload(canonical)
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z'))
    const exposed = await getSituationalAttemptResult(row.id, 'student-1')
    expect(exposed).not.toHaveProperty('feedbackDeferred'); expect(exposed.result).toEqual(result); expect(exposed.canonicalResult).toEqual(canonical)
    expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled()
  })
  it('fails closed for malformed binding and preserves owner checks', async () => {
    parent.trainingFeedbackSnapshotHash = 'malformed'
    expect(await resumeSituationalAttempt(row.id, 'student-1')).toHaveProperty('feedbackDeferred', true)
    await expect(resumeSituationalAttempt(row.id, 'other')).rejects.toMatchObject({ statusCode: 403 })
  })
})
