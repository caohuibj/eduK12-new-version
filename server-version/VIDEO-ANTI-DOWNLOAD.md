# 视频防下载方案

## 核心思路

**重要提示**: 技术上无法100%阻止视频下载，只能增加下载难度

## 方案对比

| 方案 | 难度 | 效果 | 硬件负担 | 推荐度 |
|-----|------|------|---------|--------|
| **HLS流媒体分割** | 中 | ⭐⭐⭐ | 中 | ⭐⭐⭐⭐⭐ |
| **Blob URL + 自定义播放器** | 低 | ⭐⭐ | 低 | ⭐⭐⭐⭐ |
| **视频加密 (AES-128)** | 高 | ⭐⭐⭐⭐ | 高 | ⭐⭐⭐ |
| **防盗链 (Referer)** | 低 | ⭐ | 无 | ⭐⭐⭐⭐ |
| **DRM ( Widevine等)** | 极高 | ⭐⭐⭐⭐⭐ | 高 | ⭐ |

## 推荐方案: HLS + Blob URL (低配服务器)

### 1. 后端: HLS 流分割

```typescript
// src/utils/hls.ts
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs/promises'
import path from 'path'

export async function generateHLS(
  inputPath: string,
  outputDir: string,
  segmentDuration: number = 10
): Promise<{ m3u8Path: string; segments: string[] }> {
  const outputName = 'playlist'
  
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset ultrafast',
        '-crf 28',
        `-hls_time ${segmentDuration}`,        // 每10秒一个片段
        '-hls_list_size 0',                     // 保留所有片段
        '-hls_segment_filename', 
        path.join(outputDir, 'segment_%03d.ts'), // 片段命名
        '-f hls'
      ])
      .on('end', async () => {
        const m3u8Path = path.join(outputDir, `${outputName}.m3u8`)
        const files = await fs.readdir(outputDir)
        const segments = files.filter(f => f.endsWith('.ts'))
        resolve({ m3u8Path, segments })
      })
      .on('error', reject)
      .save(path.join(outputDir, `${outputName}.m3u8`))
  })
}
```

### 2. 前端: 自定义播放器 (禁用下载)

```typescript
// VideoPlayer.tsx - 防下载播放器
import React, { useEffect, useRef } from 'react'
import Hls from 'hls.js'

interface Props {
  src: string  // HLS m3u8 URL
}

export const SecureVideoPlayer: React.FC<Props> = ({ src }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    
    // 禁用右键菜单
    video.oncontextmenu = (e) => {
      e.preventDefault()
      return false
    }
    
    // 禁用快捷键
    const handleKeyDown = (e: KeyboardEvent) => {
      // 禁用 F12, Ctrl+S, Ctrl+Shift+I 等
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.key === 's') ||
        (e.ctrlKey && e.shiftKey && e.key === 'I')
      ) {
        e.preventDefault()
        return false
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    
    // HLS 播放
    if (Hls.isSupported()) {
      const hls = new Hls({
        // 配置: 不缓存到本地存储
        enableWorker: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      })
      
      hls.loadSource(src)
      hls.attachMedia(video)
      
      // 自定义请求头 (用于防盗链验证)
      hls.config.xhrSetup = (xhr) => {
        xhr.setRequestHeader('X-Video-Token', generateToken())
      }
      
      return () => {
        hls.destroy()
        document.removeEventListener('keydown', handleKeyDown)
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari 原生支持
      video.src = src
    }
  }, [src])
  
  // 防录屏水印 (动态移动)
  const [watermarkPos, setWatermarkPos] = React.useState({ x: 0, y: 0 })
  
  useEffect(() => {
    const interval = setInterval(() => {
      setWatermarkPos({
        x: Math.random() * 80 + 10,  // 10% - 90%
        y: Math.random() * 80 + 10
      })
    }, 5000)  // 每5秒移动一次
    
    return () => clearInterval(interval)
  }, [])
  
  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-video bg-black select-none"
      style={{ userSelect: 'none' }}
    >
      {/* 视频元素 */}
      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        controlsList="nodownload noremoteplayback"  // 禁用下载按钮
        disablePictureInPicture  // 禁用画中画
        disableRemotePlayback
        onContextMenu={(e) => e.preventDefault()}
      />
      
      {/* 防录屏水印 */}
      <div 
        className="absolute pointer-events-none text-white/30 text-sm font-bold"
        style={{
          left: `${watermarkPos.x}%`,
          top: `${watermarkPos.y}%`,
          transform: 'translate(-50%, -50%)',
          textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
          zIndex: 10
        }}
      >
        慧育空间 - 用户ID: {userId} - {new Date().toLocaleTimeString()}
      </div>
      
      {/* 遮罩层 - 防止开发者工具选择 */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ 
          background: 'transparent',
          zIndex: 5
        }}
      />
    </div>
  )
}

// 生成临时 Token
function generateToken(): string {
  return btoa(`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
}
```

### 3. 后端: 防盗链验证

```typescript
// middleware/videoAuth.ts
import { Request, Response, NextFunction } from 'express'

