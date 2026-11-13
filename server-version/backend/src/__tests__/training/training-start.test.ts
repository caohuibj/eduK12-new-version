import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../config/database'
import {
  listAvailableForStudent,
  loadComposite,
  invalidateCompositeAvailableCache,
  invalidateCompositeDefinitionCache,
  clearScaleFreezeCacheForTest,
  clearTrainingStartGateForTest,
  projectStartedAttempt,
  startUserAttempt,
} from '../../modules/composite/composite.service'
import {
  lockCompositeAdmissionShare,
  lockAuthenticatedAdmission,
} from '../../modules/composite/authenticated-admission-lock'
import { clearScaleAdmissionRuntimeCacheForTest } from '../../modules/scale/scale-admission.service'
import { storeFrozenActiveSlotSet, createFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'

describe('PR-B: Training START and Available Optimization Suite', () => {
  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    invalidateCompositeAvailableCache()
    invalidateCompositeDefinitionCache()
    clearScaleFreezeCacheForTest()
    clearTrainingStartGateForTest()
    clearScaleAdmissionRuntimeCacheForTest()
    vi.restoreAllMocks()
    vi.spyOn(prisma.assessmentUnitSnapshot, 'findMany').mockResolvedValue([])
  })

  afterEach(() => {
    delete process.env.DATA_ENCRYPTION_KEY
    delete process.env.COMPOSITE_AVAILABLE_CACHE_TTL_MS
    delete process.env.COMPOSITE_DEFINITION_CACHE_TTL_MS
    delete process.env.SCALE_FREEZE_CACHE_TTL_MS
    delete process.env.TRAINING_SKIP_COMPOSITE_SHARE_LOCK
    delete process.env.TRAINING_START_MAX_CONCURRENT
    delete process.env.TRAINING_START_MAX_QUEUE
    invalidateCompositeAvailableCache()
    invalidateCompositeDefinitionCache()
    clearScaleFreezeCacheForTest()
    clearTrainingStartGateForTest()
    clearScaleAdmissionRuntimeCacheForTest()
    vi.restoreAllMocks()
  })

  describe('EXEC-START-01: Available endpoint caching and projection', () => {
    it('caches published composite list per courseId when TTL > 0', async () => {
      process.env.COMPOSITE_AVAILABLE_CACHE_TTL_MS = '15000'

      const mockPublished = [
        {
          id: 'comp-1',
          productKind: 'QUESTIONNAIRE',
          code: 'COMP_CODE_1',
          name: 'Test Composite 1',
          description: 'Desc',
          instruction: null,
          status: 'PUBLISHED',
          opensAt: null,
          expiresAt: null,
          maxAttempts: 1,
          reportPackageKey: null,
          reportPackageVersion: null,
          reportPackageSnapshotEncrypted: null,
          course: { id: 'course-1', title: 'Course 1', courseCode: 'C1', isLibrary: false },
          items: [],
          formSections: [],
          publishedAt: new Date(),
        },
      ]

      vi.spyOn(prisma.courseStudent, 'findMany').mockResolvedValue([{ courseId: 'course-1' }] as any)
      const findManySpy = vi.spyOn(prisma.compositeAssessment, 'findMany')
        .mockImplementation(async (args: any) => {
          if (args?.where?.status === 'PUBLISHED') return mockPublished as any
          if (args?.where?.status === 'ARCHIVED') return [] as any
          return mockPublished as any
        })
      vi.spyOn(prisma.compositeAssessmentAttempt, 'findMany').mockResolvedValue([])

      // First call: should query DB for published composites
      const res1 = await listAvailableForStudent('user-1', Date.now(), 'course-1', true)
      expect(res1).toHaveLength(1)
      expect(res1[0].id).toBe('comp-1')
      const initialFindManyCount = findManySpy.mock.calls.length

      // Second call by another user for the same course: should hit published cache
      const res2 = await listAvailableForStudent('user-2', Date.now(), 'course-1', true)
      expect(res2).toHaveLength(1)
      expect(res2[0].id).toBe('comp-1')

      // Only the archived check was queried, published findMany was cached
      const publishedQueries = findManySpy.mock.calls.filter(c => c[0]?.where?.status === 'PUBLISHED')
      expect(publishedQueries).toHaveLength(1)

      // Invalidation clears cache
      invalidateCompositeAvailableCache()
      await listAvailableForStudent('user-3', Date.now(), 'course-1', true)
      const afterInvalidateQueries = findManySpy.mock.calls.filter(c => c[0]?.where?.status === 'PUBLISHED')
      expect(afterInvalidateQueries).toHaveLength(2)
    })
  })

  describe('EXEC-START-02: Definition caching and eligibility memo', () => {
    it('caches loadComposite for published assessments when TTL > 0', async () => {
      process.env.COMPOSITE_DEFINITION_CACHE_TTL_MS = '30000'

      const mockComposite = {
        id: 'comp-def-1',
        status: 'PUBLISHED',
        productKind: 'QUESTIONNAIRE',
        questionnaireType: 'COURSE',
        courseId: 'course-1',
        course: { id: 'course-1', isLibrary: false },
        items: [],
        formSections: [],
        questionnaireCourses: [{ courseId: 'course-1', course: { id: 'course-1', title: 'Course 1' } }],
        creator: { id: 'admin-1', role: 'ADMIN' },
      }

      const findUniqueSpy = vi.spyOn(prisma.compositeAssessment, 'findUnique')
        .mockResolvedValue(mockComposite as any)

      // First call: loads from DB and caches
      const comp1 = await loadComposite('comp-def-1', true)
      expect(comp1.id).toBe('comp-def-1')
      expect(findUniqueSpy).toHaveBeenCalledTimes(1)

      // Second call: served from memory cache
      const comp2 = await loadComposite('comp-def-1', true)
      expect(comp2.id).toBe('comp-def-1')
      expect(findUniqueSpy).toHaveBeenCalledTimes(1)

      // Invalidation clears cache
      invalidateCompositeDefinitionCache('comp-def-1')
      const comp3 = await loadComposite('comp-def-1', true)
      expect(comp3.id).toBe('comp-def-1')
      expect(findUniqueSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('EXEC-START-03: Pre-Gate Fast-Path for existing IN_PROGRESS attempt', () => {
    it('bypasses loadComposite and gate entirely when attempt is already IN_PROGRESS', async () => {
      // Mock existing in_progress attempt
      vi.spyOn(prisma, '$queryRaw').mockImplementation(async (sql: any) => {
        const queryStr = String(sql?.strings ? sql.strings.join('') : sql)
        if (queryStr.includes('start.raw.pre_gate.in_progress') || queryStr.includes('composite_assessment_attempts')) {
          return [{ id: 'attempt-already-in-progress' }] as any
        }
        return [] as any
      })

      const loadCompositeSpy = vi.spyOn(prisma.compositeAssessment, 'findUnique')
      const txSpy = vi.spyOn(prisma, '$transaction')

      const baseMarkers = {
        trainingFlowSnapshotEncrypted: null,
        trainingFlowSnapshotHash: null,
        trainingFlowPathEncrypted: null,
        trainingFlowPathHash: null,
        trainingVariantAllocationEncrypted: null,
        trainingVariantAllocationHash: null,
      }
      const baseDefMarkers = {
        trainingFlowDraft: null,
        trainingFlowFrozen: null,
        trainingFlowDigest: null,
        trainingVariantDraft: null,
        trainingVariantFrozen: null,
        trainingVariantDigest: null,
      }

      const slotSet = createFrozenActiveSlotSet({
        schemaVersion: 1,
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        slots: [],
      })
      const encryptedSlotSet = await storeFrozenActiveSlotSet(slotSet)

      const mockAttempt = {
        id: 'attempt-already-in-progress',
        userId: 'student-fast-path',
        compositeAssessmentId: 'comp-fast-1',
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
        completedItems: 0,
        frozenActiveSlotSetEncrypted: encryptedSlotSet,
        frozenActiveSlotSetHash: slotSet.snapshotHash,
        ...baseMarkers,
        compositeAssessment: {
          id: 'comp-fast-1',
          status: 'PUBLISHED',
          productKind: 'QUESTIONNAIRE',
          items: [],
          formSections: [],
          ...baseDefMarkers,
        },
        scaleAssessments: [],
        cognitiveSessions: [],
        situationalAttempts: [],
      }

      // Mock projectStartedAttempt downstream getAttemptState
      vi.spyOn(prisma.compositeAssessmentAttempt, 'findUnique').mockResolvedValue(mockAttempt as any)

      const result = await startUserAttempt('student-fast-path', 'comp-fast-1', { wantsWholeDelivery: false })
      expect(result).toBeDefined()
      expect(result.attempt?.id).toBe('attempt-already-in-progress')

      // loadComposite and write transaction must NOT have been called!
      expect(loadCompositeSpy).not.toHaveBeenCalled()
      expect(txSpy).not.toHaveBeenCalled()
    })
  })

  describe('EXEC-START-04: FOR SHARE Lock skipping and gate bounds', () => {
    it('skips composite FOR SHARE lock when TRAINING_SKIP_COMPOSITE_SHARE_LOCK=true', async () => {
      process.env.TRAINING_SKIP_COMPOSITE_SHARE_LOCK = 'true'

      const mockTx: any = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
        $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
      }

      // lockCompositeAdmissionShare should skip $queryRawUnsafe entirely
      await lockCompositeAdmissionShare(mockTx, 'comp-lock-1')
      expect(mockTx.$queryRawUnsafe).not.toHaveBeenCalled()

      // lockAuthenticatedAdmission should skip share lock query and only take advisory lock
      await lockAuthenticatedAdmission(mockTx, 'comp-lock-1', 'user-lock-1')
      expect(mockTx.$queryRawUnsafe).not.toHaveBeenCalled()
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1)
    })

    it('retains composite FOR SHARE lock when TRAINING_SKIP_COMPOSITE_SHARE_LOCK is unset', async () => {
      delete process.env.TRAINING_SKIP_COMPOSITE_SHARE_LOCK

      const mockTx: any = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
        $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
      }

      await lockAuthenticatedAdmission(mockTx, 'comp-lock-2', 'user-lock-2')
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(
        'SELECT "id" FROM "composite_assessments" WHERE "id" = $1 FOR SHARE',
        'comp-lock-2',
      )
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1)
    })
  })

  describe('EXEC-START-POST: Preloaded Parent Memory Stream', () => {
    it('projectStartedAttempt uses preloadedParent without querying START_WHOLE_PARENT_SELECT', async () => {
      const baseMarkers = {
        trainingFlowSnapshotEncrypted: null,
        trainingFlowSnapshotHash: null,
        trainingFlowPathEncrypted: null,
        trainingFlowPathHash: null,
        trainingVariantAllocationEncrypted: null,
        trainingVariantAllocationHash: null,
      }
      const baseDefMarkers = {
        trainingFlowDraft: null,
        trainingFlowFrozen: null,
        trainingFlowDigest: null,
        trainingVariantDraft: null,
        trainingVariantFrozen: null,
        trainingVariantDigest: null,
      }
      const slotSet = createFrozenActiveSlotSet({
        schemaVersion: 1,
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        slots: [],
      })
      const encryptedSlotSet = await storeFrozenActiveSlotSet(slotSet)

      const preloadedParent: any = {
        id: 'attempt-preloaded-1',
        userId: 'student-preloaded',
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        progress: 0,
        completedItems: 0,
        frozenActiveSlotSetEncrypted: encryptedSlotSet,
        frozenActiveSlotSetHash: slotSet.snapshotHash,
        ...baseMarkers,
        compositeAssessment: {
          id: 'comp-1',
          status: 'PUBLISHED',
          productKind: 'QUESTIONNAIRE',
          items: [],
          formSections: [],
          ...baseDefMarkers,
        },
        scaleAssessments: [],
        cognitiveSessions: [],
        situationalAttempts: [],
      }

      const findUniqueSpy = vi.spyOn(prisma.compositeAssessmentAttempt, 'findUnique')

      const result = await projectStartedAttempt(
        'attempt-preloaded-1',
        { userId: 'student-preloaded' },
        false,
        null,
        preloadedParent,
      )

      expect(result.attempt.id).toBe('attempt-preloaded-1')
      expect(findUniqueSpy).not.toHaveBeenCalled()
    })
  })
})
