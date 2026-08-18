import { prisma } from '../config/database'

// 生成8位字母数字教师码
export const generateTeacherCode = async (): Promise<string> => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code: string
  let exists = true
  let attempts = 0
  const maxAttempts = 100

  do {
    // 生成8位随机字符
    code = ''
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }

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
