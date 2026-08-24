import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma, packageMock, protocolMock, grantMock } = vi.hoisted(() => ({
  mockPrisma: {
    compositeAssessment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    compositeAssessmentItem: { create: vi.fn(), deleteMany: vi.fn() },
    compositeAssessmentAttempt: { groupBy: vi.fn() },
    cognitiveTestConfig: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  packageMock: vi.fn(),
  protocolMock: vi.fn(),
  grantMock: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../services/materialGrant', () => ({
  canUseReportPackage: grantMock,
  canUseScale: vi.fn().mockResolvedValue(true),
}))
vi.mock('../../modules/cognitive-analysis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../modules/cognitive-analysis')>()),
  getReportPackageDefinition: packageMock,
  getAnalysisProtocolDefinition: protocolMock,
}))
vi.mock('../../modules/cognitive/assignment.service', () => ({
  ensureTeacherPublishedAssignment: vi.fn().mockResolvedValue({
    id: 'assignment-1',
    profile: 'standard',
    profileDefinitionVersion: '1.0.0',
    resolvedConfigSnapshotEncrypted: 'config-cipher',
    resolvedConfigHash: 'config-hash',
    resolvedReportSnapshotEncrypted: 'report-cipher',
  }),
}))

import { createComposite } from '../../modules/composite/composite.service'

const protocol = {
  key: 'attention_stability_v1',
  version: '1.0.0',
  status: 'PUBLISHED' as const,
  name: '注意与稳定性',
  description: '固定包',
  recommendedForCreate: false,
  profiles: ['standard', 'research'] as const,
  estimatedMinutes: { standard: [10, 15] as [number, number], research: [20, 30] as [number, number] },
  cognitiveSlots: [{
    key: 'fake', label: 'Fake', position: 0, required: true as const, testType: 'fake',
    configVersion: '1.0.0', engineVersion: '1.0.0', scoringVersion: '1.0.0',
    profileDefinitionVersion: '1.0.0', metricDefinitionVersion: '1.0.0',
    qualityDefinitionVersion: '1.0.0', reportDefinitionVersion: '1.0.0',
  }],
  scaleSlots: [],
  outputDomains: ['processing_speed' as const],
  domainDefinitionVersion: '1.0.0', evidenceMappingVersion: '1.0.0', recommendationRuleVersion: '1.0.0',
}

const packageDefinition = {
  key: protocol.key,
  version: protocol.version,
  status: 'PUBLISHED' as const,
  name: protocol.name,
  description: protocol.description,
  profiles: [...protocol.profiles],
  estimatedMinutes: protocol.estimatedMinutes,
  slots: protocol.cognitiveSlots,
  analysisProtocolKey: protocol.key,
  analysisProtocolVersion: protocol.version,
  reportDefinitionVersion: 'report-package-v1',
  audience: ['participant', 'teacher', 'researcher'] as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  packageMock.mockReturnValue(packageDefinition)
  protocolMock.mockReturnValue(protocol)
  grantMock.mockResolvedValue(true)
  mockPrisma.$transaction = vi.fn().mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
  mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-1', creatorId: 'teacher-1', isLibrary: false })
  mockPrisma.compositeAssessment.findUnique.mockResolvedValue(null)
  mockPrisma.compositeAssessment.create.mockResolvedValue({ id: 'composite-1', reportPackageKey: packageDefinition.key })
  mockPrisma.compositeAssessmentItem.create.mockResolvedValue({ id: 'item-1' })
  mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue({
    id: 'config-1', testType: 'fake', configVersion: '1.0.0', status: 'PUBLISHED',
    engineVersion: '1.0.0', scoringVersion: '1.0.0', config: {},
  })
})

describe('ReportPackage composite boundary', () => {
  it('rejects a teacher without an exact package grant before creating anything', async () => {
    grantMock.mockResolvedValue(false)
    await expect(createComposite('teacher-1', UserRole.TEACHER, {
      code: 'PKG-1', name: '固定包', courseId: 'course-1', maxAttempts: 1, publicEnabled: false,
      reportPackage: { key: packageDefinition.key, version: packageDefinition.version, profile: 'standard' },
    })).rejects.toMatchObject({ statusCode: 403 })
    expect(mockPrisma.compositeAssessment.create).not.toHaveBeenCalled()
  })

  it('materializes only the exact package slots and records package provenance', async () => {
    await createComposite('teacher-1', UserRole.TEACHER, {
      code: 'PKG-1', name: '固定包', courseId: 'course-1', maxAttempts: 1, publicEnabled: false,
      reportPackage: { key: packageDefinition.key, version: packageDefinition.version, profile: 'standard' },
    })
    expect(mockPrisma.compositeAssessment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        reportPackageKey: packageDefinition.key,
        reportPackageVersion: packageDefinition.version,
        reportPackageProfile: 'standard',
        analysisProtocolKey: protocol.key,
        analysisProtocolVersion: protocol.version,
      }),
    }))
    expect(mockPrisma.compositeAssessmentItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'COGNITIVE', position: 0, required: true }),
    }))
  })
})
