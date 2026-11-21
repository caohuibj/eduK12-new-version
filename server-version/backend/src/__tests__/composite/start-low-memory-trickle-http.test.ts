import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const proc = vi.hoisted(() => ({
  availKiB: 665600, // 650 MiB exact default floor
  user: 100,
  idle: 900,
  delay: vi.fn(),
  advanceCpuPercent(pct: number) {
    this.user += Math.round(pct * 10)
    this.idle += Math.round((100 - pct) * 10)
  },
}))

vi.mock('node:timers/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:timers/promises')>(),
  setTimeout: proc.delay,
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: ((path: unknown, ...args: unknown[]) => {
      if (path === '/proc/meminfo') return `MemAvailable: ${proc.availKiB} kB\n`
      if (path === '/proc/stat') return `cpu  ${proc.user} 0 0 ${proc.idle} 0 0 0 0\n`
      return (actual.readFileSync as (...params: unknown[]) => unknown)(path, ...args)
    }) as typeof actual.readFileSync,
  }
})

const mocks = vi.hoisted(() => ({
  prisma: {
    compositeAssessment: { findUnique: vi.fn() },
    compositeAssessmentAttempt: { findUnique: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn() },
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
  lockAuthenticatedAdmission: vi.fn(),
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

import { compositeController } from '../../modules/composite/composite.controller'
import { createFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { resetStartReadCachesForTests } from '../../modules/composite/start-read-cache'
import {
  assertAssessmentStartResources,
  reportResourceClaimDecision,
  resetAssessmentResourceProtectionForTests,
  sampleAssessmentHostResources,
} from '../../services/assessmentResourceProtection'

const slotSet = createFrozenActiveSlotSet({
  schemaVersion: 1,
  runtimeGeneration: 'UNIFIED_V1',
  attemptEpoch: 1,
  slots: [{
    slotKey: 'scale:item-1',
    unitType: 'SCALE',
    required: true,
    sourceDefinitionIdentity: { key: 'adexi_v1', version: '2.0.0', hash: 'a'.repeat(64) },
    sourceBinding: { scaleCode: 'adexi_v1', compositeItemId: 'item-1', compiledRuntimeHash: 'b'.repeat(64) },
  }],
})

const compositeRow = {
  id: 'comp-1',
  code: 'Q-303',
  name: '测验',
  status: 'PUBLISHED',
  productKind: 'QUESTIONNAIRE',
  questionnaireType: 'COURSE',
  publicEnabled: false,
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
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

const fakeRes = () => {
  const res: any = { headers: {} as Record<string, string>, statusCode: 200, body: undefined }
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; return res }
  res.status = (s: number) => { res.statusCode = s; return res }
  res.json = (b: unknown) => { res.body = b; return res }
  return res
}

const startReq = () => ({
  user: { userId: 'user-1', role: 'STUDENT' },
  params: { id: 'comp-1' },
  query: {},
  body: {},
}) as any

describe('authenticated START controller low-memory trickle HTTP contract', () => {
  let clock = 1000
  let nowSpy: ReturnType<typeof vi.spyOn>

  const advanceSample = (availMiB: number, cpuPercent: number) => {
    clock += 1500
    proc.availKiB = availMiB * 1024
    proc.advanceCpuPercent(cpuPercent)
  }

  const tripCpuProtection = () => {
    sampleAssessmentHostResources()
    for (const percent of [98, 99]) {
      advanceSample(850, percent)
      reportResourceClaimDecision(2)
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetStartReadCachesForTests()
    resetAssessmentResourceProtectionForTests()
    clock = 1000
    proc.availKiB = 720 * 1024
    proc.user = 100
    proc.idle = 900
    nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock)
    sampleAssessmentHostResources()
    advanceSample(650, 20)

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
    mocks.prisma.$queryRaw.mockResolvedValue([])
    mocks.prisma.assessmentUnitSnapshot.findMany.mockResolvedValue([])
    mocks.prisma.assessment.findMany.mockResolvedValue([{ id: 'child-1', compositeItemId: 'item-1', status: 'IN_PROGRESS' }])
    mocks.prisma.assessment.findUnique.mockResolvedValue({
      id: 'child-1',
      compositeItemId: 'item-1',
      runtimeSnapshotEncrypted: 'enc-runtime-1',
      compiledRuntimeHash: 'b'.repeat(64),
      scale: { description: null, instruction: null },
    })
    mocks.prisma.compositeAssessmentAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1',
      compositeAssessmentId: 'comp-1',
      userId: 'user-1',
      attemptNo: 1,
      attemptEpoch: 1,
      status: 'IN_PROGRESS',
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
      startedAt: new Date('2026-01-01T00:00:00Z'),
      submittedAt: null,
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
      assessments: [],
      cognitiveSessions: [],
      situationalAttempts: [],
      formSectionAttempts: [],
    })
    mocks.prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      // Mirrors freezeScaleRuntimeAtAttemptStart calling assertAssessmentStartResources() inside TX
      assertAssessmentStartResources()
      return cb({
        compositeAssessmentAttempt: {
          findFirst: vi.fn().mockResolvedValue({ id: 'attempt-1', userId: 'user-1', status: 'IN_PROGRESS' }),
        },
      })
    })
    mocks.startResponseWithInlineWholeDefinition.mockImplementation(async (_wants: boolean, data: any) => ({ ...data }))
  })

  afterEach(() => {
    nowSpy.mockRestore()
    vi.unstubAllEnvs()
    resetAssessmentResourceProtectionForTests()
  })

  it('keeps returning 503 Retry-After: 10 at 650 MiB when trickle flag is unset', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    const res = fakeRes()
    await compositeController.startAttempt(startReq(), res)

    expect(res.statusCode).toBe(503)
    expect(res.headers['Retry-After']).toBe('10')
    expect(res.body).toMatchObject({ code: 'INSTRUMENT_NOT_AVAILABLE', data: null })
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('admits 650 MiB START with idle CPU when trickle is enabled, and rejects <650 or busy CPU with hysteresis', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')

    const resOk = fakeRes()
    await compositeController.startAttempt(startReq(), resOk)
    expect(resOk.statusCode).toBe(200)
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)

    // CPU > 80% in [650, 700) must reject before TX
    advanceSample(660, 85)
    const resBusyCpu = fakeRes()
    await compositeController.startAttempt(startReq(), resBusyCpu)
    expect(resBusyCpu.statusCode).toBe(503)
    expect(resBusyCpu.headers['Retry-After']).toBe('10')
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)

    // Drop below floor (649 MiB) latches until >= release (670 MiB)
    advanceSample(649, 20)
    const resBelowFloor = fakeRes()
    await compositeController.startAttempt(startReq(), resBelowFloor)
    expect(resBelowFloor.statusCode).toBe(503)
    expect(resBelowFloor.headers['Retry-After']).toBe('10')

    advanceSample(665, 20)
    const resHysteresis = fakeRes()
    await compositeController.startAttempt(startReq(), resHysteresis)
    expect(resHysteresis.statusCode).toBe(503)

    advanceSample(670, 20)
    const resRecovered = fakeRes()
    await compositeController.startAttempt(startReq(), resRecovered)
    expect(resRecovered.statusCode).toBe(200)
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2)
  })

  it('finishes an admitted Scale START when CPU protection trips just after transaction checkout', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    advanceSample(850, 30)
    const transaction = mocks.prisma.$transaction.getMockImplementation()!
    mocks.prisma.$transaction.mockImplementationOnce(async (callback) => {
      tripCpuProtection()
      return transaction(callback)
    })

    const res = fakeRes()
    await compositeController.startAttempt(startReq(), res)

    expect(res.statusCode).toBe(200)
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(() => assertAssessmentStartResources()).toThrow(/系统繁忙/)
  })

  it('waits before checkout for a brief CPU trip and rejects sustained pressure without opening a transaction', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    tripCpuProtection()
    proc.delay.mockImplementation(async (ms: number) => {
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
      clock += ms
      proc.advanceCpuPercent(99)
    })

    const busy = fakeRes()
    await compositeController.startAttempt(startReq(), busy)
    expect(busy.statusCode).toBe(503)
    expect(busy.headers['Retry-After']).toBeDefined()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()

    proc.delay.mockImplementation(async (ms: number) => {
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
      clock += ms
      proc.advanceCpuPercent(30)
    })
    const recovered = fakeRes()
    await compositeController.startAttempt(startReq(), recovered)
    expect(recovered.statusCode).toBe(200)
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('bounds precompiled scale STARTs through the low-memory trickle gate at 650 MiB while fast-passing CPU spikes at 850 MiB', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT', '1')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_QUEUE', '0')
    mocks.prisma.compositeAssessment.findUnique.mockResolvedValue({
      ...compositeRow,
      trainingContentSnapshotHash: 'snap-hash-1',
    })

    // At 650 MiB, a precompiled START must still acquire the trickle gate slot.
    let releaseFirstTx!: () => void
    let firstEntered = false
    const txImpl = mocks.prisma.$transaction.getMockImplementation()!
    mocks.prisma.$transaction.mockImplementationOnce(async (callback) => {
      firstEntered = true
      await new Promise<void>(resolve => { releaseFirstTx = resolve })
      return txImpl(callback)
    })

    const res1 = fakeRes()
    const p1 = compositeController.startAttempt(startReq(), res1)
    await vi.waitFor(() => expect(firstEntered).toBe(true))

    const res2 = fakeRes()
    await compositeController.startAttempt(startReq(), res2)
    expect(res2.statusCode).toBe(503)
    expect(res2.headers['Retry-After']).toBe('10')
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)

    releaseFirstTx()
    await p1
    expect(res1.statusCode).toBe(200)

    // At 850 MiB with a CPU-only trip, precompiled START takes the fast path without 3s polling.
    proc.delay.mockClear()
    tripCpuProtection()
    const resFast = fakeRes()
    await compositeController.startAttempt(startReq(), resFast)
    expect(resFast.statusCode).toBe(200)
    expect(proc.delay).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2)
  })
})
