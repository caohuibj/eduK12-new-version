# COS存储迁移实施文档

## 📋 概述

本文档记录了将图片、视频文件迁移到腾讯云COS存储的实施方案，包括：
- 原始文件上传到低频存储（备份）
- 处理后文件上传到标准存储（CDN加速）
- 本地文件自动清理机制

---

## 🎯 实施目标

1. **存储优化**：减少服务器磁盘占用
2. **成本优化**：使用COS低频存储降低备份成本
3. **访问优化**：通过CDN加速用户访问
4. **数据安全**：云端备份，防止数据丢失

---

## 📦 存储策略

### 文件类型分类

| 文件类型 | 存储位置 | 存储类型 | 访问方式 | 成本 |
|---------|---------|---------|---------|------|
| **原始视频** | `videos/original/` | 低频存储 (STANDARD_IA) | COS直连 | ¥0.08/GB/月 |
| **处理后视频** | `videos/processed/` | 标准存储 (STANDARD) | CDN加速 | ¥0.118/GB/月 |
| **视频缩略图** | `videos/thumbnails/` | 标准存储 (STANDARD) | CDN加速 | ¥0.118/GB/月 |
| **原始图片** | `images/original/` | 低频存储 (STANDARD_IA) | COS直连 | ¥0.08/GB/月 |
| **处理后图片** | `images/processed/` | 标准存储 (STANDARD) | CDN加速 | ¥0.118/GB/月 |

### CDN配置

- **域名**：`https://cdn.eduk12.top`
- **加速区域**：中国大陆
- **缓存策略**：
  - 视频文件：缓存7天
  - 图片文件：缓存30天
  - 缩略图：缓存30天

---

## 🔧 技术实现

### 1. COS工具扩展

**文件**：`src/utils/cos.ts`

**新增功能**：
- 支持存储类型参数（STANDARD, STANDARD_IA, ARCHIVE）
- 自动设置COS对象的存储类型

```typescript
export type StorageClass = 'STANDARD' | 'STANDARD_IA' | 'ARCHIVE'

export const uploadToCOS = async (
  filePath: string,
  key: string,
  storageClass: StorageClass = 'STANDARD'
): Promise<string> => {
  // 上传时指定存储类型
  cos.putObject({
    Bucket: config.cosBucket!,
    Region: config.cosRegion!,
    Key: key,
    Body: fileBuffer,
    StorageClass: storageClass,
  })
}
```

### 2. 数据库Schema更新

**文件**：`prisma/schema.prisma`

**新增字段**：
```prisma
model Video {
  // ... 其他字段
  originalCosUrl  String?     @map("original_cos_url") // 原始文件COS URL
  originalCosKey  String?     @map("original_cos_key") // 原始文件COS Key
}
```

**迁移SQL**：
```sql
ALTER TABLE videos ADD COLUMN IF NOT EXISTS original_cos_url TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS original_cos_key TEXT;
```

### 3. 视频处理器改造

**文件**：`src/workers/videoProcessor.ts`

**处理流程**：
1. 上传原始视频到低频存储
2. 处理视频（转码、加水印、生成缩略图）
3. 上传处理后视频到标准存储
4. 上传缩略图到标准存储
5. 更新数据库记录
6. 删除本地原始文件

**关键代码**：
```typescript
// 上传原始视频到低频存储（备份）
const originalKey = `videos/original/${Date.now()}-${videoId}.mp4`
originalCosUrl = await uploadToCOS(inputPath, originalKey, 'STANDARD_IA')

// 上传处理后视频到标准存储（CDN加速）
const processedKey = `videos/processed/${Date.now()}-${videoId}.mp4`
processedUrl = await uploadToCOS(outputPath, processedKey, 'STANDARD')

// 删除本地原始文件
if (originalCosUrl && video.filePath) {
  await fs.unlink(video.filePath)
}
```

### 4. 图片处理器改造

**文件**：`src/workers/imageProcessor.ts`

