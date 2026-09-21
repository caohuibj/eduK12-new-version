import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { UserRole, CognitiveAssignmentStatus } from '@prisma/client'

// 绝不连真实 DB：mock config/database 单例（vi.hoisted 保证 mock 工厂先于引用初始化）
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    course: { findUnique: vi.fn() },
    cognitiveTestConfig: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    materialGrant: { findUnique: vi.fn(), findMany: vi.fn() },
    cognitiveAssignment: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    courseStudent: { findMany: vi.fn(), findUnique: vi.fn() },
    compositeAssessmentItem: { findFirst: vi.fn() },
  },
}))
vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import {
  createAssignment,
  listPublishedConfigs,
  listTeacherAssignments,
  listStudentAssignments,
  getAssignmentForTeacher,
  getAssignmentForStudent,
  updateDraftAssignment,
  publishAssignment,
  archiveAssignment,
  ensureTeacherPublishedAssignment,
} from '../../modules/cognitive/assignment.service'

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
})

const TEACHER = UserRole.TEACHER
const ADMIN = UserRole.ADMIN
const STUDENT = UserRole.STUDENT

const course = { id: 'course-1', title: 'C1', courseCode: 'CC1', creatorId: 'teacher-1' }
const config = {
  id: 'config-1',
  testType: 'fake',
  configVersion: '1.0.0',
  name: 'Fake 1.0.0',
  status: 'PUBLISHED',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
}
const publishedV2Config = {
  ...config,
  testType: 'reaction',
  configVersion: '1.1.0',
  name: 'Reaction Time 1.1.0',
  scoringVersion: '1.1.0',
  config: {
    totalTrials: 20,
    foreperiodMinMs: 700,
    foreperiodMaxMs: 1500,
    timeoutMs: 2000,
    readyDurationMs: 1000,
    report: {
      reportVersion: '1.1.0',
      referenceMode: 'simulated',
      referenceVersion: 'lit-sim-k12-v0.2',
      referenceBand: 'K7-9',
    },
  },
}
const assignment = {
  id: 'asg-1',
  courseId: 'course-1',
  courseSnapshot: null,
  configId: 'config-1',
  createdBy: 'teacher-1',
  title: 'Fake Assignment',
  instruction: null,
  status: 'DRAFT' as CognitiveAssignmentStatus,
  opensAt: null,
  dueAt: null,
  maxAttempts: 1,
  required: true,
  profile: 'standard',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  publishedAt: null,
}

const baseInput = {
  courseId: 'course-1',
  configId: 'config-1',
  title: 'Fake Assignment',
  maxAttempts: 1,
  required: true,
  profile: 'standard' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.compositeAssessmentItem.findFirst.mockResolvedValue(null)
  mockPrisma.materialGrant.findUnique.mockResolvedValue(null)
  mockPrisma.materialGrant.findMany.mockResolvedValue([])
})

describe('listPublishedConfigs', () => {
  it('hides GRANT configs the teacher cannot instantiate', async () => {
    mockPrisma.cognitiveTestConfig.findMany.mockResolvedValue([
      { id: 'open-1', accessPolicy: 'OPEN' },
    ])
    await listPublishedConfigs('teacher-1', TEACHER)
    expect(mockPrisma.cognitiveTestConfig.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'PUBLISHED',
        OR: [
          { accessPolicy: { not: 'GRANT' } },
          { id: { in: [] } },
        ],
      }),
    }))
  })

  it('does not filter GRANT configs for ADMIN', async () => {
    mockPrisma.cognitiveTestConfig.findMany.mockResolvedValue([])
    await listPublishedConfigs('admin-1', ADMIN)
    expect(mockPrisma.cognitiveTestConfig.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'PUBLISHED' },
    }))
  })

  it('keeps a database-published config even when legacy v2 compatibility metadata is Draft', async () => {
    mockPrisma.cognitiveTestConfig.findMany.mockResolvedValue([{
      id: 'fake-config',
      testType: 'fake',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      status: 'PUBLISHED',
    }])

    await expect(listPublishedConfigs('admin-1', ADMIN)).resolves.toHaveLength(1)
  })

  it('keeps a database-published config whose exact v2 definition is Published', async () => {
    mockPrisma.cognitiveTestConfig.findMany.mockResolvedValue([{
      id: 'reaction-config',
      testType: 'reaction',
      engineVersion: '1.0.0',
      scoringVersion: '1.1.0',
      status: 'PUBLISHED',
    }])

    await expect(listPublishedConfigs('admin-1', ADMIN)).resolves.toHaveLength(1)
  })
})

