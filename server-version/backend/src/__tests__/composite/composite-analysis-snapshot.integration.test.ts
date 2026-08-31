import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
process.env.COGNITIVE_MODULE_ENABLED = 'true'

const { mockPrisma, stateRef } = vi.hoisted(() => {
  const stateRef: { current: any } = { current: null }
  const mockPrisma: any = {
    compositeAssessmentAttempt: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    compositeAnalysisSnapshot: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  }
  return { mockPrisma, stateRef }
})

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import {
  finalizeCompositeAttemptIfReady,
  getAttemptState,
  getDefaultPackageAnalysisSnapshot,
  reanalyzePackageAttempt,
} from '../../modules/composite/composite.service'

const makeState = (overrides: Record<string, unknown> = {}) => ({
  id: 'attempt-1',
  compositeAssessmentId: 'composite-1',
  userId: 'student-1',
  recoveryTokenHash: null,
  anonymousCode: null,
  status: 'IN_PROGRESS',
  progress: 0,
  completedItems: 0,
  startedAt: new Date('2026-08-24T12:00:00Z'),
  lastSavedAt: new Date('2026-08-24T12:00:00Z'),
  completedAt: null,
  totalTime: null,
  compositeAssessment: {
    id: 'composite-1',
    name: 'collection-only',
    instruction: null,
    reportPackageKey: null,
    reportPackageVersion: null,
    reportPackageProfile: null,
    reportPackageSnapshotEncrypted: null,
    items: [{
      id: 'item-form',
      type: 'FORM',
      position: 0,
      required: true,
      formType: 'text',
      formLabel: '年级',
      formPlaceholder: null,
      formOptions: null,
      scale: null,
      cognitiveAssignment: null,
    }],
  },
  scaleAssessments: [],
  cognitiveSessions: [],
  formAnswers: [{ itemId: 'item-form', value: '三年级', completed: true }],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  stateRef.current = makeState()
  mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => unknown) => callback(mockPrisma))
  mockPrisma.$queryRaw.mockResolvedValue([{ id: 'attempt-1' }])
  mockPrisma.compositeAssessmentAttempt.findUnique.mockImplementation(async (args: any) => {
    if (args.select) {
      return {
        status: stateRef.current.status,
        progress: stateRef.current.progress,
        completedAt: stateRef.current.completedAt,
      }
    }
    return stateRef.current
  })
  mockPrisma.compositeAssessmentAttempt.update.mockImplementation(async ({ data }: any) => {
    stateRef.current = { ...stateRef.current, ...data }
    return stateRef.current
  })
  mockPrisma.compositeAssessmentAttempt.updateMany.mockResolvedValue({ count: 1 })
})

describe('PR8 Attempt finalization boundary', () => {
  it('completes collection-only attempts without creating an analysis snapshot', async () => {
    await finalizeCompositeAttemptIfReady('attempt-1')
    const result = await getAttemptState('attempt-1', { userId: 'student-1' })

    expect(result).toMatchObject({
      status: 'COMPLETED',
      progress: 100,
      completedItems: 1,
      totalItems: 1,
    })
    expect(mockPrisma.compositeAnalysisSnapshot.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.compositeAssessmentAttempt.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED', progress: 100 }),
    }))
  })

  it('does not complete a package attempt when the required frozen snapshot is invalid', async () => {
    stateRef.current = makeState({
      compositeAssessment: {
        ...stateRef.current.compositeAssessment,
        reportPackageKey: 'attention_stability_v1',
        reportPackageVersion: '1.0.0',
        reportPackageProfile: 'standard',
        reportPackageSnapshotEncrypted: encryptCognitivePayload({ malformed: true }),
      },
    })

    await expect(finalizeCompositeAttemptIfReady('attempt-1')).rejects.toThrow()
    await expect(getAttemptState('attempt-1', { userId: 'student-1' })).resolves.toMatchObject({ status: 'IN_PROGRESS' })
    expect(stateRef.current.status).toBe('IN_PROGRESS')
    expect(mockPrisma.compositeAnalysisSnapshot.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.compositeAssessmentAttempt.update).not.toHaveBeenCalled()
  })

  it('does not fall back to live analysis when the default completion snapshot is absent', async () => {
    stateRef.current = makeState({
      status: 'COMPLETED',
      progress: 100,
      completedItems: 1,
      completedAt: new Date('2026-08-24T12:02:00Z'),
      compositeAssessment: {
        ...stateRef.current.compositeAssessment,
        reportPackageKey: 'attention_stability_v1',
        reportPackageVersion: '1.0.0',
        reportPackageProfile: 'standard',
        reportPackageSnapshotEncrypted: encryptCognitivePayload({
          snapshotVersion: 1,
          packageKey: 'attention_stability_v1',
          packageVersion: '1.0.0',
          profile: 'standard',
          packageDefinition: { reportDefinitionVersion: 'report-package-v1' },
          analysisProtocolSnapshot: {
            snapshotVersion: 1,
            protocolKey: 'attention_stability_v1',
            protocolVersion: '1.0.0',
            protocolDefinition: {
              domainDefinitionVersion: '1.0.0',
              evidenceMappingVersion: '1.0.0',
              recommendationRuleVersion: '1.0.0',
            },
          },
        }),
      },
    })
    mockPrisma.compositeAnalysisSnapshot.findFirst.mockResolvedValue(null)

    await expect(getDefaultPackageAnalysisSnapshot('attempt-1', { userId: 'student-1' }))
      .rejects.toThrow('缺少完成时分析快照')
  })

  it.each([
    ['reportPackageKey', { reportPackageKey: 'attention_stability_v1' }],
    ['reportPackageVersion', { reportPackageVersion: '1.0.0' }],
    ['reportPackageProfile', { reportPackageProfile: 'standard' }],
    ['reportPackageSnapshotEncrypted', { reportPackageSnapshotEncrypted: 'ciphertext' }],
  ])('rejects package metadata with only %s present', async (_field, partial) => {
    stateRef.current = makeState({
      status: 'COMPLETED',
      progress: 100,
      completedItems: 1,
      completedAt: new Date('2026-08-24T12:02:00Z'),
      compositeAssessment: {
        ...stateRef.current.compositeAssessment,
        ...partial,
      },
    })

    await expect(getDefaultPackageAnalysisSnapshot('attempt-1', { userId: 'student-1' }))
      .rejects.toThrow('报告包冻结信息不完整')
  })

  it('limits explicit reanalysis to administrators', async () => {
    await expect(reanalyzePackageAttempt('teacher-1', UserRole.TEACHER, 'attempt-1'))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
