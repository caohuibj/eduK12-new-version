# 视频上传存储与压缩打码流程说明

## 📋 完整处理流程

```
用户上传视频
    ↓
保存到本地临时目录 (/opt/ptool/server-version/backend/uploads/videos/)
    ↓
创建数据库记录 (status: PENDING)
    ↓
加入视频处理队列 (Bull Queue)
    ↓
开始异步处理
    ├─ 1. 分析视频信息
    ├─ 2. 智能决策处理策略
    ├─ 3. 生成水印图片
    ├─ 4. FFmpeg转码+添加水印
    ├─ 5. 智能压缩检查
    ├─ 6. 生成缩略图
    ├─ 7. 上传到COS（三种存储）
    ├─ 8. 更新数据库
    ├─ 9. 清理临时文件
    └─ 10. 删除本地原始文件
    ↓
处理完成 (status: COMPLETED)
```

---

## 🔍 详细步骤说明

### 步骤1: 视频上传

**触发方式**: 用户通过前端上传视频

**处理逻辑**:
```typescript
// 1. 保存到本地临时目录
const filePath = `/opt/ptool/server-version/backend/uploads/videos/${Date.now()}-${uuid}.mp4`

// 2. 创建数据库记录
const video = await prisma.video.create({
  data: {
    title,
    filePath,
    fileName,
    fileSize,
    mimeType,
    teacherId,
    originalUrl: `file://${filePath}`,
    status: 'PENDING',
  }
})

// 3. 加入处理队列
await videoQueue.add('transcode', {
  videoId: video.id,
  originalUrl: `file://${filePath}`,
  teacherId,
}, {
  delay: 1000,  // 延迟1秒
  priority: 1,
  attempts: 3,
})
```

**状态**: `PENDING`（待处理）

---

### 步骤2: 分析视频信息

**分析内容**:
```typescript
const videoInfo = await validateVideoFile(inputPath)

// 分析结果包含：
{
  valid: boolean,
  isH264: boolean,        // 是否为H.264编码
  is480pOrLower: boolean, // 分辨率是否≤480p
  height: number,         // 视频高度
  codec: string,          // 编码格式
  duration: number,       // 时长
}
```

**目的**: 为后续处理策略提供决策依据

---

### 步骤3: 智能决策处理策略

**决策逻辑**:

#### 策略1: 仅添加水印（快速模式）
```
条件: H.264编码 + 分辨率≤480p
处理: 只添加水印，不重新编码
配置:
  - preset: ultrafast
  - crf: 18
  - 保持原分辨率
原因: 原视频已优化，无需重新编码
```

#### 策略2: 压缩到480p + 水印
```
条件: H.264编码 + 分辨率>480p
处理: 压缩到480p并添加水印
配置:
  - preset: veryfast
  - crf: 26
  - 分辨率: 854x480
  - 比特率: 800k
原因: 降低分辨率以节省存储和带宽
```

#### 策略3: 完整转码 + 压缩
```
条件: 非H.264编码
处理: 转码为H.264并添加水印
配置:
  - preset: veryfast
  - crf: 26
  - 分辨率: 854x480
  - 比特率: 800k
原因: 统一编码格式，提高兼容性
```

**配置参数**:
```typescript
const PROCESSING_CONFIG = {
  resolution: '480p',        // 目标分辨率
  preset: 'veryfast',        // 编码速度（质量与速度平衡）
  crf: 26,                   // 质量参数（18-28，越小质量越好）
  videoBitrate: '800k',      // 视频比特率
  audioBitrate: '96k',       // 音频比特率
  smartCompression: true,    // 智能压缩
}
```

---

### 步骤4: 生成水印

**水印样式**:
```typescript
// 右下角水印
位置: 右下角
内容: "慧育空间教学专属视频"
样式:
  - 字体: 思源黑体
  - 大小: 根据视频宽度自适应
  - 颜色: 白色半透明
  - 阴影: 黑色描边
```

**生成代码**:
```typescript
const cornerBuffer = await generateCornerWatermark(targetWidth)
await fs.writeFile(cornerWatermarkPath, cornerBuffer)
```

---

### 步骤5: FFmpeg转码 + 添加水印

**处理命令**:
```bash
ffmpeg -i input.mp4 \
  -vf "movie=watermark.png [watermark]; [in][watermark] overlay=W-w-10:H-h-10 [out]" \
  -c:v libx264 \
  -preset veryfast \
  -crf 26 \
  -b:v 800k \
  -c:a aac \
  -b:a 96k \
  output.mp4
```

**关键参数说明**:
- `-c:v libx264`: 使用H.264编码
- `-preset veryfast`: 编码速度（ultrafast, superfast, veryfast, faster, fast）
- `-crf 26`: 质量参数（18-28，推荐26）
- `-b:v 800k`: 视频比特率
- `-b:a 96k`: 音频比特率

---

### 步骤6: 智能压缩检查

**检查逻辑**:
```typescript
if (压缩后文件大小 >= 原文件大小 && 处理模式 === 'transcode') {
  // 改用仅水印模式
  重新处理(inputPath, outputPath, {
    mode: 'watermark-only',
    preset: 'ultrafast',
    crf: 18,
  })
}
```

**目的**: 避免无效压缩，如果压缩后反而更大，则只添加水印不压缩

**压缩效果统计**:
```
原始文件: 100MB
处理后: 45MB
节省: 55%
```

---

### 步骤7: 生成缩略图

**生成逻辑**:
```bash
ffmpeg -i output.mp4 \
  -ss 00:00:01 \
  -vframes 1 \
  -q:v 2 \
  thumbnail.jpg
