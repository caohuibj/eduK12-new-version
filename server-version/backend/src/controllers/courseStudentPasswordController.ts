import { Request, Response } from 'express'
import { UserRole } from '@prisma/client'
import { error, forbidden, success } from '../utils/response'
import { logger } from '../utils/logger'
import { generateTempPassword, hashPassword } from '../utils/password'
import { BoundedAdmissionGate, isBoundedAdmissionBusyError } from '../services/boundedAdmissionGate'
import {
  CoursePasswordResetError,
  assertTeacherCourseResetPreflight,
  resetEnrolledStudentPassword,
} from '../services/courseStudentPasswordResetService'

const passwordWorkGate = new BoundedAdmissionGate({
  name: 'course_teacher_password_reset',
  maxConcurrent: 2,
  maxQueue: 4,
  maxWaitMs: 1000,
  retryAfterSeconds: 2,
})

/**
 * One-time credential delivery for an authenticated course owner.
 * The temporary password exists only in this response and the teacher's
 * transient UI state. No credential handoff file, log or persisted receipt.
 */
export async function resetPasswordForCourseTeacher(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Referrer-Policy', 'no-referrer')

  if (req.user?.role !== UserRole.TEACHER) {
    return forbidden(res, '只有该课程的培训师可以为学员重置密码')
  }

  const { courseId, studentId } = req.params
  const actorUserId = req.user.userId
  try {
    await assertTeacherCourseResetPreflight({ actorUserId, courseId, studentId })
    return await passwordWorkGate.run(async () => {
      const temporaryPassword = generateTempPassword()
      const passwordHash = await hashPassword(temporaryPassword)
      const target = await resetEnrolledStudentPassword({
        actorUserId,
        courseId,
        studentId,
        passwordHash,
      })
      logger.info('课程学员账号恢复已完成', {
        actorUserId,
        courseId,
        studentId: target.studentId,
      })
      return success(res, {
        studentId: target.studentId,
        username: target.username,
        temporaryPassword,
        mustChangePassword: true,
      }, '密码已重置。请将临时密码单独安全交给该学员；首次登录必须修改。')
    })
  } catch (cause) {
    if (cause instanceof CoursePasswordResetError) {
      return error(res, cause.message, -1, cause.statusCode)
    }
    if (isBoundedAdmissionBusyError(cause)) {
      res.setHeader('Retry-After', String(cause.retryAfterSeconds))
      return error(res, '密码重置请求繁忙，请稍后重试', -1, 503)
    }
    logger.error('课程学员密码重置失败', cause)
    return error(res, '密码重置失败，请稍后重试')
  }
}
