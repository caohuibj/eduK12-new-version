import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  attemptFindUnique: vi.fn(),
  attemptFindMany: vi.fn(),
  snapshotFindMany: vi.fn(),
  formAnswerFindMany: vi.fn(),
  bundleFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  courseStudentFindFirst: vi.fn(),
  reportJobFindUnique: vi.fn(),
  compositeFindUnique: vi.fn(),
  scope: vi.fn(),
  source: vi.fn(),
  getContentRelease: vi.fn(),
  loadStoredCanonicalUnitResults: vi.fn(),
  loadTrainingMetricDisclosure: vi.fn(),
  prepareWait: vi.fn(),
  beginWait: vi.fn(),
  waitSequence: vi.fn(),
}))

vi.mock('../../config/database', () => ({
  prisma: {
    $transaction: m.transaction,
    $queryRaw: m.queryRaw,
    $executeRaw: m.executeRaw,
    compositeAssessmentAttempt: { findUnique: m.attemptFindUnique, findMany: m.attemptFindMany },
    compositeAssessment: { findUnique: m.compositeFindUnique },
    assessmentUnitSnapshot: { findMany: m.snapshotFindMany },
    compositeFormAnswer: { findMany: m.formAnswerFindMany },
    bundleInstance: { findMany: m.bundleFindMany },
    user: { findUnique: m.userFindUnique },
    courseStudent: { findFirst: m.courseStudentFindFirst },
    compositeReportJob: { findUnique: m.reportJobFindUnique },
  },
}))
vi.mock('../../modules/organization/educationProductAccess', () => ({ resolveEducationProductMemberScope: m.scope }))
vi.mock('../../modules/assessment-run/registeredResources', () => ({ resolveHistoricalRelationalEntry: m.source }))
vi.mock('../../modules/measurement-content/repository', () => ({ getContentRelease: m.getContentRelease }))
vi.mock('../../modules/assessment-runtime/compact-assessment-storage', () => ({ loadStoredCanonicalUnitResults: m.loadStoredCanonicalUnitResults }))
vi.mock('../../modules/composite/training-metric-disclosure', () => ({ loadTrainingMetricDisclosure: m.loadTrainingMetricDisclosure }))
vi.mock('../../modules/composite/training-content-final', () => ({
  decodeTrainingFinalReceipt: (parent: any) => parent._receipt ?? null,
}))
vi.mock('../../services/reportReadyNotifications', () => ({
  prepareReportReadyNotifications: m.prepareWait,
  beginReportReadyWait: m.beginWait,
  reportReadyWaitAvailable: () => true,
  reportReadyNotificationSequence: m.waitSequence,
  REPORT_READY_MAX_WAIT_MS: 4000,
}))

import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { compositeItemSlotKey } from '../../modules/assessment-runtime/slot-set'
import { readTrainingPersonalChanges, readTrainingPersonalChangesAvailability } from '../../modules/composite/personal-tracking.service'
import { readTrainingPersonalLeafs } from '../../modules/composite/personal-tracking-results'
import { readTeacherPersonalChanges } from '../../modules/reporting/teacher-personal-changes.service'
import { projectPersonalChanges } from '../../modules/reporting/personal-tracking'
import { getReport } from '../../modules/composite/composite.service'
import { testDisclosure } from '../assessment-policy/result-disclosure.fixture'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('DATA_ENCRYPTION_KEY', '55'.repeat(32))
  vi.stubEnv('DATA_PSEUDONYM_KEY', '66'.repeat(32))
  vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true')
  vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED', 'false')
  m.transaction.mockImplementation(async (work: any) => work({
    $queryRaw: m.queryRaw,
    $executeRaw: m.executeRaw,
    compositeAssessmentAttempt: { findUnique: m.attemptFindUnique, findMany: m.attemptFindMany },
    assessmentUnitSnapshot: { findMany: m.snapshotFindMany },
    compositeFormAnswer: { findMany: m.formAnswerFindMany },
    bundleInstance: { findMany: m.bundleFindMany },
    user: { findUnique: m.userFindUnique },
    courseStudent: { findFirst: m.courseStudentFindFirst },
  }))
})
afterEach(() => { vi.unstubAllEnvs() })

