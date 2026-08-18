/**
 * Redis 缓存服务
 * 用于缓存频繁访问的数据，减少数据库查询
 */

import { createClient } from 'redis'
import { logger } from '../utils/logger'

/**
 * 缓存配置
 */
const CACHE_CONFIG = {
  // 默认缓存时间（秒）
  defaultTTL: parseInt(process.env.CACHE_TTL || '300'), // 5分钟
  
  // 课程列表缓存时间
  courseListTTL: 600, // 10分钟
  
  // 用户信息缓存时间
  userInfoTTL: 1800, // 30分钟
  
  // 统计数据缓存时间
  statsTTL: 60, // 1分钟
}

/**
 * Redis 缓存服务类
 */
class CacheService {
  private client: any = null
  private isConnected: boolean = false

  /**
   * 初始化 Redis 客户端
   */
  async initialize(): Promise<void> {
    try {
      this.client = createClient({
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
        password: process.env.REDIS_PASSWORD || undefined,
      })

      this.client.on('error', (err: Error) => {
        logger.error('[CacheService] Redis客户端错误:', err)
        this.isConnected = false
      })

      this.client.on('end', () => {
        logger.warn('[CacheService] Redis客户端已断开')
        this.isConnected = false
      })

      await this.client.connect()
      
      // 连接成功后立即设置状态
      this.isConnected = true
      logger.info('[CacheService] Redis缓存服务初始化完成')
    } catch (error) {
      logger.error('[CacheService] Redis连接失败:', error)
      this.isConnected = false
      // 不抛出错误，允许服务在没有缓存的情况下运行
    }
  }

  /**
   * 获取缓存
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) {
      logger.warn(`[CacheService] Redis未连接，无法获取缓存: ${key}`)
      return null
    }

    try {
      const value = await this.client.get(key)
      if (!value) {
        logger.info(`[CacheService] 缓存未命中: ${key}`)
        return null
      }
      logger.info(`[CacheService] 缓存命中: ${key}`)
      return JSON.parse(value) as T
    } catch (error) {
      logger.error(`[CacheService] 获取缓存失败: ${key}`, error)
      return null
    }
  }

  /**
   * 设置缓存
   */
  async set(key: string, value: any, ttl: number = CACHE_CONFIG.defaultTTL): Promise<void> {
    if (!this.isConnected || !this.client) {
      logger.warn(`[CacheService] Redis未连接，无法设置缓存: ${key}`)
      return
    }

    try {
      await this.client.setEx(key, ttl, JSON.stringify(value))
      logger.info(`[CacheService] 缓存已设置: ${key}, TTL: ${ttl}秒`)
    } catch (error) {
      logger.error(`[CacheService] 设置缓存失败: ${key}`, error)
    }
  }

  /**
   * 删除缓存
   */
  async del(key: string): Promise<void> {
    if (!this.isConnected || !this.client) {
      return
    }

    try {
      await this.client.del(key)
    } catch (error) {
      logger.error(`[CacheService] 删除缓存失败: ${key}`, error)
    }
  }

  /**
   * 批量删除缓存（按模式）
   */
  async delPattern(pattern: string): Promise<void> {
    if (!this.isConnected || !this.client) {
      return
    }

    try {
      const keys = await this.client.keys(pattern)
      if (keys.length > 0) {
        await this.client.del(keys)
        logger.info(`[CacheService] 删除缓存: ${pattern}, 数量: ${keys.length}`)
      }
    } catch (error) {
      logger.error(`[CacheService] 批量删除缓存失败: ${pattern}`, error)
    }
  }

  /**
   * 获取或设置缓存（缓存穿透保护）
   */
  async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttl: number = CACHE_CONFIG.defaultTTL
  ): Promise<T> {
    // 尝试从缓存获取
    const cachedValue = await this.get<T>(key)
    if (cachedValue !== null) {
      logger.debug(`[CacheService] 缓存命中: ${key}`)
      return cachedValue
    }

    // 缓存未命中，执行函数获取数据
    logger.debug(`[CacheService] 缓存未命中: ${key}`)
    const value = await fetchFunction()

    // 设置缓存
    await this.set(key, value, ttl)

    return value
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<any> {
    if (!this.isConnected || !this.client) {
      return { connected: false }
    }

    try {
      const info = await this.client.info('stats')
      const dbSize = await this.client.dbSize()
      
      return {
        connected: true,
        keys: dbSize,
        info: info
      }
    } catch (error) {
      logger.error('[CacheService] 获取统计信息失败', error)
      return { connected: false, error: String(error) }
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit()
      logger.info('[CacheService] Redis连接已关闭')
    }
  }

  /**
   * 获取连接状态
   */
  getStatus(): { connected: boolean } {
    return { connected: this.isConnected }
  }

  /**
   * 获取缓存配置
   */
  getConfig(): typeof CACHE_CONFIG {
    return CACHE_CONFIG
  }

  // ==================== 业务特定的缓存方法 ====================

  /**
   * 获取问卷的量表列表（带缓存）
   */
  async getQuestionnaireScales(questionnaireId: string): Promise<any[]> {
    const key = `questionnaire:${questionnaireId}:scales`
    return this.getOrSet(key, async () => {
      const { prisma } = await import('../config/database')
      return prisma.questionnaireScale.findMany({
        where: { questionnaireId },
        include: { 
          scale: {
            include: {
              items: {
                orderBy: { sortOrder: 'asc' }
              },
              dimensions: true
            }
          }
        },
        orderBy: { position: 'asc' }
      })
    }, CACHE_CONFIG.defaultTTL)
  }

  /**
   * 获取问卷的表单题目列表（带缓存）
   */
  async getQuestionnaireFormItems(questionnaireId: string): Promise<any[]> {
    const key = `questionnaire:${questionnaireId}:formItems`
    return this.getOrSet(key, async () => {
      const { prisma } = await import('../config/database')
      return prisma.questionnaireFormItem.findMany({
        where: { questionnaireId },
        orderBy: { position: 'asc' }
      })
    }, CACHE_CONFIG.defaultTTL)
  }

  /**
   * 获取量表配置（带缓存）
   */
  async getScaleConfig(scaleId: string): Promise<any> {
    const key = `scale:${scaleId}:config`
    return this.getOrSet(key, async () => {
      const { prisma } = await import('../config/database')
      return prisma.scale.findUnique({
        where: { id: scaleId },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: {
              itemDimensions: {
                include: {
                  dimension: true
                }
              }
            }
          },
          dimensions: true
        }
      })
    }, CACHE_CONFIG.defaultTTL * 2) // 量表配置缓存时间更长
  }

  /**
   * 清除问卷相关缓存
   */
  async clearQuestionnaireCache(questionnaireId: string): Promise<void> {
    await this.delPattern(`questionnaire:${questionnaireId}:*`)
  }

  /**
   * 清除量表相关缓存
   */
  async clearScaleCache(scaleId: string): Promise<void> {
    await this.delPattern(`scale:${scaleId}:*`)
  }
}

// 单例模式
export const cacheService = new CacheService()

// 导出配置
export { CACHE_CONFIG }
