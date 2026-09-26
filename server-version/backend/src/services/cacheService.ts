/**
 * Redis 缓存服务
 * 用于缓存频繁访问的数据，减少数据库查询
 */

import { createClient } from 'redis'
import { logger } from '../utils/logger'
import { getRedisUrl } from '../config/redis'

/**
 * 缓存配置
 */
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export interface RateLimitState {
  count: number
  retryAfterSeconds: number
}

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

export type QuestionnaireStartContent = {
  formItems: Array<{
    id: string
    questionnaireId: string
    type: string
    label: string
    placeholder: string | null
    required: boolean
    position: number
    options: unknown
    contextKey: string | null
    createdAt: Date | string
    updatedAt: Date | string
  }>
  questionnaireScales: Array<{
    id: string
    questionnaireId: string
    scaleId: string
    position: number
    scale: {
      id: string
      code: string
      name: string
      description: string | null
      estimatedTime: number | null
      instruction: string | null
      status: string
      instrumentClass: string
      instrumentVersion: string
      definition: unknown
    }
  }>
}

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { count, ttl }
`

const WEIGHTED_RATE_LIMIT_SCRIPT = `
local cost = tonumber(ARGV[2])
local count = redis.call('INCRBY', KEYS[1], cost)
if count == cost then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { count, ttl }
`

const SEMAPHORE_ACQUIRE_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
if current >= limit then
  return { 0, current }
end
local next = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return { 1, next }
`

const SEMAPHORE_RELEASE_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current <= 1 then
  redis.call('DEL', KEYS[1])
  return 0
