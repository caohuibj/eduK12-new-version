# PTool 代码审查报告

**审查日期**: 2026年2月7日  
**审查范围**: server-version (前后端完整代码)  
**审查人员**: AI Code Reviewer

---

## 一、代码审查摘要

| 风险等级 | 问题数量 | 主要问题类别 |
|---------|---------|-------------|
| 🔴 高 | 6 | XSS漏洞、JWT Secret、权限漏洞、缺少分页、缺少限流 |
| 🟡 中 | 15 | 重复代码、错误处理、N+1查询、事务缺失、大文件处理 |
| 🟢 低 | 9 | 类型定义、代码组织、日志记录 |

---

## 二、高危问题（需立即修复）

### 🔴 1. XSS 漏洞 - dangerouslySetInnerHTML

**文件**: `frontend/src/pages/AssignmentList.tsx`, `CheckinList.tsx`

**问题**: 直接使用 `dangerouslySetInnerHTML` 渲染富文本内容，存在 XSS 攻击风险。

```tsx
// 危险代码
<div 
  dangerouslySetInnerHTML={{ 
    __html: assignment.content || assignment.description || '暂无描述' 
  }}
/>
```

**修复方案**:
```bash
npm install dompurify
npm install -D @types/dompurify
```

```tsx
import DOMPurify from 'dompurify'

<div 
  dangerouslySetInnerHTML={{ 
    __html: DOMPurify.sanitize(assignment.content || '暂无描述') 
  }}
/>
```

---

### 🔴 2. 默认 JWT Secret 安全风险

**文件**: `backend/src/config/index.ts`

**问题**: 生产环境使用默认 JWT Secret，存在严重安全隐患。

```typescript
jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
```

**修复方案**:
```typescript
export const config = {
  // ...
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' 
    ? (() => { throw new Error('JWT_SECRET must be set in production') })()
    : 'development-secret-only'),
  // ...
}
```

---

### 🔴 3. extendAccount 接口缺少管理员权限检查

**文件**: `backend/src/controllers/authController.ts`

**问题**: 账号延期接口没有验证调用者是否是管理员。

**修复方案**:
```typescript
// 在路由层添加权限检查
router.post('/extend-account', authenticate, requireAdmin, authController.extendAccount)
```

---

### 🔴 4. 列表接口缺少分页

**文件**: `backend/src/controllers/userController.ts`, `courseController.ts` 等

**问题**: 所有列表接口返回全部数据，数据量大时会导致内存溢出和响应缓慢。

**修复方案**:
```typescript
// 统一分页处理
const page = Math.max(1, parseInt(req.query.page as string) || 1)
const pageSize = Math.min(100, parseInt(req.query.pageSize as string) || 20)

const [items, total] = await Promise.all([
  prisma.model.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: 'desc' }
  }),
  prisma.model.count({ where })
])

return success(res, { items, total, page, pageSize })
```

---

### 🔴 5. 缺少请求限流

**文件**: `backend/src/routes/auth.ts`

**问题**: 登录接口没有频率限制，容易受到暴力破解攻击。

**修复方案**:
```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 最多5次
  message: { code: -1, message: '登录尝试次数过多，请稍后再试' }
})

router.post('/login', loginLimiter, authController.login)
```

---

### 🔴 6. N+1 查询问题

**文件**: `frontend/src/pages/StudentManagement.tsx`

**问题**: 对每个课程分别请求学生列表，产生 N+1 查询问题。

**修复方案**: 后端提供批量获取接口
```typescript
// 新增接口 GET /courses/students/batch
async batchStudents(req: Request, res: Response) {
  const courseIds = req.query.courseIds?.toString().split(',') || []
  const students = await prisma.courseStudent.findMany({
    where: { courseId: { in: courseIds } },
    include: { student: true, course: true }
  })
  // 按课程分组返回
}
```

---

## 三、中危问题（建议修复）

### 🟡 7. 前端错误处理导致数据丢失

**文件**: `frontend/src/api/client.ts`

**问题**: 401 错误强制刷新页面，可能导致用户未保存的数据丢失。

**修复方案**:
```typescript
if (error.response?.status === 401) {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  // 使用事件通知而不是强制跳转
  window.dispatchEvent(new CustomEvent('auth:expired'))
}
```

---

### 🟡 8. 硬编码密码

**文件**: `backend/src/controllers/courseController.ts`

**问题**: 重置学生密码使用硬编码值。

```typescript
const hashedPassword = await hashPassword('12345678')
```

**修复方案**: 生成随机临时密码，要求首次登录修改。

---

### 🟡 9. 批量操作未使用事务

**文件**: `backend/src/controllers/assignmentController.ts`

**问题**: 批量批改作业没有事务保护，可能导致数据不一致。

**修复方案**:
```typescript
await prisma.$transaction(
  submissions.map(sub => 
    prisma.submission.update({ where: { id: sub.id }, data: { ... } })
  )
)
```

---

### 🟡 10. 文件上传缺少严格验证

**文件**: `backend/src/routes/videos.ts`

**问题**: 仅通过 MIME 类型验证，可能被伪装文件类型攻击。

**修复方案**: 添加文件魔数检查。

---

### 🟡 11-15. 其他中危问题

- 重复代码（类型定义、权限检查）
- 类型定义不一致（使用 any）
- 内存泄漏风险（URL.createObjectURL 未清理）
- 课程结束和学生状态更新非原子操作
- 缺少缓存机制

---

## 四、低危问题（可选优化）

### 🟢 16-24. 代码组织与最佳实践

- Zod Schema 类型推断未使用
- 控制器职责过重（courseController 1065 行）
- 缺少服务层抽象
- 环境变量缺少验证
- 缺少结构化日志
- 事件监听器未清理
- 并行请求未使用 Promise.all

---

## 五、测试相关

### 当前状态
- ❌ 没有单元测试
- ❌ 没有集成测试
- ❌ 没有 E2E 测试
- ❌ 没有 API 文档

### 建议
1. 使用 Jest 添加后端单元测试
2. 使用 Vitest 添加前端组件测试
3. 使用 Playwright 添加 E2E 测试
4. 使用 Swagger/OpenAPI 生成 API 文档

---

## 六、功能优化建议

### 1. 性能优化
- 添加 Redis 缓存层
- 实现数据库查询优化
- 图片/视频使用 CDN
- 启用 gzip 压缩

### 2. 安全增强
- 添加 CSRF 保护
- 实现请求签名
- 添加操作日志审计
- 敏感数据加密存储

### 3. 用户体验
- 添加加载状态
- 实现乐观更新
- 添加离线支持
- 响应式图片处理

---

## 七、修复优先级

### 立即修复（本周内）
1. XSS 漏洞修复
2. JWT Secret 强制环境变量
3. extendAccount 权限检查
4. 登录接口限流

### 短期修复（本月内）
5. 所有列表接口添加分页
6. N+1 查询优化
7. 批量操作添加事务
8. 前端错误处理优化

### 长期优化（下季度）
9. 添加测试覆盖
10. 代码重构（服务层）
11. 添加缓存层
12. 完善日志系统

---

*报告生成时间: 2026-02-07*
