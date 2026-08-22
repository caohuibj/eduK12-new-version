import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
process.env.COGNITIVE_MODULE_ENABLED = 'true'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    compositeAssessment: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    compositeAssessmentAttempt: { groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    compositeAssessmentAccessToken: { findUnique: vi.fn(), create: vi.fn() },
    course: { findUnique: vi.fn() },
    courseStudent: { findMany: vi.fn(), findUnique: vi.fn() },
    cognitiveTestConfig: { findUnique: vi.fn() },
    cognitiveAssignment: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import {
  copyComposite,
  createAccessTokenForComposite,
  getCompositeForTeacher,
  getPublicCompositeInfo,
  listComposites,
  listAvailableForStudent,
  listLibraryTemplates,
  publishComposite,
  startUserAttempt,
  updateComposite,
} from '../../modules/composite/composite.service'

const TEACHER = UserRole.TEACHER
const ADMIN = UserRole.ADMIN

const publishedConfig = {
  id: 'config-1',
  testType: 'fake',
  configVersion: '1.0.0',
  name: 'Fake 1.0.0',
  instruction: 'cfg',
  status: 'PUBLISHED',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
}

const libraryCourse = { id: 'library-1', title: '材料库', courseCode: 'LIB', isLibrary: true, creatorId: 'admin-1' }
const teacherCourse = { id: 'course-t', title: '授课课', courseCode: 'T1', isLibrary: false, creatorId: 'teacher-1' }

const libraryTemplate = (overrides: Record<string, unknown> = {}) => ({
  id: 'source-1',
  code: 'LIB-C',
  name: '管理员模板',
  description: 'desc',
  instruction: 'inst',
  status: 'PUBLISHED',
  copyable: true,
  courseId: 'library-1',
  createdBy: 'admin-1',
  maxAttempts: 1,
  publicEnabled: false,
  creator: { id: 'admin-1', role: ADMIN },
  course: libraryCourse,
  items: [
    { id: 'form-1', type: 'FORM', position: 0, required: true, formType: 'text_input', formLabel: '年级', formPlaceholder: null, formOptions: null },
    { id: 'scale-1', type: 'SCALE', position: 1, required: true, scaleId: 'scale-1', scale: { id: 'scale-1', status: 'PUBLISHED' } },
    {
      id: 'cog-1',
      type: 'COGNITIVE',
      position: 2,
      required: true,
      cognitiveAssignmentId: 'admin-asg',
      cognitiveAssignment: {
        id: 'admin-asg',
        title: '反应时',
        instruction: '看绿点',
        configId: 'config-1',
        config: publishedConfig,
      },
    },
  ],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
  mockPrisma.compositeAssessmentAttempt.groupBy.mockResolvedValue([])
  mockPrisma.compositeAssessmentAttempt.findMany.mockResolvedValue([])
  mockPrisma.cognitiveAssignment.findFirst.mockResolvedValue(null)
  mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(publishedConfig)
  mockPrisma.course.findUnique.mockResolvedValue(teacherCourse)
})

describe('copyable PATCH', () => {
  it('rejects a teacher setting copyable', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate({ createdBy: 'teacher-1', creator: { id: 'teacher-1', role: TEACHER }, course: teacherCourse, courseId: 'course-t', items: [] }))
    await expect(updateComposite('teacher-1', TEACHER, 'source-1', { copyable: true })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects ADMIN copyable on a DRAFT', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate({ status: 'DRAFT', items: [] }))
    await expect(updateComposite('admin-1', ADMIN, 'source-1', { copyable: true })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects ADMIN copyable on a teacher-created composite', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate({
      createdBy: 'teacher-1',
      creator: { id: 'teacher-1', role: TEACHER },
      items: [],
    }))
    await expect(updateComposite('admin-1', ADMIN, 'source-1', { copyable: true })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects ADMIN copyable when the course is not a library course', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate({
      course: { ...teacherCourse, isLibrary: false },
      courseId: 'course-t',
      items: [],
    }))
    await expect(updateComposite('admin-1', ADMIN, 'source-1', { copyable: true })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('lets ADMIN set copyable on a published library template', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate({ items: [] }))
    mockPrisma.compositeAssessment.update.mockResolvedValue({ copyable: true })
    await updateComposite('admin-1', ADMIN, 'source-1', { copyable: true })
    expect(mockPrisma.compositeAssessment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ copyable: true }),
    }))
  })
})

