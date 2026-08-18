import dotenv from 'dotenv'
import { z } from 'zod'
import path from 'path'

dotenv.config()

// 使用 Zod 验证环境变量配置
const configSchema = z.object({
  port: z.number().int().min(1).max(65535),
  nodeEnv: z.enum(['development', 'production', 'test']),
  databaseUrl: z.string().url(),
  jwtSecret: z.string().min(32, 'JWT_SECRET must be at least 32 characters in production'),
  jwtExpiresIn: z.string(),
  uploadDir: z.string(),
  adminUsername: z.string().min(1),
  adminPassword: z.string().min(6),
  // 数据加密密钥 (可选，生产环境必需)
  dataEncryptionKey: z.string().optional(),
  // COS 配置 (可选)
  cosSecretId: z.string().optional(),
  cosSecretKey: z.string().optional(),
  cosBucket: z.string().optional(),
  cosRegion: z.string().optional(),
  cosDomain: z.string().optional(),
})

const parsePort = () => {
  const port = parseInt(process.env.PORT || '3000')
  if (isNaN(port)) return 3000
  return port
}

// 获取项目根目录（backend目录）
const projectRoot = path.resolve(__dirname, '..')

const rawConfig = {
  port: parsePort(),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://ptool:ptool123@localhost:5432/ptool?schema=public',
  jwtSecret: process.env.NODE_ENV === 'production' ? (process.env.JWT_SECRET || '') : (process.env.JWT_SECRET || 'dev-secret-key-not-for-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // 使用绝对路径，避免PM2等工作目录问题
  uploadDir: process.env.UPLOAD_DIR || path.join(projectRoot, 'uploads'),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  // 数据加密密钥 (生产环境必需)
  dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY,
  // COS 配置 (可选)
  cosSecretId: process.env.COS_SECRET_ID,
  cosSecretKey: process.env.COS_SECRET_KEY,
  cosBucket: process.env.COS_BUCKET,
  cosRegion: process.env.COS_REGION,
  cosDomain: process.env.COS_DOMAIN,
}

// 生产环境强制检查
if (rawConfig.nodeEnv === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('❌ JWT_SECRET must be set and at least 32 characters in production mode')
  }
  if (!process.env.DATA_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY.length !== 64) {
    throw new Error('❌ DATA_ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes) in production mode')
  }
}

const result = configSchema.safeParse(rawConfig)

if (!result.success) {
  console.error('❌ Configuration validation failed:', result.error.errors)
  throw new Error(`Configuration error: ${result.error.errors.map(e => e.message).join(', ')}`)
}

export const config = result.data
