import { UserRole } from '../types'

export type AccountStatusFields = {
  isActive: boolean
  isFrozen: boolean
  expiresAt: Date | null
  role: UserRole
  teacherApproved: boolean
}

/** Shared rejection copy for login, /auth/me, and authenticated requests. */
export const inactiveAccountMessage = (user: AccountStatusFields | null): string | null => {
  if (!user) return '用户不存在'
  if (!user.isActive) return '账号已被禁用'
  if (user.isFrozen) return '账号已被冻结，请联系教师'
  if (user.expiresAt && user.expiresAt < new Date()) return '账号已过期，请联系管理员'
  if (user.role === UserRole.TEACHER && !user.teacherApproved) {
    return '账号正在等待管理员审核，审核通过后即可登录'
  }
  return null
}
