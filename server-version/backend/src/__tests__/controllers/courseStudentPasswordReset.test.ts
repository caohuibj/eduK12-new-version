import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  preflight: vi.fn(),
  reset: vi.fn(),
  hash: vi.fn(),
  info: vi.fn(),
  logError: vi.fn(),
}))
vi.mock('../../services/courseStudentPasswordResetService', () => ({
  CoursePasswordResetError: class extends Error {
    constructor(public code: string, message: string, public statusCode: number) {
      super(message)
    }
  },
  assertTeacherCourseResetPreflight: mocks.preflight,
  resetEnrolledStudentPassword: mocks.reset,
}))
vi.mock('../../utils/password', () => ({
  generateTempPassword: () => 'SyntheticOnly2026',
  hashPassword: mocks.hash,
}))
vi.mock('../../utils/logger', () => ({ logger: { info: mocks.info, error: mocks.logError } }))
vi.mock('../../services/boundedAdmissionGate', () => ({
  BoundedAdmissionGate: class {
    run<T>(operation: () => Promise<T>) { return operation() }
  },
  isBoundedAdmissionBusyError: () => false,
}))

import { resetPasswordForCourseTeacher } from '../../controllers/courseStudentPasswordController'
import { CoursePasswordResetError } from '../../services/courseStudentPasswordResetService'

const request = (role = UserRole.TEACHER) => ({
  params: { courseId: 'owned-course', studentId: 'active-learner' },
  user: { userId: 'trainer', role, platformRole: 'STANDARD' },
})
const response = () => {
  const headers: Record<string, string> = {}
  const res: any = { statusCode: 200, headers, body: null }
  res.setHeader = vi.fn((name: string, value: string) => { headers[name] = value })
  res.status = vi.fn((code: number) => { res.statusCode = code; return res })
  res.json = vi.fn((body: unknown) => { res.body = body; return res })
  return res
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.preflight.mockResolvedValue(undefined)
  mocks.hash.mockResolvedValue('bcrypt-fixture-hash')
  mocks.reset.mockResolvedValue({ studentId: 'active-learner', username: 'learner01' })
})

describe('teacher course password recovery', () => {
  it('returns a random temporary password only to a verified teacher, with no-store headers', async () => {
    const res = response()
    await resetPasswordForCourseTeacher(request() as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Cache-Control']).toContain('no-store')
    expect(res.headers['Referrer-Policy']).toBe('no-referrer')
    expect(mocks.preflight).toHaveBeenCalledWith({
      actorUserId: 'trainer', courseId: 'owned-course', studentId: 'active-learner',
    })
    expect(mocks.reset).toHaveBeenCalledWith({
      actorUserId: 'trainer', courseId: 'owned-course',
      studentId: 'active-learner', passwordHash: 'bcrypt-fixture-hash',
    })
    expect(res.body.data).toEqual({
      studentId: 'active-learner', username: 'learner01',
      temporaryPassword: 'SyntheticOnly2026', mustChangePassword: true,
    })
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain('SyntheticOnly2026')
  })

  it('rejects unrelated course or pending membership before generating or hashing a secret', async () => {
    mocks.preflight.mockRejectedValueOnce(new CoursePasswordResetError('COURSE_PASSWORD_RESET_FORBIDDEN', '无权限', 403))
    const res = response()
    await resetPasswordForCourseTeacher(request() as any, res)
    expect(res.statusCode).toBe(403)
    expect(res.body.data).toBeNull()
    expect(mocks.hash).not.toHaveBeenCalled()
    expect(mocks.reset).not.toHaveBeenCalled()
  })

  it('rechecks the course and actor in the final transaction after preflight', async () => {
    mocks.reset.mockRejectedValueOnce(new CoursePasswordResetError('COURSE_PASSWORD_RESET_FORBIDDEN', '课程关系已结束', 403))
    const res = response()
    await resetPasswordForCourseTeacher(request() as any, res)
    expect(res.statusCode).toBe(403)
    expect(res.body).not.toHaveProperty('temporaryPassword')
    expect(JSON.stringify(res.body)).not.toContain('SyntheticOnly2026')
  })

  it('does not accept ADMIN as a course teacher bypass', async () => {
    const res = response()
    await resetPasswordForCourseTeacher(request(UserRole.ADMIN) as any, res)
    expect(res.statusCode).toBe(403)
    expect(mocks.preflight).not.toHaveBeenCalled()
    expect(mocks.hash).not.toHaveBeenCalled()
  })
})
