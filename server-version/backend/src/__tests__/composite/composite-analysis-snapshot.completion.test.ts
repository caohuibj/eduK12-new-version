import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
process.env.COGNITIVE_MODULE_ENABLED = 'true'

const { mockPrisma, buildPackageAnalysisMock, stateRef, snapshotRows } = vi.hoisted(() => {
  const stateRef: { current: any } = { current: null }
  const snapshotRows = new Map<string, any>()
  const buildPackageAnalysisMock = vi.fn()
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
  return { mockPrisma, buildPackageAnalysisMock, stateRef, snapshotRows }
})

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../modules/composite/composite-analysis-snapshot.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../modules/composite/composite-analysis-snapshot.service')>()),
  buildPackageAnalysisForAttempt: buildPackageAnalysisMock,
}))

import {
  getAttemptState,
  reanalyzePackageAttempt,
} from '../../modules/composite/composite.service'
import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'

const analysis = {
  packageKey: 'attention_stability_v1',
  packageVersion: '1.0.0',
  analysisProtocolKey: 'attention_stability_v1',
  analysisProtocolVersion: '1.0.0',
  profile: 'standard',
  analysisVersion: 'cognitive-evidence-domain-v1.0.0',
  reportSchemaVersion: 'cognitive-package-analysis-v1',
  qualitySummary: { interpretableModules: 0, excludedModules: [], warnings: [] },
  evidence: [],
  cognitiveDomains: [],
  crossSourceFindings: [],
  recommendations: [],
  limitations: [],
  provenance: {},
}

const makeState = () => ({
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
    name: 'package',
    instruction: null,
    reportPackageKey: 'attention_stability_v1',
    reportPackageVersion: '1.0.0',
    reportPackageProfile: 'standard',
    reportPackageSnapshotEncrypted: encryptCognitivePayload({ malformed: true }),
    items: [{
      id: 'item-form',
      type: 'FORM',
      position: 0,
      required: true,
      formType: 'text',
      formLabel: '背景',
      formPlaceholder: null,
      formOptions: null,
      scale: null,
      cognitiveAssignment: null,
    }],
  },
  scaleAssessments: [],
  cognitiveSessions: [],
  formAnswers: [{ itemId: 'item-form', value: 'x', completed: true }],
})

beforeEach(() => {
  vi.clearAllMocks()
  snapshotRows.clear()
  stateRef.current = makeState()
  buildPackageAnalysisMock.mockReturnValue({
    packageSnapshot: {},
    moduleResults: [],
    analysis,
    inputFingerprint: 'f'.repeat(64),
  })
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
  mockPrisma.compositeAnalysisSnapshot.findUnique.mockImplementation(async ({ where }: any) => {
    const key = JSON.stringify(where)
    return snapshotRows.get(key) ?? null
  })
  mockPrisma.compositeAnalysisSnapshot.upsert.mockImplementation(async (args: any) => {
    const key = JSON.stringify(args.where)
    const existing = snapshotRows.get(key)
    if (existing) return existing
    const row = {
      id: `snapshot-${snapshotRows.size + 1}`,
      ...args.create,
      createdAt: new Date('2026-08-24T13:00:00Z'),
    }
    snapshotRows.set(key, row)
    return row
  })
})

describe('PR8 package completion transaction', () => {
  it('writes the completion snapshot before marking the Attempt completed and is idempotent', async () => {
    const result = await getAttemptState('attempt-1', { userId: 'student-1' })

    expect(result.status).toBe('COMPLETED')
    expect(mockPrisma.compositeAnalysisSnapshot.upsert).toHaveBeenCalledTimes(1)
    expect(mockPrisma.compositeAnalysisSnapshot.upsert.mock.calls[0][0].create).toMatchObject({
      attemptId: 'attempt-1',
      generationReason: 'COMPLETION',
      packageKey: 'attention_stability_v1',
    })
    expect(mockPrisma.compositeAssessmentAttempt.update.mock.invocationCallOrder[0])
      .toBeGreaterThan(mockPrisma.compositeAnalysisSnapshot.upsert.mock.invocationCallOrder[0])

    await getAttemptState('attempt-1', { userId: 'student-1' })
    expect(mockPrisma.compositeAnalysisSnapshot.upsert).toHaveBeenCalledTimes(1)
  })

  it('uses an explicit REANALYSIS generation reason without overwriting the row', async () => {
    stateRef.current = { ...stateRef.current, status: 'COMPLETED', progress: 100, completedAt: new Date() }

    const result = await reanalyzePackageAttempt('admin-1', UserRole.ADMIN, 'attempt-1')

    expect(result).toMatchObject({
      attemptId: 'attempt-1',
      generationReason: 'REANALYSIS',
      generatedBy: 'admin-1',
      created: true,
    })
    expect(mockPrisma.compositeAnalysisSnapshot.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: {},
      create: expect.objectContaining({ generationReason: 'REANALYSIS', generatedBy: 'admin-1' }),
    }))

    const retry = await reanalyzePackageAttempt('admin-1', UserRole.ADMIN, 'attempt-1')
    expect(retry).toMatchObject({
      id: result.id,
      generationReason: 'REANALYSIS',
      created: false,
    })
    expect(mockPrisma.compositeAnalysisSnapshot.upsert).toHaveBeenCalledTimes(1)
  })
})
