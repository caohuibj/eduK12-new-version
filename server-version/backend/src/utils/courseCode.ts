import crypto from 'node:crypto'
import { prisma } from '../config/database'
import type { PrismaClient } from '@prisma/client'

// Crockford Base32 avoids ambiguous I/L/O/U and gives 60 bits of entropy in
// twelve characters. Existing legacy course codes remain valid for lookup.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const COURSE_CODE_LENGTH = 12

const randomCourseCode = (): string => {
  const bytes = crypto.randomBytes(COURSE_CODE_LENGTH)
  return Array.from(bytes, (byte) => CROCKFORD[byte & 31]).join('')
}

type CourseCodeDatabase = Pick<PrismaClient, 'course'>

export const generateCourseCode = async (db: CourseCodeDatabase = prisma): Promise<string> => {
  let code: string
  let exists = true
  let attempts = 0
  const maxAttempts = 20

  do {
    code = randomCourseCode()

    // 检查是否已存在
    const existing = await db.course.findUnique({
      where: { courseCode: code }
    })

    exists = !!existing
    attempts++
  } while (exists && attempts < maxAttempts)

  if (attempts >= maxAttempts) {
    throw new Error('无法生成唯一课程号，请稍后重试')
  }

  return code
}
