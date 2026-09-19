import path from 'node:path'
import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { error, notFound, success } from '../utils/response'
import { generateTempPassword, hashPassword } from '../utils/password'
import { removeCredentialHandoff, writeCredentialHandoff } from '../utils/credentialHandoff'
import {
  AccountAuthorityError,
  forceResetPasswordBySystemAdmin,
} from '../services/accountAuthorityService'

/** Platform-authoritative account credential commands. */
export const platformAccountController = {
  async resetPassword(req: Request, res: Response) {
    let handoffFile: string | null = null
    try {
      const target = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, username: true },
      })
      if (!target) return notFound(res, '用户不存在')

      const temporaryPassword = generateTempPassword()
      const passwordHash = await hashPassword(temporaryPassword)
      handoffFile = await writeCredentialHandoff([{
        username: target.username,
        temporaryPassword,
      }], 'admin-password-reset')

      await forceResetPasswordBySystemAdmin({
        actorUserId: req.user!.userId,
        targetUserId: target.id,
        passwordHash,
      })

      return success(
        res,
        { handoffFile: path.basename(handoffFile) },
        '密码已重置；临时密码已写入受保护的本地交接文件',
      )
    } catch (err) {
      if (handoffFile) removeCredentialHandoff(handoffFile)
      if (err instanceof AccountAuthorityError) {
        return error(res, err.message, -1, err.statusCode)
      }
      logger.error('平台重置密码错误', err)
      return error(res, '密码重置失败')
    }
  },
}
