import { prisma } from '../config/database'

// 生成3位随机大写字母
const generateRandomLetters = (): string => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let result = ''
  for (let i = 0; i < 3; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length))
  }
  return result
}

// 生成课程码: YYMMDD + 3位大写字母 (如 260205ABC)
export const generateCourseCode = async (): Promise<string> => {
  const now = new Date()
  // 获取年月日，格式 YYMMDD
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')
  const datePrefix = `${year}${month}${day}`

  let code: string
  let exists = true
  let attempts = 0
  const maxAttempts = 100

  do {
    // 格式: YYMMDD + 3位大写字母
    code = `${datePrefix}${generateRandomLetters()}`

    // 检查是否已存在
    const existing = await prisma.course.findUnique({
      where: { courseCode: code }
    })

    exists = !!existing
    attempts++
  } while (exists && attempts < maxAttempts)

  if (attempts >= maxAttempts) {
    throw new Error('无法生成唯一课程号，今日课程数量已达上限')
  }

  return code
}
