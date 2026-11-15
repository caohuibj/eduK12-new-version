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
      compositeAssessment: { id: 'comp-1', status: 'PUBLISHED', publicEnabled: true, opensAt: null, expiresAt: null },
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
  })
})
