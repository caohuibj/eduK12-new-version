import { Request, Response } from 'express'
import { UserRole } from '@prisma/client'
import { error, success } from '../utils/response'
import { logger } from '../utils/logger'
import {
  CourseStudentLifecycleError,
  setCourseStudentFrozenState,
} from '../services/courseStudentLifecycleService'

export const courseStudentLifecycleController = {
  async setFrozen(req: Request, res: Response) {
    try {
      if (typeof req.body?.isFrozen !== 'boolean') {
        return error(res, 'isFrozen 必须为布尔值', -1, 400)
      }
      const result = await setCourseStudentFrozenState({
        actorUserId: req.user!.userId,
        actorRole: req.user!.role as UserRole,
        courseId: req.params.courseId,
        studentId: req.params.studentId,
        isFrozen: req.body.isFrozen,
      })
      return success(
        res,
        { isFrozen: result.isFrozen },
        result.isFrozen ? '学生账号已冻结' : '学生账号已解冻',
      )
    } catch (err) {
      if (err instanceof CourseStudentLifecycleError) {
        return error(res, err.message, -1, err.statusCode)
      }
      logger.error('冻结/解冻学生错误', err)
      return error(res, '操作失败')
    }
  },
}
