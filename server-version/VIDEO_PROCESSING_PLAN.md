# 视频自动转码+打码功能设计方案

**功能需求**: 视频上传后自动转码为720p，并添加水印/打码  
**处理时机**: 空闲时间异步处理  
**技术方案**: FFmpeg + 消息队列

---

## 📋 功能需求分析

### 核心功能
1. **视频转码**: 转换为720p (1280×720)，H.264编码
2. **添加水印**: 在视频角落添加文字/图片水印
3. **隐私打码**: 对敏感区域进行模糊处理
4. **异步处理**: 上传后立即返回，后台空闲时处理

### 技术选型

| 组件 | 选型 | 说明 |
|-----|------|------|
| 视频处理 | **FFmpeg** | 业界标准，功能强大 |
| 任务队列 | **Bull/BullMQ** | Redis-based 队列 |
| 水印生成 | **Canvas/Sharp** | Node.js 生成水印图 |
| 存储 | COS | 原始视频和转码后视频 |

---

## 🏗️ 系统架构

```
用户上传视频
    │
    ▼
┌─────────────────────────────────────────────┐
│  1. 接收上传                                  │
│     - 保存原始视频到 COS                       │
│     - 创建数据库记录 (status: pending)         │
│     - 将任务加入队列                           │
│     - 立即返回成功 (视频处理中提示)             │
└──────────────┬──────────────────────────────┘
               │
               ▼ 异步处理
┌─────────────────────────────────────────────┐
│  2. 视频处理队列 (Worker)                     │
│     - 从队列获取任务                           │
│     - 下载原始视频                             │
│     - FFmpeg 转码 720p                        │
│     - 添加水印                                 │
│     - 上传转码后的视频                         │
│     - 更新数据库 (status: completed)           │
└─────────────────────────────────────────────┘
```

---

## 💻 技术实现

### 1. 安装依赖

```bash
# 后端安装 FFmpeg 和依赖
cd backend
npm install bull fluent-ffmpeg sharp
npm install -D @types/fluent-ffmpeg

# 服务器安装 FFmpeg
sudo apt update
sudo apt install ffmpeg

# 验证安装
ffmpeg -version
```

### 2. 数据库模型更新

```prisma
// 在 Video 模型中添加处理状态
model Video {
  id           String    @id @default(uuid())
  title        String
  filePath     String    @map("file_path")
  fileName     String    @map("file_name")
  fileSize     Int       @map("file_size")
  mimeType     String    @map("mime_type")
  teacherId    String    @map("teacher_id")
  usageCount   Int       @default(0) @map("usage_count")
  tags         String[]  @default([])
  isDeleted    Boolean   @default(false) @map("is_deleted")
  deletedAt    DateTime? @map("deleted_at")
  
  // 新增: 视频处理相关字段
  status       VideoStatus @default(PENDING)  // pending, processing, completed, failed
  originalUrl  String?    @map("original_url") // 原始视频URL
  processedUrl String?    @map("processed_url") // 转码后视频URL
  resolution   String?    // 分辨率: 720p
  duration     Int?       // 时长(秒)
  thumbnailUrl String?    @map("thumbnail_url") // 缩略图
  processedAt  DateTime?  @map("processed_at")
  errorMessage String?    @map("error_message")
  
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt @map("updated_at")

  teacher User @relation(fields: [teacherId], references: [id], onDelete: Cascade)

  @@map("videos")
}

enum VideoStatus {
  PENDING     // 等待处理
  PROCESSING  // 处理中
  COMPLETED   // 已完成
  FAILED      // 处理失败
}
```

### 3. Redis + Bull 队列配置

```typescript
// src/config/queue.ts
import Queue from 'bull'

// 视频处理队列
export const videoQueue = new Queue('video processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  defaultJobOptions: {
    attempts: 3, // 失败重试3次
    backoff: {
      type: 'exponential',
      delay: 5000, // 5秒后重试
    },
    removeOnComplete: 100, // 保留最近100个完成的任务
    removeOnFail: 50, // 保留最近50个失败的任务
  },
})

// 队列事件监听
videoQueue.on('completed', (job, result) => {
  logger.info(`视频处理完成: ${job.id}`, result)
})

videoQueue.on('failed', (job, err) => {
  logger.error(`视频处理失败: ${job.id}`, err)
})
```

### 4. 视频处理 Worker

