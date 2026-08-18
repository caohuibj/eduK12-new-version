# 心理测评报告配置功能 - 规格文档

> 版本: v2.0 | 日期: 2026-03-25

---

## 一、功能概述

为教师端提供心理测评报告的自定义配置功能，支持：
- 为每个维度自定义任意数量的等级区间（名称、分数范围）
- 为每个等级自定义解读文本和建议内容
- 支持求和/平均两种计分方式
- 预览报告效果

---

## 二、数据模型设计

### 2.1 扩展 Dimension 模型

**文件**: `backend/prisma/schema.prisma`

```prisma
model Dimension {
  id            String  @id @default(uuid())
  scaleId       String  @map("scale_id")
  code          String
  name          String
  description   String?
  scoringMethod String  @default("sum") @map("scoring_method")  // sum | average
  weight        Decimal @default(1.0)
  
  // 新增：等级配置与反馈模板
  levelFeedback Json?   @map("level_feedback")
  
  scale          Scale           @relation(fields: [scaleId], references: [id], onDelete: Cascade)
  itemDimensions ItemDimension[]

  @@map("dimensions")
}
```

### 2.2 levelFeedback 字段结构

```json
{
  "levels": [
    {
      "name": "优秀",
      "min": 45,
      "max": 50,
      "interpretation": "您在{{dimensionName}}方面表现优秀...",
      "suggestions": ["继续保持", "发挥优势"]
    },
    {
      "name": "良好",
      "min": 35,
      "max": 44,
      "interpretation": "您在{{dimensionName}}方面表现良好...",
      "suggestions": ["持续提升"]
    },
    {
      "name": "中等",
      "min": 25,
      "max": 34,
      "interpretation": "您在{{dimensionName}}方面处于中等水平...",
      "suggestions": ["加强练习"]
    },
    {
      "name": "待提升",
      "min": 10,
      "max": 24,
      "interpretation": "您在{{dimensionName}}方面有待提升...",
      "suggestions": ["制定提升计划"]
    }
  ]
}
```

### 2.3 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| levels | Array | 等级配置数组，数量不限 |
| levels[].name | string | 等级名称（如"优秀"、"良好"） |
| levels[].min | number | 分数下限（包含） |
| levels[].max | number | 分数上限（包含） |
| levels[].interpretation | string | 该等级的解读文本 |
| levels[].suggestions | string[] | 该等级的建议列表 |

---

## 三、API 设计

### 3.1 获取维度反馈配置

```http
GET /api/scales/:scaleId/dimensions/:dimensionId/feedback

Response:
{
  "code": 0,
  "data": {
    "dimensionId": "xxx",
    "dimensionName": "外向性",
    "scoringMethod": "average",
    "itemCount": 10,
    "scoreRange": { "min": 10, "max": 50 },
    "levelFeedback": {
      "levels": [...]
    }
  }
}
```

### 3.2 更新维度反馈配置

```http
PUT /api/scales/:scaleId/dimensions/:dimensionId/feedback
{
  "levelFeedback": {
    "levels": [
      {
        "name": "优秀",
        "min": 45,
        "max": 50,
        "interpretation": "...",
        "suggestions": [...]
      }
    ]
  }
}
```

---

## 四、开发任务清单

### Task 1: 数据库模型更新

**目标**: 扩展 Dimension 模型，添加反馈配置字段

| 步骤 | 操作 |
|------|------|
| 1.1 | 修改 Prisma Schema，添加 `levelFeedback` 字段 |
| 1.2 | 执行数据库迁移 |

**检验标准**:
- [ ] Prisma Schema 语法正确
- [ ] `npx prisma migrate dev` 执行成功
- [ ] 数据库表 `dimensions` 包含 `level_feedback` 字段

---

### Task 2: 后端 API - 维度反馈配置

**目标**: 实现维度反馈配置的 CRUD 接口

| 步骤 | 操作 |
|------|------|
| 2.1 | 添加获取维度反馈配置接口 |
| 2.2 | 添加更新维度反馈配置接口 |
| 2.3 | 添加路由配置 |

**检验标准**:
- [ ] GET 接口返回正确的维度反馈配置
- [ ] PUT 接口能正确更新配置
- [ ] 验证分数区间不重叠
- [ ] 验证必填字段

---

### Task 3: 后端服务 - 报告生成改进

**目标**: 修改 `scoringService.ts`，使用自定义等级配置生成反馈

