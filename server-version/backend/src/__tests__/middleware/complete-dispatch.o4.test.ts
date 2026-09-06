import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY ?? 'a'.repeat(64)

const { mockPrisma, mockFormSectionService } = vi.hoisted(() => ({
  mockPrisma: {
    questionnaireAssessment: { findUnique: vi.fn() },
  },
  mockFormSectionService: {
    finalizeQuestionnaireAttemptIfReady: vi.fn(),
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../services/questionnaire-form-section.service', () => mockFormSectionService)

import { questionnaireController } from '../../controllers/questionnaireController'
import { unifiedCompletionDispatchSelect } from '../../modules/assessment-runtime/unified-aggregate-finalizer.service'

// Shape produced by unifiedCompletionDispatchSelect: the aggregate parent
// header plus the owner column the route needs for the authorization check.
const dispatchParent = (overrides: Record<string, unknown> = {}) => ({
  id: 'attempt-1',
  userId: 'student-1',
  status: 'IN_PROGRESS',
  deliveryMode: 'FINAL_ONLY',
  runtimeGeneration: 'UNIFIED_V1',
  attemptEpoch: 1,
  startedAt: new Date('2026-09-06T00:00:00Z'),
  completedAt: null,
  progress: 80,
  aggregateInputHash: null,
  contextSnapshotEncrypted: null,
  contextSnapshotHash: null,
  frozenActiveSlotSetEncrypted: 'slot-set',
  frozenActiveSlotSetHash: 'slot-hash',
  completedScales: 1,
  completedForms: 0,
  ...overrides,
})

const invoke = async (id: string, userId = 'student-1') => {
  const res: any = { statusCode: 200, body: null }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: unknown) => {
    res.body = body
    return res
  })
  await questionnaireController.completeAssessment({ params: { id }, user: { userId } } as any, res)
  return res
}

describe('O4 /complete load-once dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFormSectionService.finalizeQuestionnaireAttemptIfReady.mockResolvedValue({
      status: 'COMPLETED',
      progress: 100,
      completedAt: new Date('2026-09-06T01:00:00Z'),
    })
  })

  it('serves UNIFIED completion from ONE dispatch read and hands the preloaded parent to the finalizer', async () => {
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(dispatchParent())

    const res = await invoke('attempt-1')

    expect(res.statusCode).toBe(200)
    // Reads collapse 4 -> 2: exactly ONE authoritative dispatch read (parent
    // header + owner, replacing guard probe + route dispatch + finalizer
    // parent probe), then one post-finalize report projection.
    expect(mockPrisma.questionnaireAssessment.findUnique).toHaveBeenCalledTimes(2)
    const [dispatchArgs, projectionArgs] = mockPrisma.questionnaireAssessment.findUnique.mock.calls
    expect(dispatchArgs[0]).toEqual(
      expect.objectContaining({ where: { id: 'attempt-1' }, select: unifiedCompletionDispatchSelect }),
    )
    expect((projectionArgs[0] as any).select).toMatchObject({ aggregateReportEncrypted: true })
    expect(mockFormSectionService.finalizeQuestionnaireAttemptIfReady).toHaveBeenCalledTimes(1)
    const [parentId, preloaded] = mockFormSectionService.finalizeQuestionnaireAttemptIfReady.mock.calls[0]
    expect(parentId).toBe('attempt-1')
    expect(preloaded).toMatchObject({
      id: 'attempt-1',
      runtimeGeneration: 'UNIFIED_V1',
      frozenActiveSlotSetEncrypted: 'slot-set',
      userId: 'student-1',
    })
  })

  it('reports 409 when the aggregate is not ready yet', async () => {
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(dispatchParent())
    mockFormSectionService.finalizeQuestionnaireAttemptIfReady.mockResolvedValue({
      status: 'IN_PROGRESS',
      progress: 80,
      completedAt: null,
    })

    const res = await invoke('attempt-1')

    expect(res.statusCode).toBe(409)
    expect(mockFormSectionService.finalizeQuestionnaireAttemptIfReady).toHaveBeenCalledTimes(1)
  })

  it('keeps legacy attempts on the 410 LEGACY_WRITE_DISABLED boundary without touching the finalizer', async () => {
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(dispatchParent({ runtimeGeneration: null }))

    const res = await invoke('attempt-1', 'someone-else')

    expect(res.statusCode).toBe(410)
    expect(res.body).toMatchObject({ code: 'LEGACY_WRITE_DISABLED' })
    expect(mockFormSectionService.finalizeQuestionnaireAttemptIfReady).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing attempt', async () => {
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(null)

    const res = await invoke('missing')

    expect(res.statusCode).toBe(404)
    expect(mockFormSectionService.finalizeQuestionnaireAttemptIfReady).not.toHaveBeenCalled()
  })

  it('rejects a wrong owner on a UNIFIED attempt with 403 before finalizing', async () => {
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue(dispatchParent())

    const res = await invoke('attempt-1', 'student-2')

    expect(res.statusCode).toBe(403)
    expect(mockFormSectionService.finalizeQuestionnaireAttemptIfReady).not.toHaveBeenCalled()
  })
})
