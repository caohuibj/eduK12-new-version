import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CourseStudentStatus } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    courseStudent: { findFirst: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { canStudentAccessScale } from '../../modules/scale/scale-access'

const scale = (overrides: Partial<{ status: string; visibility: string }> = {}) => ({
  id: 'scale-1',
  status: 'PUBLISHED',
  visibility: 'PUBLIC',
  ...overrides,
})

describe('standalone student scale access', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows only published public scales', async () => {
    await expect(canStudentAccessScale(scale(), 'student-1')).resolves.toBe(true)
    await expect(canStudentAccessScale(scale({ status: 'DRAFT' }), 'student-1')).resolves.toBe(false)
    await expect(canStudentAccessScale(scale({ visibility: 'HIDDEN' }), 'student-1')).resolves.toBe(false)
    expect(mockPrisma.courseStudent.findFirst).not.toHaveBeenCalled()
  })

  it('requires an active or approved membership for course-visible scales', async () => {
    mockPrisma.courseStudent.findFirst.mockResolvedValue({ id: 'membership-1' })
    await expect(canStudentAccessScale(scale({ visibility: 'COURSE' }), 'student-1')).resolves.toBe(true)
    expect(mockPrisma.courseStudent.findFirst).toHaveBeenCalledWith({
      where: {
        studentId: 'student-1',
        status: { in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED] },
        course: { courseScales: { some: { scaleId: 'scale-1' } } },
      },
      select: { id: true },
    })

    mockPrisma.courseStudent.findFirst.mockResolvedValue(null)
    await expect(canStudentAccessScale(scale({ visibility: 'COURSE' }), 'student-1')).resolves.toBe(false)
  })
})