end
return redis.call('DECR', KEYS[1])
`

/**
 * Redis 缓存服务类
 */
class CacheService {
  private client: any = null
  private isConnected: boolean = false
  private readonly inFlight = new Map<string, Promise<unknown>>()
  private cacheWriteEpoch = 0

  /**
   * 初始化 Redis 客户端
   */
  async initialize(): Promise<void> {
    try {
      this.client = createClient({
        url: getRedisUrl(),
      })

      this.client.on('error', (err: Error) => {
        logger.error('[CacheService] Redis客户端错误')
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
      logger.error('[CacheService] Redis连接失败')
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
      // High-frequency hot path: hit/miss must not produce INFO (string
      // interpolation + stdout + docker logging). Keep lifecycle INFO and
      // failure WARN/ERROR; per-access outcome goes to DEBUG only and never
      // interpolates the key (template interpolation still allocates even when
      // the DEBUG level is disabled).
      if (!value) {
        logger.debug('[CacheService] 缓存未命中')
        return null
      }
      logger.debug('[CacheService] 缓存命中')
      return JSON.parse(value) as T
    } catch (error) {
      logger.error('[CacheService] 获取缓存失败')
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
      logger.debug('[CacheService] 缓存已设置')
    } catch (error) {
      logger.error('[CacheService] 设置缓存失败')
    }
  }

  /**
   * 删除缓存
   */
  async del(key: string): Promise<void> {
    this.cacheWriteEpoch += 1
    if (!this.isConnected || !this.client) {
      return
    }

    try {
      await this.client.del(key)
    } catch (error) {
      logger.error('[CacheService] 删除缓存失败')
    }
  }

  /**
   * 批量删除缓存（按模式）
   */
  async delPattern(pattern: string): Promise<void> {
    // A mutation can race with an origin read that started before the
    // invalidation. Advance the epoch even when Redis is unavailable so that
    // that read cannot populate a stale value after the delete completes.
    this.cacheWriteEpoch += 1
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
      logger.error('[CacheService] 批量删除缓存失败')
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
      logger.debug('[CacheService] 缓存命中')
      return cachedValue
    }

    // A start burst can miss Redis on every request at the same time. Share
    // the origin read inside this process so one cache miss does not become a
    // database connection burst. The promise is removed after completion so
    // errors never poison future requests.
    const pending = this.inFlight.get(key)
    if (pending) return pending as Promise<T>

    const writeEpoch = this.cacheWriteEpoch
    const request = (async () => {
      const value = await fetchFunction()
      if (this.cacheWriteEpoch === writeEpoch) await this.set(key, value, ttl)
      return value
    })()
    this.inFlight.set(key, request)

    // 缓存未命中，执行函数获取数据
    try {
      logger.debug('[CacheService] 缓存未命中')
      return await request
    } finally {
      if (this.inFlight.get(key) === request) this.inFlight.delete(key)
    }
  }


  /**
   * Atomically consume one Redis-backed rate-limit token.
   *
   * Returning null is intentional: public classroom lookup callers must fail
   * closed when Redis is unavailable instead of silently bypassing limits.
   */
  async consumeRateLimit(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult | null> {
    if (!this.isConnected || !this.client) {
      return null
    }

    try {
      const rawResult = await this.client.eval(RATE_LIMIT_SCRIPT, {
        keys: [key],
        arguments: [String(windowSeconds)],
      }) as unknown
      if (!Array.isArray(rawResult) || rawResult.length < 2) {
        return null
      }

      const count = Number(rawResult[0])
      const ttl = Number(rawResult[1])
      if (!Number.isFinite(count) || count < 1 || !Number.isFinite(ttl)) {
        return null
      }

      const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds,
      }
    } catch {
      return null
    }
  }

  /** Consume a variable-cost fixed-window budget atomically. */
  async consumeWeightedRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
    cost: number,
  ): Promise<RateLimitResult | null> {
    if (!this.isConnected || !this.client) return null
    if (!Number.isSafeInteger(cost) || cost < 1 || !Number.isSafeInteger(limit) || limit < 1) return null
    try {
      const rawResult = await this.client.eval(WEIGHTED_RATE_LIMIT_SCRIPT, {
        keys: [key],
        arguments: [String(windowSeconds), String(cost)],
      }) as unknown
      if (!Array.isArray(rawResult) || rawResult.length < 2) return null
      const count = Number(rawResult[0])
      const ttl = Number(rawResult[1])
      if (!Number.isFinite(count) || count < cost || !Number.isFinite(ttl)) return null
      const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds,
      }
    } catch {
      return null
    }
  }

  /** Acquire a small Redis-backed semaphore with a fail-safe TTL. */
  async acquireSemaphore(key: string, limit: number, ttlSeconds: number): Promise<boolean | null> {
    if (!this.isConnected || !this.client) return null
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) return null
    try {
      const rawResult = await this.client.eval(SEMAPHORE_ACQUIRE_SCRIPT, {
        keys: [key],
        arguments: [String(limit), String(ttlSeconds)],
      }) as unknown
      if (!Array.isArray(rawResult) || rawResult.length < 1) return null
      return Number(rawResult[0]) === 1
    } catch {
      return null
    }
  }

  async releaseSemaphore(key: string): Promise<void> {
    if (!this.isConnected || !this.client) return
    try {
      await this.client.eval(SEMAPHORE_RELEASE_SCRIPT, { keys: [key], arguments: [] })
    } catch {
      logger.warn('[CacheService] Redis semaphore release failed')
    }
  }

  /** Read a fixed-window counter without consuming another token. */
  async getRateLimitState(key: string): Promise<RateLimitState | null> {
    if (!this.isConnected || !this.client) return null
    try {
      const [value, ttl] = await Promise.all([
        this.client.get(key),
        this.client.ttl(key),
      ])
      const count = Number(value || 0)
      const retryAfterSeconds = Number(ttl)
      if (!Number.isFinite(count) || count < 0 || !Number.isFinite(retryAfterSeconds)) return null
      return { count, retryAfterSeconds: retryAfterSeconds > 0 ? retryAfterSeconds : 0 }
    } catch {
      return null
    }
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
      logger.error('[CacheService] 获取统计信息失败')
      return { connected: false, error: 'cache_unavailable' }
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
        include: { scale: true },
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
   * Read the immutable content envelope used by questionnaire start/resume.
   * Authorization and attempt state stay outside this cache; only published
   * questionnaire content is shared. Keeping the projection explicit avoids
   * pulling unrelated questionnaire/scale columns into every start request.
   */
  async getQuestionnaireStartContent(questionnaireId: string): Promise<QuestionnaireStartContent> {
    const key = `questionnaire:${questionnaireId}:start-content:v1`
    return this.getOrSet(key, async () => {
      const { prisma } = await import('../config/database')
      const [formItems, questionnaireScales] = await Promise.all([
        prisma.questionnaireFormItem.findMany({
          where: { questionnaireId },
          select: {
            id: true,
            questionnaireId: true,
            type: true,
            label: true,
            placeholder: true,
            required: true,
            position: true,
            options: true,
            contextKey: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { position: 'asc' },
        }),
        prisma.questionnaireScale.findMany({
          where: { questionnaireId },
          select: {
            id: true,
            questionnaireId: true,
            scaleId: true,
            position: true,
            scale: {
              select: {
                id: true,
                code: true,
                name: true,
                description: true,
                estimatedTime: true,
                instruction: true,
                status: true,
                instrumentClass: true,
                instrumentVersion: true,
                definition: true,
              },
            },
          },
          orderBy: { position: 'asc' },
        }),
      ])
      return { formItems, questionnaireScales }
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
        include: { assessments: false }
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
