import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'
import { AuthenticatedPrincipal, UserRole } from '../types'
import { unauthorized, forbidden } from '../utils/response'
import { inactiveAccountMessage } from '../utils/accountStatus'
import { getSessionToken } from '../utils/authCookies'
import { measureRequestPhase } from '../services/runtimeObservability'
import { loadCurrentPrincipal, toRequestPrincipal } from '../modules/organization/principal'

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedPrincipal
    }
  }
}

const loadPrincipal = async (userId: string) => {
  return measureRequestPhase('auth_account_lookup', () => loadCurrentPrincipal(userId))
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getSessionToken(req)
    if (!token) {
      return unauthorized(res, '缺少认证令牌')
    }

    const payload = verifyToken(token)

    if (!payload) {
      return unauthorized(res, '无效的认证令牌')
    }

    const principal = await loadPrincipal(payload.userId)
    const rejection = inactiveAccountMessage(principal)
    if (rejection) {
      return unauthorized(res, rejection)
    }

    if (payload.tokenVersion !== principal!.tokenVersion) {
      return unauthorized(res, '认证令牌已失效，请重新登录')
    }

    // JWT proves possession of a session credential. Current database state is
    // authoritative for every mutable authorization attribute, including the
    // legacy role and the independent platform role.
    req.user = toRequestPrincipal(principal!)

    const allowedWhileChangingPassword = new Set([
      '/api/auth/me',
      '/api/auth/change-password',
      '/api/users/change-password',
      '/api/auth/logout',
      '/api/auth/csrf',
    ])
    if (
      principal!.mustChangePassword &&
      !allowedWhileChangingPassword.has(req.originalUrl.split('?')[0])
    ) {
      return forbidden(res, '首次登录必须先修改密码')
    }
    next()
  } catch (err) {
    next(err)
  }
}

// 可选认证中间件 - 有有效且未停用的 token 才挂上当前数据库 principal；公开入口不因冻结账号 401。
export const optionalAuthenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getSessionToken(req)
    if (token) {
      const payload = verifyToken(token)

      if (payload) {
        const principal = await loadPrincipal(payload.userId)
        if (!inactiveAccountMessage(principal) && payload.tokenVersion === principal!.tokenVersion) {
          req.user = toRequestPrincipal(principal!)
        }
      }
    }

    next()
  } catch (err) {
    next(err)
  }
}

// Legacy product authorization only. Organization routes must use the
// OrganizationAccessContext guards and must never use this role helper.
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return unauthorized(res)
    }

    if (!roles.includes(req.user.role)) {
      return forbidden(res, '需要特定权限')
    }

    next()
  }
}

export const requireAdmin = requireRole(UserRole.ADMIN)
export const requireTeacher = requireRole(UserRole.TEACHER, UserRole.ADMIN)
export const requireStudent = requireRole(UserRole.STUDENT)

/** Allow a user to access only their own record, unless they are a legacy admin. */
export const requireSelfOrAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return unauthorized(res)
  }

  if (req.user.role !== UserRole.ADMIN && req.user.userId !== req.params.id) {
    return forbidden(res, '无权限查看此用户')
  }

  next()
}
