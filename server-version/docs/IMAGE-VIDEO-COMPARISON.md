# 图片 vs 视频处理流程对比

## 📊 总体对比

| 对比项 | 图片处理 | 视频处理 |
|--------|---------|---------|
| **处理工具** | Sharp | FFmpeg |
| **处理速度** | 快（1-5秒） | 慢（30秒-10分钟） |
| **数据库记录** | ❌ 无（内存缓存） | ✅ 有（Video表） |
| **智能策略** | ❌ 简单判断 | ✅ 三种策略 |
| **缩略图** | ❌ 无 | ✅ 自动生成 |
| **水印位置** | 底部居中 | 右下角 |
| **COS上传** | ✅ 相同 | ✅ 相同 |
| **自动清理** | ✅ 相同 | ✅ 相同 |

---

## 🔄 图片处理流程

```
用户上传图片
    ↓
保存到本地临时目录
    ↓
保存原始文件副本到/tmp
    ↓
分析图片元数据（宽高、格式）
    ↓
判断是否需要处理
    ├─ >500KB 或 尺寸>1920px → 压缩+水印
    └─ 小图 → 仅加水印
    ↓
Sharp处理（调整尺寸+水印+压缩）
    ↓
上传到COS
    ├─ 原始图片 → 低频存储（STANDARD_IA）
    └─ 处理后图片 → 标准存储（STANDARD）
    ↓
删除本地文件
    ↓
返回结果（内存缓存）
```

---

## 🔄 视频处理流程

```
用户上传视频
    ↓
保存到本地临时目录
    ↓
创建数据库记录（status: PENDING）
    ↓
加入处理队列
    ↓
分析视频信息（编码、分辨率、时长）
    ↓
智能选择处理策略
    ├─ H.264 + ≤480p → 仅水印
    ├─ H.264 + >480p → 压缩到480p
    └─ 非H.264 → 完整转码
    ↓
FFmpeg处理（转码+水印）
    ↓
智能压缩检查
    ↓
生成缩略图
    ↓
上传到COS
    ├─ 原始视频 → 低频存储（STANDARD_IA）
    ├─ 处理后视频 → 标准存储（STANDARD）
    └─ 缩略图 → 标准存储（STANDARD）
    ↓
更新数据库（status: COMPLETED）
    ↓
删除本地原始文件
```

---

## 📋 详细对比

### 1. 处理工具

#### 图片 - Sharp
```typescript
// 处理速度快
const pipeline = sharp(inputPath)
  .resize(1920, 1920, { fit: 'inside' })
  .composite([{ input: watermark, gravity: 'south' }])
  .jpeg({ quality: 80, progressive: true })
  .toFile(outputPath)

// 处理时间：1-5秒
```

#### 视频 - FFmpeg
```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -preset veryfast -crf 26 \
  -vf "overlay=watermark.png" \
  output.mp4

# 处理时间：30秒-10分钟
```

---

### 2. 处理策略

#### 图片 - 简单判断
```typescript
const needsResize = width > 1920 || height > 1920
const needsCompression = size > 500KB || needsResize

if (needsCompression || !isWebP) {
  // 压缩 + 水印
} else {
  // 仅水印
}
```

#### 视频 - 智能策略
```typescript
// 策略1: H.264 + ≤480p → 仅水印（快速）
// 策略2: H.264 + >480p → 压缩到480p
// 策略3: 非H.264 → 完整转码

// 额外：智能压缩检查
if (压缩后 > 原文件) {
  改用仅水印模式
}
```

---

### 3. 水印样式

#### 图片水印
```
位置: 底部居中（gravity: 'south'）
内容: "慧育空间"
样式: 白色半透明，自适应宽度
```

#### 视频水印
```
位置: 右下角（overlay=W-w-10:H-h-10）
内容: "慧育空间教学专属视频"
样式: 白色半透明 + 黑色描边
```

---

### 4. COS上传

#### 图片 - 两种存储
```typescript
// 1. 原始图片 → 低频存储
const originalKey = `images/original/${timestamp}-${imageId}.jpg`
await uploadToCOS(originalBackupPath, originalKey, 'STANDARD_IA')

// 2. 处理后图片 → 标准存储
const processedKey = `images/processed/${timestamp}-${imageId}.jpg`
await uploadToCOS(outputPath, processedKey, 'STANDARD')
```

#### 视频 - 三种存储
```typescript
// 1. 原始视频 → 低频存储
const originalKey = `videos/original/${timestamp}-${videoId}.mp4`
await uploadToCOS(inputPath, originalKey, 'STANDARD_IA')

// 2. 处理后视频 → 标准存储
const processedKey = `videos/processed/${timestamp}-${videoId}.mp4`
await uploadToCOS(outputPath, processedKey, 'STANDARD')

// 3. 缩略图 → 标准存储
const thumbnailKey = `videos/thumbnails/${timestamp}-${videoId}.jpg`
await uploadToCOS(thumbnailPath, thumbnailKey, 'STANDARD')
```

---

### 5. 数据库记录

#### 图片 - 无持久化记录
```typescript
// 只在内存缓存中存储
const imageStatusCache = new Map<string, {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  filename?: string
  url?: string
  size?: number
}>()
```

