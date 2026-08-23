import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
process.env.COGNITIVE_MODULE_ENABLED = 'true'

const { mockPrisma, getProtocolMock } = vi.hoisted(() => ({
  mockPrisma: {
    compositeAssessment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    compositeAssessmentItem: { create: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
    compositeAssessmentAttempt: { groupBy: vi.fn() },
    cognitiveTestConfig: { findUnique: vi.fn() },
    cognitiveAssignment: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    scale: { findUnique: vi.fn() },
    materialGrant: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  getProtocolMock: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../modules/cognitive-analysis/analysis-protocol.registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../modules/cognitive-analysis/analysis-protocol.registry')>()),
  getAnalysisProtocolDefinition: getProtocolMock,
}))

import {
  addItem,
  copyComposite,
  createComposite,
  publishComposite,
  removeItem,
  reorderItems,
  setCompositeAnalysisProtocol,
} from '../../modules/composite/composite.service'
import { freezeAssignmentProfile, freezeDataForWrite } from '../../modules/cognitive/profile-freeze'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import {
  buildFrozenAnalysisProtocolSnapshot,
  encryptFrozenAnalysisProtocolSnapshot,
  readFrozenAnalysisProtocolSnapshot,
} from '../../modules/cognitive-analysis/protocol-freeze'
import type { AnalysisProtocolDefinition } from '../../modules/cognitive-analysis/cognitive-analysis.types'

const TEACHER = UserRole.TEACHER
const fakeConfig = {
  id: 'config-fake',
  testType: 'fake',
  configVersion: '1.0.0',
  name: 'Fake',
  instruction: null,
  status: 'PUBLISHED',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
}

const protocol: AnalysisProtocolDefinition = {
  key: 'test_protocol_v1',
  version: '1.0.0',
  status: 'PUBLISHED',
  name: '测试协议',
  description: '测试固定协议',
  recommendedForCreate: true,
  profiles: ['standard', 'research'],
  estimatedMinutes: { standard: [1, 2], research: [2, 3] },
  cognitiveSlots: [{
    key: 'fake',
    label: 'Fake',
    position: 0,
    required: true,
    testType: 'fake',
    configVersion: '1.0.0',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    profileDefinitionVersion: '1.0.0',
    metricDefinitionVersion: '1.0.0',
    qualityDefinitionVersion: '1.0.0',
    reportDefinitionVersion: '1.0.0',
  }],
  scaleSlots: [],
  outputDomains: ['processing_speed'],
  domainDefinitionVersion: '1.0.0',
  evidenceMappingVersion: '1.0.0',
  recommendationRuleVersion: '1.0.0',
}

const frozenAssignment = (profile: 'standard' | 'research' = 'standard') => {
  const entry = requireCognitiveRegistryEntry('fake', '1.0.0', '1.0.0')
  const freeze = freezeDataForWrite(freezeAssignmentProfile({
    entry,
    baseConfig: fakeConfig.config,
    profile,
  }))
  return {
    id: 'assignment-protocol',
    courseId: 'course-1',
    createdBy: 'teacher-1',
    status: 'PUBLISHED',
    title: 'Fake',
    configId: fakeConfig.id,
    config: fakeConfig,
    ...freeze,
  }
}

const draftComposite = (overrides: Record<string, unknown> = {}) => ({
  id: 'composite-1',
  code: 'C-1',
  name: '综合测评',
  status: 'DRAFT',
  courseId: 'course-1',
  createdBy: 'teacher-1',
  publicEnabled: false,
  expiresAt: null,
  analysisProtocolKey: null,
  analysisProtocolVersion: null,
  analysisProtocolSnapshotEncrypted: null,
  items: [],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  getProtocolMock.mockImplementation((key: string, version: string) =>
    key === protocol.key && version === protocol.version ? protocol : undefined,
  )
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
  mockPrisma.course.findUnique.mockResolvedValue({
    id: 'course-1',
    title: '课程',
    courseCode: 'C1',
    creatorId: 'teacher-1',
    isLibrary: false,
  })
  mockPrisma.compositeAssessment.findUnique.mockResolvedValue(null)
  mockPrisma.compositeAssessment.create.mockResolvedValue({ id: 'composite-1' })
  mockPrisma.compositeAssessment.update.mockResolvedValue({ id: 'composite-1' })
  mockPrisma.compositeAssessmentAttempt.groupBy.mockResolvedValue([])
  mockPrisma.compositeAssessmentItem.create.mockResolvedValue({ id: 'item-1' })
  mockPrisma.compositeAssessmentItem.deleteMany.mockResolvedValue({ count: 1 })
  mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(fakeConfig)
  mockPrisma.cognitiveAssignment.findMany.mockResolvedValue([])
  mockPrisma.cognitiveAssignment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'assignment-protocol',
    ...data,
  }))
})

