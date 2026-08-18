# 聚合问卷功能开发规范文档 (Spec)

**版本**: 1.0  
**创建日期**: 2026-03-25  
**项目**: 心理测评系统 - 聚合问卷模块

---

## 一、功能概述

### 1.1 需求背景

当前系统支持单个心理量表的发布和作答。但在实际应用中，教师常需要一次性发布多个相关量表（如焦虑+抑郁+压力量表），学生需要完成多个量表的作答。

### 1.2 功能目标

- 将多个心理量表聚合为"问卷"单位
- 学生可一次性连续完成多个量表作答
- 系统统一生成聚合报告（各量表报告累加）
- 支持课程关联和发布管理

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| 独立模型 | 新建 Questionnaire 相关模型，不修改 Scale 模型 |
| 独立路由 | 新建 `/questionnaires` 路由，不影响 `/scales` 路由 |
| 复用服务 | 复用 scoringService 评分逻辑，不重复开发 |
| 独立前端 | 新建问卷页面，不影响现有量表页面 |

---

## 二、数据库设计

### 2.1 新增模型

#### Questionnaire (问卷主表)

```prisma
model Questionnaire {
  id            String              @id @default(uuid())
  code          String              @unique
  name          String
  description   String?
  instruction   String?
  status        QuestionnaireStatus @default(DRAFT)
  visibility    ScaleVisibility     @default(HIDDEN)
  estimatedTime Int?               @map("estimated_time")
  creatorId     String             @map("creator_id")
  createdAt     DateTime           @default(now()) @map("created_at")
  updatedAt     DateTime           @updatedAt @map("updated_at")

  creator              User                      @relation("QuestionnaireCreator", fields: [creatorId], references: [id])
  questionnaireScales  QuestionnaireScale[]
  assessments          QuestionnaireAssessment[]
  courseQuestionnaires CourseQuestionnaire[]

  @@map("questionnaires")
}
```

#### QuestionnaireScale (问卷-量表关联表)

```prisma
model QuestionnaireScale {
  id              String   @id @default(uuid())
  questionnaireId String   @map("questionnaire_id")
  scaleId         String   @map("scale_id")
  sortOrder       Int      @default(0) @map("sort_order")

  questionnaire Questionnaire @relation(fields: [questionnaireId], references: [id], onDelete: Cascade)
  scale         Scale         @relation("QuestionnaireScales", fields: [scaleId], references: [id], onDelete: Cascade)

  @@unique([questionnaireId, scaleId])
  @@map("questionnaire_scales")
}
```

#### QuestionnaireAssessment (问卷测评记录)

```prisma
model QuestionnaireAssessment {
  id               String           @id @default(uuid())
  questionnaireId  String           @map("questionnaire_id")
  userId           String           @map("user_id")
  status           AssessmentStatus @default(IN_PROGRESS)
  progress         Int              @default(0)
  startedAt        DateTime         @default(now()) @map("started_at")
  completedAt      DateTime?        @map("completed_at")
  totalTime        Int?             @map("total_time")
  aggregateReport  Json?            @map("aggregate_report")

  questionnaire    Questionnaire     @relation(fields: [questionnaireId], references: [id], onDelete: Cascade)
  user             User              @relation("UserQuestionnaireAssessments", fields: [userId], references: [id], onDelete: Cascade)
  scaleAssessments ScaleAssessment[]

  @@map("questionnaire_assessments")
}
```

#### CourseQuestionnaire (课程-问卷关联)

```prisma
model CourseQuestionnaire {
  id              String   @id @default(uuid())
  courseId        String   @map("course_id")
  questionnaireId String   @map("questionnaire_id")
  createdAt       DateTime @default(now()) @map("created_at")

  course        Course       @relation(fields: [courseId], references: [id], onDelete: Cascade)
  questionnaire Questionnaire @relation(fields: [questionnaireId], references: [id], onDelete: Cascade)

  @@unique([courseId, questionnaireId])
  @@map("course_questionnaires")
}
```

### 2.2 修改现有模型

#### Scale (添加反向关联)

```prisma
model Scale {
  // ... 现有字段
  questionnaireScales QuestionnaireScale[] @relation("QuestionnaireScales")
}
```

#### ScaleAssessment (添加可选关联)

```prisma
model ScaleAssessment {
  // ... 现有字段
  questionnaireAssessmentId String?                 @map("questionnaire_assessment_id")
  questionnaireAssessment   QuestionnaireAssessment? @relation(fields: [questionnaireAssessmentId], references: [id])
}
```

#### User (添加反向关联)

