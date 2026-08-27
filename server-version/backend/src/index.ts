import express from 'express'
import { rateLimit } from 'express-rate-limit'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'
import { config } from './config'
import { prisma } from './config/database'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { authenticate, requireAdmin } from './middleware/auth'
import { logger } from './utils/logger'
import { socketService } from './services/socketService'
import { classroomSocketHandler } from './services/classroomSocketHandler'
import { requestId } from './middleware/requestId'
import { csrfProtection } from './middleware/csrf'
import { legacyUploadGuard } from './middleware/legacyUploadGuard'

// 导入 Worker (启动视频处理队列)
// 使用优化版本 (支持硬件负担最小模式)
import './workers/videoProcessorOptimized'
// 图片处理队列
import './workers/imageProcessor'
// 中文分词服务（单例模式，服务启动时自动初始化）
import './services/wordSegmentation'
// Redis缓存服务
import { cacheService } from './services/cacheService'
import { closeQueues } from './config/queue'

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
import questionnaireRoutes from './routes/questionnaires'
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
import assetRoutes, { publicAssetRouter } from './routes/assets'

const app = express()

const publicAssessmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

// 创建 HTTP 服务器
const server = createServer(app)

const requestMetricCounts = new Map<string, number>()
const normalizeMetricPath = (req: express.Request): string => {
  const routePath = req.route?.path
  if (routePath) return `${req.baseUrl}${routePath}`
  return req.path
    .replace(/\/ck_[A-Za-z0-9_-]+/g, '/:token')
    .replace(/\/[0-9a-f]{8,}(?=\/|$)/gi, '/:id')
    .replace(/\/[^/]{32,}(?=\/|$)/g, '/:id')
}

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint()
  res.once('finish', () => {
    const pathLabel = normalizeMetricPath(req)
    const key = `${req.method}|${pathLabel}|${res.statusCode}`
    requestMetricCounts.set(key, (requestMetricCounts.get(key) || 0) + 1)
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    if (durationMs > 10_000) logger.warn('HTTP request exceeded latency threshold', { method: req.method, path: pathLabel, durationMs: Math.round(durationMs) })
  })
  next()
})

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
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))
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
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'unready', timestamp: new Date().toISOString() })
  }
})

// Prometheus-compatible process metrics.  The backend is only reachable from
// the Compose network in production; the endpoint intentionally contains no
// request payload, account, or assessment data.
app.get('/metrics', async (_req, res) => {
  const memory = process.memoryUsage()
  const lines = [
    '# HELP process_uptime_seconds Process uptime in seconds.',
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${process.uptime()}`,
    '# HELP process_resident_memory_bytes Resident memory size in bytes.',
    '# TYPE process_resident_memory_bytes gauge',
    `process_resident_memory_bytes ${memory.rss}`,
    '# HELP process_heap_used_bytes V8 heap used in bytes.',
    '# TYPE process_heap_used_bytes gauge',
    `process_heap_used_bytes ${memory.heapUsed}`,
    '# HELP process_heap_total_bytes V8 heap total in bytes.',
    '# TYPE process_heap_total_bytes gauge',
    `process_heap_total_bytes ${memory.heapTotal}`,
    '# HELP ptool_api_requests_total Completed API requests by normalized route and status.',
    '# TYPE ptool_api_requests_total counter',
  ]
  for (const [key, count] of requestMetricCounts) {
    const [method, route, status] = key.split('|')
    const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    lines.push(`ptool_api_requests_total{method="${escape(method)}",route="${escape(route)}",status="${escape(status)}"} ${count}`)
  }
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
app.use('/api/admin/material-grants', authenticate, requireAdmin, materialGrantRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/assignments', assignmentRoutes)
app.use('/api/checkins', checkinRoutes)
app.use('/api/videos', videoRoutes)
app.use('/api/teacher-codes', teacherCodeRoutes)
app.use('/api/uploads', uploadRoutes)
app.use('/api/scales', scaleRoutes)
app.use('/api/questionnaires', questionnaireRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/assets', assetRoutes)
app.use('/api/public/assets', publicAssetRouter)
// 泛化问卷路由（新增）

app.use('/api/general-questionnaires', generalQuestionnaireRoutes)
// 综合测评：将量表、表单和认知任务放入同一完成容器；公开入口不要求登录。
app.use('/api/composite-assessments', compositeRoutes)
app.use('/api/public/composite-assessments', publicAssessmentLimiter, compositePublicRoutes)
// 课堂互动路由（新增）
app.use('/api/classrooms', classroomRoutes)

// 认知测评路由（D3+）：feature flag 默认 false —— 关闭时 /api/cognitive/* 走 404，旧路由零改动
if (config.cognitiveModuleEnabled) {
  app.use('/api/cognitive', cognitiveRoutes)
  app.use('/api/public/cognitive', publicAssessmentLimiter, cognitivePublicRoutes)
}

app.use('/api/public', publicAssessmentLimiter, publicRoutes)

// 404 处理
app.use(notFoundHandler)

// 错误处理
app.use(errorHandler)

// 初始化 Socket.IO 服务（异步）
socketService.initialize(server).then(() => {
  // 初始化课堂 Socket.IO 事件处理器
  classroomSocketHandler.initialize()
  logger.info('课堂 Socket.IO 事件处理器已初始化')
}).catch(err => {
  logger.error('Socket.IO 服务初始化失败', err)
})

// 初始化 Redis 缓存服务
cacheService.initialize().catch(err => {
  logger.warn('Redis缓存服务初始化失败，继续运行（无缓存）', err)
})

// 启动服务器
server.listen(config.port, () => {
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
})

// 优雅关闭（增加超时保护）
let shutdownStarted = false

const gracefulShutdown = async (signal: string, exitCode = 0) => {
  if (shutdownStarted) return
  shutdownStarted = true
  logger.info(`${signal} signal received: closing HTTP server`)
  
  // 设置强制退出超时（5秒）
  const forceExit = setTimeout(() => {
    logger.warn('⚠️  Forced exit after timeout')
    process.exit(exitCode || 1)
  }, 5000)
  
  server.close(async () => {
    logger.info('HTTP server closed')
    await Promise.allSettled([
      socketService.close(),
      closeQueues(),
      cacheService.close(),
      prisma.$disconnect(),
    ])
    clearTimeout(forceExit)
    process.exit(exitCode)
  })
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