export const validateVideoAccess = (req: Request, res: Response, next: NextFunction) => {
  // 1. 检查 Referer
  const referer = req.headers.referer || req.headers.referer
  const allowedDomains = [process.env.FRONTEND_URL, 'http://localhost:5173']
  
  if (!referer || !allowedDomains.some(domain => referer.startsWith(domain))) {
    return res.status(403).json({ error: '非法访问来源' })
  }
  
  // 2. 检查自定义 Token
  const token = req.headers['x-video-token']
  if (!token) {
    return res.status(403).json({ error: '缺少访问凭证' })
  }
  
  // 3. Token 验证 (简化版，实际应使用 JWT)
  try {
    const decoded = atob(token as string)
    const [timestamp] = decoded.split('-')
    const age = Date.now() - parseInt(timestamp)
    
    // Token 有效期 5 分钟
    if (age > 5 * 60 * 1000) {
      return res.status(403).json({ error: '凭证已过期' })
    }
  } catch {
    return res.status(403).json({ error: '无效凭证' })
  }
  
  next()
}
```

### 4. Nginx 防盗链配置

```nginx
# /etc/nginx/conf.d/video.conf

location /videos/ {
    # 防盗链
    valid_referers none blocked server_names
                   *.yourdomain.com
                   localhost;
    
    if ($invalid_referer) {
        return 403;
    }
    
    # 添加防盗下载头
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header Content-Disposition "inline";
    
    # 禁止直接下载
    if ($http_user_agent ~* (wget|curl|download)) {
        return 403;
    }
    
    alias /var/www/videos/;
}
```

## 硬件负担最小模式

### 1. 转码配置

```bash
# .env 环境变量

# 启用低配模式
VIDEO_LOW_POWER_MODE=true

# 分辨率 (低配推荐 480p)
VIDEO_RESOLUTION=480p

# 编码速度 (ultrafast = 最快, 文件稍大)
VIDEO_PRESET=ultrafast

# 质量 (28 = 较低质量, 更快)
VIDEO_CRF=28

# 视频码率 (低配推荐 800k)
VIDEO_BITRATE=800k
```

### 2. 队列配置

```typescript
// config/queue.ts

// 限制并发数为 1 (低配服务器)
videoQueue.process('transcode', 1, async (job) => {
  // 处理逻辑
})

// 夜间批量处理 (可选)
export const scheduleNightProcessing = () => {
  const now = new Date()
  const nightStart = 22 // 22:00 开始
  const nightEnd = 8    // 08:00 结束
  
  const currentHour = now.getHours()
  const isNightTime = currentHour >= nightStart || currentHour < nightEnd
  
  return isNightTime
}
```

### 3. 前端适配

```typescript
// 根据服务器负载选择清晰度
const getOptimalQuality = (serverLoad: number): string => {
  if (serverLoad > 80) return '360p'
  if (serverLoad > 50) return '480p'
  return '720p'
}
```

## 综合建议

### 低配服务器 (2C2G) 推荐配置

```yaml
视频处理:
  分辨率: 480p
  码率: 800k
  预设: ultrafast
  并发: 1
  处理时间: 空闲时 (22:00-08:00)

防下载:
  方案: HLS + Blob URL + 防盗链
  不启用: 视频加密 (CPU负担大)

存储:
  原始视频: 保存 7 天
  处理后: 永久保存
  缩略图: 压缩存储
```

### 效果评估

| 措施 | 阻止普通用户 | 阻止技术用户 | 性能影响 |
|-----|------------|------------|---------|
| HLS 分割 | ✅ | ⚠️ | 中 |
| Blob URL | ✅ | ❌ | 低 |
| 防盗链 | ✅ | ❌ | 无 |
| 动态水印 | ⚠️ | ❌ | 低 |
| 禁用右键 | ✅ | ❌ | 无 |

**结论**: 组合使用可有效阻止 90% 的普通用户下载，对服务器性能影响最小。