```prisma
model User {
  // ... 现有字段
  createdQuestionnaires     Questionnaire[]          @relation("QuestionnaireCreator")
  questionnaireAssessments  QuestionnaireAssessment[] @relation("UserQuestionnaireAssessments")
}
```

#### Course (添加反向关联)

```prisma
model Course {
  // ... 现有字段
  courseQuestionnaires CourseQuestionnaire[]
}
```

### 2.3 新增枚举

```prisma
enum QuestionnaireStatus {
  DRAFT      // 草稿
  PUBLISHED  // 已发布
  DEPRECATED // 已废弃
}
```

---

## 三、API 接口规范

### 3.1 管理端接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/questionnaires` | 获取问卷列表 | 教师/管理员 |
| POST | `/api/questionnaires` | 创建问卷 | 教师/管理员 |
| GET | `/api/questionnaires/:id` | 获取问卷详情 | 教师/管理员 |
| PUT | `/api/questionnaires/:id` | 更新问卷 | 教师/管理员 |
| DELETE | `/api/questionnaires/:id` | 删除问卷 | 教师/管理员 |
| POST | `/api/questionnaires/:id/publish` | 发布问卷 | 教师/管理员 |
| POST | `/api/questionnaires/:id/deprecate` | 废弃问卷 | 教师/管理员 |
| GET | `/api/questionnaires/:id/scales` | 获取关联量表 | 教师/管理员 |
| POST | `/api/questionnaires/:id/scales` | 添加量表 | 教师/管理员 |
| DELETE | `/api/questionnaires/:id/scales/:scaleId` | 移除量表 | 教师/管理员 |
| POST | `/api/questionnaires/:id/scales/reorder` | 量表排序 | 教师/管理员 |
| GET | `/api/questionnaires/:id/courses` | 获取关联课程 | 教师/管理员 |
| POST | `/api/questionnaires/:id/courses` | 添加课程关联 | 教师/管理员 |
| DELETE | `/api/questionnaires/:id/courses/:courseId` | 移除课程关联 | 教师/管理员 |

### 3.2 学生端接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/questionnaires/available` | 获取可用问卷列表 | 学生 |
| POST | `/api/questionnaires/:id/assessments` | 开始/继续问卷测评 | 学生 |
| GET | `/api/questionnaire-assessments/:id` | 获取测评状态 | 学生 |
| POST | `/api/questionnaire-assessments/:id/complete` | 完成问卷测评 | 学生 |
| GET | `/api/questionnaire-assessments/:id/report` | 获取聚合报告 | 学生 |

### 3.3 接口详情

#### GET /api/questionnaires/available

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": "uuid",
        "code": "mental-health-composite",
        "name": "心理健康综合评估",
        "description": "包含焦虑、抑郁、压力三个量表",
        "estimatedTime": 30,
        "scaleCount": 3,
        "totalItems": 63,
        "courses": [
          { "id": "course-uuid", "title": "心理健康课程" }
        ],
        "completed": false,
        "completedAt": null
      }
    ],
    "total": 1
  }
}
```

#### POST /api/questionnaires/:id/assessments

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "questionnaireAssessment": {
      "id": "qa-uuid",
      "status": "IN_PROGRESS",
      "progress": 0,
      "currentScaleIndex": 0
    },
    "currentScale": {
      "id": "scale-uuid",
      "name": "焦虑自评量表",
      "items": [...],
      "dimensions": [...],
      "scaleAssessmentId": "sa-uuid"
    }
  },
  "message": "开始问卷测评"
}
```

---

## 四、开发任务清单

### 阶段一：数据库模型 (预计 1 小时)

#### T1.1 添加 Questionnaire 模型

**文件**: `backend/prisma/schema.prisma`

**检验标准**:
- [ ] 模型定义包含所有必需字段
- [ ] 字段映射正确（snake_case）
- [ ] 创建者关联定义正确

**命令**:
```bash
# 添加模型后运行
npx prisma format
```

#### T1.2 添加 QuestionnaireScale 模型

**检验标准**:
- [ ] 包含 sortOrder 字段用于排序
- [ ] 唯一约束正确（questionnaireId + scaleId）
- [ ] 级联删除配置正确

#### T1.3 添加 QuestionnaireAssessment 模型

**检验标准**:
- [ ] 包含 aggregateReport 字段存储聚合报告
- [ ] 状态使用现有 AssessmentStatus 枚举
- [ ] 与 User 关联正确

#### T1.4 添加 CourseQuestionnaire 模型

