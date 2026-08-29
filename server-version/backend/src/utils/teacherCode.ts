import crypto from 'node:crypto'
import { prisma } from '../config/database'

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

// 生成8位字母数字教师码
export const generateTeacherCode = async (): Promise<string> => {
  let code: string
  let exists = true
  let attempts = 0
  const maxAttempts = 100

  do {
    code = Array.from(crypto.randomBytes(8), (byte) => CROCKFORD[byte & 31]).join('')

    // 检查是否已存在
    const existing = await prisma.teacherCode.findUnique({
      where: { code }
    })

    exists = !!existing
    attempts++
  } while (exists && attempts < maxAttempts)

  if (attempts >= maxAttempts) {
    throw new Error('无法生成唯一教师码')
  }

  return code
}