describe('list/detail copyable fields', () => {
  it('sets canSetCopyable for ADMIN on a library template and false for a teacher row', async () => {
    mockPrisma.compositeAssessment.findMany.mockResolvedValue([
      libraryTemplate({ items: [] }),
      libraryTemplate({
        id: 'teacher-row',
        createdBy: 'teacher-1',
        creator: { id: 'teacher-1', role: TEACHER },
        course: teacherCourse,
        courseId: 'course-t',
        copyable: false,
        items: [],
      }),
    ])
    const list = await listComposites('admin-1', ADMIN)
    expect(list[0]).toMatchObject({
      copyable: true,
      createdBy: 'admin-1',
      creator: { role: ADMIN },
      course: { isLibrary: true },
      canSetCopyable: true,
    })
    expect(list[1].canSetCopyable).toBe(false)
  })

  it('returns the same copyable fields on detail', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate({ items: [] }))
    const detail = await getCompositeForTeacher('admin-1', ADMIN, 'source-1')
    expect(detail).toMatchObject({
      copyable: true,
      createdBy: 'admin-1',
      canSetCopyable: true,
      course: { isLibrary: true },
    })
  })
})

describe('listLibraryTemplates', () => {
  it('only returns admin library templates and omits courseId', async () => {
    mockPrisma.compositeAssessment.findMany.mockResolvedValue([
      libraryTemplate(),
      libraryTemplate({ id: 'dirty', copyable: true, creator: { id: 't', role: TEACHER }, createdBy: 't' }),
    ])
    const list = await listLibraryTemplates('teacher-1', TEACHER)
    expect(list).toHaveLength(1)
    expect(list[0]).not.toHaveProperty('courseId')
    expect(list[0].id).toBe('source-1')
  })
})

