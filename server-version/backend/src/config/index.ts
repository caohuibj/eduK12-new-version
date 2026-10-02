import dotenv from 'dotenv'
import { z } from 'zod'
import path from 'path'
import { HEX_32_BYTE_KEY } from '../utils/encryption'
import { logger } from '../utils/logger'
import { resolveBackgroundWorkersEnabled } from './backgroundWorkers'

dotenv.config()

// 使用 Zod 验证环境变量配置
const configSchema = z.object({
  port: z.number().int().min(1).max(65535),
  nodeEnv: z.enum(['development', 'production', 'test']),
  corsOrigin: z.string().min(1),
  databaseUrl: z.string().url(),
  trustProxyHops: z.number().int().min(0).max(10),
  jwtSecret: z.string().min(32, 'JWT_SECRET must be at least 32 characters in production'),
  jwtExpiresIn: z.string(),
  cookieSecure: z.boolean(),
  assetSigningSecret: z.string().min(32, 'ASSET_SIGNING_SECRET must be at least 32 characters'),
  uploadDir: z.string(),
  publicCheckinUploadIpLimit: z.number().int().min(1).max(10000),
  publicCheckinUploadTokenLimit: z.number().int().min(1).max(10000),
  publicCheckinSubmitIpLimit: z.number().int().min(1).max(10000),
  publicCheckinSubmitTokenLimit: z.number().int().min(1).max(10000),
  publicAssessmentWindowMs: z.number().int().min(60_000).max(3_600_000),
  // Classroom NAT sizing (IP budgets). Distinct from shared-link start-token audience.
  publicAssessmentExpectedClassSize: z.number().int().min(1).max(100_000),
  // Shared public start-link audience (token budgets). Not the same as class size.
  publicAssessmentExpectedStartTokenAudience: z.number().int().min(1).max(100_000),
  publicAssessmentIpGetLimit: z.number().int().min(1).max(5_000_000),
  publicAssessmentIpFinalLimit: z.number().int().min(1).max(5_000_000),
  publicAssessmentTokenGetLimit: z.number().int().min(1).max(5_000_000),
  publicAssessmentTokenFinalLimit: z.number().int().min(1).max(5_000_000),
  publicAssessmentRecoveryGetLimit: z.number().int().min(1).max(5_000_000),
  publicAssessmentRecoveryFinalLimit: z.number().int().min(1).max(5_000_000),
  // Keep legacy static uploads available only during the reversible migration
  // window. Set ASSET_MIGRATION_COMPLETE=true after all references are copied
  // and verified.
  legacyUploadsEnabled: z.boolean(),
  assetMigrationComplete: z.boolean(),
  // 数据加密密钥 (可选，生产环境必需)
  dataEncryptionKey: z.string().optional(),
  // Cognitive 模块开关（严格 true/false，Milestone D 完整验收前默认 false）
  cognitiveModuleEnabled: z.boolean(),
  parentPortalEnabled: z.boolean(),
  miniClassroomEnabled: z.boolean(),
  // 材料授权总开关。默认 true：空 grant 表等于今天的 creatorId 隔离，打开不会突然暴露材料。
  materialGrantsEnabled: z.boolean(),
  // Consume video/image/export Bull jobs in this process. Default on except NODE_ENV=test.
  backgroundWorkersEnabled: z.boolean(),
  socketRedisRequired: z.boolean(),
  // Cognitive 参与者假名化密钥（64 位十六进制；生产环境必需，独立于 DATA_ENCRYPTION_KEY）
  dataPseudonymKey: z.string().optional(),
  // COS 配置 (可选)
  cosSecretId: z.string().optional(),
  cosSecretKey: z.string().optional(),
  cosBucket: z.string().optional(),
  cosRegion: z.string().optional(),
  cosDomain: z.string().optional(),
})

const parsePort = () => {
  const port = Number(process.env.PORT ?? '3000')
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535')
  return port
}

const parseNonNegativeInteger = (name: string, fallback: number): number => {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`❌ ${name} must be a non-negative integer (got '${value}')`)
  }
  return parsed
}

const parsePositiveInteger = (name: string, fallback: number): number => {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10000) {
    throw new Error(`❌ ${name} must be an integer between 1 and 10000 (got '${value}')`)
  }
  return parsed
}


const parseBoundedInteger = (name: string, fallback: number, min: number, max: number): number => {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`❌ ${name} must be an integer between ${min} and ${max} (got '${value}')`)
  }
  return parsed
}

/** Derive public-assessment ceilings from class-size (IP) / start-token-audience (token) formulas unless an explicit limit is set. */
const resolvePublicAssessmentLimit = (
  explicitName: string,
  formulaValue: number,
): number => {
  const explicit = process.env[explicitName]
  if (explicit !== undefined && explicit !== '') {
    return parseBoundedInteger(explicitName, formulaValue, 1, 5_000_000)
  }
  if (!Number.isSafeInteger(formulaValue) || formulaValue < 1) {
    throw new Error(`❌ Derived ${explicitName} must be a positive integer (got ${formulaValue})`)
  }
  return Math.min(5_000_000, formulaValue)
}


