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

  // 3. 回退：非生产允许 localhost；生产缺少配置时显式抛出，禁止静默回退 localhost
  if (process.env.NODE_ENV !== 'production') {
    return DEV_FALLBACK
  }

  // 生产环境未配置 Redis：显式失败，避免静默连接不存在的 localhost:6379
  // （cacheService / socketService 已在各自 initialize() 中 catch 并降级）
  throw new Error(
    '[redis] NODE_ENV=production 但未配置 REDIS_URL / REDIS_HOST；' +
      '拒绝回退到 localhost。请在 compose / 环境显式配置 Redis 连接。'
  )
}

/**
 * Bull Queue（底层 ioredis）连接选项。
 * ioredis 接受 Redis 连接 URL 字符串，无需拆成 host/port。
 *
 * 注意：按 Milestone D v1.2 收口（D0-9.1），生产环境缺 Redis 配置时
 * getRedisUrl() 会显式抛出；但 Bull 队列按既有系统行为处理（保留回退地址），
 * 因此此处 catch 后回退，避免队列模块在 import 时直接崩溃导致整个后端无法启动。
 */
export function getBullRedisOptions(): string {
  try {
    return getRedisUrl()
  } catch {
    logger.warn(
      '[redis] Bull 队列使用回退 Redis 地址（生产环境应显式配置 REDIS_URL）'
    )
    return DEV_FALLBACK
  }
}