describe('Composite analysis protocol selection', () => {
  it('keeps collection-only creation compatible and does not create fixed items', async () => {
    await createComposite('teacher-1', TEACHER, {
      code: 'C-1',
      name: '综合测评',
      courseId: 'course-1',
      maxAttempts: 1,
      publicEnabled: false,
    })
    expect(mockPrisma.compositeAssessment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        analysisProtocolKey: null,
        analysisProtocolVersion: null,
        analysisProtocolSnapshotEncrypted: null,
      }),
    }))
    expect(mockPrisma.compositeAssessmentItem.create).not.toHaveBeenCalled()
  })

  it('materializes exact required assignments and items for a published protocol', async () => {
    await createComposite('teacher-1', TEACHER, {
      code: 'C-1',
      name: '综合测评',
      courseId: 'course-1',
      maxAttempts: 1,
      publicEnabled: false,
      analysisProtocol: { key: protocol.key, version: protocol.version, profile: 'standard' },
    })
    expect(mockPrisma.cognitiveAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ profile: 'standard', resolvedConfigHash: expect.any(String) }),
    }))
    expect(mockPrisma.compositeAssessmentItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        compositeAssessmentId: 'composite-1',
        type: 'COGNITIVE',
        position: 0,
        required: true,
        cognitiveAssignmentId: 'assignment-protocol',
      }),
    })
  })

  it('requires a course and refuses a collection draft that already has arbitrary items', async () => {
    await expect(createComposite('teacher-1', TEACHER, {
      code: 'C-1',
      name: '综合测评',
      courseId: null,
      maxAttempts: 1,
      publicEnabled: false,
      analysisProtocol: { key: protocol.key, version: protocol.version, profile: 'standard' },
    })).rejects.toMatchObject({ statusCode: 400 })

    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{ id: 'form-1', type: 'FORM', position: 0 }],
    }))
    await expect(setCompositeAnalysisProtocol('teacher-1', TEACHER, 'composite-1', {
      analysisProtocol: { key: protocol.key, version: protocol.version, profile: 'standard' },
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('keeps fixed protocol items locked until switching back to collection-only', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      analysisProtocolKey: protocol.key,
      analysisProtocolVersion: protocol.version,
      items: [{ id: 'item-1', type: 'COGNITIVE', position: 0 }],
    }))

    await expect(addItem('teacher-1', TEACHER, 'composite-1', {
      type: 'FORM',
      formType: 'text_input',
      formLabel: '备注',
      required: true,
    })).rejects.toMatchObject({ statusCode: 409 })
    await expect(removeItem('teacher-1', TEACHER, 'composite-1', 'item-1')).rejects.toMatchObject({ statusCode: 409 })
    await expect(reorderItems('teacher-1', TEACHER, 'composite-1', [{ id: 'item-1', position: 0 }]))
      .rejects.toMatchObject({ statusCode: 409 })

    await setCompositeAnalysisProtocol('teacher-1', TEACHER, 'composite-1', { analysisProtocol: null })
    expect(mockPrisma.compositeAssessment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        analysisProtocolKey: null,
        analysisProtocolVersion: null,
        analysisProtocolSnapshotEncrypted: null,
      },
    }))
  })

  it('re-materializes every fixed item when changing profile', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      analysisProtocolKey: protocol.key,
      analysisProtocolVersion: protocol.version,
      items: [{ id: 'item-1', type: 'COGNITIVE', position: 0 }],
    }))

    await setCompositeAnalysisProtocol('teacher-1', TEACHER, 'composite-1', {
      analysisProtocol: { key: protocol.key, version: protocol.version, profile: 'research' },
    })
    expect(mockPrisma.compositeAssessmentItem.deleteMany).toHaveBeenCalledWith({
      where: { compositeAssessmentId: 'composite-1' },
    })
    expect(mockPrisma.cognitiveAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ profile: 'research' }),
    }))
  })
})

