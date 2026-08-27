import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
process.env.COGNITIVE_MODULE_ENABLED = 'true'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    compositeAssessment: { findUnique: vi.fn(), update: vi.fn() },
    cognitiveAssignment: { findUnique: vi.fn() },
    compositeAssessmentItem: { create: vi.fn() },
    course: { findUnique: vi.fn() },
    scale: { findUnique: vi.fn() },
    materialGrant: { findUnique: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { addItem, publishComposite, updateComposite } from '../../modules/composite/composite.service'
import { ADEXI_V2_DEFINITION } from '../../modules/scale/packages/adexi-v2'

const TEACHER = UserRole.TEACHER

const publishedConfig = {
  id: 'config-1',
  testType: 'fake',
  configVersion: '1.0.0',
  name: 'Fake 1.0.0',
  status: 'PUBLISHED',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
}

const draftComposite = (overrides: Record<string, unknown> = {}) => ({
  id: 'composite-1',
  code: 'C-1',
  name: '综合测评 1',
  status: 'DRAFT',
  courseId: 'course-1',
  createdBy: 'teacher-a',
  publicEnabled: false,
  expiresAt: null,
  items: [],
  ...overrides,
})

const assignment = (overrides: Record<string, unknown> = {}) => ({
  id: 'asg-1',
  courseId: 'course-1',
  createdBy: 'teacher-a',
  status: 'PUBLISHED',
  title: 'Fake',
  config: publishedConfig,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.compositeAssessmentItem.create.mockResolvedValue({ id: 'item-1' })
  mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-1', creatorId: 'teacher-a' })
  mockPrisma.materialGrant.findUnique.mockResolvedValue(null)
})

describe('addItem cognitive course match', () => {
  it('rejects newly added optional modules until optional execution states exist', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())

    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'FORM',
      formType: 'text_input',
      formLabel: '备注',
      required: false,
    })).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.compositeAssessmentItem.create).not.toHaveBeenCalled()
  })

  it('allows a published assignment on the same course', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(assignment())

    await addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'COGNITIVE',
      cognitiveAssignmentId: 'asg-1',
      required: true,
    })

    expect(mockPrisma.compositeAssessmentItem.create).toHaveBeenCalled()
  })

  it('rejects a report-package wrapper in collection-only mode', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(assignment({ listedStandalone: false }))

    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'COGNITIVE',
      cognitiveAssignmentId: 'asg-1',
      required: true,
    })).rejects.toMatchObject({ statusCode: 403 })
    expect(mockPrisma.compositeAssessmentItem.create).not.toHaveBeenCalled()
  })

  it('rejects an assignment from another course', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(assignment({ courseId: 'course-2' }))

    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'COGNITIVE',
      cognitiveAssignmentId: 'asg-1',
      required: true,
    })).rejects.toMatchObject({ statusCode: 400, message: '认知任务必须与综合测评属于同一课程' })
    expect(mockPrisma.compositeAssessmentItem.create).not.toHaveBeenCalled()
  })

  it('rejects a cognitive item when the composite has no course', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({ courseId: null }))
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(assignment())

    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'COGNITIVE',
      cognitiveAssignmentId: 'asg-1',
      required: true,
    })).rejects.toMatchObject({ statusCode: 400, message: '含认知模块的综合测评必须绑定课程' })
  })
})

describe('addItem scale grants', () => {
  it('forbids another teacher published scale without a grant', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-other', creatorId: 'admin-1', status: 'PUBLISHED', instrumentClass: 'STANDARD', instrumentVersion: '2.0.0', definition: ADEXI_V2_DEFINITION })
    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'SCALE',
      scaleId: 'scale-other',
      required: true,
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows a granted published scale', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite())
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-other', creatorId: 'admin-1', status: 'PUBLISHED', instrumentClass: 'STANDARD', instrumentVersion: '2.0.0', definition: ADEXI_V2_DEFINITION })
    mockPrisma.materialGrant.findUnique.mockResolvedValue({ id: 'g1' })
    await addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'SCALE',
      scaleId: 'scale-other',
      required: true,
    })
    expect(mockPrisma.compositeAssessmentItem.create).toHaveBeenCalled()
  })

  it('keeps an existing scale item after a grant is revoked', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{ id: 'item-scale', type: 'SCALE', scaleId: 'scale-other' }],
    }))
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-other', creatorId: 'admin-1', status: 'PUBLISHED' })
    expect(draftComposite({
      items: [{ id: 'item-scale', type: 'SCALE', scaleId: 'scale-other' }],
    }).items).toHaveLength(1)
    await expect(addItem('teacher-a', TEACHER, 'composite-1', {
      type: 'SCALE',
      scaleId: 'scale-other',
      required: true,
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('still publishes a draft after the scale grant is revoked', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{ type: 'SCALE', scale: { id: 'scale-other', status: 'PUBLISHED', creatorId: 'admin-1' } }],
    }))
    mockPrisma.materialGrant.findUnique.mockResolvedValue(null)
    mockPrisma.compositeAssessment.update.mockResolvedValue({ status: 'PUBLISHED' })
    await publishComposite('teacher-a', TEACHER, 'composite-1')
    expect(mockPrisma.compositeAssessment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PUBLISHED' }),
    }))
  })
})

describe('publishComposite cognitive course match', () => {
  it('refuses to publish when an existing cognitive item is on another course', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{
        type: 'COGNITIVE',
        cognitiveAssignment: assignment({ courseId: 'course-2' }),
      }],
    }))

    await expect(publishComposite('teacher-a', TEACHER, 'composite-1'))
      .rejects.toMatchObject({ statusCode: 400, message: '认知任务必须与综合测评属于同一课程' })
  })
})

describe('updateComposite course change with cognitive items', () => {
  it('rejects changing courseId when the draft already has a cognitive module', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{ type: 'COGNITIVE', cognitiveAssignment: assignment() }],
    }))
    mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-2', creatorId: 'teacher-a' })

    await expect(updateComposite('teacher-a', TEACHER, 'composite-1', { courseId: 'course-2' }))
      .rejects.toMatchObject({ statusCode: 400, message: '请先移除认知模块，或复制到目标课程' })
    expect(mockPrisma.compositeAssessment.update).not.toHaveBeenCalled()
  })

  it('allows changing courseId when the draft has no cognitive module', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{ type: 'SCALE', scale: { status: 'PUBLISHED' } }],
    }))
    mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-2', creatorId: 'teacher-a' })
    mockPrisma.compositeAssessment.update.mockResolvedValue({ id: 'composite-1', courseId: 'course-2' })

    await updateComposite('teacher-a', TEACHER, 'composite-1', { courseId: 'course-2' })
    expect(mockPrisma.compositeAssessment.update).toHaveBeenCalled()
  })

  it('allows a no-op courseId patch when cognitive items exist', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(draftComposite({
      items: [{ type: 'COGNITIVE', cognitiveAssignment: assignment() }],
    }))
    mockPrisma.compositeAssessment.update.mockResolvedValue({ id: 'composite-1', courseId: 'course-1' })

    await updateComposite('teacher-a', TEACHER, 'composite-1', { courseId: 'course-1' })
    expect(mockPrisma.compositeAssessment.update).toHaveBeenCalled()
  })
})
