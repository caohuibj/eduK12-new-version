import { prisma } from '../config/database'
import { comparePassword, hashPassword, isValidPassword } from '../utils/password'

export class PasswordChangeError extends Error {
  constructor(message: string, readonly unauthenticated = false, readonly statusCode = 400) { super(message) }
}

/** One validation and credential mutation contract for both public URL aliases. */
export async function changeOwnPassword(userId: string | undefined, oldPassword: unknown, newPassword: unknown) {
  if (!userId) throw new PasswordChangeError('请先登录', true)
  if (typeof oldPassword !== 'string' || !oldPassword || oldPassword.length > 128 || !newPassword) {
    throw new PasswordChangeError('请提供旧密码和新密码')
  }
  if (typeof newPassword !== 'string' || !isValidPassword(newPassword)) {
    throw new PasswordChangeError('密码必须包含字母和数字，长度为8-128个字符')
  }
  if (oldPassword === newPassword) throw new PasswordChangeError('新密码不能与旧密码相同')
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new PasswordChangeError('请先登录', true)
  if (!(await comparePassword(oldPassword, user.passwordHash))) throw new PasswordChangeError('旧密码错误')
  // bcrypt can treat distinct UTF-8 strings as the same credential after 72 bytes.
  if (await comparePassword(newPassword, user.passwordHash)) throw new PasswordChangeError('新密码不能与旧密码相同')
  const passwordHash = await hashPassword(newPassword)
  const updated = await prisma.user.updateMany({
    where: { id: userId, tokenVersion: user.tokenVersion },
    data: { passwordHash, tokenVersion: { increment: 1 }, mustChangePassword: false },
  })
  if (updated.count !== 1) throw new PasswordChangeError('账号状态已改变，请重新登录', false, 409)
}
