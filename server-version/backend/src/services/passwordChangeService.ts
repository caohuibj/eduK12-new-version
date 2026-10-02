import { prisma } from '../config/database'
import { comparePassword, hashPassword, isValidPassword } from '../utils/password'

export class PasswordChangeError extends Error {
  constructor(message: string, readonly unauthenticated = false) { super(message) }
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
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new PasswordChangeError('请先登录', true)
  if (!(await comparePassword(oldPassword, user.passwordHash))) throw new PasswordChangeError('旧密码错误')
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 }, mustChangePassword: false },
  })
}
