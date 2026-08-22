import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
process.env.COGNITIVE_MODULE_ENABLED = 'true'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    compositeAssessment: { findUnique: vi.fn() },
    cognitiveAssignment: { findUnique: vi.fn() },
    compositeAssessmentItem: { create: vi.fn() },
    course: { findUnique: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { addItem, publishComposite } from '../../modules/composite/composite.service'

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
})

describe('addItem cognitive course match', () => {
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