**处理流程**：
1. 保存原始文件副本
2. 处理图片（压缩、加水印）
3. 上传原始图片到低频存储
4. 上传处理后图片到标准存储
5. 删除本地文件和临时文件

**关键代码**：
```typescript
// 保存原始文件副本
const originalBackupPath = path.join('/tmp', `original-${imageId}${path.extname(inputPath)}`)
await fs.copyFile(inputPath, originalBackupPath)

// 上传原始图片到低频存储
const originalKey = `images/original/${Date.now()}-${imageId}${path.extname(originalFilename)}`
originalCosUrl = await uploadToCOS(originalBackupPath, originalKey, 'STANDARD_IA')

// 上传处理后图片到标准存储
const processedKey = `images/processed/${outputFilename}`
finalUrl = await uploadToCOS(outputPath, processedKey, 'STANDARD')
```

---

## 🧹 文件清理机制

### 自动清理

**视频处理器**：处理完成后自动删除本地原始文件
**图片处理器**：处理完成后自动删除本地原始文件和处理后文件

### 手动清理脚本

**脚本路径**：`scripts/cleanup-local-files.sh`

**功能**：
- 清理已上传到COS的本地视频文件
- 清理本地处理后的视频文件
- 统计释放空间

**使用方法**：
```bash
# 执行清理
/opt/ptool/server-version/scripts/cleanup-local-files.sh

# 查看日志
tail -f /var/log/ptool/monitoring/local-files-cleanup.log
```

**定时任务**：
```bash
# 每天凌晨4点执行清理
crontab -e
# 添加：
0 4 * * * /opt/ptool/server-version/scripts/cleanup-local-files.sh
```

---

## 📊 成本分析

### 存储成本对比

**原方案**（本地存储）：
- 磁盘成本：59GB × ¥0.3/GB = ¥17.7/月
- 备份风险：高（无异地备份）

**新方案**（COS存储）：
- 原始文件（低频）：15GB × ¥0.08/GB = ¥1.2/月
- 处理后文件（标准）：15GB × ¥0.118/GB = ¥1.77/月
- CDN流量：100GB × ¥0.21/GB = ¥21/月
- **总成本：¥24/月**

**成本增加**：约¥6.3/月（+36%）

**收益**：
- ✅ 释放服务器磁盘空间（约30GB）
- ✅ CDN加速，用户体验提升
- ✅ 数据安全，云端备份
- ✅ 无限扩展，无需担心磁盘满

---

## 🚀 部署步骤

### 1. 部署代码变更

```bash
# 拉取最新代码
cd /opt/ptool/server-version
git pull

# 安装依赖
cd backend
npm install

# 生成Prisma客户端
npx prisma generate

# 重启服务
pm2 restart ptool-backend
```

### 2. 执行数据库迁移

```bash
# 执行SQL迁移
sudo -u postgres psql -d ptool -f /tmp/add_cos_fields.sql
```

### 3. 迁移现有文件（可选）

```bash
# 执行迁移脚本
/opt/ptool/server-version/scripts/migrate-existing-files-to-cos.sh

# 查看迁移日志
tail -f /var/log/ptool/monitoring/migrate-to-cos.log
```

### 4. 清理本地文件

```bash
# 执行清理脚本
/opt/ptool/server-version/scripts/cleanup-local-files.sh

# 设置定时任务
crontab -e
# 添加：
0 4 * * * /opt/ptool/server-version/scripts/cleanup-local-files.sh
```

---

## ✅ 验证测试

### 1. 测试视频上传

```bash
# 上传测试视频
curl -X POST http://localhost:3000/api/videos/upload \
  -H "Authorization: Bearer <token>" \
  -F "video=@test.mp4" \
  -F "title=测试视频"

# 检查数据库
psql -U postgres -d ptool -c "
SELECT id, title, status, processed_url, original_cos_url 
FROM videos 
ORDER BY created_at DESC 
LIMIT 1;
"

# 检查COS文件
# 登录腾讯云控制台 -> 对象存储 -> ptool-videos-edu-1393949445
# 查看 videos/original/ 和 videos/processed/ 目录
```

