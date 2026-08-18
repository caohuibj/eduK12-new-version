/**
 * 打卡访问令牌服务
 * 
 * 功能：
 * - 生成唯一访问令牌（用于匿名打卡）
 * - 验证令牌有效性
 * - 检查过期和访问限制
 * - 记录访问次数
 */

import { prisma } from '../config/database'
import { customAlphabet } from 'nanoid'
import { logger } from '../utils/logger'

// 使用字母数字字符集生成令牌（排除容易混淆的字符）
const nanoid = customAlphabet('abcdefghjkmnpqrstuvwxyz23456789', 16)

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

    const token = this.generateToken()

    const accessToken = await prisma.checkinAccessToken.create({
      data: {
        checkinId,
        token,
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

    return accessToken
  },

  /**
   * 验证令牌有效性
   */
  async validateToken(tokenString: string): Promise<CheckinTokenValidation> {
    // 查询令牌
    const accessToken = await prisma.checkinAccessToken.findUnique({
      where: { token: tokenString },
      include: {
        checkin: true,
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
   * 记录访问（增加 usedCount）
   */
  async recordAccess(tokenId: string): Promise<void> {
    const token = await prisma.checkinAccessToken.findUnique({
      where: { id: tokenId },
      select: { token: true, maxUses: true, usedCount: true },
    })

    if (!token) return

    // 更新访问计数
    await prisma.checkinAccessToken.update({
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
  async getTokensByCheckin(checkinId: string) {
    return await prisma.checkinAccessToken.findMany({
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
  },

  /**
   * 获取令牌详情
   */
  async getTokenById(tokenId: string) {
    return await prisma.checkinAccessToken.findUnique({
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
}
