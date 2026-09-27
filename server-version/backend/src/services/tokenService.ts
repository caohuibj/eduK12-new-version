/**
 * 问卷访问令牌服务
 * 
 * 功能：
 * - 生成唯一访问令牌
 * - 验证令牌有效性
 * - 检查过期和访问限制
 */

import { prisma } from '../config/database'
import { customAlphabet } from 'nanoid'
import { logger } from '../utils/logger'
import { Prisma } from '@prisma/client'
import { createHash } from 'crypto'
import { decryptField, encryptField } from '../utils/encryption'
import { MAX_TOKEN_USES } from '../constants'

// 使用字母数字字符集生成令牌（排除容易混淆的字符）
const nanoid = customAlphabet('abcdefghjkmnpqrstuvwxyz23456789', 16)

/**
 * Keep lookup hashes/ciphertexts inside the service boundary.  Authorized
 * management views may recover the bearer for copy-link workflows, but the
 * protected columns themselves are never part of an API response.
 */
export const serializeQuestionnaireAccessToken = (row: any, reveal = false) => {
  const {
    token: legacyToken,
    tokenHash: _tokenHash,
    tokenEncrypted,
    ...safe
  } = row || {}
  return reveal
    ? { ...safe, token: legacyToken || (tokenEncrypted ? tokenService.decryptToken(tokenEncrypted) : null) }
    : { ...safe, token: null }
}

export interface TokenValidation {
  valid: boolean
  expired: boolean
  overLimit: boolean
  disabled: boolean
  token?: any
  questionnaire?: any
}

export const tokenService = {
  /**
   * 生成访问令牌
   * 格式：qn_xxxxxxxxxxxxxxxx（16位随机字符）
   */
  generateToken(): string {
    return `qn_${nanoid()}`
  },

  hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex')
  },

  encryptToken(token: string): string {
    return encryptField({ token })
  },

  decryptToken(value: string): string | null {
    try {
      const payload = decryptField<{ token?: unknown }>(value)
      return typeof payload.token === 'string' ? payload.token : null
    } catch {
      return null
    }
  },

  /**
   * 创建新的访问令牌
   */
  async createToken(params: {
    questionnaireId: string
    createdBy: string
    expiresAt: Date
    maxUses?: number
  }) {
    const { questionnaireId, createdBy, expiresAt, maxUses = 0 } = params

    if (!Number.isSafeInteger(maxUses) || maxUses < 0 || maxUses > MAX_TOKEN_USES) {
      throw new Error('maxUses must be an integer between 0 and 2147483647')
    }
    if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())) {
      throw new Error('expiresAt must be a valid date')
    }

    const token = this.generateToken()

    const accessToken = await prisma.questionnaireAccessToken.create({
      data: {
        questionnaireId,
        token: null,
        tokenHash: this.hashToken(token),
        tokenEncrypted: this.encryptToken(token),
        createdBy,
        expiresAt,
        maxUses,
        usedCount: 0,
        isActive: true,
      },
      include: {
        questionnaire: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    })

    logger.info('访问令牌创建成功', {
      tokenId: accessToken.id,
      questionnaireId,
      expiresAt,
      maxUses,
    })

    // The raw bearer is returned once to the caller that just created it. It
    // is never persisted or logged in plaintext.
    return { ...serializeQuestionnaireAccessToken(accessToken, true), token }
  },

  /**
   * 验证令牌有效性
   */
  async validateToken(tokenString: string, options: { allowOverLimit?: boolean } = {}): Promise<TokenValidation> {
    // 查询令牌
    const tokenHash = this.hashToken(tokenString)
    // New rows are looked up by a deterministic hash. The legacy lookup is
    // retained only for rows that have not gone through backfill yet.
    let accessToken = await prisma.questionnaireAccessToken.findUnique({
      where: { tokenHash },
      include: { questionnaire: true },
    })
    if (!accessToken) {
      accessToken = await prisma.questionnaireAccessToken.findUnique({
        where: { token: tokenString },
        include: { questionnaire: true },
      })
      if (accessToken?.tokenHash && accessToken.tokenHash !== tokenHash) accessToken = null
    }

    // Questionnaire bearer tokens are exclusively for GENERAL public flows;
    // a COURSE id must never become reachable through the public resolver.
    if (accessToken && accessToken.questionnaire?.type && accessToken.questionnaire.type !== 'GENERAL') {
      return {
        valid: false,
        expired: false,
        overLimit: false,
        disabled: false,
      }
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
    const overLimit = accessToken.maxUses > 0 && accessToken.usedCount >= accessToken.maxUses
    if (overLimit && !options.allowOverLimit) {
      return {
        valid: false,
        expired: false,
        overLimit,
        disabled: false,
        token: accessToken,
      }
    }

    // 令牌有效，返回结果
    const result: TokenValidation = {
      valid: true,
      expired: false,
      // A caller may use a valid, unexpired token to locate an in-progress
      // session even after its one-time start quota was consumed. The start
      // transaction still performs the quota check for new sessions.
      overLimit,
      disabled: false,
      token: accessToken,
      questionnaire: accessToken.questionnaire,
    }

    logger.info('令牌验证成功', {
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
   * 检查令牌是否超过访问限制
   */
  isOverLimit(maxUses: number, usedCount: number): boolean {
    return maxUses > 0 && usedCount >= maxUses
  },

  /**
   * 真正开始一次公开问卷时占用名额。预览 GET 不调用。
   * maxUses=0 表示不限制。并发下用条件更新避免超额。
   */
  async claimAccess(tokenId: string, db: typeof prisma | Prisma.TransactionClient = prisma, questionnaireId?: string): Promise<boolean> {
    const claimed = await db.$executeRaw`
      UPDATE "questionnaire_access_tokens"
      SET "used_count" = "used_count" + 1
      WHERE "id" = ${tokenId}
        AND "is_active" = true
        AND "expires_at" > NOW()
        AND ("max_uses" = 0 OR "used_count" < "max_uses")
        ${questionnaireId ? Prisma.sql`AND "questionnaire_id" = ${questionnaireId}` : Prisma.empty}
    `
    return Number(claimed) > 0
  },

  /**
   * 禁用令牌
   */
  async disableToken(tokenId: string): Promise<void> {
    await prisma.questionnaireAccessToken.update({
      where: { id: tokenId },
      data: {
        isActive: false,
      },
    })

    logger.info('访问令牌已禁用', { tokenId })
  },

  /**
   * 获取问卷的所有令牌
   */
  async getTokensByQuestionnaire(questionnaireId: string) {
    const rows = await prisma.questionnaireAccessToken.findMany({
      where: { questionnaireId },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        },
      },
    })
    return rows.map((row) => serializeQuestionnaireAccessToken(row))
  },

  /**
   * 获取令牌详情
   */
  async getTokenById(tokenId: string, questionnaireId?: string, options: { reveal?: boolean } = {}) {
    const row = await prisma.questionnaireAccessToken.findFirst({
      where: { id: tokenId, ...(questionnaireId ? { questionnaireId } : {}) },
      include: {
        questionnaire: {
          select: {
            id: true,
            name: true,
            type: true,
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
            assessments: true,
          },
        },
      },
    })
    if (!row) return null
    return serializeQuestionnaireAccessToken(row, options.reveal === true)
  },

  /**
   * 删除令牌（实际上是禁用）
   */
  async deleteToken(tokenId: string): Promise<void> {
    // 为了数据完整性，我们不删除令牌，而是禁用
    await this.disableToken(tokenId)
  },
}
