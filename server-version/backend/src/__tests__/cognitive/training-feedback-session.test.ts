import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { db } = vi.hoisted(() => ({ db: {
  cognitiveSession: { findUnique: vi.fn() }, compositeAssessmentAttempt: { findUnique: vi.fn() },
  compositeReportJob: { findUnique: vi.fn() }, $queryRaw: vi.fn(),
} }))
vi.mock('../../config/database', () => ({ prisma: db }))
import { getSession, getPublicSession } from '../../modules/cognitive/session.service'
import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { feedbackAttempt, readyFeedbackJob } from '../fixtures/training-feedback'

let parent: any, session: any
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64)); vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
  vi.stubEnv('COGNITIVE_MODULE_ENABLED', 'true')
  parent = feedbackAttempt()
  session = { id: 'session-1', userId: 'student-1', compositeAttemptId: parent.id, compositeAttempt: parent,
    assignmentId: null, testType: 'fake', engineVersion: '1.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0',
    attemptNo: 1, status: 'COMPLETED', finishedAt: new Date(), randomSeed: 'seed',
    configSnapshotEncrypted: encryptCognitivePayload({ trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 }),
    // Invalid result ciphertext proves a delayed read never even decrypts feedback.
    scoreEncrypted: 'PRIVATE_INVALID_CIPHERTEXT', metricsEncrypted: 'PRIVATE_INVALID_CIPHERTEXT', qualityFlagsEncrypted: 'PRIVATE_INVALID_CIPHERTEXT' }
  db.cognitiveSession.findUnique.mockImplementation(async () => session)
  db.compositeAssessmentAttempt.findUnique.mockImplementation(async () => parent)
  db.compositeReportJob.findUnique.mockImplementation(async () => readyFeedbackJob(parent))
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
describe('Cognitive native Training feedback reads', () => {
  const read = (publicRead: boolean) => publicRead ? getPublicSession('recovery', session.id) : getSession('student-1', session.id)
  const publicSession = () => { session.userId = null; parent.userId = null; parent.recoveryTokenHash = 'recovery' }
  it.each([false, true])('preserves completion and hides result before scheduled release (public=%s)', async publicRead => {
    if (publicRead) publicSession()
    const result = await read(publicRead)
    expect(result).toMatchObject({ sessionId: 'session-1', status: 'COMPLETED', feedbackDeferred: true, finishedAt: session.finishedAt })
    expect(result).not.toHaveProperty('result'); expect(JSON.stringify(result)).not.toContain('PRIVATE_')
    expect(db.cognitiveSession.findUnique).toHaveBeenCalledTimes(1)
    expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled()
    const query = db.cognitiveSession.findUnique.mock.calls[0][0]
    expect(query.include.compositeAttempt.select).toMatchObject({ trainingFeedbackSnapshot: true, trainingFeedbackSnapshotHash: true,
      compositeAssessment: { select: { trainingFeedbackPolicy: true, trainingFeedbackPolicyHash: true } } })
  })
  it.each([false, true])('keeps malformed configured history closed (public=%s)', async publicRead => {
    if (publicRead) publicSession()
    parent.trainingFeedbackSnapshotHash = 'invalid'
    expect(await read(publicRead)).toHaveProperty('feedbackDeferred', true)
  })
  it.each([false, true])('releases existing frozen result exactly at the preset boundary (public=%s)', async publicRead => {
    if (publicRead) publicSession()
    session.scoreEncrypted = encryptCognitivePayload(42)
    session.metricsEncrypted = encryptCognitivePayload({ accuracy: 0.8, meanRt: 300 })
    session.qualityFlagsEncrypted = encryptCognitivePayload({})
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z'))
    const result = await read(publicRead)
    expect(result).not.toHaveProperty('feedbackDeferred')
    expect(result).toMatchObject({ result: { score: 42, metrics: { accuracy: 0.8, meanRt: 300 } } })
  })
  it('keeps a completed unit hidden until the current parent async report is READY', async () => {
    parent = feedbackAttempt({ asyncReportEpoch: 1 }, { schemaVersion: 1, mode: 'IMMEDIATE' }); session.compositeAttempt = parent
    db.compositeReportJob.findUnique.mockResolvedValue({ ...readyFeedbackJob(parent), status: 'PROCESSING' })
    expect(await getSession('student-1', session.id)).toHaveProperty('feedbackDeferred', true)
    expect(db.compositeReportJob.findUnique).toHaveBeenCalledTimes(1)
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })
  it('rejects incorrect authenticated or recovery owners before any release lookup', async () => {
    await expect(getSession('other', session.id)).rejects.toMatchObject({ statusCode: 403 })
    publicSession()
    await expect(getPublicSession('wrong', session.id)).rejects.toMatchObject({ statusCode: 403 })
    expect(db.compositeReportJob.findUnique).not.toHaveBeenCalled()
  })
})
