import { describe, expect, it } from 'vitest'
import { UserRole } from '@prisma/client'
import { inactiveAccountMessage } from '../../utils/accountStatus'

const active = {
  isActive: true,
  isFrozen: false,
  expiresAt: null as Date | null,
  role: UserRole.STUDENT,
  teacherApproved: true,
}

describe('inactiveAccountMessage', () => {
  it('allows an active account', () => {
    expect(inactiveAccountMessage(active)).toBeNull()
  })

  it('rejects missing, frozen, expired, and pending teacher accounts', () => {
    expect(inactiveAccountMessage(null)).toBe('用户不存在')
    expect(inactiveAccountMessage({ ...active, isActive: false })).toBe('账号已被禁用')
    expect(inactiveAccountMessage({ ...active, isFrozen: true })).toBe('账号已被冻结，请联系教师')
    expect(inactiveAccountMessage({ ...active, expiresAt: new Date(Date.now() - 1000) })).toBe('账号已过期，请联系管理员')
    expect(inactiveAccountMessage({
      ...active,
      role: UserRole.TEACHER,
      teacherApproved: false,
    })).toBe('账号正在等待管理员审核，审核通过后即可登录')
  })
})
