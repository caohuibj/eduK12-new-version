# 问题分析报告

## 问题 1：CPU 占满是否正常？

### 当前系统配置
- **CPU**: AMD EPYC 7K83 64核处理器
- **核心数**: 2个虚拟核心
- **视频处理配置**: 并发处理 2 个视频

### CPU 占用分析

#### ✅ **正常情况**

视频转码时 CPU 占满是**完全正常**的，原因：

1. **FFmpeg 软件编码特性**
   - 使用 libx264 软件编码器
   - 转码是 CPU 密集型操作
   - 每个视频转码进程会占用 80-100% CPU

2. **并发处理配置**
   ```javascript
   // videoProcessorOptimized.ts
   concurrency: 1,  // 同时处理 1 个队列任务
   ```
   但由于队列启动了两个处理器（transcode + download-and-transcode），所以实际并发 2 个

3. **资源利用率**
   - 2核 CPU + 2个并发任务 = 每核 100% 利用率
   - 这是资源的高效利用，不是浪费

#### ⚠️ **潜在问题**

虽然正常，但对于 2核服务器有以下影响：

1. **响应延迟**
   - 其他服务请求可能变慢
   - 数据库查询可能排队

2. **长时间占满**
   - 30-40MB 视频需要 1-2 分钟转码
   - 如果持续有新视频上传，CPU 会持续占满

### 🔧 优化建议

#### 方案 1：降低并发数（推荐）

修改 `/opt/ptool/server-version/backend/src/workers/videoProcessorOptimized.ts`:

```javascript
// 当前配置
concurrency: 1,

// 建议改为（单核服务器）
concurrency: 1,  // 保持不变，但只启动一个处理器
```

或者关闭一个处理器：

```typescript
// 只保留一个处理器，注释掉另一个
videoQueue.process('transcode', 1, async (job) => { ... })
// videoQueue.process('download-and-transcode', 1, async (job) => { ... }) // 注释掉
```

#### 方案 2：使用更快的编码预设

```javascript
// 当前配置
preset: 'faster',  // 平衡速度和质量

// 改为更快速度（降低质量）
preset: 'veryfast',  // 或 'ultrafast'
```

#### 方案 3：限制 CPU 使用

使用 `cpulimit` 或 `nice` 命令：

```bash
# 安装 cpulimit
sudo apt-get install cpulimit

# 限制 FFmpeg 使用 50% CPU
cpulimit -e ffmpeg -l 50
```

#### 方案 4：硬件加速（如果有 GPU）

修改 FFmpeg 使用硬件编码：

```bash
# 使用 NVIDIA GPU 加速（如果有）
-vcodec h264_nvenc

# 使用 Intel GPU 加速（如果有）
-vcodec h264_qsv
```

### 📊 当前状态评估

- ✅ **CPU 占满是正常的**
- ✅ **转码完成自动释放**
- ⚠️ **建议优化并发数**（避免影响其他服务）

---

## 问题 2：COS 为什么没有正常运行？

### 根本原因分析

#### 🔴 **主要原因：环境变量配置错误**

**问题详情：**

系统中有**两个 .env 文件**：

```
/opt/ptool/server-version/.env           # 我们更新的文件
/opt/ptool/server-version/backend/.env   # 实际被加载的文件 ❌
```

**为什么会这样？**

1. **PM2 工作目录**
   - PM2 在 backend 目录启动服务
   - `dotenv.config()` 默认从当前目录加载 .env
   - 所以加载的是 `backend/.env`

2. **错误的密钥配置**
   ```bash
   # backend/.env 中的旧密钥（错误）
   COS_SECRET_ID=AKIDbHl04uoW0Gk7IFyXu3yeAYkiU5TebMvH  ❌
   COS_SECRET_KEY=CAxNdppb9TZTBfvz2rSq0xc5KK6ex2uY    ❌

   # 正确的密钥
   COS_SECRET_ID=AKIDz32xrfMtGQQK7pP2a3Po5aGvTpGXgeR4  ✅
   COS_SECRET_KEY=YG1pXIxcKuRmy0ibO5pS9iO1UrBWluBX     ✅
   ```

#### 🔴 **次要原因：COS SDK 参数问题**

**问题详情：**

```typescript
// 原始代码（错误）
cos.putObject({
  Bucket: config.cosBucket!,
  Region: config.cosRegion!,
  Key: key,
  FilePath: filePath,  // ❌ FilePath 参数不被支持
})
```

**为什么会失败？**

- `FilePath` 是旧版 SDK 的参数
- 新版 SDK 要求使用 `Body` 参数
- `Body` 必须是 Buffer 或 Stream

**修复方案：**

```typescript
// 修复后（正确）
const fileBuffer = fs.readFileSync(filePath)
cos.putObject({
  Bucket: config.cosBucket!,
  Region: config.cosRegion!,
  Key: key,
  Body: fileBuffer,  // ✅ 使用 Buffer
})
```

### 📋 完整的时间线

1. **初始配置**（2026-02-08）
   - 创建 backend/.env 文件
   - 使用错误的 COS 密钥（测试密钥？）

2. **我们更新配置**（2026-02-25 20:55）
   - 更新 `/opt/ptool/server-version/.env`
   - 但没有更新 `backend/.env`
   - PM2 继续使用旧配置

3. **多次重启失败**
   - PM2 提示 "Use --update-env"
   - 但环境变量来自 .env 文件
   - 不是 PM2 的环境变量配置

4. **最终修复**（2026-02-25 21:17）
   - 更新 `backend/.env` 文件
   - 重启 PM2 服务
   - COS 上传成功

### 🎯 教训总结

#### 1. **环境变量管理**

❌ **错误做法**：
- 多个 .env 文件
- 不清楚哪个文件被加载

✅ **正确做法**：
```typescript
// 明确指定 .env 文件路径
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// 或者使用单一配置文件
// 只保留一个 .env 文件在 backend 目录
```

#### 2. **密钥验证**

✅ **建议流程**：
```bash
# 1. 配置后立即测试
node test-cos.js

# 2. 检查实际加载的环境变量
node -e "require('dotenv').config(); console.log(process.env.COS_SECRET_ID)"

# 3. 监控日志
pm2 logs ptool-backend --lines 100
```

#### 3. **PM2 环境变量**

PM2 有两种环境变量来源：
1. `.env` 文件（dotenv 加载）
2. PM2 配置文件（ecosystem.config.js）

推荐使用 PM2 配置文件：

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'ptool-backend',
    script: 'dist/index.js',
    env_file: '.env',  // 明确指定
    env: {
      NODE_ENV: 'production',
      // 其他环境变量
    }
  }]
}
```

---

## 💡 最终建议

### 立即优化

1. **清理重复的 .env 文件**
   ```bash
   # 只保留一个
   rm /opt/ptool/server-version/.env
   # 或
   rm /opt/ptool/server-version/backend/.env
   ```

2. **降低视频处理并发**
   ```typescript
   // videoProcessorOptimized.ts
   concurrency: 1,  // 单核服务器建议设为 1
   preset: 'veryfast',  // 更快的编码速度
   ```

### 长期优化

1. **使用配置管理**
   - 统一环境变量管理
   - 使用 PM2 ecosystem 配置

2. **监控和告警**
   - CPU 使用率监控
   - 视频处理队列监控
   - 错误告警

3. **性能优化**
   - 考虑硬件加速（GPU）
   - 分布式视频处理
   - CDN 加速
