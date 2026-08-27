# 系统性能分析与优化建议报告

> 生成日期: 2026-03-25
> 分析范围: 前端加载、后端API、数据库查询

---

## 一、问题诊断

### 1.1 发现的问题

#### 问题1：后端 Prisma 查询错误（严重）

**现象**: PM2 日志显示持续的错误：

```
PrismaClientValidationError: Invalid `prisma.scale.findMany()` invocation
Unknown argument `courseId`. Available options are marked with ?.
```

**原因**: 历史代码中使用了 `courseId` 字段进行查询，但 Scale 模型中没有这个直接字段（应使用 `courseScales` 关联表）。

**影响**: 
- 导致量表列表接口持续失败
- 服务多次重启（PM2 显示重启次数：13次）
- 可能是登录后加载慢的主要原因

**状态**: 当前源代码已修复，但需要确认部署版本是否最新。

---

#### 问题2：前端资源过大（中等）

**数据**:
| 资源 | 大小 | 加载时间 |
|------|------|----------|
| index.js | 1.0 MB | ~1.1s |
| index.css | 38 KB | - |

**影响**: 
- 首次加载耗时较长
- 移动端体验可能受影响

---

#### 问题3：N+1 查询问题（中等）

**位置**: `scaleController.ts` - `available` 函数

```typescript
// 第503-511行：对每个量表单独查询测评状态
const scalesWithStatus = await Promise.all(
  scales.map(async (scale) => {
    const assessment = await prisma.assessment.findFirst({
      where: { scaleId: scale.id, userId, status: 'COMPLETED' }
    })
    // ...
  })
)
```

**影响**: 
- 如果有 N 个量表，会产生 N 次额外数据库查询
- 用户量表越多，响应越慢

---

#### 问题4：登录限流配置（低）

**当前配置**:
```typescript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 最多5次
})
```

**影响**: 
- 用户多次登录失败后需要等待15分钟
- 可能导致"登录不成功"的反馈

---

### 1.2 系统状态

| 指标 | 当前值 | 状态 |
|------|--------|------|
| API 健康检查 TTFB | 82ms | 正常 |
| 内存使用 | 2.0G / 3.6G (56%) | 正常 |
| 磁盘空间 | 24G / 59G (42%) | 正常 |
| 数据库连接池 | 10 | 正常 |
| PM2 重启次数 | 13次 | 需关注 |

---

## 二、优化建议

### 2.1 紧急修复（优先级：高）

#### 修复1：确认部署最新代码

```bash
# 重新构建并部署后端
cd /opt/ptool/server-version/backend
npm run build
pm2 restart ptool-backend

# 清除 PM2 日志
pm2 flush
```

#### 修复2：添加数据库索引

```sql
-- 为常用查询添加索引
CREATE INDEX IF NOT EXISTS idx_assessment_user_scale 
ON assessments(user_id, scale_id, status);

CREATE INDEX IF NOT EXISTS idx_course_student_user 
ON course_students(student_id, status);

CREATE INDEX IF NOT EXISTS idx_scale_status_visibility 
ON scales(status, visibility);
```

---

### 2.2 数据库查询优化（优先级：高）

#### 优化1：消除 N+1 查询

**修改位置**: `scaleController.ts` - `available` 函数

**优化前**:
```typescript
const scales = await prisma.scale.findMany({ where, ... })

const scalesWithStatus = await Promise.all(
  scales.map(async (scale) => {
    const assessment = await prisma.assessment.findFirst(...)
    return { ...scale, completed: !!assessment }
  })
)
```

**优化后**:
```typescript
// 一次性查询所有已完成的测评
const completedAssessments = await prisma.assessment.findMany({
  where: {
    userId,
    status: 'COMPLETED',
    scaleId: { in: scales.map(s => s.id) }
  },
  select: { scaleId: true }
})
const completedScaleIds = new Set(completedAssessments.map(a => a.scaleId))

const scalesWithStatus = scales.map(scale => ({
  ...scale,
  completed: completedScaleIds.has(scale.id)
}))
```

**预期效果**: 
- 查询次数从 N+2 次减少到 3 次
- 响应时间预计减少 50%+

---

#### 优化2：合并关联查询

**修改位置**: `scaleController.ts` - `available` 函数

```typescript
// 使用单个查询获取学生课程和量表
const [courseStudents, scales] = await Promise.all([
  prisma.courseStudent.findMany({
    where: { studentId: userId, status: { in: ['ACTIVE', 'APPROVED'] } },
    select: { courseId: true }
  }),
  prisma.scale.findMany({
    where: { status: 'PUBLISHED', visibility: 'PUBLIC' },
    // ... 基础量表
  })
])
```

---

### 2.3 前端资源优化（优先级：中）

#### 优化1：代码分割