// 严格布尔环境变量解析：仅接受 'true'/'false'，缺省回落 fallback。
// 不允许使用 z.coerce.boolean()（因为 Boolean('false') === true，会误判）。
const parseBooleanEnv = (name: string, fallback: boolean): boolean => {
  const v = process.env[name]
  if (v === undefined) return fallback
  if (v === 'true') return true
  if (v === 'false') return false
  throw new Error(`❌ ${name} must be 'true' or 'false' (got '${v}')`)
}

// 获取项目根目录（backend目录）
const projectRoot = path.resolve(__dirname, '..')


// Class size drives IP NAT budgets only. Shared-link audience is separate:
// one public start-token may be opened by far more students than one classroom.
const publicAssessmentExpectedClassSize = parsePositiveInteger('PUBLIC_ASSESSMENT_EXPECTED_CLASS_SIZE', 60)
const publicAssessmentExpectedStartTokenAudience = parsePositiveInteger(
  'PUBLIC_ASSESSMENT_EXPECTED_START_TOKEN_AUDIENCE',
  500,
)
const publicAssessmentGetsPerStudent = parsePositiveInteger('PUBLIC_ASSESSMENT_GETS_PER_STUDENT', 40)
const publicAssessmentFinalsPerStudent = parsePositiveInteger('PUBLIC_ASSESSMENT_FINALS_PER_STUDENT', 8)
const publicAssessmentNatShareFactor = parsePositiveInteger('PUBLIC_ASSESSMENT_NAT_SHARE_FACTOR', 50)
// F3 (Gate-E): a single public bundle may legally finalize > 8 units across its
// children; the recovery FINAL ceiling must cover that bundle width plus a
// restart/idempotent-retry headroom instead of hard-binding finalsPerStudent.
// Env override keeps production tunable.
const publicAssessmentRecoveryBundleMultiplier = parsePositiveInteger('PUBLIC_ASSESSMENT_RECOVERY_BUNDLE_MULTIPLIER', 4)

