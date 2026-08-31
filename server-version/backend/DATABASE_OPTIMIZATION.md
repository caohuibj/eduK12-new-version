# 数据库查询优化方案

## 📋 已完成的优化

### 1. ✅ 增加数据库连接池
- backend 启动时会把连接池配置实际注入 Prisma datasource
- 默认连接池：10；默认等待超时：30 秒
- 已写在 `DATABASE_URL` 中的参数优先于环境变量
- 配置参数：
  ```env
  DATABASE_URL="postgresql://...?schema=public"
  PRISMA_CONNECTION_POOL_SIZE=10
  PRISMA_POOL_TIMEOUT=30
  ```

---

## 🎯 建议的优化方案

### 1. 添加数据库索引

#### **高频查询字段索引**
```sql
-- 用户表
CREATE INDEX IF NOT EXISTS idx_user_username ON "User"(username);
CREATE INDEX IF NOT EXISTS idx_user_role ON "User"(role);

-- 课程表
CREATE INDEX IF NOT EXISTS idx_course_teacher_id ON "Course"(teacher_id);
CREATE INDEX IF NOT EXISTS idx_course_status ON "Course"(status);

-- 作业表
CREATE INDEX IF NOT EXISTS idx_assignment_course_id ON "Assignment"(course_id);
CREATE INDEX IF NOT EXISTS idx_assignment_due_date ON "Assignment"(due_date);

-- 签到表
CREATE INDEX IF NOT EXISTS idx_checkin_course_id ON "Checkin"(course_id);
CREATE INDEX IF NOT EXISTS idx_checkin_student_id ON "Checkin"(student_id);
CREATE INDEX IF NOT EXISTS idx_checkin_created_at ON "Checkin"(created_at);

-- 视频表
CREATE INDEX IF NOT EXISTS idx_video_course_id ON "Video"(course_id);
CREATE INDEX IF NOT EXISTS idx_video_status ON "Video"(status);

-- 课堂互动
CREATE INDEX IF NOT EXISTS idx_classroom_teacher_id ON "Classroom"(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classroom_status ON "Classroom"(status);
CREATE INDEX IF NOT EXISTS idx_classroom_question_classroom_id ON "ClassroomQuestion"(classroom_id);

-- 问卷
CREATE INDEX IF NOT EXISTS idx_questionnaire_status ON "Questionnaire"(status);
CREATE INDEX IF NOT EXISTS idx_questionnaire_visibility ON "Questionnaire"(visibility);

-- 测评
CREATE INDEX IF NOT EXISTS idx_assessment_user_id ON "Assessment"(user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_scale_id ON "Assessment"(scale_id);
CREATE INDEX IF NOT EXISTS idx_assessment_status ON "Assessment"(status);
```

#### **复合索引（优化多字段查询）**
```sql
-- 课程+状态查询
CREATE INDEX IF NOT EXISTS idx_course_teacher_status ON "Course"(teacher_id, status);

-- 签到+时间查询
CREATE INDEX IF NOT EXISTS idx_checkin_course_date ON "Checkin"(course_id, created_at);

-- 课堂+状态查询
CREATE INDEX IF NOT EXISTS idx_classroom_teacher_status ON "Classroom"(teacher_id, status);
```

---

### 2. 优化查询语句

#### **使用 Prisma 的最佳实践**

##### ❌ 避免的做法
```typescript
// 1. N+1 查询问题
const courses = await prisma.course.findMany()
for (const course of courses) {
  const assignments = await prisma.assignment.findMany({
    where: { courseId: course.id }
  })
}

// 2. 查询所有字段
const users = await prisma.user.findMany()

// 3. 不使用分页
const allCourses = await prisma.course.findMany()
```

##### ✅ 推荐的做法
```typescript
// 1. 使用 include 避免 N+1
const courses = await prisma.course.findMany({
  include: {
    assignments: true,
    teacher: {
      select: { id: true, name: true, username: true }
    }
  }
})

// 2. 只选择需要的字段
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    username: true,
    role: true
  }
})

// 3. 使用分页
const courses = await prisma.course.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { createdAt: 'desc' }
})
```

---

### 3. 添加查询超时

Prisma 的 `connection_limit` 和 `pool_timeout` 是 datasource URL 参数，
由 `src/config/databasePool.ts` 在运行时补齐；不要把它们写成
`schema.prisma` datasource 的字段。生产部署可在 `DATABASE_URL` 中显式
指定值，或通过 `PRISMA_CONNECTION_POOL_SIZE` / `PRISMA_POOL_TIMEOUT`
统一配置。

---

### 4. 数据库监控

#### **添加慢查询日志**
在 PostgreSQL 配置中：
```sql
-- 记录执行时间超过 500ms 的查询
ALTER SYSTEM SET log_min_duration_statement = 500;

-- 重启 PostgreSQL 生效
-- sudo systemctl restart postgresql
```

#### **创建监控视图**
```sql
-- 查看当前活跃连接
SELECT 
  pid,
  usename,
  application_name,
  state,
  query_start,
  query
FROM pg_stat_activity
WHERE state = 'active';

-- 查看表大小
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- 查看索引使用情况
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC
LIMIT 20;
```

---

### 5. 定期维护任务

#### **创建维护脚本**
```bash
#!/bin/bash
# 数据库维护脚本 - 每周执行

# 1. 分析统计信息
psql -U ptool -d ptool -c "ANALYZE;"

# 2. 清理死元组（Vacuum）
psql -U ptool -d ptool -c "VACUUM ANALYZE;"

# 3. 重建索引（谨慎使用，会锁表）
# psql -U ptool -d ptool -c "REINDEX DATABASE ptool;"

# 4. 检查磁盘空间
df -h /var/lib/postgresql

echo "数据库维护完成: $(date)"
```

添加到 crontab：
```bash
# 每周日凌晨3点执行数据库维护
0 3 * * 0 /opt/ptool/server-version/scripts/db-maintenance.sh >> /var/log/ptool/db-maintenance.log 2>&1
```

---

## 📊 优化效果预估

| 优化项 | 预期提升 | 实施难度 |
|--------|---------|---------|
| **添加索引** | 查询速度 +50-200% | 低 |
| **优化查询语句** | 减少数据库负载 30% | 中 |
| **查询超时** | 避免慢查询阻塞 | 低 |
| **定期维护** | 保持性能稳定 | 低 |
| **监控告警** | 及时发现问题 | 中 |

---

## 🚀 实施步骤

### 第一步：添加索引（立即执行）
```bash
# 连接数据库
psql -U ptool -d ptool

# 执行索引创建脚本
\i /opt/ptool/server-version/scripts/create-indexes.sql
```

### 第二步：优化查询语句（逐步进行）
- 识别慢查询（查看日志）
- 逐个优化高频查询
- 添加缓存（已实现Redis）

### 第三步：添加监控（1-2天）
- 配置慢查询日志
- 创建监控脚本
- 设置告警

### 第四步：定期维护（长期）
- 每周执行 VACUUM
- 监控表大小和索引使用率
- 调整索引策略

---

## 📝 注意事项

1. **索引不是越多越好**
   - 每个索引会增加写入开销
   - 占用额外存储空间
   - 建议只为高频查询字段添加索引

2. **避免过度优化**
   - 先监控，找到真正的瓶颈
   - 优化最慢的20%查询（80/20法则）

3. **测试环境验证**
   - 在测试环境先验证优化效果
   - 确认不会影响现有功能

4. **备份数据库**
   - 优化前先备份数据库
   - 准备回滚方案

---

**优化完成后，预期数据库查询性能提升 50-200%。**
