import express from 'express'
import { publicAssessmentRateLimiters } from './middleware/publicAssessmentRateLimit'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'
import { config } from './config'
import { startBackgroundWorkers } from './config/backgroundWorkers'
import { prisma } from './config/database'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { authenticate, requireAdmin } from './middleware/auth'
import { logger } from './utils/logger'
import { socketService } from './services/socketService'
import { classroomSocketHandler } from './services/classroomSocketHandler'
import { requestId } from './middleware/requestId'
import { csrfProtection } from './middleware/csrf'
import { legacyUploadGuard } from './middleware/legacyUploadGuard'

// Redis缓存服务
import { cacheService } from './services/cacheService'
import { closeQueues } from './config/queue'
import { cleanupExpiredExportArtifacts } from './services/exportStorage'
import { cleanupExpiredSubmissionIdempotencyReceipts } from './utils/submissionIdempotency'
import { recordRequestPhase, requestObservabilityMiddleware, runtimeMetricLines } from './services/runtimeObservability'

// 导入路由
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import courseRoutes from './routes/courses'
import assignmentRoutes from './routes/assignments'
import checkinRoutes from './routes/checkins'
import videoRoutes from './routes/videos'
import teacherCodeRoutes from './routes/teacherCodes'
import uploadRoutes from './routes/uploads'
import scaleRoutes from './routes/scales'
import scaleLibraryRoutes from './routes/scaleLibrary'
import situationalRoutes from './routes/situational'
import questionnaireRoutes from './routes/questionnaires'
import questionnaireProductRoutes from './modules/questionnaire-product/routes'
import documentRoutes from './routes/documents'
import publicRoutes from './routes/public'
import generalQuestionnaireRoutes from './routes/generalQuestionnaires'
import classroomRoutes from './routes/classrooms'
// 认知测评路由（D3+；仅在 COGNITIVE_MODULE_ENABLED=true 时挂载）
import cognitiveRoutes from './modules/cognitive/cognitive.routes'
import cognitivePublicRoutes from './modules/cognitive/cognitive.public.routes'
import compositeRoutes from './modules/composite/composite.routes'
import compositePublicRoutes from './modules/composite/composite.public.routes'
import capabilitiesRoutes from './routes/capabilities'
import materialGrantRoutes from './routes/materialGrants'
import instrumentAuthorizationRoutes from './routes/instrumentAuthorizations'
import assetRoutes, { publicAssetRouter } from './routes/assets'
import relationalProductRoutes from './modules/assessment-relational/product.routes'
import organizationRoutes from './modules/organization/organization.routes'

const app = express()

// 创建 HTTP 服务器
const server = createServer(app)

app.use(requestObservabilityMiddleware)

// 信任反向代理 - hop 数由部署拓扑显式配置，避免错误解析客户端 IP。
app.set('trust proxy', config.trustProxyHops)

// 禁用 API 缓存 - 确保数据实时更新
app.set('etag', false)
app.use(requestId)
app.use((req, res, next) => {
  // 对 API 请求禁用缓存
  if (req.path.startsWith('/api')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
  }
  next()
})

// 中间件
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))
app.use(cors({ origin: config.corsOrigin, credentials: true }))
const jsonBodyParser = express.json({ limit: '2mb' })
const urlencodedBodyParser = express.urlencoded({ extended: true, limit: '1mb' })
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint()
  jsonBodyParser(req, res, (error) => {
    const endedAt = process.hrtime.bigint()
    const method = String(req.method || 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      recordRequestPhase(
        'request_body_receive_parse',
        Number(endedAt - startedAt) / 1_000_000,
        startedAt,
        endedAt,
      )
    }
    if (error) {
      next(error)
      return
    }
    next()
  })
})
app.use((req, res, next) => {
  // json parser already consumed JSON bodies; urlencoded only runs for form posts.
  if (req.is('application/json')) {
    next()
    return
  }
  const startedAt = process.hrtime.bigint()
  urlencodedBodyParser(req, res, (error) => {
    const endedAt = process.hrtime.bigint()
    const method = String(req.method || 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && req.is('application/x-www-form-urlencoded')) {
      recordRequestPhase(
        'request_body_receive_parse',
        Number(endedAt - startedAt) / 1_000_000,
        startedAt,
        endedAt,
      )
    }
    next(error)
  })
})
app.use('/api', csrfProtection)