#### 视频 - 持久化记录
```typescript
// 存储在数据库中
model Video {
  id           String
  title        String
  filePath     String
  status       VideoStatus  // PENDING, PROCESSING, COMPLETED, FAILED
  processedUrl String?
  originalCosUrl String?
  thumbnailUrl String?
  resolution   String?
  duration     Int?
  // ... 更多字段
}
```

---

### 6. 压缩效果

#### 图片压缩
```
配置:
  - 最大尺寸: 1920x1920
  - JPEG质量: 80
  - WebP质量: 75
  - 渐进式: true
  - MozJPEG: true

效果:
  - 原始: 5MB
  - 压缩后: 500KB
  - 压缩率: 90%
```

#### 视频压缩
```
配置:
  - 目标分辨率: 480p (854x480)
  - 编码: H.264
  - CRF: 26
  - 比特率: 800k

效果:
  - 原始: 100MB
  - 压缩后: 45MB
  - 压缩率: 55%
```

---

## 🎯 共同特点

### 1. 相同的COS存储策略

| 文件类型 | 存储类型 | 位置 | 用途 |
|---------|---------|------|------|
| 原始文件 | 低频存储 (STANDARD_IA) | */original/ | 备份 |
| 处理后文件 | 标准存储 (STANDARD) | */processed/ | 访问 |

### 2. 相同的CDN加速

- 域名: `https://cdn.eduk12.top`
- 访问方式: CDN全国加速
- 缓存策略: 7-30天

### 3. 相同的自动清理

- 处理完成后删除临时文件
- 上传成功后删除本地原始文件
- 无需手动干预

### 4. 相同的错误处理

- 失败时清理临时文件
- 记录错误日志
- 回退到本地存储

---

## 📊 性能对比

### 处理速度

| 文件大小 | 图片处理 | 视频处理 |
|---------|---------|---------|
| 1MB | 0.5-1秒 | 10-30秒 |
| 10MB | 1-2秒 | 30-60秒 |
| 100MB | 2-5秒 | 2-5分钟 |
| 500MB | - | 5-10分钟 |

### 并发能力

| 项目 | 图片 | 视频 |
|------|------|------|
| 并发数 | 3-5 | 2 |
| 内存占用 | 100-200MB | 500MB-1GB |
| CPU占用 | 低 | 高 |

---

## 💰 成本对比

### 图片成本（月度）

```
原始图片: 5MB
压缩后: 500KB
存储成本:
  - 原始（低频）: 5MB × ¥0.08/GB = ¥0.0004
  - 处理后（标准）: 0.5MB × ¥0.118/GB = ¥0.00006
  - 总计: ¥0.00046/月
```

### 视频成本（月度）

```
原始视频: 100MB
压缩后: 45MB
存储成本:
  - 原始（低频）: 100MB × ¥0.08/GB = ¥0.008
  - 处理后（标准）: 45MB × ¥0.118/GB = ¥0.0053
  - 缩略图（标准）: 0.1MB × ¥0.118/GB = ¥0.00001
  - 总计: ¥0.013/月
```

---

## 🔧 技术细节对比

### 1. 尺寸调整

#### 图片
```typescript
// Sharp - 智能缩放
.resize(1920, 1920, {
  fit: 'inside',          // 保持比例
  withoutEnlargement: true // 不放大小图
})
```

#### 视频
```bash
# FFmpeg - 固定分辨率
-vf "scale=854:480"
```

### 2. 水印添加

#### 图片
```typescript
// Sharp - 底部居中
.composite([{
  input: watermarkBuffer,
  gravity: 'south'  // 底部居中
}])
```

#### 视频
```bash
# FFmpeg - 右下角
-vf "movie=watermark.png [wm]; [in][wm] overlay=W-w-10:H-h-10 [out]"
```

### 3. 质量控制

#### 图片
```typescript
.jpeg({
  quality: 80,           // 质量80%
  progressive: true,     // 渐进式加载
  mozjpeg: true          // MozJPEG优化
})
```

#### 视频
```bash
-crf 26                  # 质量参数（18-28）
-preset veryfast         # 编码速度
-b:v 800k                # 比特率限制
```

---

## ✅ 总结

### 核心相同点

1. ✅ **双存储架构**：原始文件（低频）+ 处理后文件（标准）
2. ✅ **CDN加速**：处理后文件通过CDN访问
3. ✅ **自动添加水印**：保护版权
4. ✅ **自动清理**：处理完成自动删除本地文件
5. ✅ **错误处理**：失败时清理临时文件

### 关键区别

| 项目 | 图片 | 视频 |
|------|------|------|
| **处理工具** | Sharp | FFmpeg |
| **处理速度** | 快（秒级） | 慢（分钟级） |
| **策略复杂度** | 简单 | 智能（3种策略） |
| **数据库记录** | 无 | 有 |
| **缩略图** | 无 | 有 |
| **并发限制** | 3-5个 | 2个 |

### 优化建议

#### 图片优化
- ✅ 已使用MozJPEG优化
- ✅ 渐进式加载
- 💡 可考虑WebP格式（更小体积）
- 💡 可考虑添加懒加载

#### 视频优化
- ✅ 智能策略选择
- ✅ 智能压缩检查
- 💡 可考虑多分辨率（720p选项）
- 💡 可考虑HLS切片（大视频）

---

**文档版本**: v1.0  
**更新时间**: 2026-03-27  
**维护人员**: 系统管理员
