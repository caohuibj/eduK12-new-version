import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
process.env.COGNITIVE_MODULE_ENABLED = 'true'

const { mockPrisma, state } = vi.hoisted(() => ({
  mockPrisma: {
    compositeAssessment: { findUnique: vi.fn() },
    compositeAssessmentAttempt: { findUnique: vi.fn() },
    compositeAnalysisSnapshot: { findFirst: vi.fn(), findMany: vi.fn() },
  },
  state: { attempt: null as any },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { UserRole } from '@prisma/client'
import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import {
  getAnalysisExportForParticipant,
  getAnalysisExportForTeacher,
  getReport,
  getReportForTeacher,
  listPackageAnalysisSnapshotsForTeacher,
} from '../../modules/composite/composite.service'

const packageSnapshot = {
  snapshotVersion: 1,
  packageKey: 'attention_stability_v1',
  packageVersion: '1.0.0',
  profile: 'standard',
  packageDefinition: { name: '注意稳定性报告包', reportDefinitionVersion: 'report-package-v1' },
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
}

const analysis = {
  packageKey: 'attention_stability_v1',
  packageVersion: '1.0.0',
  analysisProtocolKey: 'attention_stability_v1',
  analysisProtocolVersion: '1.0.0',
  profile: 'standard',
  analysisVersion: 'cognitive-evidence-domain-v1.0.1',
  reportSchemaVersion: 'cognitive-package-analysis-v1',
  qualitySummary: { interpretableModules: 0, excludedModules: [], warnings: [] },
  evidence: [],
  cognitiveDomains: [],
  crossSourceFindings: [],
  recommendations: [],
  limitations: ['不作诊断。'],
  provenance: {
    attemptId: 'attempt-1',
    assessmentId: 'composite-1',
    packageKey: 'attention_stability_v1',
    packageVersion: '1.0.0',
    packageSnapshotVersion: '1',
    analysisProtocolKey: 'attention_stability_v1',
    analysisProtocolVersion: '1.0.0',
    analysisProtocolSnapshotVersion: '1',
    profile: 'standard',
    packageReportDefinitionVersion: 'report-package-v1',
    domainDefinitionVersion: '1.0.0',
    evidenceMappingVersion: '1.0.0',
    recommendationRuleVersion: '1.0.0',
  },
}

const row = (id: string, generationReason: 'COMPLETION' | 'REANALYSIS', createdAt: string) => ({
  id,
  attemptId: 'attempt-1',
  packageKey: 'attention_stability_v1',
  packageVersion: '1.0.0',
  analysisDefinitionVersion: '1.0.0',
  analysisVersion: 'cognitive-evidence-domain-v1.0.1',
  reportSchemaVersion: 'cognitive-package-analysis-v1',
  inputFingerprint: id.repeat(64).slice(0, 64),
  generationReason,
  generatedBy: generationReason === 'REANALYSIS' ? 'admin-1' : null,
  payloadEncrypted: encryptCognitivePayload(analysis),
  createdAt: new Date(createdAt),
})

const attempt = () => ({
  id: 'attempt-1',
  compositeAssessmentId: 'composite-1',
  userId: 'student-1',
  recoveryTokenHash: null,
  anonymousCode: null,
  status: 'COMPLETED',
  completedAt: new Date('2026-08-25T00:00:00Z'),
  totalTime: 100,
  compositeAssessment: {
    id: 'composite-1',
    name: '综合测评',
    reportPackageKey: 'attention_stability_v1',
    reportPackageVersion: '1.0.0',
    reportPackageProfile: 'standard',
    reportPackageSnapshotEncrypted: encryptCognitivePayload(packageSnapshot),
    items: [{ id: 'form-1', type: 'FORM', formLabel: '年级' }],
  },
  scaleAssessments: [],
  cognitiveSessions: [],
  formAnswers: [{ itemId: 'form-1', value: '三年级' }],
})

describe('PR9 package report service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.attempt = attempt()
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue({ id: 'composite-1', createdBy: 'teacher-a' })
    mockPrisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(state.attempt)
    mockPrisma.compositeAnalysisSnapshot.findFirst.mockImplementation(async (args: any) => {
      if (args.where.id === 'snapshot-reanalysis') return row('snapshot-reanalysis', 'REANALYSIS', '2026-08-25T02:00:00Z')
      if (args.where.generationReason === 'COMPLETION') return row('snapshot-completion', 'COMPLETION', '2026-08-25T01:00:00Z')
      return null
    })
    mockPrisma.compositeAnalysisSnapshot.findMany.mockResolvedValue([
      row('snapshot-reanalysis', 'REANALYSIS', '2026-08-25T02:00:00Z'),
      row('snapshot-completion', 'COMPLETION', '2026-08-25T01:00:00Z'),
    ])
  })

  it('uses completion by default, exact reanalysis when selected, and maps roles', async () => {
    const participant = await getReport('attempt-1', { userId: 'student-1' })
    expect(participant.packageReport).toMatchObject({ audience: 'participant' })
    expect(participant.packageReport).not.toHaveProperty('snapshotId')
    expect(participant.packageReport).not.toHaveProperty('evidence')
    expect(participant).not.toHaveProperty('payloadEncrypted')

    const teacher = await getReportForTeacher('teacher-a', UserRole.TEACHER, 'composite-1', 'attempt-1')
    expect(teacher.packageReport).toMatchObject({ audience: 'teacher', snapshotId: 'snapshot-completion' })

    const selected = await getReportForTeacher('teacher-a', UserRole.TEACHER, 'composite-1', 'attempt-1', 'snapshot-reanalysis')
    expect(selected.packageReport).toMatchObject({ audience: 'teacher', snapshotId: 'snapshot-reanalysis', generationReason: 'REANALYSIS' })

    const researcher = await getReportForTeacher('admin-1', UserRole.ADMIN, 'composite-1', 'attempt-1', 'snapshot-reanalysis')
    expect(researcher.packageReport).toMatchObject({ audience: 'researcher', inputFingerprint: expect.any(String) })
  })

  it('returns owner-filtered history and hides teacher-sensitive metadata', async () => {
    const teacher = await listPackageAnalysisSnapshotsForTeacher('teacher-a', UserRole.TEACHER, 'attempt-1')
    expect(teacher.total).toBe(2)
    expect(teacher.list[0].id).toBe('snapshot-reanalysis')
    expect(teacher.list[0]).not.toHaveProperty('inputFingerprint')
    expect(teacher.list[0]).not.toHaveProperty('generatedBy')
    expect(JSON.stringify(teacher)).not.toContain('payloadEncrypted')

    const admin = await listPackageAnalysisSnapshotsForTeacher('admin-1', UserRole.ADMIN, 'attempt-1')
    expect(admin.list[0]).toHaveProperty('inputFingerprint')
    expect(admin.list[0]).toHaveProperty('generatedBy', 'admin-1')

    mockPrisma.compositeAnalysisSnapshot.findMany.mockResolvedValue([
      { ...row('snapshot-drift', 'REANALYSIS', '2026-08-25T02:00:00Z'), packageVersion: '9.9.9' },
    ])
    await expect(listPackageAnalysisSnapshotsForTeacher('admin-1', UserRole.ADMIN, 'attempt-1'))
      .rejects.toMatchObject({ statusCode: 400 })

    await expect(listPackageAnalysisSnapshotsForTeacher('teacher-b', UserRole.TEACHER, 'attempt-1'))
      .rejects.toMatchObject({ statusCode: 403 })

    state.attempt = {
      ...state.attempt,
      status: 'IN_PROGRESS',
      compositeAssessment: {
        ...state.attempt.compositeAssessment,
        reportPackageKey: null,
        reportPackageVersion: null,
        reportPackageProfile: null,
        reportPackageSnapshotEncrypted: null,
      },
    }
    mockPrisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(state.attempt)
    mockPrisma.compositeAnalysisSnapshot.findMany.mockClear()
    const collection = await listPackageAnalysisSnapshotsForTeacher('teacher-a', UserRole.TEACHER, 'attempt-1')
    expect(collection).toEqual({ list: [], total: 0 })
    expect(mockPrisma.compositeAnalysisSnapshot.findMany).not.toHaveBeenCalled()
  })

  it('does not fall back when an explicit Snapshot is invalid or belongs elsewhere', async () => {
    await expect(getReportForTeacher('admin-1', UserRole.ADMIN, 'composite-other', 'attempt-1'))
      .rejects.toMatchObject({ statusCode: 404 })

    mockPrisma.compositeAnalysisSnapshot.findFirst.mockResolvedValue(null)
    await expect(getReportForTeacher('teacher-a', UserRole.TEACHER, 'composite-1', 'attempt-1', 'snapshot-other'))
      .rejects.toMatchObject({ statusCode: 404 })

    mockPrisma.compositeAnalysisSnapshot.findFirst.mockResolvedValue(null)
    await expect(getReport('attempt-1', { userId: 'student-1' }))
      .rejects.toThrow('缺少完成时分析快照')
  })

  it('uses the completion Snapshot for participant exports and exact history for staff exports', async () => {
    const participant = await getAnalysisExportForParticipant('attempt-1', { userId: 'student-1' })
    expect(participant).toMatchObject({ audience: 'participant', snapshot: { id: 'snapshot-completion' } })

    const teacher = await getAnalysisExportForTeacher(
      'teacher-a',
      UserRole.TEACHER,
      'composite-1',
      'attempt-1',
      'snapshot-reanalysis',
    )
    expect(teacher).toMatchObject({ audience: 'teacher', snapshot: { id: 'snapshot-reanalysis' } })

    await expect(getAnalysisExportForTeacher('teacher-b', UserRole.TEACHER, 'composite-1', 'attempt-1'))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects collection-only analysis exports before Snapshot lookup', async () => {
    state.attempt = {
      ...state.attempt,
      compositeAssessment: {
        ...state.attempt.compositeAssessment,
        reportPackageKey: null,
        reportPackageVersion: null,
        reportPackageProfile: null,
        reportPackageSnapshotEncrypted: null,
      },
    }
    mockPrisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(state.attempt)
    mockPrisma.compositeAnalysisSnapshot.findFirst.mockClear()
    await expect(getAnalysisExportForTeacher('admin-1', UserRole.ADMIN, 'composite-1', 'attempt-1', 'snapshot-1'))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.compositeAnalysisSnapshot.findFirst).not.toHaveBeenCalled()
  })
})