describe('Composite analysis protocol publish freeze', () => {
  it('freezes an exact protocol snapshot when publishing', async () => {
    const assignment = frozenAssignment('standard')
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      analysisProtocolKey: protocol.key,
      analysisProtocolVersion: protocol.version,
      items: [{
        id: 'item-1',
        type: 'COGNITIVE',
        position: 0,
        required: true,
        cognitiveAssignment: assignment,
      }],
    }))

    mockPrisma.compositeAssessment.update.mockResolvedValue({
      id: 'composite-1',
      status: 'PUBLISHED',
      analysisProtocolSnapshotEncrypted: 'database-cipher',
    })
    const published = await publishComposite('teacher-1', TEACHER, 'composite-1')
    const update = mockPrisma.compositeAssessment.update.mock.calls.at(-1)?.[0]
    const encrypted = update.data.analysisProtocolSnapshotEncrypted
    const snapshot = readFrozenAnalysisProtocolSnapshot(encrypted)
    expect(snapshot).toMatchObject({
      protocolKey: protocol.key,
      protocolVersion: protocol.version,
      profile: 'standard',
      cognitiveMeasurements: [{ slotKey: 'fake', resolvedConfigHash: assignment.resolvedConfigHash }],
    })
    expect(published).not.toHaveProperty('analysisProtocolSnapshotEncrypted')
  })

  it('rejects mismatched profile and missing protocol fields', async () => {
    const assignment = frozenAssignment('standard')
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      analysisProtocolKey: protocol.key,
      analysisProtocolVersion: null,
      items: [{
        id: 'item-1',
        type: 'COGNITIVE',
        position: 0,
        required: true,
        cognitiveAssignment: assignment,
      }],
    }))
    await expect(publishComposite('teacher-1', TEACHER, 'composite-1'))
      .rejects.toMatchObject({ statusCode: 400 })

    const researchOnly = { ...protocol, profiles: ['research'] as const }
    getProtocolMock.mockReturnValue(researchOnly)
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      analysisProtocolKey: protocol.key,
      analysisProtocolVersion: protocol.version,
      items: [{
        id: 'item-1',
        type: 'COGNITIVE',
        position: 0,
        required: true,
        cognitiveAssignment: assignment,
      }],
    }))
    await expect(publishComposite('teacher-1', TEACHER, 'composite-1'))
      .rejects.toThrow(/协议不允许 Profile/)
  })

  it('publishes legacy collection-only composites without an analysis snapshot', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{ type: 'SCALE', required: true, scale: { id: 'scale-1', status: 'PUBLISHED' } }],
    }))
    await publishComposite('teacher-1', TEACHER, 'composite-1')
    expect(mockPrisma.compositeAssessment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ analysisProtocolSnapshotEncrypted: null }),
    }))
  })

  it.each([
    ['optional item', { required: false }],
    ['wrong position', { position: 1 }],
    ['wrong config version', { cognitiveAssignment: { config: { ...fakeConfig, configVersion: '9.9.9' } } }],
  ])('rejects a protocol with %s', async (_label, itemOverride) => {
    const assignment = frozenAssignment('standard')
    const assignmentOverride = 'cognitiveAssignment' in itemOverride
      ? { ...assignment, ...itemOverride.cognitiveAssignment }
      : assignment
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      analysisProtocolKey: protocol.key,
      analysisProtocolVersion: protocol.version,
      items: [{
        id: 'item-1',
        type: 'COGNITIVE',
        position: 0,
        required: true,
        cognitiveAssignment: assignmentOverride,
        ...itemOverride,
      }],
    }))

    await expect(publishComposite('teacher-1', TEACHER, 'composite-1'))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('Composite analysis protocol copy', () => {
  it('preserves and validates the full frozen protocol snapshot on copy', async () => {
    const assignment = frozenAssignment('standard')
    const items = [{
      id: 'item-1',
      type: 'COGNITIVE',
      position: 0,
      required: true,
      cognitiveAssignmentId: assignment.id,
      cognitiveAssignment: assignment,
    }]
    const encrypted = encryptFrozenAnalysisProtocolSnapshot(
      buildFrozenAnalysisProtocolSnapshot(protocol, items),
    )
    mockPrisma.compositeAssessment.findUnique
      .mockResolvedValueOnce(draftComposite({
        status: 'PUBLISHED',
        creator: { id: 'teacher-1', role: TEACHER },
        course: { id: 'course-1', title: '课程', isLibrary: false },
        maxAttempts: 1,
        analysisProtocolKey: protocol.key,
        analysisProtocolVersion: protocol.version,
        analysisProtocolSnapshotEncrypted: encrypted,
        items,
      }))
      .mockResolvedValueOnce(null)
    mockPrisma.compositeAssessment.create.mockResolvedValue({
      id: 'copy-1',
      status: 'DRAFT',
      analysisProtocolSnapshotEncrypted: encrypted,
    })

    const copied = await copyComposite('teacher-1', TEACHER, 'composite-1', { courseId: 'course-1' })
    expect(mockPrisma.compositeAssessment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        analysisProtocolKey: protocol.key,
        analysisProtocolVersion: protocol.version,
        analysisProtocolSnapshotEncrypted: encrypted,
      }),
    }))
    expect(copied).not.toHaveProperty('analysisProtocolSnapshotEncrypted')
  })

  it('rejects a published protocol source without its frozen snapshot', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      status: 'PUBLISHED',
      creator: { id: 'teacher-1', role: TEACHER },
      course: { id: 'course-1', title: '课程', isLibrary: false },
      analysisProtocolKey: protocol.key,
      analysisProtocolVersion: protocol.version,
      analysisProtocolSnapshotEncrypted: null,
      items: [],
    }))

    await expect(copyComposite('teacher-1', TEACHER, 'composite-1', { courseId: 'course-1' }))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})