```typescript
// src/workers/videoProcessor.ts
import ffmpeg from 'fluent-ffmpeg'
import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'
import { videoQueue } from '../config/queue'
import { prisma } from '../config/database'
import { cos, uploadToCOS } from '../utils/cos'
import { logger } from '../utils/logger'

// 处理视频任务
videoQueue.process('transcode', 2, async (job) => { // 并发处理2个
  const { videoId, originalUrl, teacherId } = job.data
  
  try {
    // 更新状态为处理中
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'PROCESSING' }
    })
    
    // 创建临时目录
    const tempDir = path.join('/tmp', `video-${videoId}`)
    await fs.mkdir(tempDir, { recursive: true })
    
    const inputPath = path.join(tempDir, 'input.mp4')
    const outputPath = path.join(tempDir, 'output_720p.mp4')
    const watermarkPath = path.join(tempDir, 'watermark.png')
    const thumbnailPath = path.join(tempDir, 'thumbnail.jpg')
    
    // 1. 下载原始视频
    logger.info(`[${videoId}] 下载原始视频...`)
    await downloadFile(originalUrl, inputPath)
    
    // 2. 生成水印图片
    logger.info(`[${videoId}] 生成水印...`)
    await generateWatermark(watermarkPath, teacherId)
    
    // 3. FFmpeg 转码 + 添加水印
    logger.info(`[${videoId}] 开始转码...`)
    await transcodeVideo(inputPath, outputPath, watermarkPath)
    
    // 4. 生成缩略图
    logger.info(`[${videoId}] 生成缩略图...`)
    await generateThumbnail(inputPath, thumbnailPath)
    
    // 5. 上传到 COS
    logger.info(`[${videoId}] 上传处理后的视频...`)
    const processedKey = `videos/processed/${Date.now()}-${videoId}.mp4`
    const thumbnailKey = `videos/thumbnails/${Date.now()}-${videoId}.jpg`
    
    const [processedUrl, thumbnailUrl] = await Promise.all([
      uploadToCOS(outputPath, processedKey),
      uploadToCOS(thumbnailPath, thumbnailKey)
    ])
    
    // 6. 获取视频信息
    const duration = await getVideoDuration(outputPath)
    const fileSize = (await fs.stat(outputPath)).size
    
    // 7. 更新数据库
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'COMPLETED',
        processedUrl,
        thumbnailUrl,
        resolution: '720p',
        duration,
        fileSize,
        processedAt: new Date()
      }
    })
    
    // 8. 清理临时文件
    await fs.rm(tempDir, { recursive: true })
    
    logger.info(`[${videoId}] 视频处理完成`)
    
    return { videoId, processedUrl, thumbnailUrl }
    
  } catch (error) {
    // 更新失败状态
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'FAILED',
        errorMessage: error.message
      }
    })
    
    throw error
  }
})

// 生成水印图片
async function generateWatermark(outputPath: string, teacherId: string): Promise<void> {
  // 获取教师信息
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { nickname: true }
  })
  
  const watermarkText = `${teacher?.nickname || 'PTool'} © ${new Date().getFullYear()}`
  
  // 使用 Sharp 生成水印 PNG
  const width = 300
  const height = 50
  
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.5 } // 半透明黑色背景
    }
  })
    .composite([{
      input: Buffer.from(`
        <svg width="${width}" height="${height}">
          <text x="50%" y="50%" 
                font-family="Arial" 
                font-size="16" 
                fill="white" 
                text-anchor="middle" 
                dominant-baseline="middle">
            ${watermarkText}
          </text>
        </svg>
      `),
      top: 0,
      left: 0
    }])
    .png()
    .toFile(outputPath)
}

// 视频转码
function transcodeVideo(input: string, output: string, watermark: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      // 视频编码器
      .videoCodec('libx264')
      // 分辨率 720p
      .size('1280x720')
      // 保持宽高比
      .aspect('16:9')
      // 自动填充黑边
      .autopad()
      // 视频码率 1200k
      .videoBitrate('1200k')
      // 音频编码
      .audioCodec('aac')
      .audioBitrate('128k')
      // 添加水印 (右下角)
      .videoFilters([
        `movie=${watermark}[watermark];[in][watermark]overlay=W-w-10:H-h-10[out]`
      ])
      // 使用更快的预设
      .outputOptions([
        '-preset fast',      // 编码速度预设
        '-crf 23',          // 质量 (18-28，越小越好)
        '-movflags +faststart', // 支持流式播放
        '-threads 2'        // 使用2个线程
      ])
      .on('start', (cmd) => {
        logger.debug('FFmpeg 命令:', cmd)
      })
      .on('progress', (progress) => {
        logger.debug('转码进度:', progress.percent?.toFixed(2) + '%')
      })
      .on('end', () => {
        resolve()
      })
      .on('error', (err) => {
        reject(err)
      })
      .save(output)
  })
}

// 生成缩略图
function generateThumbnail(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .screenshots({
        timestamps: ['10%'], // 在 10% 位置截图
        filename: path.basename(output),
        folder: path.dirname(output),
        size: '640x360' // 缩略图尺寸
      })
      .on('end', () => resolve())
      .on('error', reject)
  })
}

// 获取视频时长
function getVideoDuration(input: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err, metadata) => {
      if (err) {
        reject(err)
      } else {
        resolve(Math.floor(metadata.format.duration || 0))
      }
    })
  })
}

// 下载文件
async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  await fs.writeFile(outputPath, Buffer.from(buffer))
}
```

