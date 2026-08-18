# 低配服务器硬件优化指南

**目标配置**: 2核2G / 2核4G  
**优化目标**: 在保证基本功能的前提下，最大化利用硬件资源

---

## 🎯 核心优化策略

### 1. CPU 优化

#### Node.js 进程配置
```bash
# 启动时设置线程池大小
UV_THREADPOOL_SIZE=128
NODE_OPTIONS="--max-old-space-size=1536"  # 限制内存使用
```

#### PM2 配置 (生产环境)
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'ptool-api',
    script: './dist/index.js',
    instances: 1,        // 2核服务器只跑1个实例
    exec_mode: 'fork',   // cluster 模式在2核上收益不大
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      UV_THREADPOOL_SIZE: '128'
    },
    // 自动重启策略
    restart_delay: 3000,
    max_restarts: 5,
    min_uptime: '10s'
  }]
}
```

### 2. 内存优化

#### 数据库连接池
```typescript
// database.ts
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient({
  log: ['error', 'warn'],
  // 限制连接数
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

// 查询优化示例
const optimizedQuery = async () => {
  return prisma.course.findMany({
    take: 20,           // 限制返回数量
    skip: 0,
    select: {           // 只选择需要的字段
      id: true,
      title: true,
      status: true,
    },
    orderBy: {
      createdAt: 'desc'
    }
  })
}
```

#### 缓存策略
```typescript
// utils/cache.ts
import NodeCache from 'node-cache'

// 内存缓存 (比 Redis 更快，但重启丢失)
const memoryCache = new NodeCache({
  stdTTL: 300,      // 5分钟过期
  checkperiod: 60,  // 每分钟清理
  maxKeys: 1000,    // 最多1000个key
  useClones: false  // 节省内存
})

// 缓存模式
export const cacheMiddleware = (ttl: number = 300) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.originalUrl
    const cached = memoryCache.get(key)
    
    if (cached) {
      return res.json(cached)
    }
    
    // 劫持 res.json 缓存结果
    const originalJson = res.json
    res.json = function(data) {
      memoryCache.set(key, data, ttl)
      return originalJson.call(this, data)
    }
    
    next()
  }
}
```

### 3. 磁盘 I/O 优化

#### 上传文件处理
```typescript
// 使用流式处理，避免内存占用
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'

export const handleUpload = async (req: Request) => {
  const writeStream = createWriteStream('/tmp/upload.tmp')
  
  // 流式写入，不占内存
  await pipeline(req, writeStream)
  
  // 处理完成后立即移动，不复制
  await fs.rename('/tmp/upload.tmp', '/uploads/final.mp4')
}
```

#### 日志轮转
```bash
# 使用 logrotate (Linux)
# /etc/logrotate.d/ptool
/var/log/ptool/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 www-data www-data
    size 100M           # 超过100M就轮转
}
```

### 4. 网络优化

#### Nginx 配置
```nginx
# 压缩
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript;

# 连接优化
worker_connections 1024;
keepalive_timeout 30;
keepalive_requests 100;

# 静态文件缓存
location ~* \.(js|css|png|jpg|jpeg|gif|ico)$ {
    expires 7d;
    add_header Cache-Control "public, immutable";
    access_log off;  # 静态文件不记录日志
}

# 限制上传大小
client_max_body_size 100M;
client_body_buffer_size 16k;
```

### 5. 数据库优化

#### PostgreSQL 配置 (2G 内存)
```conf
# postgresql.conf

# 内存设置
shared_buffers = 512MB          # 25% of RAM
effective_cache_size = 1536MB   # 75% of RAM
work_mem = 8MB                  # 降低每个连接内存
maintenance_work_mem = 128MB

# 连接设置
max_connections = 50            # 降低最大连接数

# WAL 设置
wal_buffers = 16MB
checkpoint_completion_target = 0.9

# 查询优化
random_page_cost = 1.1          # SSD 优化
effective_io_concurrency = 200
```

#### 索引优化
```sql
-- 常用查询索引
CREATE INDEX CONCURRENTLY idx_course_creator ON courses(creator_id);
CREATE INDEX CONCURRENTLY idx_assignment_course ON assignments(course_id);
CREATE INDEX CONCURRENTLY idx_submission_student ON submissions(student_id);
CREATE INDEX CONCURRENTLY idx_video_teacher ON videos(teacher_id);
CREATE INDEX CONCURRENTLY idx_video_status ON videos(status) WHERE status = 'PENDING';
```

### 6. 视频处理优化 (重点)

#### 分段处理策略
```typescript
// 只在空闲时间处理视频
const isIdleTime = (): boolean => {
  const hour = new Date().getHours()
  return hour >= 22 || hour <= 8  // 夜间空闲
}

