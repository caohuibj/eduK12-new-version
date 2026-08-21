import { createHash, randomBytes } from 'crypto'

/**
 * 公开测评的两个凭证分开处理：
 * - access token 是教师生成的入口链接，控制有效期和总参与次数；
 * - recovery token 是参与者主动保存后继续作答的凭证，只保存哈希。
 */
export const createAccessToken = (): string => randomBytes(24).toString('base64url')

export const createRecoveryCredential = () => {
  const token = randomBytes(24).toString('base64url')
  const hash = hashRecoveryToken(token)
  const suffix = randomBytes(4).toString('hex').toUpperCase()
  return {
    token,
    hash,
    anonymousCode: `ANON-${suffix}`,
    participantKey: `anonymous:${randomBytes(18).toString('hex')}`,
  }
}

export const hashRecoveryToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

export const isValidRecoveryToken = (token: unknown): token is string =>
  typeof token === 'string' && token.length >= 20 && token.length <= 200