describe('copyComposite', () => {
  it('forbids copying a non-library teacher template', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate({
      copyable: false,
      createdBy: 'teacher-2',
      creator: { id: 'teacher-2', role: TEACHER },
      course: teacherCourse,
      courseId: 'course-t',
    }))
    await expect(copyComposite('teacher-1', TEACHER, 'source-1', { courseId: 'course-t' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('forbids copying a teacher-owned row even if copyable is dirty', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate({
      copyable: true,
      createdBy: 'teacher-2',
      creator: { id: 'teacher-2', role: TEACHER },
    }))
    await expect(copyComposite('teacher-1', TEACHER, 'source-1', { courseId: 'course-t' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('requires a teaching course when copying a library template', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate())
    await expect(copyComposite('teacher-1', TEACHER, 'source-1', { courseId: null })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a library course as the copy target', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate())
    mockPrisma.course.findUnique.mockResolvedValue({ ...libraryCourse, creatorId: 'admin-1' })
    await expect(copyComposite('admin-1', ADMIN, 'source-1', { courseId: 'library-1' })).rejects.toMatchObject({
      statusCode: 400,
      message: '不能绑定库课程',
    })
  })

  it('copies a library template into a teacher DRAFT with a new cognitive wrapper', async () => {
    mockPrisma.compositeAssessment.findUnique
      .mockResolvedValueOnce(libraryTemplate())
      .mockResolvedValue(null)
    mockPrisma.cognitiveAssignment.create.mockResolvedValue({ id: 'wrapper-1' })
    mockPrisma.compositeAssessment.create.mockResolvedValue({
      id: 'draft-1',
      status: 'DRAFT',
      createdBy: 'teacher-1',
      courseId: 'course-t',
      copyable: false,
      items: [{ type: 'COGNITIVE', cognitiveAssignmentId: 'wrapper-1' }],
    })

    const copied = await copyComposite('teacher-1', TEACHER, 'source-1', { courseId: 'course-t' })
    expect(copied.status).toBe('DRAFT')
    expect(copied.createdBy).toBe('teacher-1')
    expect(copied.courseId).toBe('course-t')
    expect(mockPrisma.cognitiveAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ listedStandalone: false, status: 'PUBLISHED', createdBy: 'teacher-1', courseId: 'course-t' }),
    }))
    const createdItems = mockPrisma.compositeAssessment.create.mock.calls[0][0].data.items.create
    expect(createdItems.find((item: { type: string }) => item.type === 'SCALE').scaleId).toBe('scale-1')
    expect(createdItems.find((item: { type: string }) => item.type === 'COGNITIVE').cognitiveAssignmentId).toBe('wrapper-1')
    expect(createdItems.find((item: { type: string }) => item.type === 'FORM').formLabel).toBe('年级')
  })

  it('reuses an existing wrapper on a second copy of the same config and course', async () => {
    mockPrisma.compositeAssessment.findUnique
      .mockResolvedValueOnce(libraryTemplate())
      .mockResolvedValue(null)
    mockPrisma.cognitiveAssignment.findFirst.mockResolvedValue({ id: 'wrapper-1', listedStandalone: false })
    mockPrisma.compositeAssessment.create.mockResolvedValue({ id: 'draft-2', items: [] })

    await copyComposite('teacher-1', TEACHER, 'source-1', { courseId: 'course-t' })
    expect(mockPrisma.cognitiveAssignment.create).not.toHaveBeenCalled()
    expect(mockPrisma.compositeAssessment.create.mock.calls[0][0].data.items.create.find((item: { type: string }) => item.type === 'COGNITIVE').cognitiveAssignmentId).toBe('wrapper-1')
  })

  it('does not persist an assignment when the composite code collides', async () => {
    mockPrisma.compositeAssessment.findUnique
      .mockResolvedValueOnce(libraryTemplate())
      .mockResolvedValue({ id: 'taken' })

    await expect(copyComposite('teacher-1', TEACHER, 'source-1', { courseId: 'course-t', code: 'TAKEN' })).rejects.toMatchObject({ statusCode: 409 })
    expect(mockPrisma.cognitiveAssignment.create).not.toHaveBeenCalled()
    expect(mockPrisma.compositeAssessment.create).not.toHaveBeenCalled()
  })

  it('lets ADMIN publish a draft bound to a library course', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate({
      status: 'DRAFT',
      copyable: false,
      items: [{ type: 'FORM', formType: 'text_input', formLabel: '年级' }],
    }))
    mockPrisma.course.findUnique.mockResolvedValue(libraryCourse)
    mockPrisma.compositeAssessment.update.mockResolvedValue({ status: 'PUBLISHED' })
    await publishComposite('admin-1', ADMIN, 'source-1')
    expect(mockPrisma.compositeAssessment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PUBLISHED' }),
    }))
  })

  it('forbids ADMIN from copying onto another teacher’s course', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate())
    mockPrisma.course.findUnique.mockResolvedValue(teacherCourse)
    await expect(copyComposite('admin-1', ADMIN, 'source-1', { courseId: 'course-t' })).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('self-copies a published composite without requiring copyable', async () => {
    mockPrisma.compositeAssessment.findUnique
      .mockResolvedValueOnce(libraryTemplate({
        copyable: false,
        createdBy: 'teacher-1',
        creator: { id: 'teacher-1', role: TEACHER },
        course: teacherCourse,
        courseId: 'course-t',
        items: [{ id: 'form-1', type: 'FORM', position: 0, required: true, formType: 'text_input', formLabel: '年级', formPlaceholder: null, formOptions: null }],
      }))
      .mockResolvedValue(null)
    mockPrisma.compositeAssessment.create.mockResolvedValue({ id: 'self-copy', status: 'DRAFT', createdBy: 'teacher-1' })

    const copied = await copyComposite('teacher-1', TEACHER, 'source-1', { courseId: 'course-t' })
    expect(copied.status).toBe('DRAFT')
  })

  it('self-copies with omitted courseId and keeps the source course', async () => {
    mockPrisma.compositeAssessment.findUnique
      .mockResolvedValueOnce(libraryTemplate({
        copyable: false,
        createdBy: 'teacher-1',
        creator: { id: 'teacher-1', role: TEACHER },
        course: teacherCourse,
        courseId: 'course-t',
        items: [{ id: 'form-1', type: 'FORM', position: 0, required: true, formType: 'text_input', formLabel: '年级', formPlaceholder: null, formOptions: null }],
      }))
      .mockResolvedValue(null)
    mockPrisma.compositeAssessment.create.mockResolvedValue({ id: 'self-copy', courseId: 'course-t' })

    await copyComposite('teacher-1', TEACHER, 'source-1', {})
    expect(mockPrisma.compositeAssessment.create.mock.calls[0][0].data.courseId).toBe('course-t')
  })

  it('rejects self-copy of a cognitive template without a course', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate({
      copyable: false,
      createdBy: 'teacher-1',
      creator: { id: 'teacher-1', role: TEACHER },
      course: null,
      courseId: null,
    }))
    await expect(copyComposite('teacher-1', TEACHER, 'source-1', { courseId: null })).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('library composites are not takeable', () => {
  it('omits library-course composites from the student list', async () => {
    mockPrisma.courseStudent.findMany.mockResolvedValue([{ courseId: 'library-1' }])
    mockPrisma.compositeAssessment.findMany.mockResolvedValue([])
    await listAvailableForStudent('student-1')
    expect(mockPrisma.compositeAssessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ course: { isLibrary: false } }),
      }),
    )
  })

  it('rejects student start on a library composite', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate({ items: [] }))
    await expect(startUserAttempt('student-1', 'source-1')).rejects.toMatchObject({ statusCode: 400, message: '库课程上的综合测评不能作答' })
  })

  it('rejects public tokens on a library composite', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(libraryTemplate({ items: [], publicEnabled: true, expiresAt: new Date(Date.now() + 60_000) }))
    await expect(createAccessTokenForComposite('admin-1', ADMIN, 'source-1', new Date(Date.now() + 60_000).toISOString(), 0))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects public info for a historical token on a library composite', async () => {
    mockPrisma.compositeAssessmentAccessToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      isActive: true,
      expiresAt: new Date(Date.now() + 60_000),
      maxUses: 0,
      usedCount: 0,
      compositeAssessment: libraryTemplate({ publicEnabled: true, items: [] }),
    })
    await expect(getPublicCompositeInfo('token')).rejects.toMatchObject({ statusCode: 400 })
  })
})
