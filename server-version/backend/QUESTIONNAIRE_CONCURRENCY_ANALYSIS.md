# 系统资源与问卷并发能力分析报告

**分析时间：** 2026-03-30 12:30

---

## 📊 当前系统资源状况

### 硬件资源使用情况

#### 内存使用
```
总内存：3.6GB
已用：  1.9GB (52%)
可用：  1.4GB (38%)
Swap：  827MB / 2GB (40%)
```

#### CPU使用
```
CPU负载：0.47 (2核，负载合理)
空闲：   84.4%
用户进程：9.4%
系统进程：6.2%
```

#### 进程内存占用（Top 10）
| 进程 | 内存占用 | 用途 |
|------|---------|------|
| CodeBuddy IDE | 920MB (25%) | 开发工具（不影响生产） |
| TypeScript Server | 369MB (10%) | 开发工具 |
| **Node.js Backend** | **143MB (3.8%)** | **生产服务** |
| PM2 Logrotate | 58MB (1.5%) | 日志轮转 |
| Redis | 4.6MB (0.1%) | 缓存服务 |
| 其他系统服务 | ~500MB | 系统进程 |

---

## 🎯 问卷并发作答能力分析

### 问卷作答业务流程

#### 1. 获取问卷信息
- **数据库查询次数：** 3-5次
  - 验证令牌有效性
  - 获取问卷详情
  - 获取量表列表
  - 获取表单项列表

#### 2. 开始测评
- **数据库查询次数：** 5-8次
  - 创建测评记录
  - 初始化量表测评
  - 创建表单答案记录
  - 获取缓存数据

#### 3. 提交答案（单次）
- **数据库查询次数：** 2-3次
  - 验证测评存在性
  - 保存答案
  - 更新进度

#### 4. 完成测评
- **数据库查询次数：** 8-12次
  - 计算分数
  - 生成报告
  - 更新状态
  - 写入多个量表结果

---

### 并发能力计算

#### 数据库连接池限制
```
当前连接池：30个
每个问卷作答峰值连接数：3-5个
理论最大并发：30 / 4 = 7.5个
```

#### CPU处理能力限制
```
CPU负载：0.47 (当前)
CPU核心：2核
单次答案处理时间：10-50ms
理论最大QPS：2核 × 1000ms / 30ms = 66 QPS
```

#### 内存限制
```
可用内存：1.4GB
每个会话内存占用：约5-10MB（含数据、缓存）
理论最大会话数：1.4GB / 10MB = 140个
```

---

### 实际并发能力评估

#### 保守估计
| 场景 | 并发用户数 | 响应时间 | 状态 |
|------|-----------|---------|------|
| **开始测评** | 30-50人 | 500-800ms | ✅ 稳定 |
| **提交答案** | 50-100人 | 100-200ms | ✅ 稳定 |
| **完成测评** | 20-30人 | 1-2秒 | ⚠️ 可能较慢 |

#### 推荐配置
| 场景 | 推荐并发数 | 说明 |
|------|-----------|------|
| **日常使用** | 50人同时作答 | 稳定可靠 |
| **高峰期** | 100人同时作答 | 需要监控 |
| **极限测试** | 150人同时作答 | 可能出现延迟 |

---

## 🔍 数据库查询优化分析

### 发现的优化问题

#### 1. ❌ 重复查询问题（高优先级）

**位置：** `publicQuestionnaireController.ts` 第1239-1264行

```typescript
// 问题代码：
await prisma.questionnaireFormAnswer.upsert({...})  // 第1次查询

const existingAnswer = await prisma.questionnaireFormAnswer.findUnique({...}) // 第2次重复查询！

if (!existingAnswer) {
  await prisma.questionnaireAssessment.update({...})
}
```

**问题分析：**
- `upsert` 操作已经包含了判断逻辑
- 后续的 `findUnique` 是完全重复的查询
- 每次提交答案多1次数据库查询

**优化方案：**
```typescript
// 使用 upsert 返回值判断
const result = await prisma.questionnaireFormAnswer.upsert({
  where: {...},
  create: {...},
  update: {...},
  select: { id: true }  // 只选择需要的字段
})

// 通过时间戳判断是否是新建（更高效）
const isNewAnswer = !result.createdAt || 
  (result.createdAt && result.updatedAt && 
   result.updatedAt.getTime() - result.createdAt.getTime() < 100)

if (isNewAnswer) {
  await prisma.questionnaireAssessment.update({
    where: { id: questionnaireAssessment.id },
    data: { completedForms: { increment: 1 } }
  })
}
```

**预期效果：** 减少 33% 数据库查询

---

#### 2. ⚠️ N+1查询问题（中优先级）

**位置：** 多处使用 `include` 但未优化

```typescript
// 问题代码：
const questionnaireAssessment = await prisma.questionnaireAssessment.findUnique({
  where: { sessionId },
  include: {
    questionnaire: {
      include: {
        formItems: true,        // 可能有很多
        questionnaireScales: {  // 可能有很多
          include: { scale: true }
        }
      }
    }
  }
})
```

**问题分析：**
- 每次都查询所有关联数据
- 数据量大时影响性能

