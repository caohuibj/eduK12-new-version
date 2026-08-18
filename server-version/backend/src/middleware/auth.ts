import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'
import { JwtPayload, UserRole } from '../types'
import { unauthorized, forbidden } from '../utils/response'

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, '缺少认证令牌')
  }

  const token = authHeader.substring(7)
  const payload = verifyToken(token)

  if (!payload) {
    return unauthorized(res, '无效的认证令牌')
  }

  req.user = payload
  next()
}

// 可选认证中间件 - 有token就验证，没有也允许访问
export const optionalAuthenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  
  // 如果有 token，尝试验证
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    const payload = verifyToken(token)
    
    if (payload) {
      req.user = payload
    }
  }
  
  // 无论是否有 token，都继续执行
  next()
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