```

**缩略图规格**:
- 提取时间: 第1秒
- 格式: JPG
- 质量: 2（高质量）
- 分辨率: 与视频相同

---

### 步骤8: 上传到COS（三种存储）

#### 8.1 原始视频上传

**存储位置**: `videos/original/${timestamp}-${videoId}.mp4`

**存储类型**: `STANDARD_IA`（低频存储）

**访问方式**: COS直连

**用途**: 备份，仅管理员访问

**成本**: ¥0.08/GB/月

```typescript
const originalKey = `videos/original/${Date.now()}-${videoId}.mp4`
originalCosUrl = await uploadToCOS(inputPath, originalKey, 'STANDARD_IA')

// 返回URL: https://cdn.eduk12.top/videos/original/xxx.mp4
```

#### 8.2 处理后视频上传

**存储位置**: `videos/processed/${timestamp}-${videoId}.mp4`

**存储类型**: `STANDARD`（标准存储）

**访问方式**: CDN加速

**用途**: 用户观看

**成本**: ¥0.118/GB/月

```typescript
const processedKey = `videos/processed/${Date.now()}-${videoId}.mp4`
processedUrl = await uploadToCOS(outputPath, processedKey, 'STANDARD')

// 返回URL: https://cdn.eduk12.top/videos/processed/xxx.mp4
```

#### 8.3 缩略图上传

**存储位置**: `videos/thumbnails/${timestamp}-${videoId}.jpg`

**存储类型**: `STANDARD`（标准存储）

**访问方式**: CDN加速

**用途**: 视频封面

**成本**: ¥0.118/GB/月

```typescript
const thumbnailKey = `videos/thumbnails/${Date.now()}-${videoId}.jpg`
thumbnailUrl = await uploadToCOS(thumbnailPath, thumbnailKey, 'STANDARD')

// 返回URL: https://cdn.eduk12.top/videos/thumbnails/xxx.jpg
```

**并行上传**:
```typescript
const [procUrl, thumbUrl] = await Promise.all([
  uploadToCOS(outputPath, processedKey, 'STANDARD'),
  uploadToCOS(thumbnailPath, thumbnailKey, 'STANDARD')
])
```

---

### 步骤9: 更新数据库

**更新内容**:
```typescript
await prisma.video.update({
  where: { id: videoId },
  data: {
    status: 'COMPLETED',
    processedUrl,        // 处理后视频CDN URL
    thumbnailUrl,        // 缩略图CDN URL
    resolution: '480p',  // 处理后分辨率
    duration,            // 视频时长
    fileSize,            // 处理后文件大小
    processedAt: new Date(),
    originalCosUrl,      // 原始文件COS URL
    originalCosKey,      // 原始文件COS Key
  }
})
```

**状态变化**: `PROCESSING` → `COMPLETED`

---

### 步骤10: 清理临时文件

**清理内容**:
```typescript
// 1. 清理临时目录
await fs.rm(tempDir, { recursive: true, force: true })