**修改位置**: `vite.config.ts`

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['lucide-react'],
          'vendor-utils': ['axios', 'date-fns'],
        }
      }
    },
    chunkSizeWarningLimit: 500,
  }
})
```

**预期效果**: 
- 主包体积减少 30-40%
- 首屏加载更快（按需加载）

---

#### 优化2：开启 Gzip 压缩

**修改位置**: Nginx 配置

```nginx
# /etc/nginx/nginx.conf
http {
  gzip on;
  gzip_vary on;
  gzip_min_length 1024;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
  gzip_comp_level 6;
}
```

**预期效果**: 
- JS 文件压缩后约 300KB（减少 70%）
- CSS 文件压缩后约 10KB（减少 75%）

---

#### 优化3：添加浏览器缓存

**修改位置**: Nginx 配置

```nginx
location /assets/ {
  expires 1y;
  add_header Cache-Control "public, immutable";
}
```

---

### 2.4 后端性能优化（优先级：中）

#### 优化1：添加 API 响应缓存

**修改位置**: 创建缓存中间件

```typescript
// middleware/cache.ts
import NodeCache from 'node-cache'

const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 })

export const cacheMiddleware = (key: string) => (req, res, next) => {
  const cacheKey = `${key}:${req.user?.userId}:${JSON.stringify(req.query)}`
  const cached = cache.get(cacheKey)
  
  if (cached) {
    return res.json(cached)
  }
  
  res.originalJson = res.json
  res.json = (data) => {
    cache.set(cacheKey, data)
    return res.originalJson(data)
  }
  
  next()
}
```

**使用场景**:
- 量表列表（缓存 1 分钟）
- 课程列表（缓存 2 分钟）
- 用户信息（缓存 5 分钟）

---

#### 优化2：数据库连接池调优

**修改位置**: `.env`

```bash
# 根据 2C4G 服务器配置优化
PRISMA_CONNECTION_POOL_SIZE=5  # 从 10 减少到 5
DATABASE_URL="${DATABASE_URL:?set DATABASE_URL in the protected environment}"
```

**说明**: 
- 较小的连接池减少内存占用
- 避免连接争用

---

#### 优化3：添加请求超时

**修改位置**: `index.ts`

```typescript
app.use((req, res, next) => {
  req.setTimeout(30000) // 30秒超时
  res.setTimeout(30000)
  next()
})
```

---

### 2.5 监控与告警（优先级：低）

#### 建议1：添加性能监控

```typescript
// 添加请求耗时日志
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    if (duration > 1000) {
      logger.warn('慢请求', { 
        method: req.method, 
        url: req.url, 
        duration: `${duration}ms` 
      })
    }
  })
  next()
})
```

---

## 三、优化优先级排序

| 优先级 | 优化项 | 预期效果 | 工作量 |
|--------|--------|----------|--------|
| P0 | 修复 Prisma 查询错误 | 解决服务不稳定 | 低 |
| P0 | 消除 N+1 查询 | 响应时间减少 50% | 中 |
| P1 | 添加数据库索引 | 查询效率提升 | 低 |
| P1 | 开启 Nginx Gzip | 传输体积减少 70% | 低 |
| P1 | 前端代码分割 | 首屏加载加快 | 中 |
| P2 | API 响应缓存 | 减少数据库压力 | 中 |
| P2 | 调整连接池配置 | 资源利用优化 | 低 |
| P3 | 添加性能监控 | 问题定位能力 | 中 |

---

## 四、立即可执行的操作

### 4.1 重启服务并清除日志

```bash
# 重启后端服务
pm2 restart ptool-backend
pm2 flush

# 检查服务状态
pm2 logs ptool-backend --lines 20
```

### 4.2 检查 Nginx Gzip 是否已开启

```bash
# 检查当前配置
grep -r "gzip" /etc/nginx/

# 如果未开启，添加配置
sudo nano /etc/nginx/nginx.conf
# 在 http 块中添加 gzip 配置

# 重载 Nginx
sudo nginx -t && sudo nginx -s reload
```

### 4.3 添加数据库索引

```bash
PGPASSWORD="${DB_PASSWORD:?set DB_PASSWORD in the protected environment}" psql -U ptool -d ptool -h localhost << 'EOF'
CREATE INDEX IF NOT EXISTS idx_assessment_user_scale ON assessments(user_id, scale_id, status);
CREATE INDEX IF NOT EXISTS idx_course_student_user ON course_students(student_id, status);
CREATE INDEX IF NOT EXISTS idx_scale_status_visibility ON scales(status, visibility);
EOF
```

---

## 五、总结

### 主要问题

1. **Prisma 查询错误**：历史代码导致服务不稳定，需立即修复
2. **N+1 查询**：影响量表列表加载性能
3. **前端资源大**：1MB JS 文件需优化

### 预期优化效果

| 指标 | 当前 | 优化后 |
|------|------|--------|
| 量表列表加载 | ~500ms | ~100ms |
| 前端首次加载 | ~1.5s | ~0.5s |
| 服务稳定性 | 偶发错误 | 稳定运行 |

---

**下一步**：请确认是否需要执行上述优化建议。如需执行，请告知优先级顺序。