describe('createAssignment', () => {
  it('creates a DRAFT for a TEACHER owning the course', async () => {
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(config)
    mockPrisma.cognitiveAssignment.create.mockResolvedValue(assignment)

    const result = await createAssignment('teacher-1', TEACHER, baseInput)
    expect(result.status).toBe('DRAFT')
    expect(result.createdBy).toBe('teacher-1')
    expect(mockPrisma.cognitiveAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT', createdBy: 'teacher-1' }),
      })
    )
  })

  it('forbids a TEACHER creating for another teachers course', async () => {
    mockPrisma.course.findUnique.mockResolvedValue(course)
    await expect(createAssignment('teacher-2', TEACHER, baseInput)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows ADMIN to create for any course', async () => {
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(config)
    mockPrisma.cognitiveAssignment.create.mockResolvedValue(assignment)
    const result = await createAssignment('admin-1', ADMIN, baseInput)
    expect(result.status).toBe('DRAFT')
  })

  it('forbids STUDENT from creating', async () => {
    await expect(createAssignment('student-1', STUDENT, baseInput)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects a DRAFT config', async () => {
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue({ ...config, status: 'DRAFT' })
    await expect(createAssignment('teacher-1', TEACHER, baseInput)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects an unknown registry version', async () => {
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue({ ...config, scoringVersion: '9.9.9' })
    await expect(createAssignment('teacher-1', TEACHER, baseInput)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects config JSON that fails the registry schema', async () => {
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue({
      ...config,
      config: { trialCount: 'three', trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
    })
    await expect(createAssignment('teacher-1', TEACHER, baseInput)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a missing course', async () => {
    mockPrisma.course.findUnique.mockResolvedValue(null)
    await expect(createAssignment('teacher-1', TEACHER, baseInput)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('forbids creating an assignment from a GRANT config without a grant', async () => {
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue({ ...config, accessPolicy: 'GRANT' })
    await expect(createAssignment('teacher-1', TEACHER, baseInput)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockPrisma.cognitiveAssignment.create).not.toHaveBeenCalled()
  })

  it('allows creating an assignment from a GRANT config with a grant', async () => {
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue({ ...config, accessPolicy: 'GRANT' })
    mockPrisma.materialGrant.findUnique.mockResolvedValue({ id: 'g1' })
    mockPrisma.cognitiveAssignment.create.mockResolvedValue(assignment)
    await expect(createAssignment('teacher-1', TEACHER, baseInput)).resolves.toMatchObject({ status: 'DRAFT' })
  })
})

describe('listTeacherAssignments / listStudentAssignments', () => {
  it('TEACHER only sees own assignments, with config metadata only', async () => {
    mockPrisma.cognitiveAssignment.findMany.mockResolvedValue([{ ...assignment, config }])
    const result = await listTeacherAssignments('teacher-1', TEACHER, {})
    expect(result).toHaveLength(1)
    expect(mockPrisma.cognitiveAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ createdBy: 'teacher-1', listedStandalone: true }) })
    )
    expect((result[0] as any).config).toEqual({
      id: 'config-1',
      testType: 'fake',
      configVersion: '1.0.0',
      name: 'Fake 1.0.0',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
    })
    // 不返回完整 config JSON
    expect((result[0] as any).config.config).toBeUndefined()
  })

  it('student sees PUBLISHED assignments for ACTIVE/APPROVED memberships only', async () => {
    mockPrisma.courseStudent.findMany.mockResolvedValue([{ courseId: 'course-1' }])
    mockPrisma.cognitiveAssignment.findMany.mockResolvedValue([{ ...assignment, status: 'PUBLISHED', config, course }])
    const result = await listStudentAssignments('student-1')
    expect(result).toHaveLength(1)
    expect(mockPrisma.courseStudent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentId: 'student-1', status: { in: ['ACTIVE', 'APPROVED'] } }) })
    )
  })

  it('student with no memberships gets empty list', async () => {
    mockPrisma.courseStudent.findMany.mockResolvedValue([])
    const result = await listStudentAssignments('student-1')
    expect(result).toEqual([])
  })
})