// 临时文件包括：
// - /tmp/video-{videoId}/input.mp4 (原始视频临时副本)
// - /tmp/video-{videoId}/output.mp4 (处理后视频)
// - /tmp/video-{videoId}/watermark-corner.png (水印图片)
// - /tmp/video-{videoId}/thumbnail.jpg (缩略图)
```

---

### 步骤11: 删除本地原始文件

**删除条件**:
```typescript
if (originalCosUrl && video.filePath && video.filePath !== 'pending_download') {
  // 已上传到COS
  // 文件路径存在
  // 不是从URL下载的视频
  
  await fs.unlink(video.filePath)
}
```

**删除位置**: `/opt/ptool/server-version/backend/uploads/videos/${fileName}`

**目的**: 释放磁盘空间（文件已备份到COS）

---

## 📊 存储策略对比

### 原始视频（低频存储）

| 属性 | 值 |
|------|-----|
| 存储类型 | STANDARD_IA |
| 存储位置 | videos/original/ |
| 访问方式 | COS直连 |
| 访问权限 | 仅管理员 |
| 成本 | ¥0.08/GB/月 |
| 最少存储 | 30天 |
| 适用场景 | 长期备份 |

### 处理后视频（标准存储）

| 属性 | 值 |
|------|-----|
| 存储类型 | STANDARD |
| 存储位置 | videos/processed/ |
| 访问方式 | CDN加速 |
| 访问权限 | 所有用户 |
| 成本 | ¥0.118/GB/月 |
| CDN费用 | ¥0.21/GB |
| 适用场景 | 用户观看 |

### 缩略图（标准存储）

| 属性 | 值 |
|------|-----|
| 存储类型 | STANDARD |
| 存储位置 | videos/thumbnails/ |
| 访问方式 | CDN加速 |
| 访问权限 | 所有用户 |
| 成本 | ¥0.118/GB/月 |
| CDN费用 | ¥0.21/GB |
| 适用场景 | 视频封面 |

---

## 💰 成本计算示例

### 示例场景

```
原始视频: 100MB
处理后视频: 45MB
缩略图: 100KB
每月播放: 50次完整观看
```

### 存储成本

```
原始文件（低频）: 100MB × ¥0.08/GB = ¥0.008/月
处理后文件（标准）: 45MB × ¥0.118/GB = ¥0.0053/月
缩略图（标准）: 0.1MB × ¥0.118/GB = ¥0.00001/月
存储总计: ¥0.013/月
```

### 流量成本

```
CDN流量: 45MB × 50次 = 2.25GB
流量费用: 2.25GB × ¥0.21/GB = ¥0.47/月
```

### 总成本

```
月度成本: ¥0.013 + ¥0.47 = ¥0.48/月
年度成本: ¥0.48 × 12 = ¥5.76/年
```

**对比本地存储**:
- 本地磁盘: 100MB × ¥0.3/GB = ¥0.03/月
- **节省**: 本地存储看似便宜，但无备份、无加速、扩展性差

---

## 🔧 关键技术点

### 1. 智能处理策略

**优势**:
- ✅ 根据视频特性自动选择最优策略
- ✅ 避免不必要的转码，节省处理时间
- ✅ 保证输出质量一致

**示例**:
```
原视频: H.264编码, 720p, 50MB
策略: 压缩到480p + 水印
处理时间: 约30秒
输出: 480p, 20MB
```

### 2. 智能压缩检查

**逻辑**:
```
if (压缩后 > 原文件) {
  改用仅水印模式
}
```

**效果**:
- 避免无效压缩
- 节省处理时间
- 保证文件大小合理

### 3. 并行上传

**实现**:
```typescript
const [procUrl, thumbUrl] = await Promise.all([
  uploadToCOS(outputPath, processedKey, 'STANDARD'),
  uploadToCOS(thumbnailPath, thumbnailKey, 'STANDARD')
])
```

**优势**:
- 减少上传时间50%
- 提高处理效率

### 4. 自动清理

**机制**:
- 处理完成自动清理临时文件
- 上传成功自动删除本地原始文件
- 无需手动干预

---

## 📈 性能优化

### 1. 处理速度优化

**措施**:
- 使用 `veryfast` preset（速度与质量平衡）
- 并发处理（最多2个任务）
- 智能策略选择（避免不必要的转码）

**效果**:
```
100MB视频处理时间: 约30-60秒
500MB视频处理时间: 约2-5分钟
```

### 2. 存储空间优化

**措施**:
- 压缩到480p（节省50-70%空间）
- 删除本地原始文件
- 低频存储备份

**效果**:
```
原始: 100MB
处理后: 45MB
节省: 55%
```

### 3. CDN加速

**配置**:
- 域名: cdn.eduk12.top
- 节点: 全国加速
- 缓存: 7-30天

**效果**:
- 首次访问: 慢（需从COS拉取）
- 后续访问: 快（缓存命中）

---

## ⚠️ 注意事项

### 1. 处理失败处理

**失败原因**:
- FFmpeg未安装
- 视频格式不支持
- 存储空间不足
- COS上传失败

**处理方式**:
```typescript
status: 'FAILED'
errorMessage: '具体错误信息'
```

### 2. 低频存储限制

**限制条件**:
- 最少存储30天
- 提前删除仍收取30天费用
- 不适合频繁访问

**建议**: 仅用于备份，不用于日常访问

### 3. 文件清理时机

**清理条件**:
- ✅ 上传到COS成功
- ✅ 数据库记录更新成功
- ✅ 文件路径有效

**不清理情况**:
- ❌ COS上传失败
- ❌ 数据库更新失败
- ❌ 从URL下载的视频

### 4. 成本控制

**监控指标**:
- COS存储用量
- CDN流量
- 处理任务数

**告警阈值**:
- 存储超过10GB
- 月流量超过100GB
- 月费用超过¥50

---

## 🎯 总结

### 核心流程

```
上传 → 分析 → 策略 → 转码+水印 → 压缩检查 → 缩略图 → COS上传 → 清理
```

### 存储策略

| 文件类型 | 存储类型 | 位置 | 用途 |
|---------|---------|------|------|
| 原始视频 | 低频存储 | videos/original/ | 备份 |
| 处理后视频 | 标准存储 | videos/processed/ | 观看 |
| 缩略图 | 标准存储 | videos/thumbnails/ | 封面 |

### 成本优化

- 压缩率: 50-70%
- 低频存储: 节省32%
- CDN加速: 提升用户体验
- 自动清理: 节省磁盘空间

### 技术亮点

✅ 智能处理策略  
✅ 智能压缩检查  
✅ 三级存储架构  
✅ 并行上传优化  
✅ 自动清理机制  

---

**文档版本**: v1.0  
**更新时间**: 2026-03-27  
**维护人员**: 系统管理员