| 步骤 | 操作 |
|------|------|
| 3.1 | 添加 `findLevelByScore` 函数 |
| 3.2 | 修改 `generateFeedback` 使用等级配置 |

**核心代码**:

```typescript
// 根据分数查找对应等级
function findLevelByScore(
  score: number,
  levelFeedback?: LevelFeedback
): { name: string; interpretation: string; suggestions: string[] } | null {
  if (!levelFeedback?.levels) return null
  
  for (const level of levelFeedback.levels) {
    if (score >= level.min && score <= level.max) {
      return {
        name: level.name,
        interpretation: level.interpretation,
        suggestions: level.suggestions
      }
    }
  }
  
  return null
}
```

**检验标准**:
- [ ] 分数正确匹配等级
- [ ] 无配置时返回默认反馈
- [ ] 占位符正确替换

---

### Task 4: 前端 - 反馈配置 Tab

**目标**: 在量表编辑页面添加反馈配置 Tab

| 步骤 | 操作 |
|------|------|
| 4.1 | 添加 Tab 导航项 |
| 4.2 | 创建维度选择器组件 |
| 4.3 | 创建等级列表编辑器 |
| 4.4 | 创建等级详情编辑表单 |

**检验标准**:
- [ ] Tab 切换正常
- [ ] 维度选择后显示对应配置
- [ ] 可添加/删除等级
- [ ] 解读文本可编辑
- [ ] 建议列表可增删

---

### Task 5: 前端 - 保存与预览

**目标**: 实现配置保存和报告预览功能

| 步骤 | 操作 |
|------|------|
| 5.1 | 实现保存配置 API 调用 |
| 5.2 | 实现单维度预览功能 |

**检验标准**:
- [ ] 保存成功显示提示
- [ ] 预览正确显示等级和反馈

---

### Task 6: 学生端报告展示更新

**目标**: 更新学生端报告页面，使用新模板渲染

| 步骤 | 操作 |
|------|------|
| 6.1 | 更新反馈数据接口类型 |
| 6.2 | 显示等级名称、解读和建议 |

**检验标准**:
- [ ] 报告正确显示维度分数
- [ ] 等级名称正确显示
- [ ] 解读文本正确渲染

---

### Task 7: 测试与部署

**目标**: 端到端测试，部署上线

| 步骤 | 操作 |
|------|------|
| 7.1 | 后端接口测试 |
| 7.2 | 前端构建测试 |
| 7.3 | 部署到生产环境 |

**检验标准**:
- [ ] 前端构建无错误
- [ ] 完整流程可正常使用

---

## 五、数据校验规则

```typescript
function validateLevelFeedback(levelFeedback: LevelFeedback): string[] {
  const errors: string[] = []
  const levels = levelFeedback.levels || []
  
  if (levels.length === 0) {
    errors.push('至少需要配置一个等级')
    return errors
  }
  
  for (const level of levels) {
    if (!level.name?.trim()) errors.push('等级名称不能为空')
    if (level.min === undefined) errors.push('分数下限不能为空')
    if (level.max === undefined) errors.push('分数上限不能为空')
    if (level.min > level.max) errors.push('分数下限不能大于上限')
    if (!level.interpretation?.trim()) errors.push('解读文本不能为空')
  }
  
  // 检查区间重叠
  const sorted = [...levels].sort((a, b) => a.min - b.min)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min <= sorted[i-1].max) {
      errors.push(`等级 "${sorted[i-1].name}" 和 "${sorted[i].name}" 分数区间重叠`)
    }
  }
  
  return errors
}
```

---

## 六、文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `backend/prisma/schema.prisma` | 修改 | 添加 `levelFeedback` 字段 |
| `backend/src/services/scoringService.ts` | 修改 | 添加等级匹配和反馈生成 |
| `backend/src/controllers/scaleController.ts` | 修改 | 添加反馈配置 API |
| `backend/src/routes/scales.ts` | 修改 | 添加路由 |
| `frontend/src/pages/ScaleEdit.tsx` | 修改 | 添加反馈配置 Tab |
| `frontend/src/pages/student/ScaleResult.tsx` | 修改 | 更新报告展示 |

---

## 七、兼容性说明

- `levelFeedback` 为空时，反馈仅显示分数，不显示等级和解读
- 现有测评记录的 `feedback` JSON 格式不变
- 新生成的反馈包含 `levelName` 字段
