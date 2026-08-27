import bcrypt from 'bcryptjs'
import { randomInt } from 'node:crypto'

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export const isValidPassword = (password: string): boolean => {
  return password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
}

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 10)
}

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash)
}

/**
 * 生成随机临时密码
 * 包含大小写字母和数字，长度16位。每个字符使用 CSPRNG 生成。
 */
export const generateTempPassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (;;) {
    let password = ''
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(randomInt(chars.length))
    }
    if (isValidPassword(password)) return password
  }
}