describe('getAssignmentForTeacher / getAssignmentForStudent', () => {
  it('teacher can read own assignment', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...assignment, config, course })
    const result = await getAssignmentForTeacher('teacher-1', TEACHER, 'asg-1')
    expect(result.id).toBe('asg-1')
    expect(result.reportPackageLocked).toBe(false)
  })

  it('marks a package-referenced wrapper as locked for the teacher UI', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...assignment, listedStandalone: false, config, course })
    mockPrisma.compositeAssessmentItem.findFirst.mockResolvedValue({ id: 'package-item-1' })
    const result = await getAssignmentForTeacher('teacher-1', TEACHER, 'asg-1')
    expect(result.reportPackageLocked).toBe(true)
  })

  it('teacher cannot read another teacher assignment', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...assignment, config, course })
    await expect(getAssignmentForTeacher('teacher-2', TEACHER, 'asg-1')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('student detail hides the run config JSON', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({
      ...assignment,
      status: 'PUBLISHED',
      config,
      course,
    })
    mockPrisma.courseStudent.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    const result = await getAssignmentForStudent('student-1', 'asg-1')
    expect(result.config.config).toBeUndefined()
    expect(result.config.configVersion).toBe('1.0.0')
  })

  it('student detail rejects PENDING membership', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({
      ...assignment,
      status: 'PUBLISHED',
      config,
      course,
    })
    mockPrisma.courseStudent.findUnique.mockResolvedValue({ status: 'PENDING' })
    await expect(getAssignmentForStudent('student-1', 'asg-1')).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('updateDraftAssignment', () => {
  it('updates a DRAFT assignment', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(assignment)
    mockPrisma.cognitiveAssignment.update.mockResolvedValue({ ...assignment, title: 'New Title' })
    const result = await updateDraftAssignment('teacher-1', TEACHER, 'asg-1', { title: 'New Title' })
    expect(result.title).toBe('New Title')
  })

  it('rejects updating a PUBLISHED assignment', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...assignment, status: 'PUBLISHED' })
    await expect(updateDraftAssignment('teacher-1', TEACHER, 'asg-1', { title: 'x' })).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  // D6.1 (P1)：时间窗不变量必须跨"本次 request + 既有行"合并校验
  it('rejects PATCH opensAt beyond the existing dueAt', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({
      ...assignment,
      opensAt: new Date('2026-01-01T10:00:00Z'),
      dueAt: new Date('2026-01-01T18:00:00Z'),
    })
    await expect(
      updateDraftAssignment('teacher-1', TEACHER, 'asg-1', { opensAt: '2026-01-01T20:00:00Z' })
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.cognitiveAssignment.update).not.toHaveBeenCalled()
  })

  it('rejects PATCH dueAt before the existing opensAt', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({
      ...assignment,
      opensAt: new Date('2026-01-01T10:00:00Z'),
      dueAt: new Date('2026-01-01T18:00:00Z'),
    })
    await expect(
      updateDraftAssignment('teacher-1', TEACHER, 'asg-1', { dueAt: '2026-01-01T08:00:00Z' })
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.cognitiveAssignment.update).not.toHaveBeenCalled()
  })

  it('accepts a valid PATCH of both opensAt and dueAt', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({
      ...assignment,
      opensAt: new Date('2026-01-01T10:00:00Z'),
      dueAt: new Date('2026-01-01T18:00:00Z'),
    })
    mockPrisma.cognitiveAssignment.update.mockResolvedValue(assignment)
    await expect(
      updateDraftAssignment('teacher-1', TEACHER, 'asg-1', {
        opensAt: '2026-01-02T10:00:00Z',
        dueAt: '2026-01-02T18:00:00Z',
      })
    ).resolves.toBeTruthy()
  })

  it('accepts an unrelated-field PATCH when existing window is valid', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({
      ...assignment,
      opensAt: new Date('2026-01-01T10:00:00Z'),
      dueAt: new Date('2026-01-01T18:00:00Z'),
    })
    mockPrisma.cognitiveAssignment.update.mockResolvedValue({ ...assignment, instruction: 'updated' })
    const result = await updateDraftAssignment('teacher-1', TEACHER, 'asg-1', { instruction: 'updated' })
    expect(result.instruction).toBe('updated')
  })
})

