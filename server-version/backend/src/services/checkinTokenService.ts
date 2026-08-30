/**
 * 打卡访问令牌服务
 * 
 * 功能：
 * - 生成唯一访问令牌（用于匿名打卡）
 * - 验证令牌有效性
 * - 检查过期和匿名提交额度
 * - 原子地占用匿名提交额度
 */

import crypto from 'node:crypto'
import { prisma } from '../config/database'
import { customAlphabet } from 'nanoid'
import { logger } from '../utils/logger'
import { Prisma } from '@prisma/client'
import { config } from '../config'
import { MAX_TOKEN_USES } from '../constants'
import { decryptToken, encryptToken, hashToken } from './checkinTokenCrypto'

// 使用字母数字字符集生成令牌（排除容易混淆的字符）
const nanoid = customAlphabet('abcdefghjkmnpqrstuvwxyz23456789', 16)

const serializeToken = (row: any, reveal: boolean) => ({
  id: row.id,
  checkinId: row.checkinId,
  ...(reveal
    ? { token: row.token || (row.tokenEncrypted ? decryptToken(row.tokenEncrypted) : null) }
    : {}),
  createdBy: row.createdBy,
  expiresAt: row.expiresAt,
  maxUses: row.maxUses,
  usedCount: row.usedCount,
  isActive: row.isActive,
  createdAt: row.createdAt,
  ...(row.checkin ? { checkin: row.checkin } : {}),
  ...(row.creator ? { creator: row.creator } : {}),
  ...(row._count ? { _count: row._count } : {}),
})

export const PUBLIC_CHECKIN_SESSION_TTL_SECONDS = 24 * 60 * 60

const sessionCapabilitySecret = crypto
  .createHmac('sha256', config.assetSigningSecret)
  .update('public-checkin-session-capability-v1')
  .digest()

const sessionCapabilityPayload = (params: {
  checkinId: string
  tokenId: string
  sessionId: string
  expiresAt: number
}) => `v1.${params.checkinId}.${params.tokenId}.${params.sessionId}.${params.expiresAt}`

const createSessionCapabilitySignature = (params: {
  checkinId: string
  tokenId: string
  sessionId: string
  expiresAt: number
}): string => crypto
  .createHmac('sha256', sessionCapabilitySecret)
  .update(sessionCapabilityPayload(params))
  .digest('base64url')

export interface PublicCheckinSessionCapability {
  sessionId: string
  capability: string
  expiresAt: number
}

const sessionCapabilityPattern = /^v1\.(\d+)\.([A-Za-z0-9_-]{40,100})$/

export interface CheckinTokenValidation {
  valid: boolean
  expired: boolean
  overLimit: boolean
  disabled: boolean
  token?: any
  checkin?: any
}