// 静态文件服务 - 使用绝对路径
logger.info('[Server] Static files configured', { uploadDir: config.uploadDir })
app.use('/uploads', legacyUploadGuard(config.legacyUploadsEnabled), express.static(config.uploadDir, {
  maxAge: '7d',
  immutable: true
}))

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    const socketRedisState = socketService.getRedisState()
    const socketReady = socketRedisState !== 'failed' || !config.socketRedisRequired
    const cacheRedisState = cacheService.getStatus().connected ? 'ready' : 'failed'
    const cacheRedisReady = cacheRedisState === 'ready' || config.nodeEnv !== 'production'
    if (!socketReady || !cacheRedisReady) {
      return res.status(503).json({
        status: 'unready',
        dependencies: {
          database: 'ready',
          socketRedis: socketRedisState,
          cacheRedis: cacheRedisState,
        },
        timestamp: new Date().toISOString(),
      })
    }
    res.json({
      status: 'ok',
      dependencies: {
        database: 'ready',
        socketRedis: socketRedisState,
        cacheRedis: cacheRedisState,
      },
      timestamp: new Date().toISOString(),
    })
  } catch {
    res.status(503).json({ status: 'unready', dependencies: { database: 'failed' }, timestamp: new Date().toISOString() })
  }
})

// Prometheus-compatible process metrics.  The backend is only reachable from
// the Compose network in production; the endpoint intentionally contains no
// request payload, account, or assessment data.
app.get('/metrics', async (_req, res) => {
  const lines = [
    ...runtimeMetricLines(),
    '# HELP ptool_socket_redis_state Socket Redis adapter state (1 for current state).',
    '# TYPE ptool_socket_redis_state gauge',
    `ptool_socket_redis_state{state="ready"} ${socketService.getRedisState() === 'ready' ? 1 : 0}`,
    `ptool_socket_redis_state{state="degraded"} ${socketService.getRedisState() === 'degraded' ? 1 : 0}`,
    `ptool_socket_redis_state{state="failed"} ${socketService.getRedisState() === 'failed' ? 1 : 0}`,
  ]
  const backupStatusFile = process.env.BACKUP_STATUS_FILE
  if (backupStatusFile) {
    try {
      const timestamp = Number(require('fs').readFileSync(backupStatusFile, 'utf8').trim())
      if (Number.isFinite(timestamp) && timestamp > 0) {
        lines.push('# HELP ptool_backup_last_success_timestamp_seconds Unix timestamp of the last verified backup.')
        lines.push('# TYPE ptool_backup_last_success_timestamp_seconds gauge')
        lines.push(`ptool_backup_last_success_timestamp_seconds ${timestamp}`)
      }
    } catch {
      // Missing status is intentionally left visible to Prometheus as absent.
    }
  }
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8').send(`${lines.join('\n')}\n`)
})

// Runtime capabilities (public; backend flag is the source of truth)
app.use('/api/capabilities', capabilitiesRoutes)

