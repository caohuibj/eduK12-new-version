import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'
import { JwtPayload, UserRole } from '../types'
import { unauthorized, forbidden } from '../utils/response'
import { prisma } from '../config/database'
import { inactiveAccountMessage } from '../utils/accountStatus'

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

const ACCOUNT_STATUS_SELECT = {
  isActive: true,
  isFrozen: true,
  expiresAt: true,
  role: true,
  teacherApproved: true,
} as const

const loadAccountStatus = async (userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: ACCOUNT_STATUS_SELECT,
  })
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, '缺少认证令牌')
    }

    const token = authHeader.substring(7)
    const payload = verifyToken(token)

    if (!payload) {
      return unauthorized(res, '无效的认证令牌')
    }

    const user = await loadAccountStatus(payload.userId)
    const rejection = inactiveAccountMessage(user)
    if (rejection) {
      return unauthorized(res, rejection)
    }

    req.user = payload
    next()
  } catch (err) {
    next(err)
  }
}

// 可选认证中间件 - 有有效且未停用的 token 才挂上 req.user；课堂等公开入口不因冻结账号 401。
export const optionalAuthenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const payload = verifyToken(token)

      if (payload) {
        const user = await loadAccountStatus(payload.userId)
        if (!inactiveAccountMessage(user)) {
          req.user = payload
        }
      }
    }

    next()
  } catch (err) {
    next(err)
  }
}

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

/** Allow a user to access only their own record, unless they are an admin. */
export const requireSelfOrAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return unauthorized(res)
  }

  if (req.user.role !== UserRole.ADMIN && req.user.userId !== req.params.id) {
    return forbidden(res, '无权限查看此用户')
  }

  next()
}
