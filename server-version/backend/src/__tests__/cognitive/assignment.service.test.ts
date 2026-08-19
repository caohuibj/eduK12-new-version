import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UserRole, CognitiveAssignmentStatus } from '@prisma/client'

// 绝不连真实 DB：mock config/database 单例（vi.hoisted 保证 mock 工厂先于引用初始化）
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    course: { findUnique: vi.fn() },
    cognitiveTestConfig: { findUnique: vi.fn() },
    cognitiveAssignment: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    courseStudent: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import {
  createAssignment,
  listTeacherAssignments,
  listStudentAssignments,
  getAssignmentForTeacher,
  getAssignmentForStudent,
  updateDraftAssignment,
  publishAssignment,
  archiveAssignment,
} from '../../modules/cognitive/assignment.service'

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
}

beforeEach(() => {
  vi.clearAllMocks()
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
})

describe('listTeacherAssignments / listStudentAssignments', () => {
  it('TEACHER only sees own assignments, with config metadata only', async () => {
    mockPrisma.cognitiveAssignment.findMany.mockResolvedValue([{ ...assignment, config }])
    const result = await listTeacherAssignments('teacher-1', TEACHER, {})
    expect(result).toHaveLength(1)
    expect(mockPrisma.cognitiveAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ createdBy: 'teacher-1' }) })
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
})

describe('publishAssignment / archiveAssignment', () => {
  it('publishes a DRAFT with publishedAt + courseSnapshot', async () => {
    mockPrisma.cognitiveAssignment.findUnique
      .mockResolvedValueOnce({ ...assignment, course })
      .mockResolvedValueOnce({ ...assignment, status: 'PUBLISHED', publishedAt: new Date() })
    mockPrisma.course.findUnique.mockResolvedValue(course)
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(config)
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
})
