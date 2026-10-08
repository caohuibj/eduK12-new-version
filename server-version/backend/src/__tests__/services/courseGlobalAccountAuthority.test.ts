import { describe, expect, it } from 'vitest'
import { UserRole } from '@prisma/client'
import { setCourseStudentFrozenState } from '../../services/courseStudentLifecycleService'

describe('legacy course roles cannot mutate global user account', () => {
  it('rejects a course trainer freeze attempt before any DB transaction', async () => {
    await expect(setCourseStudentFrozenState({
      actorUserId: 'trainer',
      actorRole: UserRole.TEACHER,
      courseId: 'course',
      studentId: 'learner',
      isFrozen: true,
    })).rejects.toMatchObject({ code: 'COURSE_ACCOUNT_ADMIN_REQUIRED', statusCode: 403 })
  })

  it('rejects trainer unfreeze attempts as global account mutations', async () => {
    await expect(setCourseStudentFrozenState({
      actorUserId: 'trainer',
      actorRole: UserRole.TEACHER,
      courseId: 'course',
      studentId: 'learner',
      isFrozen: false,
    })).rejects.toMatchObject({ code: 'COURSE_ACCOUNT_ADMIN_REQUIRED', statusCode: 403 })
  })
})