describe('P2 regression: receiptOnly enforced across personal-changes availability, entry, and historical leaves', () => {
  it('hides Training personal changes CTA and rejects changes API on a receiptOnly attempt before any cache hit', async () => {
    const attempt = {
      id: 'att-1',
      userId: 'student-1',
      status: 'COMPLETED',
      completedAt: new Date(),
      assignmentRef: null,
      subjectUserId: null,
      respondentUserId: null,
      receiptOnly: true,
      deliveryCourseId: 'course-1',
      compositeAssessment: {
        id: 'comp-1',
        personalTrackingBaselineId: 'base-1',
        createdBy: 'trainer-1',
        status: 'PUBLISHED',
        productKind: 'QUESTIONNAIRE',
        courseId: null,
      },
    }
    m.attemptFindUnique.mockResolvedValue(attempt)

    await expect(readTrainingPersonalChangesAvailability('att-1', 'student-1')).resolves.toEqual({ configured: false })
    await expect(readTrainingPersonalChanges('att-1', { userId: 'student-1' })).rejects.toMatchObject({
      statusCode: 403,
      message: '本次问卷仅提供交卷回执',
    })
    expect(m.queryRaw).not.toHaveBeenCalled()
  })

  it('sets visible=false on receiptOnly historical waves in readTrainingPersonalLeafs so later report waves never disclose them', async () => {
    const metricId = randomUUID()
    const baselineId = randomUUID()
    const releaseId = randomUUID()
    const contentHash = 'a'.repeat(64)
    const measurementHash = 'b'.repeat(64)
    const resultHash = 'c'.repeat(64)
    const unit = {
      itemId: 'item-1',
      family: 'SCALE' as const,
      source: { kind: 'SCALE' as const, id: 'scale-1', ownerId: 'owner-1' },
      measurement: { releaseId, contentHash, measurementHash },
    }
    const makeParent = (id: string, ordinal: number, receiptOnly: boolean) => {
      const compositeId = ordinal === 1 ? baselineId : 'wave-2'
      const binding = { schemaVersion: 1 as const, attemptId: id, epoch: 1, compositeId, publicationHash: 'e'.repeat(64), units: [unit] }
      const aggregateInputHash = 'd'.repeat(64)
      const receipt = {
        schemaVersion: 1 as const,
        attemptId: id,
        epoch: 1,
        aggregateInputHash,
        sources: [{ itemId: 'item-1', resultHash }],
      }
      return {
        id,
        compositeAssessmentId: compositeId,
        attemptEpoch: 1,
        completedAt: new Date(Date.UTC(2026, 10, ordinal)),
        aggregateInputHash,
        receiptOnly,
        trainingContentBinding: binding,
        trainingContentBindingHash: canonicalHash(binding),
        _receipt: receipt,
        compositeAssessment: {
          id: compositeId,
          productKind: 'QUESTIONNAIRE',
          personalTrackingOrdinal: ordinal,
          personalTracking: {
            schemaVersion: 1,
            bindings: [{ metricId, itemId: 'item-1', scoreKey: 'total', visible: true }],
          },
        },
      }
    }
    const p1 = makeParent('att-ro', 1, true)
    const p2 = makeParent('att-wr', 2, false)

    const slotKey = compositeItemSlotKey('item-1', 'SCALE')
    m.snapshotFindMany.mockResolvedValue([
      {
        compositeAttemptId: p1.id, attemptEpoch: 1, slotKey, unitType: 'SCALE',
        terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT', canonicalResultEncrypted: 'enc-1',
        sourceType: 'SCALE', sourceAttemptId: 's-1', sourceSubmissionId: null,
      },
      {
        compositeAttemptId: p2.id, attemptEpoch: 1, slotKey, unitType: 'SCALE',
        terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT', canonicalResultEncrypted: 'enc-2',
        sourceType: 'SCALE', sourceAttemptId: 's-2', sourceSubmissionId: null,
      },
    ])
    m.loadStoredCanonicalUnitResults.mockResolvedValue([
      {
        resultHash,
        persistenceProvenance: { sourceType: 'SCALE', sourceAttemptId: 's-1', sourceSubmissionId: null },
        core: {
          unitType: 'SCALE',
          quality: { status: 'interpretable' },
          scientificProvenance: { profileKey: null },
          metrics: [{ key: 'total', value: 42, quality: 'OK' }],
        },
      },
      {
        resultHash,
        persistenceProvenance: { sourceType: 'SCALE', sourceAttemptId: 's-2', sourceSubmissionId: null },
        core: {
          unitType: 'SCALE',
          quality: { status: 'interpretable' },
          scientificProvenance: { profileKey: null },
          metrics: [{ key: 'total', value: 55, quality: 'OK' }],
        },
      },
    ])
    m.getContentRelease.mockResolvedValue({
      layer: 'MEASUREMENT',
      status: 'PUBLISHED',
      contentHash,
      content: { measurementHash, metrics: [{ metricKey: 'total', unit: 'score' }] },
    })
    m.loadTrainingMetricDisclosure.mockResolvedValue({ metricKeys: new Set(['total']) })
    m.bundleFindMany.mockResolvedValue([])

    const expectedIdentity = canonicalHash({ family: 'SCALE', releaseId, contentHash, measurementHash, profile: null })
    const plan = {
      schemaVersion: 1 as const,
      id: randomUUID(),
      baselineWaveId: baselineId,
      metrics: [{ id: metricId, sourceKey: 'item-1', scoreKey: 'total', label: 'Total', unit: 'score', kind: 'SCALE' as const, measurementHash: expectedIdentity }],
    }

    const leaves = await readTrainingPersonalLeafs({
      assessmentUnitSnapshot: { findMany: m.snapshotFindMany },
      compositeFormAnswer: { findMany: m.formAnswerFindMany },
      bundleInstance: { findMany: m.bundleFindMany },
    } as never, { scopedSubjectId: 'student-1', plan, parents: [p1, p2] })

    expect(leaves[0].metrics[metricId].visible).toBe(false)
    expect(leaves[1].metrics[metricId].visible).toBe(true)

    const projected = projectPersonalChanges(plan, [{ id: baselineId, ordinal: 1 }, { id: 'wave-2', ordinal: 2 }], leaves)
    expect(projected.status).toBe('WAITING')
    expect(projected.metrics).toEqual([])
  })

  it('rejects School/Teacher personal changes API on a receiptOnly anchor execution before cache lookup', async () => {
    const metricId = randomUUID()
    const baseline = randomUUID()
    const organizationId = randomUUID()
    const actor = randomUUID()
    const disclosure = testDisclosure()
    disclosure.audiences.RESPONDENT = { mode: 'INDIVIDUAL_SUMMARY', metricKeys: ['latency'], longitudinalMetricKeys: ['latency'] }
    const policy = { resultDisclosure: disclosure, runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'runtime' } }
    const policyHash = canonicalHash(policy)
    const plan = {
      schemaVersion: 1,
      id: randomUUID(),
      baselineWaveId: baseline,
      metrics: [{ id: metricId, sourceKey: 'leaf', scoreKey: 'latency', label: 'Latency', unit: 'ms', kind: 'COGNITIVE', measurementHash: 'a'.repeat(64) }],
    }
    const waves = [1, 2].map(ordinal => ({
      id: randomUUID(), organizationId, runId: ordinal === 1 ? baseline : randomUUID(), trackId: randomUUID(),
      ordinal, baselineId: baseline, assignmentId: randomUUID(), policy, policyHash, family: 'COGNITIVE',
      key: 'education-assessment:synthetic', version: '1.0.0', episodeId: randomUUID(), tracking: {} as any,
    }))
    for (const wave of waves) {
      wave.tracking = { schemaVersion: 1, entry: 'TEACHER', bindings: [{ metricId, trackId: wave.trackId, itemId: 'leaf', scoreKey: 'latency', visible: true }] }
    }
    const parents = waves.map((w, idx) => ({
      id: randomUUID(), compositeAssessmentId: 'runtime', assignmentRef: w.assignmentId, episodeId: w.episodeId,
      receiptOnly: idx === 1, compositeAssessment: { trainingContentSnapshot: {} },
    }))
    m.scope.mockResolvedValue({ membershipId: 'own' })
    m.source.mockResolvedValue({ releaseStatus: 'PUBLISHED', resultDisclosure: disclosure })
    m.attemptFindMany.mockResolvedValue(parents)
    m.queryRaw.mockImplementation(async (query: any) => {
      const sql = (Array.isArray(query) ? query : query.strings).join(' ')
      if (sql.includes('SELECT personal_tracking AS tracking')) return [{ tracking: { ...waves[0].tracking, plan } }]
      if (sql.includes('personal_tracking_ordinal AS ordinal FROM assessment_runs')) return waves.map(w => ({ id: w.runId, ordinal: w.ordinal }))
      if (sql.includes('FROM assessment_run_executions e JOIN')) return sql.includes('jsonb_array_elements') ? waves : [waves[1]]
      if (sql.includes('DISTINCT ON')) return parents.map(p => ({ id: p.id }))
      if (sql.includes('personal_changes_snapshots->>')) throw new Error('must not query snapshot cache for receiptOnly anchor')
      return []
    })

    await expect(readTeacherPersonalChanges({ actorUserId: actor, executionId: waves[1].id })).rejects.toMatchObject({
      statusCode: 404,
      message: '本人变化报告不可访问',
    })
  })
})

