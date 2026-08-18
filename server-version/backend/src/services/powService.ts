/**
 * POW (Proof of Work) 防机器人服务
 * 
 * 功能：
 * - 生成挑战
 * - 验证 POW 计算
 * - 防止机器人滥用
 */

import crypto from 'crypto'
import { customAlphabet } from 'nanoid'
import NodeCache from 'node-cache'
import { logger } from '../utils/logger'

// 生成随机挑战字符串
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 32)

// 使用内存缓存存储挑战（生产环境可替换为 Redis）
const challengeCache = new NodeCache({
  stdTTL: 300, // 挑战有效期 5 分钟
  checkperiod: 60, // 每60秒检查一次过期
})

export interface POWChallenge {
  challenge: string
  difficulty: number
  timestamp: number
}

export const powService = {
  /**
   * 生成 POW 挑战
   */
  generateChallenge(difficulty: number = 4): POWChallenge {
    const challenge = nanoid()
    const timestamp = Date.now()

    // 存储挑战
    const key = `pow:${challenge}`
    challengeCache.set(key, { challenge, difficulty, timestamp })

    logger.debug('POW 挑战已生成', { challenge, difficulty })

    return {
      challenge,
      difficulty,
      timestamp,
    }
  },

  /**
   * 验证 POW 计算
   */
  verifyPOW(challenge: string, proof: string, difficulty: number): boolean {
    // 检查挑战是否存在
    const key = `pow:${challenge}`
    const stored = challengeCache.get(key) as POWChallenge | undefined

    if (!stored) {
      logger.warn('POW 挑战不存在或已过期', { challenge })
      return false
    }

    // 验证难度匹配
    if (stored.difficulty !== difficulty) {
      logger.warn('POW 难度不匹配', { challenge, expected: stored.difficulty, provided: difficulty })
      return false
    }

    // 验证 POW：计算哈希并检查前导零
    const hash = crypto.createHash('sha256').update(`${challenge}${proof}`).digest('hex')
    const target = '0'.repeat(difficulty)

    if (!hash.startsWith(target)) {
      logger.warn('POW 验证失败', { challenge, proof, hash, target })
      return false
    }

    // 验证成功，删除挑战（防止重放）
    challengeCache.del(key)

    logger.info('POW 验证成功', { challenge })
    return true
  },

  /**
   * 检查挑战是否有效
   */
  isChallengeValid(challenge: string): boolean {
    const key = `pow:${challenge}`
    return challengeCache.has(key)
  },

  /**
   * 获取挑战信息
   */
  getChallenge(challenge: string): POWChallenge | undefined {
    const key = `pow:${challenge}`
    return challengeCache.get(key) as POWChallenge | undefined
  },

  /**
   * 计算验证哈希（用于测试）
   */
  calculateHash(challenge: string, proof: string): string {
    return crypto.createHash('sha256').update(`${challenge}${proof}`).digest('hex')
  },

  /**
   * 获取缓存统计信息（用于监控）
   */
  getStats() {
    return {
      totalChallenges: challengeCache.keys().length,
      stats: challengeCache.getStats(),
    }
  },
}
