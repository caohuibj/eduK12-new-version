# 视频自动转码功能部署指南

**功能**: 视频上传后自动转码为720p + 添加水印  
**技术栈**: FFmpeg + Redis + Bull Queue  
**预计处理时间**: 45-90秒/视频

---

## 📋 前置要求

### 服务器配置
- **CPU**: 2核以上 (转码时占用2核)
- **内存**: 额外500MB/视频
- **磁盘**: 临时空间 (原始视频大小 × 2)

### 必须安装的软件
```bash
# FFmpeg - 视频处理
ffmpeg -version

# Redis - 任务队列
redis-cli ping
```

---

## 🚀 快速部署

### 第一步: 安装依赖

```bash
# 方式1: 使用脚本 (Ubuntu/Debian)
ssh root@your-server
cd /opt/ptool/server-version
bash scripts/install-deps.sh

# 方式2: 手动安装
sudo apt update
sudo apt install ffmpeg redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### 第二步: 配置环境变量

编辑 `backend/.env`:
```bash
# 必需: Redis 配置 (如果非本地)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password  # 如果有

# 可选但推荐: COS 配置 (用于存储转码后的视频)
COS_SECRET_ID=your-secret-id
COS_SECRET_KEY=your-secret-key
COS_BUCKET=your-bucket
COS_REGION=ap-guangzhou
COS_DOMAIN=https://your-bucket.cos.ap-guangzhou.myqcloud.com
```

### 第三步: 数据库迁移

```bash
cd /opt/ptool/server-version/backend

# 生成迁移文件
npx prisma migrate dev --name add_video_processing

# 或直接使用 db push
npx prisma db push

# 重新生成 Prisma Client
npx prisma generate
```

### 第四步: 安装 NPM 依赖

```bash
cd /opt/ptool/server-version/backend
npm install bull fluent-ffmpeg sharp
npm install -D @types/fluent-ffmpeg
```

### 第五步: 重新构建并启动

```bash
# 构建后端
npm run build

# 重启服务
pm2 restart ptool-api

# 查看日志
pm2 logs ptool-api
```

---

## 📊 监控和维护

### 查看队列状态

```bash
# 使用 redis-cli
redis-cli
LLEN bull:video processing:wait    # 等待队列长度
LLEN bull:video processing:active  # 活跃任务数

# 或使用脚本
cd /opt/ptool/server-version/backend
node -e "
const Queue = require('bull');
const videoQueue = new Queue('video processing');
videoQueue.getJobCounts().then(console.log);
"
```

### 手动触发重新处理

如果某个视频处理失败，可以手动重新入队:
```bash
node -e "
const Queue = require('bull');
const videoQueue = new Queue('video processing');
videoQueue.add('transcode', {
  videoId: 'VIDEO_ID_HERE',
  originalUrl: 'file:///path/to/video.mp4',
  teacherId: 'TEACHER_ID'
});
"
```

### 清理失败的视频

```sql
-- 查看失败的视频
SELECT id, title, errorMessage, createdAt
FROM videos
WHERE status = 'FAILED'
ORDER BY createdAt DESC;

-- 重置状态重新处理
UPDATE videos
SET status = 'PENDING', errorMessage = NULL
WHERE id = 'VIDEO_ID';
```

---

## ⚙️ 性能调优

### FFmpeg 参数调整

在 `src/workers/videoProcessor.ts` 中:
```typescript
// 更快的编码 (质量略降)
ffmpeg()
  .outputOptions([
    '-preset ultrafast',  // 最快，文件更大
    '-crf 28',           // 质量稍低
  ])

// 更好的质量 (速度更慢)
ffmpeg()
  .outputOptions([
    '-preset slow',      // 更慢，文件更小
    '-crf 20',           // 质量更好
  ])
```

### 并发处理数

```typescript
// 在 videoProcessor.ts 中调整
videoQueue.process('transcode', 1, async (job) => {
  // 1 = 同时只处理1个视频 (推荐2C4G配置)
  // 2 = 同时处理2个视频 (需要4C8G配置)
})
```

---

## 🔍 常见问题

### Q1: 视频一直处于 "等待处理" 状态

**原因**: Worker 未启动或 Redis 未连接  
**解决**:
```bash
# 检查 Redis
redis-cli ping  # 应返回 PONG

# 检查 Worker 日志
pm2 logs ptool-api | grep -i "视频处理 Worker"
```

### Q2: 转码失败，错误 "FFmpeg 未安装"

**原因**: FFmpeg 未正确安装  
**解决**:
```bash
# 安装 FFmpeg
sudo apt install ffmpeg

# 验证
ffmpeg -version
```

### Q3: 处理速度太慢

**原因**: 视频分辨率太高或服务器配置低  
**解决**:
- 限制上传视频大小 (建议最大 500MB)
- 升级到更高配置服务器
- 调整 FFmpeg 参数使用更快的 preset

### Q4: 内存不足

**原因**: 并发处理视频太多  
**解决**:
- 减少并发数 (改为 1)
- 增加服务器内存
- 清理临时文件

```bash
# 清理临时文件
rm -rf /tmp/video-*
```

---

## 📈 性能指标

### 处理时间参考 (2C4G 服务器)

| 视频规格 | 时长 | 处理时间 |
|---------|------|---------|
| 1080p → 720p | 5分钟 | 30-40秒 |
| 1080p → 720p | 15分钟 | 90-120秒 |
| 4K → 720p | 5分钟 | 60-90秒 |

### 资源占用

| 阶段 | CPU | 内存 | 磁盘 |
|-----|-----|------|------|
| 下载 | 低 | 100MB | - |
| 转码 | 2核满载 | 500MB | 2×视频大小 |
| 上传 | 低 | 50MB | - |

---

## ✅ 验证部署

1. **上传视频**: 访问视频库页面上传一个测试视频
2. **查看状态**: 确认显示 "处理中" 状态
3. **等待完成**: 观察进度条直到 100%
4. **验证结果**: 
   - 检查视频是否能正常播放
   - 检查右下角是否有水印
   - 检查分辨率是否为 720p

---

## 📝 更新日志

### v1.0.1 (视频转码功能)
- ✅ 自动转码为 720p
- ✅ 添加文字水印
- ✅ 异步队列处理
- ✅ 进度实时显示
- ✅ 失败自动重试

---

**部署完成时间**: _______________  
**部署人员**: _______________  
**测试视频**: _______________
