import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    classroom: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import {
  canManageClassroom,
  requireClassroomManager,
} from '../../middleware/classroomAccess'

const classroom = {
  id: 'classroom-1',
  courseId: 'course-1',
  creatorId: 'teacher-creator',
  status: 'PREPARING',
  course: {
    creatorId: 'course-owner',
    shares: [{ sharedTo: 'course-teacher' }],
  },
}

const makeRes = () => {
  const res: any = { statusCode: 0, body: null }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: any) => {
    res.body = body
    return res
  })
  return res
}

describe('classroom manager policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.classroom.findUnique.mockResolvedValue(classroom)
  })

  it('allows administrators, classroom creators, course owners and shared teachers', () => {
    expect(canManageClassroom(classroom, 'admin-1', UserRole.ADMIN)).toBe(true)
    expect(canManageClassroom(classroom, 'teacher-creator', UserRole.TEACHER)).toBe(true)
    expect(canManageClassroom(classroom, 'course-owner', UserRole.TEACHER)).toBe(true)
    expect(canManageClassroom(classroom, 'course-teacher', UserRole.TEACHER)).toBe(true)
  })

  it('rejects unrelated teachers and students', () => {
    expect(canManageClassroom(classroom, 'other-teacher', UserRole.TEACHER)).toBe(false)
    expect(canManageClassroom(classroom, 'student-1', UserRole.STUDENT)).toBe(false)
  })

  it('returns 401 when the resource request is unauthenticated', async () => {
    const req = { params: { id: classroom.id } } as any
    const res = makeRes()
    const next = vi.fn()

    await requireClassroomManager()(req, res, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
    expect(mockPrisma.classroom.findUnique).not.toHaveBeenCalled()
  })

  it('returns 403 for an authenticated user without classroom access', async () => {
    const req = {
      params: { id: classroom.id },
      user: { userId: 'other-teacher', role: UserRole.TEACHER },
    } as any
    const res = makeRes()
    const next = vi.fn()

    await requireClassroomManager()(req, res, next)

    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows a course-shared teacher through the route gate', async () => {
    const req = {
      params: { id: classroom.id },
      user: { userId: 'course-teacher', role: UserRole.TEACHER },
    } as any
    const res = makeRes()
    const next = vi.fn()

    await requireClassroomManager()(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('returns 404 when the classroom does not exist', async () => {
    mockPrisma.classroom.findUnique.mockResolvedValue(null)
    const req = {
      params: { id: 'missing-classroom' },
      user: { userId: 'teacher-1', role: UserRole.TEACHER },
    } as any
    const res = makeRes()
    const next = vi.fn()

    await requireClassroomManager()(req, res, next)

    expect(res.statusCode).toBe(404)
    expect(next).not.toHaveBeenCalled()
  })
})