describe('P2 regression: getReport captures READY notification sequence before initial DB read', () => {
  it('passes the pre-DB-read notification sequence into beginReportReadyWait so concurrent READY wakes immediately', async () => {
    let seq = 10
    m.prepareWait.mockResolvedValue(true)
    m.waitSequence.mockImplementation(() => seq)

    const parent = {
      id: 'att-ready',
      userId: 'student-1',
      status: 'COMPLETED',
      receiptOnly: false,
      attemptEpoch: 1,
      asyncReportEpoch: 1,
      completedAt: new Date(),
      aggregateInputHash: 'a'.repeat(64),
      frozenActiveSlotSetHash: 'b'.repeat(64),
      contextSnapshotHash: 'c'.repeat(64),
      compositeAssessment: { id: 'comp-1', name: 'T', status: 'PUBLISHED', createdBy: 'teacher-1', productKind: 'QUESTIONNAIRE' },
    }
    let dbReads = 0
    m.attemptFindUnique.mockImplementation(async () => {
      dbReads++
      // Simulate Worker completing and publishing READY notification during the FIRST DB read!
      if (dbReads === 1) seq = 11
      return parent
    })
    m.reportJobFindUnique
      .mockResolvedValueOnce({ id: 'job-1', status: 'PROCESSING', reportEncrypted: null, completedAt: null, errorCode: null })
      .mockResolvedValueOnce({ id: 'job-1', status: 'READY', reportEncrypted: null, completedAt: new Date(), errorCode: null })
    m.beginWait.mockReturnValue({ done: Promise.resolve('ready'), cancel: vi.fn() })

    await getReport('att-ready', { userId: 'student-1' }).catch(() => undefined)

    // Crucial invariant: beginReportReadyWait received pre-read sequence 10, NOT post-read 11!
    expect(m.prepareWait).toHaveBeenCalledTimes(1)
    expect(m.prepareWait.mock.invocationCallOrder[0]).toBeLessThan(m.attemptFindUnique.mock.invocationCallOrder[0])
    expect(m.beginWait).toHaveBeenCalledWith('att-ready', 1, 2000, undefined, 10)
  })
})
