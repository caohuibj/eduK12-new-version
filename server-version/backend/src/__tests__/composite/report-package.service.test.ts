import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { freezeAssignmentProfile, freezeDataForWrite } from '../../modules/cognitive/profile-freeze'
import {
  buildFrozenReportPackageSnapshot,
  encryptFrozenAnalysisProtocolSnapshot,
  encryptFrozenReportPackageSnapshot,
  readFrozenAnalysisProtocolSnapshot,
  readFrozenReportPackageSnapshot,
} from '../../modules/cognitive-analysis'

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

import { buildCompositeReport, copyComposite, createComposite, getCompositeForTeacher, publishComposite } from '../../modules/composite/composite.service'

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
})

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

const fakeConfig = {
  trialCount: 3,
  trialDurationMs: 1000,
  allowPractice: false,
  maxRtMs: 60000,
}

const frozenAssignment = () => {
  const entry = getCognitiveRegistryEntry('fake', '1.0.0', '1.0.0')
  if (!entry) throw new Error('fake registry entry missing')
  return freezeDataForWrite(freezeAssignmentProfile({ entry, baseConfig: fakeConfig, profile: 'standard' }))
}

const packageItem = () => ({
  id: 'item-1',
  compositeAssessmentId: 'composite-1',
  type: 'COGNITIVE',
  position: 0,
  required: true,
  cognitiveAssignmentId: 'assignment-1',
  cognitiveAssignment: {
    id: 'assignment-1',
    courseId: 'course-1',
    createdBy: 'teacher-1',
    title: 'Live wrapper title',
    instruction: '说明',
    status: 'PUBLISHED',
    listedStandalone: false,
    configId: 'config-1',
    config: {
      id: 'config-1',
      testType: 'fake',
      configVersion: '1.0.0',
      status: 'PUBLISHED',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      config: fakeConfig,
      name: 'Fake',
      instruction: '说明',
    },
    ...frozenAssignment(),
  },
})

const scaleSlot = {
  key: 'adexi_inhibition',
  label: 'ADEXI 抑制自评',
  position: 1,
  required: true as const,
  mappingKey: 'adexi_v1.inhibition.response_inhibition.v1',
  mappingVersion: '1.0.0',
  expectedScaleCode: 'adexi_v1',
  expectedDimensionCode: 'inhibition',
  respondentType: 'participant_self_report' as const,
  valueSelector: 'dimensionScore' as const,
}

const scaleProtocol = {
  ...protocol,
  key: 'inhibitory_control_multisource_v1',
  name: '抑制控制跨来源画像',
  cognitiveSlots: protocol.cognitiveSlots,
  scaleSlots: [scaleSlot],
  outputDomains: ['response_inhibition' as const],
}

const scalePackageDefinition = {
  ...packageDefinition,
  key: scaleProtocol.key,
  name: scaleProtocol.name,
  slots: [...scaleProtocol.cognitiveSlots, scaleSlot],
  analysisProtocolKey: scaleProtocol.key,
}

const adexiScale = (status = 'PUBLISHED') => ({
  id: 'scale-adexi',
  code: 'adexi_v1',
  name: 'ADEXI',
  description: 'draft fixture',
  status,
  visibility: 'HIDDEN',
  config: { respondentType: 'participant_self_report' },
  estimatedTime: 5,
  instruction: 'self report',
  tags: ['ADEXI'],
  dimensions: [{
    id: 'dimension-inhibition',
    code: 'inhibition',
    name: '抑制',
    description: 'self-report inhibition',
    scoringMethod: 'sum',
    weight: 1,
    minScore: 1,
    maxScore: 5,
    levelFeedback: null,
  }],
  items: [{
    id: 'scale-item-1',
    itemCode: 'ADEXI-01',
    content: 'draft item',
    type: 'single',
    reverse: false,
    required: true,
    weight: 1,
    sortOrder: 0,
    options: [{ value: 1, label: '1' }],
    randomizeOptions: false,
    itemDimensions: [{ dimensionId: 'dimension-inhibition', weight: 1, reverse: false }],
  }],
})