describe('publishAssignment / archiveAssignment', () => {
  it('publishes a DRAFT with publishedAt + courseSnapshot', async () => {
    mockPrisma.cognitiveAssignment.findUnique
      .mockResolvedValueOnce({ ...assignment, course })
      .mockResolvedValueOnce({ ...assignment, status: 'PUBLISHED', publishedAt: new Date() })
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(publishedV2Config)
    mockPrisma.cognitiveAssignment.updateMany.mockResolvedValue({ count: 1 })

    const result = await publishAssignment('teacher-1', TEACHER, 'asg-1')
    expect(result.status).toBe('PUBLISHED')
    expect(mockPrisma.cognitiveAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asg-1', status: 'DRAFT' },
        data: expect.objectContaining({ status: 'PUBLISHED', courseSnapshot: { id: 'course-1', title: 'C1', courseCode: 'CC1' } }),
      })
    )
  })

  it('freezes a selected profile into resolved snapshot hash at publish', async () => {
    mockPrisma.cognitiveAssignment.findUnique
      .mockResolvedValueOnce({ ...assignment, profile: 'experience', course })
      .mockResolvedValueOnce({ ...assignment, status: 'PUBLISHED', profile: 'experience' })
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(publishedV2Config)
    mockPrisma.cognitiveAssignment.updateMany.mockResolvedValue({ count: 1 })

    await publishAssignment('teacher-1', TEACHER, 'asg-1')
    const data = mockPrisma.cognitiveAssignment.updateMany.mock.calls[0][0].data
    expect(data.resolvedConfigHash).toMatch(/^[a-f0-9]{64}$/)
    expect(data.resolvedConfigSnapshotEncrypted).toEqual(expect.any(String))
    expect(data.resolvedReportSnapshotEncrypted).toEqual(expect.any(String))
    expect(data.profileDefinitionVersion).toBe('1.1.0')
  })

  it('rejects updating profile after publish', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...assignment, status: 'PUBLISHED', profile: 'standard' })
    await expect(updateDraftAssignment('teacher-1', TEACHER, 'asg-1', { profile: 'research' })).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('rejects publishing a draft without a profile', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...assignment, profile: null, course })
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(publishedV2Config)
    await expect(publishAssignment('teacher-1', TEACHER, 'asg-1')).rejects.toMatchObject({
      statusCode: 400,
      message: '发布前必须选择 Profile',
    })
    expect(mockPrisma.cognitiveAssignment.updateMany).not.toHaveBeenCalled()
  })

  it('publishes from DB-published config even when legacy v2 compatibility metadata is Draft', async () => {
    mockPrisma.cognitiveAssignment.findUnique
      .mockResolvedValueOnce({ ...assignment, course })
      .mockResolvedValueOnce({ ...assignment, status: 'PUBLISHED', publishedAt: new Date() })
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(config)
    mockPrisma.cognitiveAssignment.updateMany.mockResolvedValue({ count: 1 })

    await expect(publishAssignment('teacher-1', TEACHER, 'asg-1')).resolves.toMatchObject({ status: 'PUBLISHED' })
    expect(mockPrisma.cognitiveAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asg-1', status: 'DRAFT' },
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      }),
    )
  })

  it('materializes a new report-package wrapper from DB-published config regardless of legacy v2 compatibility status', async () => {
    const wrapper = {
      ...assignment,
      status: 'PUBLISHED' as const,
      listedStandalone: false,
      publishedAt: new Date(),
    }
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(config)
    mockPrisma.cognitiveAssignment.findMany.mockResolvedValue([])
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveAssignment.create.mockResolvedValue(wrapper)

    await expect(ensureTeacherPublishedAssignment(mockPrisma as any, {
      userId: 'teacher-1',
      courseId: 'course-1',
      configId: 'config-1',
      title: 'Fake package slot',
      instruction: null,
      profile: 'standard',
    })).resolves.toMatchObject({ status: 'PUBLISHED', listedStandalone: false })
    expect(mockPrisma.cognitiveAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        configId: 'config-1',
        status: 'PUBLISHED',
        listedStandalone: false,
        profile: 'standard',
      }),
    }))
  })

  it('rejects publishing a non-DRAFT', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...assignment, status: 'PUBLISHED' })
    await expect(publishAssignment('teacher-1', TEACHER, 'asg-1')).rejects.toMatchObject({ statusCode: 409 })
  })

  it('archives DRAFT/PUBLISHED without physical delete', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...assignment, status: 'PUBLISHED' })
    mockPrisma.cognitiveAssignment.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...assignment, status: 'ARCHIVED' })

    const result = await archiveAssignment('teacher-1', TEACHER, 'asg-1')
    expect(result.status).toBe('ARCHIVED')
    expect(mockPrisma.cognitiveAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asg-1', status: { in: ['DRAFT', 'PUBLISHED'] } },
        data: { status: 'ARCHIVED' },
      })
    )
  })

  it('rejects archive when a non-archived composite still references the assignment', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...assignment, status: 'PUBLISHED' })
    mockPrisma.compositeAssessmentItem.findFirst.mockResolvedValue({ id: 'item-1' })
    await expect(archiveAssignment('teacher-1', TEACHER, 'asg-1')).rejects.toMatchObject({ statusCode: 409 })
    expect(mockPrisma.cognitiveAssignment.updateMany).not.toHaveBeenCalled()
  })
})