### 5. 上传接口修改

```typescript
// src/controllers/videoController.ts
import { videoQueue } from '../config/queue'

export const videoController = {
  // 上传视频
  async upload(req: Request, res: Response) {
    try {
      const teacherId = req.user?.userId
      const file = req.file
      
      if (!file) {
        return error(res, '请选择要上传的视频')
      }
      
      // 1. 上传原始视频到 COS
      const originalKey = `videos/original/${Date.now()}-${uuidv4()}.mp4`
      const originalUrl = await uploadToCOS(file.path, originalKey)
      
      // 2. 创建数据库记录
      const video = await prisma.video.create({
        data: {
          title: req.body.title || file.originalname,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          teacherId,
          originalUrl,
          status: 'PENDING',
          tags: req.body.tags ? JSON.parse(req.body.tags) : []
        }
      })
      
      // 3. 添加到处理队列
      await videoQueue.add('transcode', {
        videoId: video.id,
        originalUrl,
        teacherId
      }, {
        delay: 1000, // 延迟1秒，确保文件上传完成
        priority: 1  // 优先级
      })
      
      // 4. 立即返回 (不等待处理完成)
      return success(res, {
        id: video.id,
        title: video.title,
        status: 'PENDING',
        message: '视频已上传，正在后台处理中...'
      }, '上传成功，视频处理中')
      
    } catch (err) {
      logger.error('视频上传失败', err)
      return error(res, '上传失败')
    }
  },
  
  // 获取视频处理状态
  async getStatus(req: Request, res: Response) {
    try {
      const { id } = req.params
      const teacherId = req.user?.userId
      
      const video = await prisma.video.findFirst({
        where: { id, teacherId }
      })
      
      if (!video) {
        return notFound(res, '视频不存在')
      }
      
      return success(res, {
        id: video.id,
        status: video.status,
        progress: video.status === 'PROCESSING' ? await getJobProgress(video.id) : null,
        processedUrl: video.processedUrl,
        thumbnailUrl: video.thumbnailUrl,
        errorMessage: video.errorMessage
      })
      
    } catch (err) {
      logger.error('获取视频状态失败', err)
      return error(res, '获取状态失败')
    }
  }
}

// 获取队列任务进度
async function getJobProgress(videoId: string): Promise<number> {
  const jobs = await videoQueue.getJobs(['active', 'waiting'])
  const job = jobs.find(j => j.data.videoId === videoId)
  
  if (job) {
    // 实际进度需要从 FFmpeg 获取，这里简化处理
    return 0
  }
  return 0
}
```

### 6. 前端界面更新

