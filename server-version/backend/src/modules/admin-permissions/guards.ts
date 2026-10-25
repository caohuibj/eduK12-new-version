import type { RequestHandler } from 'express'
import { forbidden } from '../../utils/response'
import type { AdminEntry } from './service'
import { ADMIN_STEP_UP_SECONDS } from './security'

// No database lookup here: authenticate loaded this immutable request snapshot
// and validated its signed tokenVersion. Transactional writers recheck state.
export const requireEntryAdmin = (entry: AdminEntry): RequestHandler => (req, res, next) => {
  if (req.user?.platformRole!=='STANDARD'||!req.user.entryGrants?.some(g => g.entry === entry)) return forbidden(res, '缺少当前入口管理授权')
  next()
}
export const requireSystemAdmin: RequestHandler = (req, res, next) => {
  if (req.user?.platformRole !== 'SYSTEM_ADMIN') return forbidden(res, '只有系统管理员可以管理入口授权')
  next()
}
export const requireRecentAdminKey: RequestHandler = (req, res, next) => {
  const age = Date.now() / 1000 - (req.user?.adminVerifiedAt ?? 0)
  if (!Number.isFinite(age) || age < 0 || age > ADMIN_STEP_UP_SECONDS)
    return res.status(403).json({ code: 'ADMIN_KEY_STEP_UP_REQUIRED', message: '敏感操作需要重新完成管理员双因素验证' })
  next()
}
