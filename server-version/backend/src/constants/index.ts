/**
 * 统一常量定义
 */

export * from './messages'

// 分页默认配置
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 100,
  MAX_PAGE_SIZE: 100,
} as const

// 缓存时间配置（秒）
export const CACHE_TTL = {
  SHORT: 60,      // 1分钟
  MEDIUM: 300,    // 5分钟
  LONG: 3600,     // 1小时
} as const

// 文件大小限制（字节）
export const FILE_LIMITS = {
  IMAGE: 10 * 1024 * 1024,      // 10MB
  VIDEO: 500 * 1024 * 1024,     // 500MB
  DOCUMENT: 50 * 1024 * 1024,   // 50MB
} as const

// 允许的 MIME 类型
export const ALLOWED_TYPES = {
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  VIDEO: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  DOCUMENT: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
} as const

// 限流配置
export const RATE_LIMIT = {
  LOGIN_WINDOW_MS: 15 * 60 * 1000,  // 15分钟
  LOGIN_MAX_ATTEMPTS: 5,
  API_WINDOW_MS: 60 * 1000,         // 1分钟
  API_MAX_REQUESTS: 100,
} as const