```typescript
// 上传视频组件
const VideoUpload: React.FC = () => {
  const [uploading, setUploading] = useState(false)
  const [processingVideos, setProcessingVideos] = useState<ProcessingVideo[]>([])
  
  const handleUpload = async (file: File) => {
    setUploading(true)
    
    try {
      const formData = new FormData()
      formData.append('video', file)
      formData.append('title', file.name)
      
      const res = await apiClient.post('/videos/upload', formData)
      
      if (res.code === 0) {
        message.success('上传成功，正在处理中...')
        
        // 添加到处理中列表
        setProcessingVideos(prev => [...prev, {
          id: res.data.id,
          title: res.data.title,
          status: 'PENDING',
          progress: 0
        }])
        
        // 开始轮询状态
        pollProcessingStatus(res.data.id)
      }
    } finally {
      setUploading(false)
    }
  }
  
  // 轮询处理状态
  const pollProcessingStatus = async (videoId: string) => {
    const interval = setInterval(async () => {
      const res = await apiClient.get(`/videos/${videoId}/status`)
      
      if (res.code === 0) {
        const { status, progress, processedUrl, errorMessage } = res.data
        
        setProcessingVideos(prev => 
          prev.map(v => 
            v.id === videoId 
              ? { ...v, status, progress, errorMessage }
              : v
          )
        )
        
        if (status === 'COMPLETED' || status === 'FAILED') {
          clearInterval(interval)
          
          if (status === 'COMPLETED') {
            message.success('视频处理完成！')
            // 刷新视频列表
            refreshVideoList()
          } else {
            message.error(`处理失败: ${errorMessage}`)
          }
        }
      }
    }, 3000) // 每3秒查询一次
    
    // 5分钟后自动停止轮询
    setTimeout(() => clearInterval(interval), 5 * 60 * 1000)
  }
  
  return (
    <div>
      <Upload
        accept="video/*"
        beforeUpload={handleUpload}
        showUploadList={false}
      >
        <Button icon={<UploadOutlined />} loading={uploading}>
          上传视频
        </Button>
      </Upload>
      
      {/* 处理中视频列表 */}
      {processingVideos.length > 0 && (
        <div className="mt-4">
          <h4>处理中的视频</h4>
          {processingVideos.map(video => (
            <div key={video.id} className="processing-item">
              <span>{video.title}</span>
              <Progress 
                percent={video.progress} 
                status={video.status === 'FAILED' ? 'exception' : 'active'}
              />
              <Tag color={getStatusColor(video.status)}>
                {getStatusText(video.status)}
              </Tag>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## ⚙️ 硬件要求分析

### 视频转码资源消耗

| 操作 | CPU | 内存 | 时间 | 说明 |
|-----|-----|------|------|------|
| 下载 (100MB) | 低 | 100MB | 5-10s | 取决于带宽 |
| 转码 720p | **2核满载** | **500MB** | **30-60s** | 主要耗时 |
| 添加水印 | 低 | 50MB | 2-5s | 简单操作 |
| 生成缩略图 | 中 | 100MB | 5-10s | |
| 上传 (50MB) | 低 | 50MB | 3-5s | |
| **总计** | **2核** | **800MB** | **45-90s** | 每视频 |

### 并发处理能力

```
服务器配置: 2C4G

单个转码任务:
- CPU: 2核 (满载)
- 内存: 800MB
- 时间: 45-90秒

并发处理:
- 同时处理: 1个视频 (CPU限制)
- 队列等待: 无限制
- 处理速度: 40-80个视频/小时

空闲时间处理策略:
- 夜间 (22:00-08:00): 全速处理
- 白天: 仅处理1个，避免影响用户
- 上传高峰: 暂停新任务，只处理队列
```

---

## 📊 难度评估

| 方面 | 难度 | 说明 |
|-----|------|------|
| **技术复杂度** | ⭐⭐⭐ 中等 | FFmpeg + 队列 + 异步 |
| **开发时间** | 2-3天 | 含测试 |
| **服务器要求** | ⭐⭐ 较低 | 2C4G 即可 |
| **维护成本** | ⭐⭐ 较低 | 队列自动重试 |
| **稳定性** | ⭐⭐⭐ 中等 | 需监控队列状态 |

---

## 🎯 推荐实现方案

### 方案A: 最小可行 (推荐)

```
功能:
- 异步转码 720p
- 简单文字水印
- 队列处理
- 状态轮询

开发: 2天
硬件: 2C4G 即可
成本: 无额外成本
```

### 方案B: 完整功能

```
功能:
- 720p/480p 多分辨率
- 图片/文字水印可选
- 人脸识别自动打码
- 进度实时推送 (WebSocket)
- 批量处理

开发: 5天
硬件: 2C4G (推荐) 或 4C8G (更好)
成本: 可能需要GPU实例 (人脸识别)
```

---

## ✅ 下一步行动

1. **确认需求**:
   - [ ] 是否需要多分辨率?
   - [ ] 水印内容格式?
   - [ ] 是否需要人脸识别打码?

2. **环境准备**:
   ```bash
   # 服务器安装 FFmpeg
   sudo apt install ffmpeg
   
   # 安装 Redis
   sudo apt install redis-server
   
   # 验证
   ffmpeg -version
   redis-cli ping
   ```

3. **数据库迁移**:
   ```bash
   npx prisma migrate dev --name add_video_processing
   ```

4. **部署 Worker**:
   ```bash
   # PM2 启动 Worker
   pm2 start dist/workers/videoProcessor.js --name video-worker
   ```

---

**预估总开发时间**: 2-3天  
**预估硬件成本**: 无需升级 (2C4G足够)  
**难度**: 中等 (需要 FFmpeg 和队列知识)