const rawConfig = {
  port: parsePort(),
  nodeEnv: process.env.NODE_ENV || 'development',
  // Cookie authentication requires a concrete origin; Compose overrides this
  // for the deployed frontend and local development uses Vite's default.
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Development still requires an explicit DATABASE_URL when credentials are
  // needed; the fallback intentionally contains no embedded password.
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/ptool?schema=public',
  // Docker production topology is frontend proxy -> backend, while local
  // development normally has no trusted proxy in front of the API.
  trustProxyHops: parseNonNegativeInteger('TRUST_PROXY_HOPS', process.env.NODE_ENV === 'production' ? 1 : 0),
  jwtSecret: process.env.NODE_ENV === 'production' ? (process.env.JWT_SECRET || '') : (process.env.JWT_SECRET || 'dev-secret-key-not-for-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieSecure: parseBooleanEnv('COOKIE_SECURE', process.env.NODE_ENV === 'production'),
  // Production must supply a separate signing key. The development fallback
  // keeps the local test environment self-contained without reusing JWT.
  assetSigningSecret: process.env.ASSET_SIGNING_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-asset-signing-secret-not-for-production'),
  // 使用绝对路径，避免PM2等工作目录问题
  uploadDir: process.env.UPLOAD_DIR || path.join(projectRoot, 'uploads'),
  // Public check-in limits use a 15-minute window.
  // Assessment IP limits use class_size × per_student × NAT (school NAT share).
  // Assessment start-token limits use start_token_audience × per_student
  // (shared-link audience ≠ classroom size).
  publicCheckinUploadIpLimit: parsePositiveInteger('PUBLIC_CHECKIN_UPLOAD_IP_LIMIT', 1800),
  publicCheckinUploadTokenLimit: parsePositiveInteger('PUBLIC_CHECKIN_UPLOAD_TOKEN_LIMIT', 600),
  publicCheckinSubmitIpLimit: parsePositiveInteger('PUBLIC_CHECKIN_SUBMIT_IP_LIMIT', 600),
  publicCheckinSubmitTokenLimit: parsePositiveInteger('PUBLIC_CHECKIN_SUBMIT_TOKEN_LIMIT', 120),
  publicAssessmentWindowMs: parseBoundedInteger('PUBLIC_ASSESSMENT_WINDOW_MS', 15 * 60 * 1000, 60_000, 3_600_000),
  publicAssessmentExpectedClassSize,
  publicAssessmentExpectedStartTokenAudience,
  publicAssessmentIpGetLimit: resolvePublicAssessmentLimit(
    'PUBLIC_ASSESSMENT_IP_GET_LIMIT',
    publicAssessmentExpectedClassSize * publicAssessmentGetsPerStudent * publicAssessmentNatShareFactor,
  ),
  publicAssessmentIpFinalLimit: resolvePublicAssessmentLimit(
    'PUBLIC_ASSESSMENT_IP_FINAL_LIMIT',
    publicAssessmentExpectedClassSize * publicAssessmentFinalsPerStudent * publicAssessmentNatShareFactor,
  ),
  publicAssessmentTokenGetLimit: resolvePublicAssessmentLimit(
    'PUBLIC_ASSESSMENT_TOKEN_GET_LIMIT',
    publicAssessmentExpectedStartTokenAudience * publicAssessmentGetsPerStudent,
  ),
  publicAssessmentTokenFinalLimit: resolvePublicAssessmentLimit(
    'PUBLIC_ASSESSMENT_TOKEN_FINAL_LIMIT',
    publicAssessmentExpectedStartTokenAudience * publicAssessmentFinalsPerStudent,
  ),
  publicAssessmentRecoveryGetLimit: resolvePublicAssessmentLimit(
    'PUBLIC_ASSESSMENT_RECOVERY_GET_LIMIT',
    publicAssessmentGetsPerStudent,
  ),
  publicAssessmentRecoveryFinalLimit: resolvePublicAssessmentLimit(
    'PUBLIC_ASSESSMENT_RECOVERY_FINAL_LIMIT',
    // F3: cover a full legal (multi-unit) bundle width + restart/idempotent headroom.
    publicAssessmentFinalsPerStudent * publicAssessmentRecoveryBundleMultiplier,
  ),
  legacyUploadsEnabled: !parseBooleanEnv('ASSET_MIGRATION_COMPLETE', false),
  assetMigrationComplete: parseBooleanEnv('ASSET_MIGRATION_COMPLETE', false),
  // 数据加密密钥 (生产环境必需)
  dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY,
  // Cognitive 模块开关（严格解析；Milestone D 完整验收前默认 false，避免提前污染生产）
  cognitiveModuleEnabled: parseBooleanEnv('COGNITIVE_MODULE_ENABLED', false),
  parentPortalEnabled: parseBooleanEnv('PARENT_PORTAL_ENABLED', false),
  miniClassroomEnabled: parseBooleanEnv('MINI_CLASSROOM_ENABLED', false),
  materialGrantsEnabled: parseBooleanEnv('MATERIAL_GRANTS_ENABLED', true),
  backgroundWorkersEnabled: resolveBackgroundWorkersEnabled(),
  // Socket.IO room broadcasts are not safe to run in a multi-process
  // deployment without the Redis adapter.  Production therefore requires it
  // by default; development and test keep the single-process fallback.
  socketRedisRequired: parseBooleanEnv('SOCKET_REDIS_REQUIRED', process.env.NODE_ENV === 'production'),
  // Cognitive 参与者假名化密钥（生产环境必需）
  dataPseudonymKey: process.env.DATA_PSEUDONYM_KEY,
  // COS 配置 (可选)
  cosSecretId: process.env.COS_SECRET_ID,
  cosSecretKey: process.env.COS_SECRET_KEY,
  cosBucket: process.env.COS_BUCKET,
  cosRegion: process.env.COS_REGION,
  cosDomain: process.env.COS_DOMAIN,
}

// 生产环境强制检查
if (rawConfig.nodeEnv === 'production') {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    throw new Error('❌ DATABASE_URL must be set in production mode')
  }
  if (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN.trim() === '*') {
    throw new Error('❌ CORS_ORIGIN must be set to a specific frontend origin in production mode')
  }
  const origin = new URL(rawConfig.corsOrigin)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('CORS_ORIGIN must be one exact HTTP(S) origin')
  if (origin.protocol === 'https:' && !rawConfig.cookieSecure) throw new Error('COOKIE_SECURE=true is required for HTTPS production')
  if (rawConfig.trustProxyHops < 1) throw new Error('TRUST_PROXY_HOPS must match the production single ingress (at least 1)')
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('❌ JWT_SECRET must be set and at least 32 characters in production mode')
  }
  if (!process.env.DATA_ENCRYPTION_KEY || !HEX_32_BYTE_KEY.test(process.env.DATA_ENCRYPTION_KEY)) {
    throw new Error('❌ DATA_ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes) in production mode')
  }
  // Cognitive 关闭时，旧 eduK12 系统仍应正常启动（模块隔离原则）：
  // 仅当 COGNITIVE_MODULE_ENABLED=true 才强制要求 DATA_PSEUDONYM_KEY。
  if (rawConfig.cognitiveModuleEnabled) {
    if (!process.env.DATA_PSEUDONYM_KEY || !HEX_32_BYTE_KEY.test(process.env.DATA_PSEUDONYM_KEY)) {
      throw new Error('❌ DATA_PSEUDONYM_KEY must be set and exactly 64 hex characters (32 bytes) when COGNITIVE_MODULE_ENABLED=true in production mode')
    }
  }
}

const result = configSchema.safeParse(rawConfig)

if (!result.success) {
  logger.error('Configuration validation failed', result.error.errors)
  throw new Error(`Configuration error: ${result.error.errors.map(e => e.message).join(', ')}`)
}

export const config = result.data
