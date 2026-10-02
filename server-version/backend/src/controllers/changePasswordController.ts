import type { Request, Response } from 'express'
import { changeOwnPassword, PasswordChangeError } from '../services/passwordChangeService'
import { clearSessionCookie } from '../utils/authCookies'
import { error, success, unauthorized } from '../utils/response'
import { logger } from '../utils/logger'
import { Messages } from '../constants'

export async function changePasswordHandler(req: Request, res: Response) {
  try {
    await changeOwnPassword(req.user?.userId, req.body.oldPassword, req.body.newPassword)
    clearSessionCookie(req, res)
    return success(res, null, '密码修改成功')
  } catch (cause) {
    if (cause instanceof PasswordChangeError) {
      return cause.unauthenticated ? unauthorized(res) : error(res, cause.message)
    }
    logger.error('修改密码错误', cause)
    return error(res, Messages.COMMON.FAILED)
  }
}