**检验标准**:
- [ ] 唯一约束正确（courseId + questionnaireId）
- [ ] 级联删除配置正确

#### T1.5 修改 ScaleAssessment 模型

**检验标准**:
- [ ] questionnaireAssessmentId 为可选字段
- [ ] 关联定义正确

#### T1.6 添加 Scale 模型反向关联

**检验标准**:
- [ ] 添加 questionnaireScales 关联数组
- [ ] 关系名称正确

#### T1.7 运行数据库迁移

**命令**:
```bash
cd /opt/ptool/server-version/backend
npx prisma migrate dev --name add_questionnaire_module
```

**检验标准**:
- [ ] 迁移文件生成成功
- [ ] 数据库表创建成功
- [ ] 外键约束正确

---

### 阶段二：后端 API 开发 (预计 3-4 小时)

#### T2.1 创建 questionnaireController.ts

**文件**: `backend/src/controllers/questionnaireController.ts`

**检验标准**:
- [ ] 文件创建成功
- [ ] 导入必要的依赖
- [ ] 基础结构搭建完成

#### T2.2 实现问卷 CRUD 接口

**包含接口**:
- `list` - 获取问卷列表
- `create` - 创建问卷
- `detail` - 获取问卷详情
- `update` - 更新问卷
- `delete` - 删除问卷

**检验标准**:
- [ ] 权限检查正确（教师只能看自己创建的）
- [ ] 输入验证完整
- [ ] 错误处理正确

**测试命令**:
```bash
# 创建问卷
curl -X POST http://localhost:3001/api/questionnaires \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"test-qn","name":"测试问卷"}'

# 获取列表
curl http://localhost:3001/api/questionnaires \
  -H "Authorization: Bearer $TOKEN"
```

#### T2.3 实现问卷发布/废弃接口

**包含接口**:
- `publish` - 发布问卷
- `deprecate` - 废弃问卷

**检验标准**:
- [ ] 发布前验证（至少包含一个量表）
- [ ] 状态变更正确
- [ ] 权限检查正确

#### T2.4 实现量表关联管理接口

**包含接口**:
- `listScales` - 获取关联量表列表
- `addScale` - 添加量表
- `removeScale` - 移除量表
- `reorderScales` - 量表排序

**检验标准**:
- [ ] 添加时验证量表存在
- [ ] 排序功能正确
- [ ] 防止重复添加

#### T2.5 实现学生可用问卷列表接口

**接口**: `available`

**检验标准**:
- [ ] 按可见性过滤（PUBLIC/COURSE）
- [ ] 按课程过滤（学生所在课程）
- [ ] 返回完成状态

#### T2.6 实现开始问卷测评接口

**接口**: `startAssessment`

**逻辑**:
1. 验证问卷已发布
2. 检查是否有进行中的测评
3. 创建 QuestionnaireAssessment
4. 为每个量表创建 ScaleAssessment
5. 返回第一个量表信息

**检验标准**:
- [ ] 事务处理正确
- [ ] ScaleAssessment 关联正确
- [ ] 返回数据结构完整

#### T2.7 实现获取当前测评状态接口

**接口**: `getAssessment`

**返回**:
- 当前问卷测评进度
- 当前正在作答的量表信息
- 各量表完成状态

**检验标准**:
- [ ] 进度计算正确
- [ ] 当前量表索引正确

#### T2.8 实现完成问卷测评接口

**接口**: `completeAssessment`

**逻辑**:
1. 验证所有量表已完成
2. 生成聚合报告
3. 更新状态和时间

**检验标准**:
- [ ] 聚合报告生成正确
- [ ] 状态更新正确

#### T2.9 实现获取聚合报告接口

**接口**: `getReport`

**返回结构**:
```typescript
{
  questionnaireName: string
  completedAt: Date
  totalTime: number
  scaleReports: ScaleReport[]
  overallSummary: string
}
```

**检验标准**:
- [ ] 报告结构正确
- [ ] 包含所有量表报告

#### T2.10 创建 questionnaires.ts 路由

**文件**: `backend/src/routes/questionnaires.ts`

**检验标准**:
- [ ] 所有端点注册正确
- [ ] 中间件配置正确
- [ ] 导出正确

#### T2.11 注册路由到 app.ts

**文件**: `backend/src/app.ts`

**添加**:
```typescript
import questionnaireRoutes from './routes/questionnaires'
// ...
app.use('/api/questionnaires', questionnaireRoutes)
```

**检验标准**:
- [ ] 路由注册成功
- [ ] /api/questionnaires 可访问

---

### 阶段三：前端管理端开发 (预计 3-4 小时)