export const checkinTokenService = {
  /**
   * 生成访问令牌
   * 格式：ck_xxxxxxxxxxxxxxxx（16位随机字符）
   */
  generateToken(): string {
    return `ck_${nanoid()}`
  },

  hashToken,

  encryptToken,

  decryptToken,

  /**
   * 创建新的访问令牌
   */
  async createToken(params: {
    checkinId: string
    createdBy: string
    expiresAt: Date
    maxUses?: number
  }) {
    const { checkinId, createdBy, expiresAt, maxUses = 0 } = params

    if (!Number.isSafeInteger(maxUses) || maxUses < 0 || maxUses > MAX_TOKEN_USES) {
      throw new Error('maxUses must be an integer between 0 and 2147483647')
    }
    if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())) {
      throw new Error('expiresAt must be a valid date')
    }

    const token = this.generateToken()

    const accessToken = await prisma.checkinAccessToken.create({
      data: {
        checkinId,
        token: null,
        tokenHash: hashToken(token),
        tokenEncrypted: encryptToken(token),
        createdBy,
        expiresAt,
        maxUses,
        usedCount: 0,
        isActive: true,
      },
      include: {
        checkin: {
          select: {
            id: true,
            title: true,
            allowAnonymous: true,
            endTime: true,
          },
        },
      },
    })

    logger.info('打卡访问令牌创建成功', {
      tokenId: accessToken.id,
      checkinId,
      expiresAt,
      maxUses,
    })

    // Return the bearer to the authorized creator at creation time. It is not
    // present in the database row and is never logged.
    return { ...serializeToken(accessToken, false), token }
  },

  /**
   * 验证令牌有效性
   */
  async validateToken(tokenString: string, options: { ignoreUsageLimit?: boolean } = {}): Promise<CheckinTokenValidation> {
    // 查询令牌
    const tokenHash = hashToken(tokenString)
    let accessToken = await prisma.checkinAccessToken.findUnique({
      where: { tokenHash },
      include: {
        checkin: true,
      },
    })

    if (!accessToken) {
      // Compatibility read for rows that predate the additive migration and
      // have not yet been processed by the resumable backfill.
      accessToken = await prisma.checkinAccessToken.findUnique({
        where: { token: tokenString },
        include: { checkin: true },
      })
      if (accessToken?.tokenHash && accessToken.tokenHash !== tokenHash) accessToken = null
    }

    if (!accessToken) {
      return {
        valid: false,
        expired: false,
        overLimit: false,
        disabled: false,
      }
    }

    // 检查是否禁用
    if (!accessToken.isActive) {
      return {
        valid: false,
        expired: false,
        overLimit: false,
        disabled: true,
        token: accessToken,
      }
    }

    // 检查是否过期
    const now = new Date()
    if (now > accessToken.expiresAt) {
      return {
        valid: false,
        expired: true,
        overLimit: false,
        disabled: false,
        token: accessToken,
      }
    }

    // 检查是否超过访问限制
    if (!options.ignoreUsageLimit && accessToken.maxUses > 0 && accessToken.usedCount >= accessToken.maxUses) {
      return {
        valid: false,
        expired: false,
        overLimit: true,
        disabled: false,
        token: accessToken,
      }
    }

    // 检查打卡是否允许匿名
    if (!accessToken.checkin.allowAnonymous) {
      return {
        valid: false,
        expired: false,
        overLimit: false,
        disabled: false,
        token: accessToken,
      }
    }

    // 令牌有效，返回结果
    const result: CheckinTokenValidation = {
      valid: true,
      expired: false,
      overLimit: false,
      disabled: false,
      token: accessToken,
      checkin: accessToken.checkin,
    }

    logger.info('打卡令牌验证成功', {
      tokenId: accessToken.id
    })

    return result
  },

  /**
   * 检查令牌是否过期
   */
  isExpired(expiresAt: Date): boolean {
    return new Date() > expiresAt
  },

  /**
   * 检查令牌是否超过匿名提交限制
   */
  isOverLimit(maxUses: number, usedCount: number): boolean {
    return maxUses > 0 && usedCount >= maxUses
  },

  /**
   * Atomically reserve one anonymous submission slot. maxUses is a quota for
   * successful submissions, not page views; callers should run this inside
   * the same transaction as submission creation.
   */
  async claimSubmissionSlot(
    tokenId: string,
    db: typeof prisma | Prisma.TransactionClient = prisma,
  ): Promise<boolean> {
    const updated = await db.$executeRaw`
      UPDATE "checkin_access_tokens"
      SET "used_count" = "used_count" + 1
      WHERE "id" = ${tokenId}
        AND "is_active" = TRUE
        AND "expires_at" > NOW()
        AND ("max_uses" = 0 OR "used_count" < "max_uses")
    `
    return updated === 1
  },

  /**
   * Legacy counter entry point retained for compatibility. New public
   * check-in flows claim a slot together with the submission transaction.
   */
  async recordAccess(tokenId: string): Promise<void> {
    await this.claimSubmissionSlot(tokenId)
  },

  /**
   * 禁用令牌
   */
  async disableToken(tokenId: string): Promise<void> {
    await prisma.checkinAccessToken.update({
      where: { id: tokenId },
      data: {
        isActive: false,
      },
    })

    logger.info('打卡访问令牌已禁用', { tokenId })
  },

  /**
   * 获取打卡的所有令牌
   */
  async getTokensByCheckin(checkinId: string, options: { reveal?: boolean } = {}) {
    const rows = await prisma.checkinAccessToken.findMany({
      where: { checkinId },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        },
        _count: {
          select: {
            submissions: true,
          },
        },
      },
    })
    return rows.map((row) => serializeToken(row, options.reveal === true))
  },

  /**
   * 获取令牌详情
   */
  async getTokenById(tokenId: string, options: { reveal?: boolean } = {}) {
    const row = await prisma.checkinAccessToken.findUnique({
      where: { id: tokenId },
      include: {
        checkin: {
          select: {
            id: true,
            title: true,
            allowAnonymous: true,
            endTime: true,
          },
        },
        creator: {
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        },
        _count: {
          select: {
            submissions: true,
          },
        },
      },
    })
    return row ? serializeToken(row, options.reveal === true) : null
  },

  /**
   * 删除令牌（实际上是禁用）
   */
  async deleteToken(tokenId: string): Promise<void> {
    // 为了数据完整性，我们不删除令牌，而是禁用
    await this.disableToken(tokenId)
  },

  /**
   * 生成会话ID（用于匿名用户防重复提交）
   * 格式：session_xxxxxxxxxxxxxxxx
   */
  generateSessionId(): string {
    return `session_${nanoid()}`
  },

  /**
   * Issue a short-lived, stateless capability for one anonymous check-in
   * session. The signed payload binds the capability to the exact check-in
   * and access token; sessionId alone is never an authorization credential.
   */
  createSessionCapability(params: {
    checkinId: string
    tokenId: string
    tokenExpiresAt: Date
  }): PublicCheckinSessionCapability {
    const now = Math.floor(Date.now() / 1000)
    const tokenExpiresAt = Math.floor(params.tokenExpiresAt.getTime() / 1000)
    const expiresAt = Math.min(tokenExpiresAt, now + PUBLIC_CHECKIN_SESSION_TTL_SECONDS)
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
      throw new Error('匿名签到访问令牌有效期不足以创建会话')
    }

    const sessionId = this.generateSessionId()
    const signature = createSessionCapabilitySignature({
      checkinId: params.checkinId,
      tokenId: params.tokenId,
      sessionId,
      expiresAt,
    })
    return {
      sessionId,
      capability: `v1.${expiresAt}.${signature}`,
      expiresAt,
    }
  },

  /** Verify a capability and all of the server-side bindings it carries. */
  verifySessionCapability(params: {
    checkinId: string
    tokenId: string
    sessionId: string
    capability: string | undefined
    tokenExpiresAt: Date
  }): boolean {
    if (!params.capability || !/^session_[a-z0-9]{16}$/.test(params.sessionId)) return false
    const match = sessionCapabilityPattern.exec(params.capability)
    if (!match) return false

    const expiresAt = Number(match[1])
    const now = Math.floor(Date.now() / 1000)
    const tokenExpiresAt = Math.floor(params.tokenExpiresAt.getTime() / 1000)
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > tokenExpiresAt) return false

    const expected = createSessionCapabilitySignature({
      checkinId: params.checkinId,
      tokenId: params.tokenId,
      sessionId: params.sessionId,
      expiresAt,
    })
    const expectedBuffer = Buffer.from(expected)
    const suppliedBuffer = Buffer.from(match[2])
    return expectedBuffer.length === suppliedBuffer.length
      && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  },
}