// API 路由
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/organizations', organizationRoutes)
app.use('/api/admin/material-grants', authenticate, requireAdmin, materialGrantRoutes)
app.use('/api/admin/instrument-authorizations', authenticate, requireAdmin, instrumentAuthorizationRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/assignments', assignmentRoutes)
app.use('/api/checkins', checkinRoutes)
app.use('/api/videos', videoRoutes)
app.use('/api/teacher-codes', teacherCodeRoutes)
app.use('/api/uploads', uploadRoutes)
app.use('/api/scales', scaleRoutes)
app.use('/api/scale-library', scaleLibraryRoutes)
app.use('/api/situational', situationalRoutes)
app.use('/api/questionnaires', questionnaireRoutes)
app.use('/api/questionnaire-products', questionnaireProductRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/assets', assetRoutes)
app.use('/api/public/assets', publicAssetRouter)
// 泛化问卷路由（新增）

app.use('/api/general-questionnaires', generalQuestionnaireRoutes)
// 综合测评：将量表、表单和认知任务放入同一完成容器；公开入口不要求登录。
app.use('/api/composite-assessments', compositeRoutes)
app.use('/api/relational-assessments', relationalProductRoutes)
app.use('/api/public/composite-assessments', ...publicAssessmentRateLimiters, compositePublicRoutes)
// 课堂互动路由（新增）
app.use('/api/classrooms', classroomRoutes)

// 认知测评路由（D3+）：feature flag 默认 false —— 关闭时 /api/cognitive/* 走 404，旧路由零改动
if (config.cognitiveModuleEnabled) {
  app.use('/api/cognitive', cognitiveRoutes)
  app.use('/api/public/cognitive', ...publicAssessmentRateLimiters, cognitivePublicRoutes)
}

app.use('/api/public', ...publicAssessmentRateLimiters, publicRoutes)

// 404 处理
app.use(notFoundHandler)

// 错误处理
app.use(errorHandler)

// The HTTP listener is deliberately started only after required dependencies
// have initialized. This keeps PM2/Docker from declaring a process ready while
// classroom broadcasts are silently running without cross-process delivery.
let exportCleanupTimer: ReturnType<typeof setInterval> | null = null
let submissionReceiptCleanupTimer: ReturnType<typeof setInterval> | null = null
let serverListening = false
let shutdownStarted = false

const gracefulShutdown = async (signal: string, exitCode = 0) => {
  if (shutdownStarted) return
  shutdownStarted = true
  if (exportCleanupTimer) clearInterval(exportCleanupTimer)
  if (submissionReceiptCleanupTimer) clearInterval(submissionReceiptCleanupTimer)
  logger.info(`${signal} signal received: closing HTTP server`)
  
  // 设置强制退出超时（5秒）
  const forceExit = setTimeout(() => {
    logger.warn('⚠️  Forced exit after timeout')
    process.exit(exitCode || 1)
  }, 5000)
  
  if (serverListening) {
    await new Promise<void>((resolve) => {
      server.close((error) => {
        if (error) logger.warn('关闭 HTTP server 时发生错误', error)
        else logger.info('HTTP server closed')
        serverListening = false
        resolve()
      })
    })
  }

  await Promise.allSettled([
    socketService.close(),
    closeQueues(),
    cacheService.close(),
    prisma.$disconnect(),
  ])
  clearTimeout(forceExit)
  process.exit(exitCode)
}

process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM') })
process.on('SIGINT', () => { void gracefulShutdown('SIGINT') })
process.on('uncaughtException', (err) => {
  logger.error('未捕获异常，服务将退出', err)
  void gracefulShutdown('uncaughtException', 1)
})
process.on('unhandledRejection', (reason) => {
  logger.error('未处理的 Promise rejection，服务将退出', reason)
  void gracefulShutdown('unhandledRejection', 1)
})

const startServer = async (): Promise<void> => {
  if (config.nodeEnv === 'production' && !config.assetMigrationComplete) {
    throw new Error('ASSET_MIGRATION_COMPLETE=true is required before starting production')
  }
  await socketService.initialize(server)

  // 初始化课堂 Socket.IO 事件处理器
  classroomSocketHandler.initialize()
  logger.info('课堂 Socket.IO 事件处理器已初始化')

  // Login and course-code verification fail closed when CacheService Redis is
  // unavailable.  Initialize it before opening the HTTP listener and make
  // production startup fail closed; initialize() itself catches connection
  // errors, so the explicit status check is required as well.
  await cacheService.initialize()
  if (config.nodeEnv === 'production' && !cacheService.getStatus().connected) {
    throw new Error('CacheService Redis 初始化失败，生产环境拒绝接收流量')
  }

  // Video/image/export consumers share this process Prisma pool. Skip them on
  // assessment-only or test processes so FINAL_ONLY submit is not queued behind
  // stale-video reconciliation. Producers still enqueue through config/queue.
  await startBackgroundWorkers(config.backgroundWorkersEnabled)

  // ExportArtifact cleanup is metadata-driven: only exact expired objects are
  // removed, never an exploratory directory scan. Keep one bounded hourly task
  // per backend process and make shutdown cancel it.
  exportCleanupTimer = setInterval(() => {
    void cleanupExpiredExportArtifacts().then((result) => {
      if (result.deletedArtifacts > 0 || result.invalidPaths > 0) {
        logger.info('过期导出产物清理完成', result)
      }
    }).catch((err) => logger.warn('过期导出产物清理失败', err))
  }, 60 * 60 * 1000)
  exportCleanupTimer.unref?.()

  // Idempotency keys are retained for a bounded retry window. Cleanup is
  // metadata-only and runs on every backend instance; the indexed createdAt
  // predicate keeps the query bounded as the tables grow.
  const cleanupSubmissionReceipts = () => {
    void cleanupExpiredSubmissionIdempotencyReceipts().then((result) => {
      if (result.assignment > 0 || result.checkin > 0) {
        logger.info('过期提交幂等回执清理完成', result)
      }
    }).catch((err) => logger.warn('过期提交幂等回执清理失败', err))
  }
  cleanupSubmissionReceipts()
  submissionReceiptCleanupTimer = setInterval(cleanupSubmissionReceipts, 60 * 60 * 1000)
  submissionReceiptCleanupTimer.unref?.()

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      serverListening = true
      logger.info(`🚀 Server running on port ${config.port}`)
      logger.info(`📁 Upload directory: ${config.uploadDir}`)
      logger.info(`📁 Upload directory absolute: ${require('path').resolve(config.uploadDir)}`)
      logger.info(`🌐 Environment: ${config.nodeEnv}`)
      logger.info(`🔌 Socket.IO enabled`)

      // 通知 PM2 进程已就绪（配合 wait_ready 配置）
      if (process.send) {
        process.send('ready')
        logger.info('✅ PM2 ready signal sent')
      }
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(config.port)
  })
}

void startServer().catch((error) => {
  logger.error('服务启动失败，进程将退出', error)
  void gracefulShutdown('startup failure', 1)
})