import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { db, scopes } = vi.hoisted(() => ({ db: { cognitiveSession: { findMany: vi.fn() }, compositeReportJob: { findMany: vi.fn() } },
  scopes: { load: vi.fn(), resolve: vi.fn(), provenance: vi.fn() } }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/composite/situational-canonical-export', () => ({ loadSituationalExportSlotSets: scopes.load }))
vi.mock('../../modules/composite/training-variant-scope', () => ({ resolveTrainingAttemptScope: scopes.resolve }))
vi.mock('../../modules/composite/training-variant-export', () => ({ trainingVariantProvenance: scopes.provenance }))
import { listMyHistory } from '../../modules/cognitive/history.service'
import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { feedbackAttempt, readyFeedbackJob } from '../fixtures/training-feedback'
const page = { page: 1, pageSize: 20, skip: 0, take: 20 }
const session = (parent: any, id = 'session-1', v2 = false) => ({ id, assignmentId: 'assignment-1', compositeItemId: 'item-1',
  testType: 'reaction', attemptNo: 1, configVersion: '1.0.0', engineVersion: '1.0.0', scoringVersion: '1.0.0',
  finishedAt: new Date('2026-10-19T00:00:00Z'), assignment: { title: 'Reaction' }, compositeAttempt: parent,
  scoreEncrypted: encryptCognitivePayload(88), qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: false }),
  resultSnapshotEncrypted: v2 ? encryptCognitivePayload({ schemaVersion: 1, completedAt: '2026-10-19T00:00:00.000Z', testType: 'reaction',
    configVersion: '1.0.0', engineVersion: '1.0.0', scoringVersion: '1.0.0', protocolSignature: 'a'.repeat(64), profile: 'standard',
    metrics: { meanRtMs: 350 }, quality: { state: 'limited', flags: {}, reasons: [] }, references: [], report: {}, assessmentContext: null }) : null })
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64)); vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
  scopes.load.mockResolvedValue(new Map()); scopes.provenance.mockReturnValue({ schemaVersion: 1 })
  db.compositeReportJob.findMany.mockResolvedValue([])
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
describe('Training cognitive history release', () => {
  it.each([false, true])('retains completion while withholding legacy score/v2 quality before the date (v2=%s)', async v2 => {
    const parent = feedbackAttempt(), row = session(parent, 'session-1', v2)
    row.scoreEncrypted = 'INVALID_PRIVATE_RESULT'; row.qualityFlagsEncrypted = 'INVALID_PRIVATE_RESULT'
    if (v2) row.resultSnapshotEncrypted = 'INVALID_PRIVATE_RESULT'
    db.cognitiveSession.findMany.mockResolvedValue([row])
    const result = await listMyHistory('student-1', page)
    expect(result).toMatchObject({ total: 1, list: [{ sessionId: row.id, finishedAt: row.finishedAt, score: null, qualityState: null,
      feedbackDeferred: true, reportHref: '/student/composite/attempts/attempt-1/report' }] })
    expect(JSON.stringify(result)).not.toContain('INVALID_PRIVATE_RESULT')
    expect(db.cognitiveSession.findMany).toHaveBeenCalledTimes(1); expect(db.compositeReportJob.findMany).not.toHaveBeenCalled()
  })
  it.each([false, true])('exposes existing frozen summary exactly at release time (v2=%s)', async v2 => {
    db.cognitiveSession.findMany.mockResolvedValue([session(feedbackAttempt(), 'session-1', v2)])
    vi.useFakeTimers(); vi.setSystemTime(new Date('2098-12-31T23:59:59.999Z'))
    expect((await listMyHistory('student-1', page)).list[0]).toHaveProperty('feedbackDeferred', true)
    vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z'))
    const item = (await listMyHistory('student-1', page)).list[0]
    expect(item).toMatchObject({ score: v2 ? null : 88, qualityState: 'limited' }); expect(item).not.toHaveProperty('feedbackDeferred')
    expect(db.compositeReportJob.findMany).not.toHaveBeenCalled()
  })
  it.each(['PENDING', 'PROCESSING', 'FAILED', 'READY'] as const)('requires the current bound async job, state=%s', async status => {
    const parent = feedbackAttempt({ asyncReportEpoch: 1 }, { schemaVersion: 1, mode: 'IMMEDIATE' })
    db.cognitiveSession.findMany.mockResolvedValue([session(parent)])
    db.compositeReportJob.findMany.mockResolvedValue([{ ...readyFeedbackJob(parent), attemptId: parent.id, status }])
    const item = (await listMyHistory('student-1', page)).list[0]
    if (status === 'READY') { expect(item).toMatchObject({ score: 88, qualityState: 'limited' }); expect(item).not.toHaveProperty('feedbackDeferred') }
    else expect(item).toMatchObject({ score: null, qualityState: null, feedbackDeferred: true })
    expect(db.compositeReportJob.findMany).toHaveBeenCalledTimes(1)
  })
  it.each([{ attemptEpoch: 0 }, { slotSetHash: 'stale' }, { contextHash: 'stale' }, { aggregateInputHash: 'stale' }])('rejects stale READY identity %#', async changed => {
    const parent = feedbackAttempt({ asyncReportEpoch: 1 }, { schemaVersion: 1, mode: 'IMMEDIATE' })
    db.cognitiveSession.findMany.mockResolvedValue([session(parent)])
    db.compositeReportJob.findMany.mockResolvedValue([{ ...readyFeedbackJob(parent), attemptId: parent.id, ...changed }])
    expect((await listMyHistory('student-1', page)).list[0]).toMatchObject({ score: null, qualityState: null, feedbackDeferred: true })
  })
  it('deduplicates current job headers across children and does not read jobs for future/invalid/stale parents', async () => {
    const parent = feedbackAttempt({ asyncReportEpoch: 1 }, { schemaVersion: 1, mode: 'IMMEDIATE' })
    const future = feedbackAttempt({ id: 'future', asyncReportEpoch: 1 })
    const invalid = feedbackAttempt({ id: 'invalid' }); invalid.trainingFeedbackSnapshotHash = 'bad'
    const stale = feedbackAttempt({ id: 'stale', asyncReportEpoch: 0 }, { schemaVersion: 1, mode: 'IMMEDIATE' })
    db.cognitiveSession.findMany.mockResolvedValue([...Array.from({ length: 12 }, (_, i) => session(parent, `child-${i}`)), session(future), session(invalid), session(stale)])
    db.compositeReportJob.findMany.mockResolvedValue([{ ...readyFeedbackJob(parent), attemptId: parent.id }])
    const result = await listMyHistory('student-1', page)
    expect(result.total).toBe(15); expect(result.list.filter(row => row.feedbackDeferred)).toHaveLength(3)
    expect(db.cognitiveSession.findMany).toHaveBeenCalledTimes(1)
    expect(db.compositeReportJob.findMany).toHaveBeenCalledExactlyOnceWith({ where: { OR: [{ attemptId: parent.id, attemptEpoch: 1 }] },
      select: { attemptId: true, attemptEpoch: true, status: true, slotSetHash: true, contextHash: true, aggregateInputHash: true } })
  })
  it('retains standalone and absent-policy legacy summaries with no job reads', async () => {
    const parent = feedbackAttempt(); parent.trainingFeedbackSnapshot = null; parent.trainingFeedbackSnapshotHash = null
    parent.compositeAssessment.trainingFeedbackPolicy = null; parent.compositeAssessment.trainingFeedbackPolicyHash = null
    db.cognitiveSession.findMany.mockResolvedValue([session(null, 'standalone'), session(parent, 'legacy')])
    const result = await listMyHistory('student-1', page)
    expect(result.list.map(row => row.score)).toEqual([88, 88]); expect(result.list.every(row => !row.feedbackDeferred)).toBe(true)
    expect(db.compositeReportJob.findMany).not.toHaveBeenCalled()
  })
  it('preserves user/parent ownership, relational exclusions and pagination of completed receipts', async () => {
    db.cognitiveSession.findMany.mockResolvedValue([session(feedbackAttempt(), 'first'), session(feedbackAttempt(), 'second')])
    const result = await listMyHistory('student-1', { page: 2, pageSize: 1, skip: 1, take: 1 })
    expect(result).toMatchObject({ total: 2, list: [{ sessionId: 'second', feedbackDeferred: true }] })
    const query = db.cognitiveSession.findMany.mock.calls[0][0]
    expect(query.where).toMatchObject({ userId: 'student-1', status: 'COMPLETED', AND: [{ OR: [{ compositeAttemptId: null },
      { compositeAttempt: { userId: 'student-1', status: 'COMPLETED', assignmentRef: null, compositeAssessment: { productKind: { in: ['QUESTIONNAIRE', 'LEGACY_COMPOSITE'] }, reportPackageKey: null, analysisProtocolKey: null } } }] }] })
    expect(query.select.compositeAttempt.select).toMatchObject({ trainingFeedbackSnapshot: true, trainingFeedbackSnapshotHash: true,
      compositeAssessment: { select: { trainingFeedbackPolicy: true, trainingFeedbackPolicyHash: true } } })
  })
  it('keeps frozen variant/flow scope filtering before even completion-only projection', async () => {
    const parent = feedbackAttempt(); parent.trainingVariantAllocationEncrypted = 'configured-variant'
    scopes.resolve.mockResolvedValue({ itemIds: new Set(['item-1']) })
    db.cognitiveSession.findMany.mockResolvedValue([session(parent, 'allowed'), { ...session(parent, 'wrong-item'), compositeItemId: 'item-2' }, { ...session(parent, 'wrong-epoch'), attemptNo: 2 }])
    const result = await listMyHistory('student-1', page)
    expect(result).toMatchObject({ total: 1, list: [{ sessionId: 'allowed', feedbackDeferred: true }] })
    expect(scopes.resolve).toHaveBeenCalledTimes(1); expect(scopes.load).toHaveBeenCalledTimes(1)
  })
})
