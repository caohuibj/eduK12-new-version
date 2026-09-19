import { Request, Response } from 'express'
import { error, success } from '../utils/response'
import { logger } from '../utils/logger'
import { setUserActiveState, UserLifecycleError } from '../services/userLifecycleService'

/**
 * Identity history is retention-critical once Organization governance exists.
 * The production "delete" operation therefore deactivates the account and
 * invalidates all bearer credentials instead of physically deleting users.
 * Platform lifecycle authority is resolved from current DB platform_role by
 * userLifecycleService; legacy User.role is never sufficient.
 */
export const userLifecycleController = {
  async deactivate(req: Request, res: Response) {
    try {
      const result = await setUserActiveState({
        actorUserId: req.user!.userId,
        targetUserId: req.params.id,
        isActive: false,
      })
      return success(res, result, '用户已停用，历史身份记录已保留')
    } catch (err) {
      if (err instanceof UserLifecycleError) {
        return error(res, err.message, -1, err.statusCode)
      }
      logger.error('停用用户错误', err)
      return error(res, '用户停用失败')
    }
  },
}