### 2. 测试图片上传

```bash
# 上传测试图片
curl -X POST http://localhost:3000/api/uploads/images \
  -H "Authorization: Bearer <token>" \
  -F "image=@test.jpg"

# 检查COS文件
# 查看 images/original/ 和 images/processed/ 目录
```

### 3. 验证CDN访问

```bash
# 测试CDN加速
curl -I https://cdn.eduk12.top/videos/processed/<filename>.mp4

# 应该看到 CDN 相关的响应头
# X-Cache-Lookup: Hit from CDN
```

---

## 🔍 监控与维护

### 日志监控

```bash
# 视频处理日志
tail -f /home/ubuntu/.pm2/logs/ptool-backend-out.log | grep -E "视频|COS"

# 清理日志
tail -f /var/log/ptool/monitoring/local-files-cleanup.log

# 迁移日志
tail -f /var/log/ptool/monitoring/migrate-to-cos.log
```

### 数据库监控

```sql
-- 查看COS上传进度
SELECT 
  status,
  COUNT(*) as count,
  COUNT(original_cos_url) as with_original,
  COUNT(processed_url) as with_processed
FROM videos
WHERE status = 'COMPLETED'
GROUP BY status;

-- 查看未上传到COS的视频
SELECT id, title, file_path, created_at
FROM videos
WHERE status = 'COMPLETED'
  AND (processed_url IS NULL OR processed_url NOT LIKE 'https://cdn.eduk12.top%')
ORDER BY created_at DESC;
```

### COS监控

- 登录腾讯云控制台
- 对象存储 -> ptool-videos-edu-1393949445
- 查看存储用量、流量、请求次数

---

## 📌 注意事项

1. **数据安全**：迁移前建议备份重要文件
2. **成本控制**：定期检查COS用量，避免意外费用
3. **权限配置**：确保COS SecretId和SecretKey配置正确
4. **CDN配置**：确保CDN域名已备案并配置正确
5. **存储类型**：低频存储不适合频繁访问，仅用于备份

---

## 🆘 故障排查

### 问题1：上传到COS失败

**症状**：日志显示 "COS 上传失败，回退到本地存储"

**排查步骤**：
1. 检查COS配置
   ```bash
   cat /opt/ptool/server-version/backend/.env | grep COS
   ```
2. 检查网络连接
   ```bash
   ping cos.ap-beijing.myqcloud.com
   ```
3. 检查COS权限
   - 登录腾讯云控制台
   - 访问管理 -> 用户 -> 用户详情
   - 检查是否有COS写入权限

### 问题2：本地文件未清理

**症状**：磁盘空间持续增长

**排查步骤**：
1. 检查清理脚本是否执行
   ```bash
   ls -lh /var/log/ptool/monitoring/local-files-cleanup.log
   ```
2. 检查定时任务
   ```bash
   crontab -l
   ```
3. 手动执行清理
   ```bash
   /opt/ptool/server-version/scripts/cleanup-local-files.sh
   ```

### 问题3：CDN访问慢

**症状**：视频播放卡顿

**排查步骤**：
1. 检查CDN配置
   - 登录腾讯云控制台
   - CDN -> 域名管理 -> cdn.eduk12.top
   - 检查加速区域和缓存配置
2. 检查CDN流量
   - 查看是否有异常流量
3. 检查源站
   - 确认COS文件存在
   - 确认文件权限正确

---

## 📚 相关文档

- [腾讯云COS文档](https://cloud.tencent.com/document/product/436)
- [腾讯云CDN文档](https://cloud.tencent.com/document/product/228)
- [COS Node.js SDK](https://cloud.tencent.com/document/product/436/8629)

---

**文档版本**：v1.0  
**更新时间**：2026-03-27  
**作者**：系统管理员
