/**
 * 统一 Redis 连接配置（Milestone C / KI-001）
 *
 * 所有 Redis 消费者（Bull Queue / CacheService / Socket.IO Adapter）
 * 必须统一通过本模块获取连接串，禁止各自解析 REDIS_HOST / REDIS_PORT。
 *
 * 优先级：
 *   1. REDIS_URL                       （Docker 环境唯一提供）
 *   2. REDIS_HOST + REDIS_PORT + REDIS_PASSWORD
 *   3. 本地开发回退 redis://localhost:6379（仅非 production）
 *
 * Docker Baseline 的 compose 仅注入 REDIS_URL=redis://redis:6379。
 */

import { logger } from '../utils/logger'

const DEV_FALLBACK = 'redis://localhost:6379'

export function getRedisUrl(): string {
  // 1. 首选 REDIS_URL
  const url = process.env.REDIS_URL
  if (url) {
    return url
  }

  // 2. 兼容旧式 Host/legacy 的 REDIS_HOST 拼装
  const host = process.env.REDIS_HOST
  if (host) {
    const port = process.env.REDIS_PORT || '6379'
    const password = process.env.REDIS_PASSWORD
    const auth = password ? `:${password}@` : ''
    return `redis://${auth}${host}:${port}`
  }

  // 3. 回退：非生产允许 localhost；生产缺少配置时显式告警（不再静默连 localhost）
  if (process.env.NODE_ENV !== 'production') {
    return DEV_FALLBACK
  }

  logger.error(
    '[redis] 生产环境未配置 REDIS_URL / REDIS_HOST，Redis 相关功能将不可用'
  )
  return DEV_FALLBACK
}

/**
 * Bull Queue（底层 ioredis）连接选项。
 * ioredis 接受 Redis 连接 URL 字符串，无需拆成 host/port。
 */
export function getBullRedisOptions(): string {
  return getRedisUrl()
}