#### T3.1 创建 QuestionnaireList.tsx

**文件**: `frontend/src/pages/QuestionnaireList.tsx`

**功能**:
- 显示问卷列表
- 创建问卷按钮
- 发布/废弃操作
- 删除操作

**检验标准**:
- [ ] 列表展示正确
- [ ] 状态标签正确
- [ ] 操作按钮可用

#### T3.2 创建 QuestionnaireEdit.tsx

**文件**: `frontend/src/pages/QuestionnaireEdit.tsx`

**标签页**:
- 基本信息
- 量表管理
- 课程关联

**检验标准**:
- [ ] 表单验证正确
- [ ] 新建/编辑模式正确切换

#### T3.3 实现问卷创建/编辑表单

**字段**:
- 问卷编码（创建后不可修改）
- 问卷名称
- 描述
- 预计用时
- 可见性设置
- 指导语

**检验标准**:
- [ ] 表单验证完整
- [ ] 保存功能正常

#### T3.4 实现量表选择组件

**功能**:
- 显示可用量表列表
- 多选支持
- 拖拽排序
- 显示量表信息（题目数、维度数）

**检验标准**:
- [ ] 量表列表正确
- [ ] 排序功能正常
- [ ] 保存关联正确

#### T3.5 实现课程关联管理

**功能**:
- 显示已关联课程
- 添加课程关联
- 移除课程关联

**检验标准**:
- [ ] 课程列表正确
- [ ] 关联操作正常

#### T3.6 课程详情页添加问卷标签页

**文件**: `frontend/src/pages/CourseDetail.tsx` 或类似

**功能**:
- 添加"问卷"标签页
- 显示该课程关联的问卷
- 支持添加/移除问卷

**检验标准**:
- [ ] 标签页显示正确
- [ ] 问卷列表正确
- [ ] 关联操作正常

---

### 阶段四：前端学生端开发 (预计 3-4 小时)

#### T4.1 创建 StudentQuestionnaires.tsx

**文件**: `frontend/src/pages/student/StudentQuestionnaires.tsx`

**功能**:
- 显示可用问卷列表
- 显示问卷信息（包含量表数、总题数、预计用时）
- 显示完成状态
- 点击进入作答

**检验标准**:
- [ ] 列表展示正确
- [ ] 完成状态显示正确

#### T4.2 创建 QuestionnaireAssessment.tsx

**文件**: `frontend/src/pages/student/QuestionnaireAssessment.tsx`

**功能**:
- 显示整体进度
- 显示当前量表名称和进度
- 复用量表作答组件
- 自动切换到下一个量表

**检验标准**:
- [ ] 进度显示正确
- [ ] 量表切换正确
- [ ] 作答数据保存正确

#### T4.3 实现量表切换逻辑

**逻辑**:
1. 完成当前量表
2. 检查是否还有下一个量表
3. 有则自动切换，无则跳转完成页

**检验标准**:
- [ ] 切换逻辑正确
- [ ] 状态保存正确

#### T4.4 实现整体进度显示

**显示**:
- 当前量表序号 / 总量表数
- 整体进度条
- 预计剩余时间

**检验标准**:
- [ ] 进度计算正确
- [ ] UI 显示正确

#### T4.5 创建 QuestionnaireResult.tsx

**文件**: `frontend/src/pages/student/QuestionnaireResult.tsx`

**功能**:
- 显示问卷名称和完成时间
- 分量表展示报告
- 整体评估摘要
- 维度得分可视化

**检验标准**:
- [ ] 报告展示正确
- [ ] 各量表报告显示完整

---

### 阶段五：集成测试与部署 (预计 1-2 小时)

#### T5.1 后端构建测试

**命令**:
```bash
cd /opt/ptool/server-version/backend
npm run build
```

**检验标准**:
- [ ] 无 TypeScript 错误
- [ ] 无编译警告
- [ ] dist 目录生成正确

#### T5.2 前端构建测试

**命令**:
```bash
cd /opt/ptool/server-version/frontend
npm run build
```

**检验标准**:
- [ ] 无 TypeScript 错误
- [ ] 无 ESLint 错误
- [ ] dist 目录生成正确

#### T5.3 数据库连接测试

**命令**:
```bash
cd /opt/ptool/server-version/backend
npx prisma db pull
```

**检验标准**:
- [ ] 数据库连接正常
- [ ] 模型同步正确

#### T5.4 问卷创建流程测试

**测试步骤**:
1. 登录教师账号
2. 创建问卷
3. 添加量表
4. 设置顺序
5. 关联课程
6. 发布问卷