describe('composite wrapper assignment class', () => {
  const wrapper = { ...assignment, status: 'PUBLISHED' as const, listedStandalone: false }

  it('hides wrappers from the student assignment list', async () => {
    mockPrisma.courseStudent.findMany.mockResolvedValue([{ courseId: 'course-1' }])
    mockPrisma.cognitiveAssignment.findMany.mockResolvedValue([])
    await listStudentAssignments('student-1')
    expect(mockPrisma.cognitiveAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          listedStandalone: true,
          status: 'PUBLISHED',
          course: { isLibrary: false },
        }),
      }),
    )
  })

  it('returns 404 for student GET of a wrapper', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...wrapper, config, course })
    await expect(getAssignmentForStudent('student-1', 'asg-1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns 404 for student GET of a library-course assignment', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({
      ...assignment,
      status: 'PUBLISHED',
      listedStandalone: true,
      config,
      course: { ...course, isLibrary: true },
    })
    await expect(getAssignmentForStudent('student-1', 'asg-1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('allows a narrow wrapper PATCH of title and instruction', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(wrapper)
    mockPrisma.cognitiveAssignment.update.mockResolvedValue({ ...wrapper, title: '综合测评用' })
    const result = await updateDraftAssignment('teacher-1', TEACHER, 'asg-1', { title: '综合测评用', instruction: '说明' })
    expect(result.title).toBe('综合测评用')
    expect(mockPrisma.cognitiveAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: '综合测评用', instruction: '说明' } }),
    )
  })

  it('rejects PATCH for a wrapper referenced by a report package', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(wrapper)
    mockPrisma.compositeAssessmentItem.findFirst.mockResolvedValue({ id: 'package-item-1' })
    await expect(updateDraftAssignment('teacher-1', TEACHER, 'asg-1', { title: '不可修改' })).rejects.toMatchObject({
      statusCode: 409,
    })
    expect(mockPrisma.cognitiveAssignment.update).not.toHaveBeenCalled()
  })

  it('rejects wrapper PATCH of maxAttempts', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(wrapper)
    await expect(updateDraftAssignment('teacher-1', TEACHER, 'asg-1', { maxAttempts: 3 })).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('rejects archive for a wrapper referenced by a report package', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(wrapper)
    mockPrisma.compositeAssessmentItem.findFirst.mockResolvedValue({ id: 'package-item-1' })
    await expect(archiveAssignment('teacher-1', TEACHER, 'asg-1')).rejects.toMatchObject({ statusCode: 409 })
    expect(mockPrisma.cognitiveAssignment.updateMany).not.toHaveBeenCalled()
  })
})