const scalePackageComposite = (status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED') => {
  const cognitiveItem = packageItem()
  const scaleItem = {
    id: 'item-scale',
    compositeAssessmentId: 'composite-1',
    type: 'SCALE',
    position: 1,
    required: true,
    scaleId: 'scale-adexi',
    scale: adexiScale(),
    cognitiveAssignment: null,
  }
  const items = [cognitiveItem, scaleItem]
  const snapshot = buildFrozenReportPackageSnapshot(scalePackageDefinition, scaleProtocol, items)
  return {
    ...frozenPackageComposite(status),
    name: scalePackageDefinition.name,
    status,
    reportPackageKey: scalePackageDefinition.key,
    reportPackageVersion: scalePackageDefinition.version,
    reportPackageSnapshotEncrypted: status === 'PUBLISHED' ? encryptFrozenReportPackageSnapshot(snapshot) : null,
    analysisProtocolKey: scaleProtocol.key,
    analysisProtocolVersion: scaleProtocol.version,
    analysisProtocolSnapshotEncrypted: status === 'PUBLISHED'
      ? encryptFrozenAnalysisProtocolSnapshot(snapshot.analysisProtocolSnapshot)
      : null,
    items,
  }
}

const frozenPackageComposite = (status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED') => {
  const item = packageItem()
  const snapshot = buildFrozenReportPackageSnapshot(packageDefinition, protocol, [item])
  return {
    id: 'composite-1',
    code: 'PKG-1',
    name: '固定包',
    description: null,
    instruction: null,
    status,
    courseId: 'course-1',
    createdBy: 'teacher-1',
    maxAttempts: 1,
    publicEnabled: false,
    copyable: false,
    reportPackageKey: packageDefinition.key,
    reportPackageVersion: packageDefinition.version,
    reportPackageProfile: 'standard',
    reportPackageSnapshotEncrypted: status === 'PUBLISHED' ? encryptFrozenReportPackageSnapshot(snapshot) : null,
    analysisProtocolKey: protocol.key,
    analysisProtocolVersion: protocol.version,
    analysisProtocolSnapshotEncrypted: status === 'PUBLISHED'
      ? encryptFrozenAnalysisProtocolSnapshot(snapshot.analysisProtocolSnapshot)
      : null,
    publishedAt: status === 'PUBLISHED' ? new Date('2026-08-24T12:00:00Z') : null,
    createdAt: new Date('2026-08-24T10:00:00Z'),
    updatedAt: new Date('2026-08-24T10:00:00Z'),
    creator: { id: 'teacher-1', role: UserRole.TEACHER },
    course: { id: 'course-1', creatorId: 'teacher-1', isLibrary: false, title: 'Course' },
    items: [item],
  }
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
    engineVersion: '1.0.0', scoringVersion: '1.0.0', config: fakeConfig,
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

  it('publishes a package instance with both immutable snapshots', async () => {
    const draft = frozenPackageComposite('DRAFT')
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draft)
    mockPrisma.compositeAssessment.update.mockResolvedValue({
      ...draft,
      status: 'PUBLISHED',
      reportPackageSnapshotEncrypted: 'package-cipher',
      analysisProtocolSnapshotEncrypted: 'protocol-cipher',
    })

    await publishComposite('teacher-1', UserRole.TEACHER, draft.id)

    const update = mockPrisma.compositeAssessment.update.mock.calls[0][0]
    expect(update.data.status).toBe('PUBLISHED')
    expect(typeof update.data.reportPackageSnapshotEncrypted).toBe('string')
    expect(typeof update.data.analysisProtocolSnapshotEncrypted).toBe('string')
    const packageSnapshot = readFrozenReportPackageSnapshot(update.data.reportPackageSnapshotEncrypted)
    expect(packageSnapshot.packageKey).toBe(packageDefinition.key)
    expect(packageSnapshot.profile).toBe('standard')
    expect(packageSnapshot.packageDefinition.slots[0].label).toBe('Fake')
    const protocolSnapshot = readFrozenAnalysisProtocolSnapshot(update.data.analysisProtocolSnapshotEncrypted)
    expect(protocolSnapshot.protocolKey).toBe(protocol.key)
  })

  it('rejects publish when a package slot is missing or not required', async () => {
    const draft = frozenPackageComposite('DRAFT')
    draft.items[0].required = false
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draft)

    await expect(publishComposite('teacher-1', UserRole.TEACHER, draft.id)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.compositeAssessment.update).not.toHaveBeenCalled()
  })

  it('rejects extra, misordered, and version-mismatched package slots', async () => {
    const cases: Array<[string, (draft: any) => void]> = [
      ['misordered', (draft) => { draft.items[0].position = 1 }],
      ['extra', (draft) => { draft.items.push({ ...packageItem(), id: 'item-2', position: 1 }) }],
      ['version-mismatched', (draft) => { draft.items[0].cognitiveAssignment.config.configVersion = '9.9.9' }],
    ]

    for (const [, mutate] of cases) {
      vi.clearAllMocks()
      packageMock.mockReturnValue(packageDefinition)
      protocolMock.mockReturnValue(protocol)
      mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-1', creatorId: 'teacher-1', isLibrary: false })
      const draft = frozenPackageComposite('DRAFT')
      mutate(draft)
      mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draft)
      await expect(publishComposite('teacher-1', UserRole.TEACHER, draft.id)).rejects.toMatchObject({ statusCode: 400 })
      expect(mockPrisma.compositeAssessment.update).not.toHaveBeenCalled()
    }
  })

  it('rejects a package Profile that disagrees with the materialized slot freeze', async () => {
    const draft = frozenPackageComposite('DRAFT')
    draft.reportPackageProfile = 'research'
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draft)

    await expect(publishComposite('teacher-1', UserRole.TEACHER, draft.id)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.compositeAssessment.update).not.toHaveBeenCalled()
  })

  it('rebuilds the internal protocol snapshot from the package snapshot when they disagree', async () => {
    const draft = frozenPackageComposite('DRAFT')
    const item = packageItem()
    const packageSnapshot = buildFrozenReportPackageSnapshot(packageDefinition, protocol, [item])
    draft.reportPackageSnapshotEncrypted = encryptFrozenReportPackageSnapshot(packageSnapshot)
    draft.analysisProtocolSnapshotEncrypted = encryptFrozenAnalysisProtocolSnapshot({
      ...packageSnapshot.analysisProtocolSnapshot,
      protocolKey: 'wrong-protocol',
    })
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draft)
    mockPrisma.compositeAssessment.update.mockResolvedValue(draft)

    await publishComposite('teacher-1', UserRole.TEACHER, draft.id)

    const update = mockPrisma.compositeAssessment.update.mock.calls[0][0]
    expect(readFrozenAnalysisProtocolSnapshot(update.data.analysisProtocolSnapshotEncrypted).protocolKey).toBe(protocol.key)
  })

  it('copies a published package with the exact frozen snapshot and profile', async () => {
    const source = frozenPackageComposite('PUBLISHED')
    mockPrisma.compositeAssessment.findUnique.mockResolvedValueOnce(source).mockResolvedValue(null)
    mockPrisma.compositeAssessment.create.mockResolvedValue({ id: 'copy-1', reportPackageKey: source.reportPackageKey })

    await copyComposite('teacher-1', UserRole.TEACHER, source.id, { code: 'PKG-COPY', name: '复制包' })

    const create = mockPrisma.compositeAssessment.create.mock.calls[0][0]
    expect(create.data.reportPackageKey).toBe(source.reportPackageKey)
    expect(create.data.reportPackageVersion).toBe(source.reportPackageVersion)
    expect(create.data.reportPackageProfile).toBe(source.reportPackageProfile)
    expect(create.data.reportPackageSnapshotEncrypted).toBe(source.reportPackageSnapshotEncrypted)
    expect(create.data.analysisProtocolSnapshotEncrypted).toBe(source.analysisProtocolSnapshotEncrypted)
  })

  it('freezes and copies a package scale slot without changing the frozen package', async () => {
    packageMock.mockReturnValue(scalePackageDefinition)
    protocolMock.mockReturnValue(scaleProtocol)
    const draft = scalePackageComposite('DRAFT')
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draft)
    mockPrisma.compositeAssessment.update.mockResolvedValue({ ...draft, status: 'PUBLISHED' })

    await publishComposite('teacher-1', UserRole.TEACHER, draft.id)
    const publishedCipher = mockPrisma.compositeAssessment.update.mock.calls[0][0].data.reportPackageSnapshotEncrypted
    const publishedSnapshot = readFrozenReportPackageSnapshot(publishedCipher)
    expect(publishedSnapshot.analysisProtocolSnapshot.scaleMeasurements?.[0]).toMatchObject({
      slotKey: 'adexi_inhibition',
      scaleId: 'scale-adexi',
      scaleCode: 'adexi_v1',
      dimensionCode: 'inhibition',
      mappingVersion: '1.0.0',
      mappingDomain: 'response_inhibition',
    })

    const source = scalePackageComposite('PUBLISHED')
    mockPrisma.compositeAssessment.findUnique.mockReset()
    mockPrisma.compositeAssessment.findUnique.mockResolvedValueOnce(source).mockResolvedValue(null)
    mockPrisma.compositeAssessment.create.mockResolvedValue({ id: 'copy-scale', reportPackageKey: source.reportPackageKey })
    await copyComposite('teacher-1', UserRole.TEACHER, source.id, { code: 'PKG-SCALE-COPY' })
    const create = mockPrisma.compositeAssessment.create.mock.calls[0][0]
    expect(create.data.reportPackageSnapshotEncrypted).toBe(source.reportPackageSnapshotEncrypted)
    expect(create.data.items.create).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'SCALE', position: 1, scaleId: 'scale-adexi' }),
    ]))
  })

  it('blocks a new copy after the current scale is retired while keeping historical unit reporting readable', async () => {
    packageMock.mockReturnValue(scalePackageDefinition)
    protocolMock.mockReturnValue(scaleProtocol)
    const source = scalePackageComposite('PUBLISHED')
    source.items[1].scale.status = 'DEPRECATED'
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(source)

    await expect(copyComposite('teacher-1', UserRole.TEACHER, source.id, { code: 'PKG-SCALE-COPY' }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.compositeAssessment.create).not.toHaveBeenCalled()

    const historical = buildCompositeReport({
      id: 'attempt-scale-history',
      anonymousCode: null,
      completedAt: new Date('2026-08-25T00:00:00Z'),
      totalTime: 10,
      compositeAssessment: source,
      scaleAssessments: [{
        compositeItemId: 'item-scale',
        scores: [{ dimensionId: 'dimension-inhibition', rawScore: 3 }],
        feedback: { overall: '', dimensions: [{ dimensionId: 'dimension-inhibition', score: 3, suggestions: [] }] },
        completedAt: new Date('2026-08-25T00:00:00Z'),
        totalTime: 10,
      }],
      cognitiveSessions: [],
      formAnswers: [],
    })
    expect(historical.unitReports).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'SCALE', scaleCode: 'adexi_v1' }),
    ]))
  })

  it('revocation blocks new package copies while an existing package remains readable', async () => {
    const source = frozenPackageComposite('PUBLISHED')
    grantMock.mockResolvedValue(false)
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(source)

    await expect(copyComposite('teacher-1', UserRole.TEACHER, source.id, { code: 'PKG-COPY' })).rejects.toMatchObject({ statusCode: 403 })
    expect(mockPrisma.compositeAssessment.create).not.toHaveBeenCalled()

    // Publishing/read paths do not re-check the grant: revocation only stops
    // creation of new instances, not the already-authorized package history.
    mockPrisma.compositeAssessmentAttempt.groupBy.mockResolvedValue([])
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(source)
    await expect(getCompositeForTeacher('teacher-1', UserRole.TEACHER, source.id)).resolves.toMatchObject({
      reportPackage: { key: source.reportPackageKey, version: source.reportPackageVersion, frozen: true },
    })

    const existing = frozenPackageComposite('DRAFT')
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(existing)
    mockPrisma.compositeAssessment.update.mockResolvedValue({ ...existing, status: 'PUBLISHED' })
    await expect(publishComposite('teacher-1', UserRole.TEACHER, existing.id)).resolves.toBeDefined()
    expect(grantMock).toHaveBeenCalledTimes(1)
  })

  it('uses the frozen package slot label in reports after the wrapper title changes', async () => {
    const source = frozenPackageComposite('PUBLISHED')
    source.items[0].cognitiveAssignment.title = 'Changed live wrapper title'
    const report = buildCompositeReport({
      id: 'attempt-1',
      anonymousCode: null,
      completedAt: null,
      totalTime: null,
      compositeAssessment: source,
      scaleAssessments: [],
      cognitiveSessions: [],
      formAnswers: [],
    })

    expect(report.unitReports[0].label).toBe('Fake')
  })
})
