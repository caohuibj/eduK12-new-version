import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStartReadCachesForTests } from '../../modules/composite/start-read-cache'
import { createFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'

const slotSet = createFrozenActiveSlotSet({
  schemaVersion: 1,
  runtimeGeneration: 'UNIFIED_V1',
  attemptEpoch: 1,
  slots: [{
    slotKey: 'scale:item-1',
    unitType: 'SCALE',
    required: true,
    sourceDefinitionIdentity: {
      key: 'adexi_v1',
      version: '2.0.0',
      hash: 'a'.repeat(64),
    },
    sourceBinding: {
      scaleCode: 'adexi_v1',
      compositeItemId: 'item-1',
      compiledRuntimeHash: 'b'.repeat(64),
    },
  }],
})

const mocks = vi.hoisted(() => ({
  prisma: {
    compositeAssessment: { findUnique: vi.fn() },
    compositeAssessmentAccessToken: { findUnique: vi.fn() },
    compositeAssessmentAttempt: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
    },
    compositeFormSectionAttempt: { findMany: vi.fn() },
    assessmentUnitSnapshot: { findMany: vi.fn() },
    courseStudent: { findFirst: vi.fn() },
    assessment: { findMany: vi.fn(), findUnique: vi.fn() },
    scaleAssessment: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  loadFrozenActiveSlotSet: vi.fn(),
  loadScaleAdmissionRuntime: vi.fn(),
  ensureScaleAdmissionAtDelivery: vi.fn(),
  startResponseWithInlineWholeDefinition: vi.fn(),
  lockAuthenticatedAdmission: vi.fn(),
  resetStartReadCaches: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }))
vi.mock('../../modules/scale/scale-admission.service', async (orig) => ({
  ...(await orig() as object),
  loadScaleAdmissionRuntime: (...args: any[]) => mocks.loadScaleAdmissionRuntime(...args),
  ensureScaleAdmissionAtDelivery: (...args: any[]) => mocks.ensureScaleAdmissionAtDelivery(...args),
  seedScaleAdmissionRuntime: vi.fn(),
}))
vi.mock('../../modules/composite/start-read-prefetch', () => ({
  preloadStartComposite: async (_db: unknown, composite: unknown) => composite,
  startReadsIfCurrent: () => undefined,
  recheckPrefetchedReleases: vi.fn(),
}))
vi.mock('../../modules/composite/start-read-cache', async (orig) => {
  const real = await orig() as Record<string, unknown>
  return {
    ...real,
    cloneCachedStartComposite: (x: unknown) => x,
    getCachedStartComposite: () => undefined,
    setCachedStartComposite: vi.fn(),
    // keep the real clear so the metadata/TTL caches reset between tests
    resetStartReadCachesForTests: (...args: unknown[]) => {
      mocks.resetStartReadCaches(...(args as []))
      return (real as { resetStartReadCachesForTests: (...a: unknown[]) => void }).resetStartReadCachesForTests(...(args as []))
    },
  }
})
vi.mock('../../modules/assessment-runtime/shared-control-records', () => ({
  withSharedControlContext: async <T,>(fn: () => Promise<T>) => fn(),
  seedSharedScaleChildren: vi.fn(),
}))
vi.mock('../../modules/assessment-runtime/slot-set', async (orig) => ({
  ...(await orig() as object),
  loadFrozenActiveSlotSet: (...args: any[]) => mocks.loadFrozenActiveSlotSet(...args),
}))
vi.mock('../../modules/composite/authenticated-admission-lock', () => ({
  lockAuthenticatedAdmission: (...args: any[]) => mocks.lockAuthenticatedAdmission(...args),
  lockCompositeAdmissionShare: vi.fn(),
  lockAnonymousAdmission: vi.fn(),
}))
vi.mock('../../modules/composite/whole-start-inline', () => ({
  startResponseWithInlineWholeDefinition: (...args: any[]) => mocks.startResponseWithInlineWholeDefinition(...args),
}))
vi.mock('../../modules/training-materials/service', async (orig) => ({
  ...(await orig() as object),
  assertStudentTrainingEligibility: vi.fn().mockResolvedValue(undefined),
}))

import {
  projectFreshStartedAttempt,
  projectStartedAttempt,
  getPublicCompositeInfo,
  restartUserAttempt,
  startPublicAttempt,
  startUserAttempt,
} from '../../modules/composite/composite.service'
import { hashRecoveryToken } from '../../services/anonymousAccess'
import { hashPublicAccessToken } from '../../services/publicAccessTokenCrypto'
import * as assessmentResourceProtection from '../../services/assessmentResourceProtection'

describe('START freshlyCreated server distinction', () => {
  const compositeRow = {
    id: 'comp-1',
    code: 'Q-303',
    name: '测验',
    status: 'PUBLISHED',
    productKind: 'QUESTIONNAIRE',
    questionnaireType: 'COURSE',
    publicEnabled: true,
    maxAttempts: 1,
    courseId: null,
    questionnaireCourses: [{ courseId: 'course-1', course: { id: 'course-1', title: 'Course 1' } }],
    course: null,
    creator: { id: 'teacher-1', role: 'TEACHER' },
    items: [{
      id: 'item-1',
      type: 'SCALE',
      position: 0,
      required: true,
      scaleId: 'scale-1',
      standardCombinationSource: null,
      scale: { id: 'scale-1', code: 'adexi_v1', name: 'ADEXI', instrumentVersion: '2.0.0', instrumentClass: 'CUSTOM_DESCRIPTIVE' },
    }],
    formSections: [],
    trainingFlowFrozen: null,
    trainingVariantFrozen: null,
    reportPackageKey: null,
    analysisProtocolKey: null,
    trainingTimingPolicy: null,
    reportPackageSnapshotEncrypted: null,
    analysisProtocolSnapshotEncrypted: null,
    reportPackageVersion: null,
    reportPackageProfile: null,
    trainingVariantDraft: null,
    trainingFlowDraft: null,
    trainingFlowDigest: null,
    trainingVariantDigest: null,
    trainingPersistencePolicy: null,
    trainingFeedbackPolicy: null,
    opensAt: null,
    expiresAt: null,
    publishedAt: new Date('2026-11-14T00:00:00.000Z'),
  }

  const makeAttemptRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'attempt-reused',
    userId: 'user-1',
    recoveryTokenHash: null,
    status: 'IN_PROGRESS',
    progress: 0,
    completedItems: 0,
    attemptEpoch: 1,
    completedAt: null,
    deliveryMode: 'FINAL_ONLY',
    runtimeGeneration: 'UNIFIED_V1',
    frozenActiveSlotSetEncrypted: 'enc-slots',
    frozenActiveSlotSetHash: slotSet.snapshotHash,
    contextSnapshotHash: null,
    trainingTimingSnapshot: null,
    trainingVariantAllocationEncrypted: null,
    trainingVariantAllocationHash: null,
    trainingFlowSnapshotEncrypted: null,
    trainingFlowSnapshotHash: null,
    trainingFlowPathEncrypted: null,
    trainingFlowPathHash: null,
    participantKey: null,
    compositeAssessment: compositeRow,
    scaleAssessments: [{
      id: 'child-1',
      compositeItemId: 'item-1',
      status: 'IN_PROGRESS',
      attemptEpoch: 1,
      deliveryMode: 'FINAL_ONLY',
      runtimeGeneration: 'UNIFIED_V1',
      runtimeSnapshotEncrypted: 'enc-runtime-1',
      compiledRuntimeHash: 'b'.repeat(64),
      scale: { description: null, instruction: null },
    }],
    cognitiveSessions: [],
    situationalAttempts: [],
    formSectionAttempts: [],
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    resetStartReadCachesForTests()
    mocks.resetStartReadCaches()
    vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED', 'true')
    mocks.loadFrozenActiveSlotSet.mockResolvedValue(slotSet)
    mocks.loadScaleAdmissionRuntime.mockResolvedValue({
      instrumentKey: 'adexi_v1',
      instrumentVersion: '2.0.0',
      sourceDefinitionHash: 'a'.repeat(64),
      compiledRuntime: { compiledRuntimeHash: 'b'.repeat(64) },
      legacyDefinitionHash: 'c'.repeat(64),
      measurementPresentation: { presentationMode: 'ONE_BY_ONE' },
      definition: {
        schemaVersion: 2,
        respondentType: 'SELF',
        display: 'LIKERT',
        responseSets: [{
          key: 'likert5',
          options: [{ value: 1, label: '从不', score: 1 }],
        }],
        items: [{
          itemCode: 'q1',
          prompt: 'Q1',
          sortOrder: 1,
          responseSetKey: 'likert5',
          required: true,
        }],
      },
    })
    mocks.ensureScaleAdmissionAtDelivery.mockResolvedValue({})
    mocks.prisma.compositeAssessment.findUnique.mockResolvedValue(compositeRow)
    mocks.prisma.courseStudent.findFirst.mockResolvedValue({ courseId: 'course-1', status: 'ACTIVE' })
    mocks.prisma.assessmentUnitSnapshot.findMany.mockResolvedValue([])
    mocks.prisma.assessment.findMany.mockResolvedValue([{ id: 'child-1', compositeItemId: 'item-1', status: 'IN_PROGRESS' }])
    mocks.prisma.assessment.findUnique.mockResolvedValue({
      id: 'child-1',
      compositeItemId: 'item-1',
      runtimeSnapshotEncrypted: 'enc-runtime-1',
      compiledRuntimeHash: 'b'.repeat(64),
      scale: { description: null, instruction: null },
    })
    mocks.prisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(makeAttemptRow())
    mocks.startResponseWithInlineWholeDefinition.mockImplementation(
      async (_wants: boolean, data: any) => ({ ...data }),
    )
  })

  it('defaults projectStartedAttempt freshlyCreated to false and propagates true only when supplied', async () => {
    const reused = await projectStartedAttempt('attempt-reused', { userId: 'user-1' }, false, null)
    expect(reused).toMatchObject({ freshlyCreated: false })

    const wholeReused = await projectStartedAttempt('attempt-reused', { userId: 'user-1' }, true, null)
    expect(wholeReused).toMatchObject({ freshlyCreated: false })

    const wholeFresh = await projectStartedAttempt('attempt-reused', { userId: 'user-1' }, true, null, undefined, undefined, undefined, true)
    expect(wholeFresh).toMatchObject({ freshlyCreated: true })
  })

  it('returns freshlyCreated: true from projectFreshStartedAttempt', async () => {
    const result = await projectFreshStartedAttempt(
      makeAttemptRow({ id: 'attempt-fresh' }),
      compositeRow,
      [{
        id: 'child-1',
        compositeItemId: 'item-1',
        status: 'IN_PROGRESS',
        attemptEpoch: 1,
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        runtimeSnapshotEncrypted: 'enc-runtime-1',
        compiledRuntimeHash: 'b'.repeat(64),
        scale: { description: null, instruction: null },
      }],
      { userId: 'user-1' },
      null,
    )
    expect(result).toMatchObject({ freshlyCreated: true })
  })

  it('marks pre-gate fast-resume startUserAttempt as freshlyCreated: false', async () => {
    mocks.prisma.$queryRaw.mockResolvedValueOnce([{ id: 'attempt-reused' }])
    const res = await startUserAttempt('user-1', 'comp-1', { wantsWholeDelivery: true })
    expect(res).toMatchObject({
      freshlyCreated: false,
      recoveryToken: null,
      attempt: { id: 'attempt-reused' },
    })
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('marks in-transaction reused attempt (existing IN_PROGRESS) as freshlyCreated: false', async () => {
    mocks.prisma.$queryRaw.mockResolvedValueOnce([])
    mocks.prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => cb({
      compositeAssessmentAttempt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'attempt-reused',
          userId: 'user-1',
          status: 'IN_PROGRESS',
        }),
      },
    }))
    const res = await startUserAttempt('user-1', 'comp-1', { wantsWholeDelivery: true })
    expect(res).toMatchObject({
      freshlyCreated: false,
      recoveryToken: null,
      attempt: { id: 'attempt-reused' },
    })
  })

  it('single-flights 50 concurrent START metadata reads without serving stale later waves', async () => {
    let releaseMetadata!: (value: typeof compositeRow) => void
    const pendingMetadata = new Promise<typeof compositeRow>(resolve => { releaseMetadata = resolve })
    mocks.prisma.compositeAssessment.findUnique.mockReturnValue(pendingMetadata)
    mocks.prisma.$queryRaw.mockResolvedValue([])
    const busyError = Object.assign(new Error('系统繁忙'), { statusCode: 503, code: 'INSTRUMENT_NOT_AVAILABLE' })
    const gateSpy = vi.spyOn(assessmentResourceProtection, 'assertAssessmentStartResources')
      .mockImplementation(() => { throw busyError })
    try {
      const starts = Array.from({ length: 50 }, (_, i) => startUserAttempt(`user-${i}`, 'comp-1'))
      // One DB metadata read is in flight; followers must await the same promise.
      expect(mocks.prisma.compositeAssessment.findUnique).toHaveBeenCalledTimes(1)
      releaseMetadata(compositeRow)
      const outcomes = await Promise.allSettled(starts)
      expect(outcomes.every(outcome => outcome.status === 'rejected' && outcome.reason === busyError)).toBe(true)
      expect(mocks.prisma.compositeAssessment.findUnique).toHaveBeenCalledTimes(1)
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()

      // The completed wave is not cached: a later request must fetch live metadata.
      mocks.prisma.compositeAssessment.findUnique.mockResolvedValue(compositeRow)
      await expect(startUserAttempt('user-next', 'comp-1')).rejects.toBe(busyError)
      expect(mocks.prisma.compositeAssessment.findUnique).toHaveBeenCalledTimes(2)
    } finally {
      gateSpy.mockRestore()
    }
  })

  it('fast-fails ordinary scale-only START on 503 resource gate before fat composite load or transaction', async () => {
    mocks.prisma.$queryRaw.mockResolvedValueOnce([])
    const busyError = Object.assign(new Error('系统繁忙'), { statusCode: 503, code: 'INSTRUMENT_NOT_AVAILABLE' })
    const gateSpy = vi.spyOn(assessmentResourceProtection, 'assertAssessmentStartResources')
      .mockImplementationOnce(() => { throw busyError })
    try {
      await expect(startUserAttempt('user-1', 'comp-1', { wantsWholeDelivery: true })).rejects.toBe(busyError)
      expect(gateSpy).toHaveBeenCalledTimes(1)
      expect(mocks.prisma.compositeAssessment.findUnique).toHaveBeenCalledTimes(1)
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    } finally {
      gateSpy.mockRestore()
    }
  })

  it('enforces live eligibility before fast-resume and skips resource gate plus fat load when fast-resuming', async () => {
    const gateSpy = vi.spyOn(assessmentResourceProtection, 'assertAssessmentStartResources')
    try {
      mocks.prisma.$queryRaw.mockResolvedValueOnce([{ id: 'attempt-reused' }])
      const resumed = await startUserAttempt('user-1', 'comp-1', { wantsWholeDelivery: true })
      expect(resumed).toMatchObject({ freshlyCreated: false, attempt: { id: 'attempt-reused' } })
      expect(gateSpy).not.toHaveBeenCalled()
      expect(mocks.prisma.compositeAssessment.findUnique).toHaveBeenCalledTimes(1)

      vi.clearAllMocks()
      mocks.prisma.compositeAssessment.findUnique.mockResolvedValueOnce(compositeRow)
      mocks.prisma.courseStudent.findFirst.mockResolvedValueOnce(null)
      mocks.prisma.$queryRaw.mockResolvedValueOnce([{ id: 'attempt-reused' }])
      await expect(startUserAttempt('user-1', 'comp-1', { wantsWholeDelivery: true }))
        .rejects.toMatchObject({ statusCode: 403 })
      expect(gateSpy).not.toHaveBeenCalled()
      expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled()
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    } finally {
      gateSpy.mockRestore()
    }
  })

  it('marks public recovery-token startPublicAttempt resume as freshlyCreated: false', async () => {
    const recoveryToken = 'r'.repeat(43)
    const tokenValue = 'public-token-1'
    mocks.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      tokenHash: hashPublicAccessToken(tokenValue),
      isActive: true,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      maxUses: 0,
      usedCount: 1,
      compositeAssessment: { id: 'comp-1', updatedAt: new Date('2026-11-14T00:00:00Z'), trainingContentSnapshotHash: null, status: 'PUBLISHED', publicEnabled: true, opensAt: null, expiresAt: null },
    })
    mocks.prisma.compositeAssessmentAttempt.findFirst.mockResolvedValue({
      id: 'attempt-reused',
      userId: null,
      recoveryTokenHash: hashRecoveryToken(recoveryToken),
    })
    mocks.prisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(
      makeAttemptRow({
        userId: null,
        recoveryTokenHash: hashRecoveryToken(recoveryToken),
      }),
    )

    const res = await startPublicAttempt(tokenValue, recoveryToken, undefined, { wantsWholeDelivery: true })
    expect(res).toMatchObject({
      freshlyCreated: false,
      recoveryToken: null,
      attempt: { id: 'attempt-reused' },
    })
    // The verified recovery returns without loading the publication tree.
    expect(mocks.prisma.compositeAssessment.findUnique).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('returns fresh public presentation without loading scale definitions', async () => {
    const tokenValue = 'public-token-1'
    mocks.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValue({
      id: 'tok-1', tokenHash: hashPublicAccessToken(tokenValue), isActive: true,
      expiresAt: new Date('2030-01-01T00:00:00Z'), maxUses: 10, usedCount: 1,
      compositeAssessment: { id: 'comp-1', status: 'PUBLISHED', publicEnabled: true, opensAt: null, expiresAt: null },
    })
    mocks.prisma.$queryRaw.mockResolvedValue([])
    const info = await getPublicCompositeInfo(tokenValue)
    expect(info.items).toEqual([{ type: 'SCALE', position: 0, label: 'ADEXI' }])
    expect(info.units).toEqual([{ type: 'scale', id: 'item-1', position: 0, label: 'ADEXI', itemCount: 1, contextSection: false }])
    const args = mocks.prisma.compositeAssessment.findUnique.mock.calls[0][0]
    expect(args.select.items.select.scale).toEqual({ select: { name: true } })
    expect(args.select.formSections.include.items).toBeDefined()
    expect(args.select.items.select.scale.select.definition).toBeUndefined()
    mocks.prisma.compositeAssessment.findUnique.mockResolvedValueOnce({
      ...compositeRow, items: [{ ...compositeRow.items[0], scale: { name: 'updated label' } }],
    })
    mocks.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValueOnce({
      id: 'tok-1', tokenHash: hashPublicAccessToken(tokenValue), isActive: true,
      expiresAt: new Date('2030-01-01T00:00:00Z'), maxUses: 10, usedCount: 2,
      compositeAssessment: { id: 'comp-1', status: 'PUBLISHED', publicEnabled: true, opensAt: null, expiresAt: null },
    })
    const next = await getPublicCompositeInfo(tokenValue)
    expect(next.usedCount).toBe(2)
    expect(next.items[0].label).toBe('updated label')
  })
  it('rejects a forged recovery proof before publication preload, admission, or memory sampling', async () => {
    const tokenValue = 'public-token-1', recoveryToken = 'x'.repeat(43)
    mocks.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValue({
      id: 'tok-1', tokenHash: hashPublicAccessToken(tokenValue), isActive: true,
      expiresAt: new Date('2030-01-01T00:00:00Z'), maxUses: 0, usedCount: 1,
      compositeAssessment: { id: 'comp-1', status: 'PUBLISHED', publicEnabled: true, opensAt: null, expiresAt: null },
    })
    mocks.prisma.compositeAssessmentAttempt.findFirst.mockResolvedValue(null)
    const guard = vi.spyOn(assessmentResourceProtection, 'assertAnonymousStartCriticalMemory')
    try {
      await expect(startPublicAttempt(tokenValue, recoveryToken)).rejects.toMatchObject({ statusCode: 403 })
      expect(mocks.prisma.compositeAssessmentAttempt.findFirst).toHaveBeenCalledWith({
        where: { accessTokenId: 'tok-1', recoveryTokenHash: hashRecoveryToken(recoveryToken), userId: null },
      })
      expect(mocks.prisma.compositeAssessment.findUnique).not.toHaveBeenCalled()
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
      expect(guard).not.toHaveBeenCalled()
    } finally { guard.mockRestore() }
  })

  it('keeps a verified anonymous resume eligible when its link has expired or been disabled', async () => {
    const tokenValue = 'public-token-1', recoveryToken = 'r'.repeat(43)
    mocks.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValue({
      id: 'tok-1', tokenHash: hashPublicAccessToken(tokenValue), isActive: false,
      expiresAt: new Date('2020-01-01T00:00:00Z'), maxUses: 1, usedCount: 1,
      compositeAssessment: { id: 'comp-1', status: 'PUBLISHED', publicEnabled: true, opensAt: null, expiresAt: null },
    })
    mocks.prisma.compositeAssessmentAttempt.findFirst.mockResolvedValue({
      id: 'attempt-reused', userId: null, accessTokenId: 'tok-1',
      recoveryTokenHash: hashRecoveryToken(recoveryToken),
    })
    mocks.prisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(
      makeAttemptRow({ userId: null, recoveryTokenHash: hashRecoveryToken(recoveryToken) }),
    )
    const guard = vi.spyOn(assessmentResourceProtection, 'assertAnonymousStartCriticalMemory')
      .mockImplementation(() => { throw new Error('verified resume must not hit new-start memory guard') })
    try {
      const resumed = await startPublicAttempt(tokenValue, recoveryToken, undefined, { wantsWholeDelivery: true })
      expect(resumed).toMatchObject({ freshlyCreated: false, attempt: { id: 'attempt-reused' } })
      expect(guard).not.toHaveBeenCalled()
      expect(mocks.prisma.compositeAssessment.findUnique).not.toHaveBeenCalled()
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    } finally { guard.mockRestore() }
  })

  it('rejects a new plain public start before loadStartComposite or transaction when the optional guard rejects, after token window validation', async () => {
    const tokenValue = 'public-token-1'
    mocks.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValue({
      id: 'tok-1', tokenHash: hashPublicAccessToken(tokenValue), isActive: true,
      expiresAt: new Date('2030-01-01T00:00:00Z'), maxUses: 0, usedCount: 0,
      compositeAssessment: { id: 'comp-1', status: 'PUBLISHED', publicEnabled: true, opensAt: null, expiresAt: null },
    })
    const busy=Object.assign(new Error('busy'),{code:'INSTRUMENT_NOT_AVAILABLE',statusCode:503})
    const criticalSpy=vi.spyOn(assessmentResourceProtection,'assertAnonymousStartCriticalMemory').mockImplementation(()=>{throw busy})
    try {
      await expect(startPublicAttempt(tokenValue)).rejects.toBe(busy)
      expect(mocks.prisma.compositeAssessment.findUnique).not.toHaveBeenCalled()
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()

      // Exhausted quota must still fail with 409 rather than being masked as 503.
      mocks.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValueOnce({
        id: 'tok-1', tokenHash: hashPublicAccessToken(tokenValue), isActive: true,
        expiresAt: new Date('2030-01-01T00:00:00Z'), maxUses: 1, usedCount: 1,
        compositeAssessment: { id: 'comp-1', status: 'PUBLISHED', publicEnabled: true, opensAt: null, expiresAt: null },
      })
      await expect(startPublicAttempt(tokenValue)).rejects.toMatchObject({ statusCode: 409 })
      expect(criticalSpy).toHaveBeenCalledTimes(1)
    } finally { criticalSpy.mockRestore() }
  })

  it('leaves study resume eligible for its existing in-transaction recovery path', async () => {
    const tokenValue='public-token-1', recoveryToken='r'.repeat(43), hash=hashRecoveryToken(recoveryToken)
    mocks.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValue({
      id:'tok-1',tokenHash:hashPublicAccessToken(tokenValue),isActive:true,
      expiresAt:new Date('2030-01-01T00:00:00Z'),maxUses:0,usedCount:1,
      compositeAssessment:{id:'comp-1',status:'PUBLISHED',publicEnabled:true,opensAt:null,expiresAt:null},
    })
    mocks.prisma.$transaction.mockImplementation(async (fn:any)=>fn(mocks.prisma))
    mocks.prisma.compositeAssessmentAttempt.findUnique
      .mockResolvedValueOnce({id:'attempt-reused',userId:null,accessTokenId:'tok-1',recoveryTokenHash:hash})
      .mockResolvedValue(makeAttemptRow({userId:null,recoveryTokenHash:hash}))
    const criticalSpy=vi.spyOn(assessmentResourceProtection,'assertAnonymousStartCriticalMemory').mockImplementation(()=>{throw new Error('unexpected guard')})
    try {
      const study:any={credential:{token:recoveryToken,hash},participantId:'p1',beforeAdmission:async()=> 'attempt-reused',afterAdmission:vi.fn()}
      const result=await startPublicAttempt(tokenValue,undefined,study,{wantsWholeDelivery:true})
      expect(result.attempt.id).toBe('attempt-reused')
      expect(criticalSpy).not.toHaveBeenCalled()
      expect(study.afterAdmission).not.toHaveBeenCalled()
    } finally { criticalSpy.mockRestore() }
  })

  it('delegates scale-only startUserAttempt through runWithLowMemoryTrickleAdmission when trickle is enabled', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    mocks.prisma.$queryRaw.mockReset()
    mocks.prisma.$queryRaw.mockResolvedValue([])
    const busyError = Object.assign(new Error('系统繁忙'), { statusCode: 503, code: 'INSTRUMENT_NOT_AVAILABLE' })
    const directSpy = vi.spyOn(assessmentResourceProtection, 'assertAssessmentStartResources')
    const trickleSpy = vi.spyOn(assessmentResourceProtection, 'runWithLowMemoryTrickleAdmission')
      .mockRejectedValueOnce(busyError)
    try {
      await expect(startUserAttempt('user-1', 'comp-1', { wantsWholeDelivery: true })).rejects.toBe(busyError)
      expect(trickleSpy).toHaveBeenCalledTimes(1)
      expect(directSpy).not.toHaveBeenCalled()
      expect(mocks.prisma.compositeAssessment.findUnique).toHaveBeenCalledTimes(1)
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    } finally {
      trickleSpy.mockRestore()
      directSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('routes a new plain public START through low-memory trickle before publication load', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    const tokenValue = 'public-token-1'
    mocks.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValue({
      id: 'tok-1', tokenHash: hashPublicAccessToken(tokenValue), isActive: true,
      expiresAt: new Date('2030-01-01T00:00:00Z'), maxUses: 0, usedCount: 0,
      compositeAssessment: { id: 'comp-1', status: 'PUBLISHED', publicEnabled: true, opensAt: null, expiresAt: null },
    })
    const busyError = Object.assign(new Error('系统繁忙'), { statusCode: 503, code: 'INSTRUMENT_NOT_AVAILABLE' })
    const criticalSpy = vi.spyOn(assessmentResourceProtection, 'assertAnonymousStartCriticalMemory')
    const trickleSpy = vi.spyOn(assessmentResourceProtection, 'runWithLowMemoryTrickleAdmission')
      .mockRejectedValueOnce(busyError)
    try {
      await expect(startPublicAttempt(tokenValue)).rejects.toBe(busyError)
      expect(trickleSpy).toHaveBeenCalledTimes(1)
      expect(criticalSpy).not.toHaveBeenCalled()
      expect(mocks.prisma.compositeAssessment.findUnique).not.toHaveBeenCalled()
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    } finally {
      trickleSpy.mockRestore()
      criticalSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('rejects a new plain public START on the authoritative resource gate before publication load when trickle is off', async () => {
    const tokenValue = 'public-token-1'
    mocks.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValue({
      id: 'tok-1', tokenHash: hashPublicAccessToken(tokenValue), isActive: true,
      expiresAt: new Date('2030-01-01T00:00:00Z'), maxUses: 0, usedCount: 0,
      compositeAssessment: { id: 'comp-1', status: 'PUBLISHED', publicEnabled: true, opensAt: null, expiresAt: null },
    })
    const busy = Object.assign(new Error('系统繁忙'), { statusCode: 503, code: 'INSTRUMENT_NOT_AVAILABLE' })
    const criticalSpy = vi.spyOn(assessmentResourceProtection, 'assertAnonymousStartCriticalMemory').mockImplementation(() => {})
    const gateSpy = vi.spyOn(assessmentResourceProtection, 'assertAssessmentStartResources').mockImplementation(() => { throw busy })
    try {
      await expect(startPublicAttempt(tokenValue)).rejects.toBe(busy)
      expect(criticalSpy).toHaveBeenCalledTimes(1)
      expect(gateSpy).toHaveBeenCalledTimes(1)
      expect(mocks.prisma.compositeAssessment.findUnique).not.toHaveBeenCalled()
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    } finally {
      criticalSpy.mockRestore()
      gateSpy.mockRestore()
    }
  })

  it('does not route fast-resume, non-scale-only start, public recovery, study, or restart through runWithLowMemoryTrickleAdmission', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    const trickleSpy = vi.spyOn(assessmentResourceProtection, 'runWithLowMemoryTrickleAdmission')
      .mockImplementation(() => { throw new Error('unexpected trickle admission call') })
    try {
      // 1) Fast-resume START skips trickle gate
      mocks.prisma.$queryRaw.mockReset()
      mocks.prisma.$queryRaw.mockResolvedValueOnce([{ id: 'attempt-reused' }])
      const resumed = await startUserAttempt('user-1', 'comp-1', { wantsWholeDelivery: true })
      expect(resumed).toMatchObject({ freshlyCreated: false, attempt: { id: 'attempt-reused' } })

      // 2) Non-scale-only START (has FORM_SECTION) bypasses scale trickle gate and proceeds straight to TX path
      mocks.prisma.$queryRaw.mockReset()
      mocks.prisma.$queryRaw.mockResolvedValue([])
      mocks.prisma.compositeAssessment.findUnique.mockResolvedValue({
        ...compositeRow,
        items: [{ id: 'item-form', type: 'FORM_SECTION', position: 0, required: true, scaleId: null, scale: null }],
        formSections: [{ id: 'sec-1', title: 'Form', position: 0, items: [] }],
      })
      mocks.prisma.$transaction.mockRejectedValueOnce(new Error('reached-tx-without-trickle'))
      await expect(startUserAttempt('user-1', 'comp-1')).rejects.toThrow('reached-tx-without-trickle')

      // 3) Restart path never enters trickle admission
      mocks.prisma.compositeAssessmentAttempt.findUnique.mockResolvedValueOnce({
        id: 'attempt-1',
        userId: 'user-1',
        compositeAssessmentId: 'comp-1',
      })
      mocks.prisma.compositeAssessment.findUnique.mockResolvedValue(compositeRow)
      mocks.prisma.$transaction.mockRejectedValueOnce(new Error('restart-reached-tx-without-trickle'))
      await expect(restartUserAttempt('user-1', 'attempt-1')).rejects.toThrow('restart-reached-tx-without-trickle')

      // 4) Public recovery resume never enters trickle admission
      const recoveryToken = 'r'.repeat(43)
      mocks.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValueOnce({
        id: 'tok-1',
        tokenHash: hashPublicAccessToken('public-token-1'),
        isActive: true,
        expiresAt: new Date('2030-01-01T00:00:00Z'),
        maxUses: 0,
        usedCount: 1,
        compositeAssessment: { id: 'comp-1', status: 'PUBLISHED', publicEnabled: true, opensAt: null, expiresAt: null },
      })
      mocks.prisma.compositeAssessmentAttempt.findFirst.mockResolvedValueOnce({
        id: 'attempt-reused',
        userId: null,
        accessTokenId: 'tok-1',
        recoveryTokenHash: hashRecoveryToken(recoveryToken),
      })
      mocks.prisma.compositeAssessmentAttempt.findUnique.mockResolvedValueOnce(
        makeAttemptRow({ userId: null, recoveryTokenHash: hashRecoveryToken(recoveryToken) }),
      )
      await expect(startPublicAttempt('public-token-1', recoveryToken, undefined, { wantsWholeDelivery: true }))
        .resolves.toMatchObject({ freshlyCreated: false })

      // 5) Anonymous study admission stays outside trickle so an existing attempt can resume.
      const studyRecovery = 's'.repeat(43)
      const studyHash = hashRecoveryToken(studyRecovery)
      mocks.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValue({
        id: 'tok-1', tokenHash: hashPublicAccessToken('public-token-1'), isActive: true,
        expiresAt: new Date('2030-01-01T00:00:00Z'), maxUses: 0, usedCount: 1,
        compositeAssessment: { id: 'comp-1', status: 'PUBLISHED', publicEnabled: true, opensAt: null, expiresAt: null },
      })
      mocks.prisma.compositeAssessment.findUnique.mockResolvedValue(compositeRow)
      mocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(mocks.prisma))
      mocks.prisma.compositeAssessmentAttempt.findUnique
        .mockResolvedValueOnce({ id: 'attempt-reused', userId: null, accessTokenId: 'tok-1', recoveryTokenHash: studyHash })
        .mockResolvedValue(makeAttemptRow({ userId: null, recoveryTokenHash: studyHash }))
      const study: any = {
        credential: { token: studyRecovery, hash: studyHash },
        participantId: 'p1',
        beforeAdmission: async () => 'attempt-reused',
        afterAdmission: vi.fn(),
      }
      await expect(startPublicAttempt('public-token-1', undefined, study, { wantsWholeDelivery: true }))
        .resolves.toMatchObject({ attempt: { id: 'attempt-reused' } })

      expect(trickleSpy).not.toHaveBeenCalled()
    } finally {
      trickleSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