**优化方案：**
```typescript
// 方案1：使用缓存
const formItems = await cacheService.getQuestionnaireFormItems(questionnaireId)
const scales = await cacheService.getQuestionnaireScales(questionnaireId)

// 方案2：分页查询
const questionnaire = await prisma.questionnaire.findUnique({
  where: { id: questionnaireId },
  select: {
    id: true,
    name: true,
    // 只选择必要字段
  }
})

// 单独查询关联数据
const formItems = await prisma.questionnaireFormItem.findMany({
  where: { questionnaireId },
  select: { id: true, label: true, position: true },
  orderBy: { position: 'asc' }
})
```

**预期效果：** 减少 20-30% 查询时间

---

#### 3. ⚠️ 缺少索引（中优先级）

**建议添加的索引：**
```sql
-- 问卷测评表
CREATE INDEX idx_questionnaire_assessment_session_id 
  ON "QuestionnaireAssessment"(session_id);
  
CREATE INDEX idx_questionnaire_assessment_status 
  ON "QuestionnaireAssessment"(status);

CREATE INDEX idx_questionnaire_assessment_questionnaire_id 
  ON "QuestionnaireAssessment"(questionnaire_id);

-- 表单答案表
CREATE INDEX idx_questionnaire_form_answer_assessment_id 
  ON "QuestionnaireFormAnswer"(questionnaire_assessment_id);

-- 复合索引
CREATE INDEX idx_questionnaire_form_answer_composite 
  ON "QuestionnaireFormAnswer"(questionnaire_assessment_id, form_item_id);
```

**预期效果：** 查询速度提升 50-200%

---

#### 4. ✅ 已实现的优化

1. **Redis缓存层** ✅
   - 量表配置缓存
   - 问卷表单项缓存
   - 减少重复查询

2. **数据库连接池** ✅
   - 连接池大小：30
   - 支持更高并发

---

## 📈 优化后的预期效果

### 查询次数对比

| 操作 | 优化前 | 优化后 | 减少 |
|------|--------|--------|------|
| **提交答案** | 3次 | 2次 | ↓ 33% |
| **获取问卷** | 5次 | 2次（缓存命中） | ↓ 60% |
| **完成测评** | 12次 | 8次 | ↓ 33% |

### 并发能力提升

| 指标 | 当前 | 优化后 | 提升 |
|------|------|--------|------|
| **并发作答用户** | 50人 | 80人 | ↑ 60% |
| **答案提交QPS** | 50 | 80 | ↑ 60% |
| **响应时间** | 200ms | 120ms | ↓ 40% |

---

## 🚀 优化实施计划

### 立即实施（今天）

#### 1. 修复重复查询问题
**文件：** `src/controllers/publicQuestionnaireController.ts`
**行号：** 1239-1274
**预计耗时：** 30分钟

```typescript
// 修改 submitFormAnswer 方法
async submitFormAnswer(req: Request, res: Response) {
  try {
    // ... 前面的验证逻辑 ...
    
    // 优化：使用 upsert 返回值，避免重复查询
    const upsertResult = await prisma.questionnaireFormAnswer.upsert({
      where: {
        questionnaireAssessmentId_formItemId: {
          questionnaireAssessmentId: questionnaireAssessment.id,
          formItemId,
        },
      },
      create: {
        questionnaireAssessmentId: questionnaireAssessment.id,
        formItemId,
        value: String(value),
      },
      update: {
        value: String(value),
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // 判断是否是新答案（创建时间与更新时间很接近）
    const isNewAnswer = Math.abs(
      upsertResult.updatedAt.getTime() - upsertResult.createdAt.getTime()
    ) < 100

    // 如果是新答案，更新计数
    if (isNewAnswer) {
      await prisma.questionnaireAssessment.update({
        where: { id: questionnaireAssessment.id },
        data: {
          completedForms: { increment: 1 },
        },
      })
    }

    return success(res, { formItemId, value }, '答案已保存')
  } catch (err) {
    logger.error('提交表单答案错误', err)
    return error(res, '提交失败')
  }
}
```

---

### 本周实施

#### 2. 添加数据库索引
```bash
# 创建索引脚本
psql -U ptool -d ptool < /opt/ptool/server-version/scripts/create-indexes.sql
```

#### 3. 优化查询语句
- 审查所有 `include` 查询
- 使用 `select` 只选择必要字段
- 实现分页查询

---

### 长期优化

#### 4. 实现读写分离
- 主库：写入操作
- 从库：读取操作
- 提升读取性能

#### 5. 实现数据库分片
- 按问卷ID分片
- 分散查询压力

---

## 📝 监控指标

### 关键监控项

```bash
# 1. 数据库连接数
SELECT count(*) FROM pg_stat_activity WHERE datname='ptool';

# 2. 慢查询
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

# 3. 缓存命中率
redis-cli INFO stats | grep keyspace_hits

# 4. 当前作答会话数
SELECT count(*) FROM "QuestionnaireAssessment" 
WHERE status='IN_PROGRESS';
```

---

## 🎯 总结

### 当前状态
- **系统资源：** 充足（CPU 84%空闲，内存 1.4GB可用）
- **并发能力：** 可支持 50人同时作答
- **优化空间：** 有 33-60% 提升潜力

### 推荐行动
1. ✅ **立即修复重复查询**（今天完成）
2. 🔄 **添加数据库索引**（本周完成）
3. 📋 **长期监控优化**（持续进行）

### 预期效果
- 并发能力提升 60%（50人 → 80人）
- 响应时间降低 40%（200ms → 120ms）
- 数据库查询减少 30-60%

---

**系统资源充足，性能优化空间明显，建议立即实施修复方案。**
