import express from 'express'
import { rateLimit } from 'express-rate-limit'
import cors from 'cors'
import { createServer } from 'http'
import { config } from './config'
import { prisma } from './config/database'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { logger } from './utils/logger'
import { socketService } from './services/socketService'
import { classroomSocketHandler } from './services/classroomSocketHandler'

// 导入 Worker (启动视频处理队列)
// 使用优化版本 (支持硬件负担最小模式)
import './workers/videoProcessorOptimized'
// 图片处理队列
import './workers/imageProcessor'
// 中文分词服务（单例模式，服务启动时自动初始化）
import './services/wordSegmentation'
// Redis缓存服务
import { cacheService } from './services/cacheService'

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

const app = express()

const publicAssessmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

// 创建 HTTP 服务器
const server = createServer(app)

// 信任反向代理 - 正确获取客户端IP (Nginx反向代理)
// 使用 'loopback' 只信任本地代理，更安全
app.set('trust proxy', 'loopback')

// 禁用 API 缓存 - 确保数据实时更新
app.set('etag', false)
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
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

// 静态文件服务 - 使用绝对路径
console.log('[Server] Static files serving from:', config.uploadDir)
app.use('/uploads', express.static(config.uploadDir, {
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

// API 路由
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/assignments', assignmentRoutes)
app.use('/api/checkins', checkinRoutes)
app.use('/api/videos', videoRoutes)
app.use('/api/teacher-codes', teacherCodeRoutes)
app.use('/api/uploads', uploadRoutes)
app.use('/api/scales', scaleRoutes)
app.use('/api/questionnaires', questionnaireRoutes)
app.use('/api/documents', documentRoutes)
// 泛化问卷路由（新增）
app.use('/api/public', publicAssessmentLimiter, publicRoutes)
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
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} signal received: closing HTTP server`)
  
  // 设置强制退出超时（5秒）
  const forceExit = setTimeout(() => {
    logger.warn('⚠️  Forced exit after timeout')
    process.exit(1)
  }, 5000)
  
  server.close(() => {
    logger.info('HTTP server closed')
    socketService.close()
    clearTimeout(forceExit)
    process.exit(0)
  })
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
