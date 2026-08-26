/**
 * 问卷访问令牌服务
 * 
 * 功能：
 * - 生成唯一访问令牌
 * - 验证令牌有效性
 * - 检查过期和访问限制
 * - 记录访问次数
 */

import { prisma } from '../config/database'
import { customAlphabet } from 'nanoid'
import { logger } from '../utils/logger'
import { Prisma } from '@prisma/client'

// 使用字母数字字符集生成令牌（排除容易混淆的字符）
const nanoid = customAlphabet('abcdefghjkmnpqrstuvwxyz23456789', 16)

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

    const token = this.generateToken()

    const accessToken = await prisma.questionnaireAccessToken.create({
      data: {
        questionnaireId,
        token,
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

    return accessToken
  },

  /**
   * 验证令牌有效性
   */
  async validateToken(tokenString: string): Promise<TokenValidation> {
    // 查询令牌
    const accessToken = await prisma.questionnaireAccessToken.findUnique({
      where: { token: tokenString },
      include: {
        questionnaire: true,
      },
    })

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
    if (accessToken.maxUses > 0 && accessToken.usedCount >= accessToken.maxUses) {
      return {
        valid: false,
        expired: false,
        overLimit: true,
        disabled: false,
        token: accessToken,
      }
    }

    // 令牌有效，返回结果
    const result: TokenValidation = {
      valid: true,
      expired: false,
      overLimit: false,
      disabled: false,
      token: accessToken,
      questionnaire: accessToken.questionnaire,
    }

    logger.info('令牌验证成功', {
      token: tokenString.substring(0, 10) + '...',
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
  async claimAccess(tokenId: string, db: typeof prisma | Prisma.TransactionClient = prisma): Promise<boolean> {
    const claimed = await db.$executeRaw`
      UPDATE "questionnaire_access_tokens"
      SET "used_count" = "used_count" + 1
      WHERE "id" = ${tokenId}
        AND "is_active" = true
        AND "expires_at" > NOW()
        AND ("max_uses" = 0 OR "used_count" < "max_uses")
    `
    return Number(claimed) > 0
  },

  /**
   * 记录访问（增加 usedCount）
   */
  async recordAccess(tokenId: string): Promise<void> {
    const token = await prisma.questionnaireAccessToken.findUnique({
      where: { id: tokenId },
      select: { token: true, maxUses: true, usedCount: true },
    })

    if (!token) return

    // 更新访问计数
    const newUsedCount = token.usedCount + 1
    
    await prisma.questionnaireAccessToken.update({
      where: { id: tokenId },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    })
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
    return await prisma.questionnaireAccessToken.findMany({
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
  },

  /**
   * 获取令牌详情
   */
  async getTokenById(tokenId: string) {
    return await prisma.questionnaireAccessToken.findUnique({
      where: { id: tokenId },
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
  },

  /**
   * 删除令牌（实际上是禁用）
   */
  async deleteToken(tokenId: string): Promise<void> {
    // 为了数据完整性，我们不删除令牌，而是禁用
    await this.disableToken(tokenId)
  },
}
