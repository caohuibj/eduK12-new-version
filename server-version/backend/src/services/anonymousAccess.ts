import { createHash, createHmac, randomBytes } from 'crypto'
import { HEX_32_BYTE_KEY } from '../utils/encryption'

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

const PUBLIC_START_INTENT_RE = /^[A-Za-z0-9_-]{43}$/
const PUBLIC_START_DOMAIN = 'anonymous-public-start-v1'

const publicStartKey = (): Buffer => {
  const source = process.env.DATA_PSEUDONYM_KEY
  if (!source || !HEX_32_BYTE_KEY.test(source)) {
    throw new Error('DATA_PSEUDONYM_KEY must be exactly 64 hex characters (32 bytes)')
  }
  return Buffer.from(source, 'hex')
}

export const isValidPublicStartIntent = (value: unknown): value is string =>
  typeof value === 'string' && PUBLIC_START_INTENT_RE.test(value)

/**
 * Derive a stable admission identity from a client-generated 256-bit start
 * intent. The raw intent is never persisted. Domain-separated HMAC outputs
 * ensure the participant key cannot be used as the recovery credential.
 *
 * accessTokenId is included so reusing the same browser intent with a different
 * public link cannot recover or collide with an admission created by that link.
 */
export const derivePublicStartCredential = (accessTokenId: string, startIntent: string) => {
  if (!accessTokenId || !isValidPublicStartIntent(startIntent)) {
    throw new Error('invalid public START intent')
  }
  const derive = (domain: string): Buffer => createHmac('sha256', publicStartKey())
    .update(PUBLIC_START_DOMAIN)
    .update('\0')
    .update(domain)
    .update('\0')
    .update(accessTokenId)
    .update('\0')
    .update(startIntent)
    .digest()
  const token = derive('recovery').toString('base64url')
  return {
    token,
    hash: hashRecoveryToken(token),
    participantKey: `anonymous-intent:${derive('participant').toString('hex')}`,
    anonymousCode: `ANON-${derive('code').subarray(0, 4).toString('hex').toUpperCase()}`,
  }
}