// 动态调整质量
const getProcessingConfig = () => {
  const load = os.loadavg()[0]  // 1分钟负载
  
  if (load > 1.5) {
    // 高负载：暂停新任务
    return null
  }
  
  if (load > 1.0) {
    // 中负载：降低质量
    return {
      resolution: '480p',
      preset: 'ultrafast',
      crf: 30
    }
  }
  
  // 低负载：标准质量
  return {
    resolution: '720p',
    preset: 'veryfast',
    crf: 23
  }
}
```

#### 视频处理队列配置
```typescript
// 优先级队列
videoQueue.process('transcode', 1, async (job) => {
  // 检查系统负载
  const load = os.loadavg()[0]
  const cpuCount = os.cpus().length
  
  if (load > cpuCount * 0.8) {
    // 负载过高，延迟处理
    await job.moveToDelayed(Date.now() + 60000)  // 延迟1分钟
    return
  }
  
  // 正常处理
  await processVideo(job.data)
})
```

### 7. 前端优化

#### 懒加载 + 虚拟滚动
```typescript
// 大列表优化
import { useVirtualizer } from '@tanstack/react-virtual'

const VirtualList = ({ items }) => {
  const parentRef = useRef()
  
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,  // 预估行高
    overscan: 5              // 预渲染5行
  })
  
  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            {items[virtualRow.index]}
          </div>
        ))}
      </div>
    </div>
  )
}
```

#### 图片优化
```typescript
// 自动压缩 + WebP 格式
const optimizeImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      // 限制最大尺寸
      const maxSize = 1920
      let { width, height } = img
      
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = (height / width) * maxSize
          width = maxSize
        } else {
          width = (width / height) * maxSize
          height = maxSize
        }
      }
      
      canvas.width = width
      canvas.height = height
      ctx?.drawImage(img, 0, 0, width, height)
      
      // 转换为 WebP (如果支持)
      canvas.toBlob(
        (blob) => resolve(blob || file),
        'image/webp',
        0.85  // 质量 85%
      )
    }
  })
}
```

---

## 📊 性能监控

### 基础监控脚本
```bash
#!/bin/bash
# monitor.sh

echo "=== 系统状态 ==="
echo "CPU 负载: $(uptime | awk -F'load average:' '{print $2}')"
echo "内存使用: $(free -h | grep Mem | awk '{print $3"/"$2}')"
echo "磁盘使用: $(df -h / | tail -1 | awk '{print $5}')"

echo ""
echo "=== Node.js 进程 ==="
ps aux | grep node | grep -v grep

echo ""
echo "=== 数据库连接 ==="
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

echo ""
echo "=== Redis 状态 ==="
redis-cli info stats | grep -E "(total_commands_processed|instantaneous_ops_per_sec)"
```

### 预警阈值
```yaml
CPU: > 80% 持续 5 分钟
内存: > 85% 持续 3 分钟
磁盘: > 90%
负载: > CPU核心数 * 0.8
响应时间: > 1 秒
```

---

## ✅ 优化检查清单

- [ ] PM2 配置优化 (instances: 1)
- [ ] 数据库连接池限制 (max: 50)
- [ ] 内存缓存配置 (maxKeys: 1000)
- [ ] 视频处理并发限制 (1 个)
- [ ] Nginx 压缩和缓存配置
- [ ] PostgreSQL 内存参数调整
- [ ] 日志轮转配置
- [ ] 前端懒加载实现
- [ ] 图片压缩和 WebP 转换
- [ ] 监控脚本部署

---

## 💡 特别建议 (2核2G)

1. **白天**: 只处理文字/图片，不处理视频
2. **夜间**: 22:00-08:00 批量处理视频
3. **周末**: 可以全天处理视频
4. **紧急情况**: 暂停视频处理，保证核心功能

**预期效果**:
- 并发用户: 30-50人
- API 响应: < 200ms
- 视频处理: 夜间完成
- 系统稳定: 99.9%