**检验标准**:
- [ ] 所有步骤正常
- [ ] 数据保存正确

#### T5.5 问卷作答流程测试

**测试步骤**:
1. 登录学生账号
2. 进入问卷列表
3. 开始作答
4. 完成第一个量表
5. 自动进入第二个量表
6. 完成所有量表
7. 查看报告

**检验标准**:
- [ ] 作答流程正常
- [ ] 进度显示正确
- [ ] 报告生成正确

#### T5.6 聚合报告测试

**检验标准**:
- [ ] 包含所有量表报告
- [ ] 得分计算正确
- [ ] 反馈文本正确

#### T5.7 课程卡片问卷测试

**测试步骤**:
1. 进入课程详情页
2. 切换到问卷标签页
3. 查看关联问卷
4. 添加新问卷关联
5. 移除问卷关联

**检验标准**:
- [ ] 标签页显示正确
- [ ] 关联操作正常

#### T5.8 部署到生产环境

**命令**:
```bash
# 后端
cd /opt/ptool/server-version/backend
npm run build
pm2 restart ptool-backend

# 前端
cd /opt/ptool/server-version/frontend
npm run build
sudo rm -rf /usr/share/nginx/html/*
sudo cp -r dist/* /usr/share/nginx/html/
sudo chown -R www-data:www-data /usr/share/nginx/html/
```

**检验标准**:
- [ ] 服务正常运行
- [ ] 页面访问正常
- [ ] API 响应正常

---

## 五、文件变更清单

### 新增文件

| 文件路径 | 说明 |
|----------|------|
| `backend/src/controllers/questionnaireController.ts` | 问卷控制器 |
| `backend/src/routes/questionnaires.ts` | 问卷路由 |
| `frontend/src/pages/QuestionnaireList.tsx` | 问卷管理列表 |
| `frontend/src/pages/QuestionnaireEdit.tsx` | 问卷编辑页 |
| `frontend/src/pages/student/StudentQuestionnaires.tsx` | 学生问卷列表 |
| `frontend/src/pages/student/QuestionnaireAssessment.tsx` | 问卷作答页 |
| `frontend/src/pages/student/QuestionnaireResult.tsx` | 聚合报告页 |

### 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `backend/prisma/schema.prisma` | 添加问卷相关模型 |
| `backend/src/app.ts` | 注册问卷路由 |
| `frontend/src/App.tsx` | 添加问卷相关路由 |
| `frontend/src/pages/CourseDetail.tsx` | 添加问卷标签页（如存在） |

---

## 六、测试用例

### 6.1 单元测试

```typescript
// questionnaire.test.ts
describe('Questionnaire Controller', () => {
  test('should create questionnaire', async () => {
    // ...
  })
  
  test('should add scale to questionnaire', async () => {
    // ...
  })
  
  test('should start questionnaire assessment', async () => {
    // ...
  })
})
```

### 6.2 集成测试

| 场景 | 步骤 | 预期结果 |
|------|------|----------|
| 创建问卷 | 填写表单提交 | 问卷创建成功 |
| 添加量表 | 选择量表并设置顺序 | 关联创建成功 |
| 发布问卷 | 点击发布按钮 | 状态变为已发布 |
| 开始作答 | 学生点击开始 | 创建测评记录 |
| 完成作答 | 完成所有量表 | 生成聚合报告 |

---

## 七、验收标准

### 功能验收

- [ ] 教师可以创建、编辑、删除问卷
- [ ] 教师可以为问卷添加多个量表并排序
- [ ] 教师可以将问卷发布到课程
- [ ] 学生可以看到可用问卷列表
- [ ] 学生可以连续完成多个量表
- [ ] 系统生成正确的聚合报告
- [ ] 课程详情页显示关联问卷

### 性能验收

- [ ] 问卷列表加载时间 < 1s
- [ ] 作答页面切换时间 < 500ms
- [ ] 报告生成时间 < 2s

### 兼容性验收

- [ ] 现有量表功能不受影响
- [ ] 现有量表测评记录不受影响
- [ ] 现有课程关联不受影响

---

## 八、风险评估

| 风险 | 等级 | 应对措施 |
|------|------|----------|
| 数据库迁移失败 | 中 | 备份数据库，准备回滚脚本 |
| 量表关联循环引用 | 低 | Prisma 自动处理 |
| 大量表聚合性能问题 | 低 | 分批加载，虚拟滚动 |
| 向后兼容性问题 | 低 | 可选字段设计 |

---

**文档结束**
