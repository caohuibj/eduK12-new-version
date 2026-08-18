# 课堂互动答题系统开发规范文档 (Spec)

**版本**: 1.0  
**创建日期**: 2026-03-29  
**项目**: PTool 心理测评系统 - 课堂互动模块

---

## 一、功能概述

### 1.1 需求背景

基于现有泛化问卷功能，扩展为**课堂互动答题系统**，支持三端协同：

- 教师端（PC Web/平板）：创建课堂、控制答题、查看大屏
- 学生端（手机 H5）：扫码入场、实时答题、查看结果
- 大屏端（PC Web 全屏）：实时展示答案分布、信息流、词云

### 1.2 核心功能

**教师端**

- 创建课堂活动、关联课程
- 生成课堂二维码供学生扫码
- 课堂控制：开始答题、结束答题、下一题
- 实时查看已答/未答人数
- 查看大屏展示

**学生端**

- 扫码进入课堂（通过课程关系验证）
- 实时接收题目推送
- 提交答案
- 查看答题结果

**大屏端**

- 实时展示选择题答案分布（饼图）
- 填空题/文本题答案信息流展示
- 词云展示高频词

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| 独立模块 | 新建 `/classrooms` 模块，不影响现有问卷功能 |
| 关联课程 | 课堂关联课程，学生通过 CourseStudent 关系验证 |
| 稳健增量 | 渐进式开发，零影响现有功能 |
| 数据稳定 | 复用表单题目，支持数据导出 |
| 多端支持 | Web + 微信小程序 |

---

## 二、数据库设计

### 2.1 新增数据表

**Classroom（课堂）**

```prisma
model Classroom {
  id              String   @id @default(uuid())
  code            String   @unique          // 课堂码（6位数字）
  name            String                    // 课堂名称
  courseId        String   @map("course_id") // 关联课程
  status          ClassroomStatus @default(PREPARING)
  questionnaireId String?  @map("questionnaire_id") // 可选：关联问卷
  creatorId       String   @map("creator_id")
  startedAt       DateTime? @map("started_at")
  endedAt         DateTime? @map("ended_at")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  
  course          Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  creator         User     @relation("ClassroomCreator", fields: [creatorId], references: [id], onDelete: Cascade)
  sessions        ClassroomSession[]
  questions       ClassroomQuestion[]
  
  @@index([code])
  @@index([courseId])
  @@index([status])
  @@map("classrooms")
}
```

**ClassroomSession（课堂会话）**

```prisma
model ClassroomSession {
  id           String   @id @default(uuid())
  classroomId  String   @map("classroom_id")
  studentId    String   @map("student_id") // 学生ID
  joinedAt     DateTime @default(now()) @map("joined_at")
  leftAt       DateTime? @map("left_at")
  
  classroom    Classroom @relation(fields: [classroomId], references: [id], onDelete: Cascade)
  student      User      @relation("UserClassroomSessions", fields: [studentId], references: [id], onDelete: Cascade)
  answers      ClassroomAnswer[]
  
  @@unique([classroomId, studentId])
  @@index([classroomId])
  @@index([studentId])
  @@map("classroom_sessions")
}
```

**ClassroomQuestion（课堂题目）**

```prisma
model ClassroomQuestion {
  id              String   @id @default(uuid())
  classroomId     String   @map("classroom_id")
  formItemId      String?  @map("form_item_id") // 可选：关联表单题目
  questionIndex   Int      @map("question_index") // 题号
  questionContent Json                        // 题目内容快照
  timeLimit       Int?     @map("time_limit")    // 答题时限（秒）
  startedAt       DateTime? @map("started_at")
  endedAt         DateTime? @map("ended_at")
  
  classroom    Classroom        @relation(fields: [classroomId], references: [id], onDelete: Cascade)
  answers      ClassroomAnswer[]
  
  @@unique([classroomId, questionIndex])
  @@index([classroomId])
  @@index([classroomId, questionIndex])
  @@map("classroom_questions")
}
```

**ClassroomAnswer（课堂答案）**

```prisma
model ClassroomAnswer {
  id           String   @id @default(uuid())
  classroomId  String   @map("classroom_id")
  questionId   String   @map("question_id")
  sessionId    String   @map("session_id")
  answer       Json                        // 答案内容
  submittedAt  DateTime @default(now()) @map("submitted_at")
  
  classroom    Classroom          @relation(fields: [classroomId], references: [id], onDelete: Cascade)
  question     ClassroomQuestion  @relation(fields: [questionId], references: [id], onDelete: Cascade)
  session      ClassroomSession   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  
  @@unique([questionId, sessionId])
  @@index([classroomId])
  @@index([questionId])
  @@index([sessionId])
  @@map("classroom_answers")
}
```

### 2.2 迁移文件

**文件位置**: `/backend/prisma/migrations/20260329121700_add_classroom_module/migration.sql`

---

## 三、后端 API 接口

### 3.1 课堂管理接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/classrooms` | 创建课堂 | 教师/管理员 |
| GET | `/api/classrooms` | 获取课堂列表 | 教师/管理员 |
| GET | `/api/classrooms/:id` | 获取课堂详情 | 教师/管理员 |
| PUT | `/api/classrooms/:id` | 更新课堂 | 教师/管理员 |
| DELETE | `/api/classrooms/:id` | 删除课堂 | 教师/管理员 |
| GET | `/api/classrooms/code/:code` | 通过课堂码获取信息 | 学生 |
| GET | `/api/classrooms/:id/qrcode` | 生成课堂二维码 | 教师/管理员 |

### 3.2 接口详情示例

**POST /api/classrooms**

请求：
```json
{
  "name": "心理健康课堂测验",
  "courseId": "course-uuid",
  "questionnaireId": "questionnaire-uuid" // 可选
}
```

响应：
```json
{
  "code": 0,
  "data": {
    "id": "classroom-uuid",
    "code": "123456",
    "name": "心理健康课堂测验",
    "courseId": "course-uuid",
    "status": "PREPARING",
    "createdAt": "2026-03-29T12:00:00Z"
  },
  "message": "课堂创建成功"
}
```

---

## 四、Socket.IO 事件规范

### 4.1 命名空间与房间

**命名空间**: `/classroom`  
**房间机制**: `classroom:{classroomId}`

### 4.2 事件类型

**教师端事件**

| 事件 | 参数 | 说明 |
|------|------|------|
| `teacher:join` | `{ classroomId, role, userId }` | 教师加入课堂 |
| `teacher:start` | `{ classroomId, questionContent, timeLimit }` | 开始答题 |
| `teacher:end` | `{ classroomId, questionId }` | 结束答题 |
| `teacher:next` | `{ classroomId }` | 下一题 |
| `teacher:close` | `{ classroomId }` | 关闭课堂 |

**学生端事件**

| 事件 | 参数 | 说明 |
|------|------|------|
| `student:join` | `{ classroomId, role, studentId }` | 学生加入课堂 |
| `student:submit` | `{ classroomId, questionId, sessionId, answer }` | 提交答案 |
| `student:leave` | `{ classroomId, sessionId }` | 离开课堂 |

**大屏端事件**

| 事件 | 参数 | 说明 |
|------|------|------|
| `bigscreen:join` | `{ classroomId, role }` | 大屏加入课堂 |

**广播事件**

| 事件 | 数据 | 说明 |
|------|------|------|
| `broadcast:question` | `{ questionId, questionContent, timeLimit }` | 推送题目 |
| `broadcast:stats` | `{ questionId, answerCount, totalSessions, submissionRate }` | 实时统计 |
| `broadcast:online` | `{ onlineCount }` | 在线人数 |
| `broadcast:finished` | `{ questionId }` | 答题结束 |
| `broadcast:closed` | `{ classroomId }` | 课堂关闭 |

---

## 五、前端页面设计

### 5.1 教师端页面

**课堂列表页面** (`/teacher/classrooms`)

- 显示课堂列表、状态、统计
- 创建课堂、删除课堂
- 进入控制面板、查看二维码

**课堂控制面板** (`/teacher/classrooms/:id/control`)

- 顶部状态栏：课堂名称、课堂码、在线人数
- 中部控制区：开始答题、结束答题、下一题
- 实时统计：已答人数/总人数、进度条
- 底部题目列表

### 5.2 学生端页面

**扫码入场页面** (`/student/classroom/join/:code`)

- 显示课堂信息、课程、教师
- 检查学生是否在课程中
- 进入课堂按钮

**答题界面** (`/student/classroom/answer/:classroomId`)

- 顶部：题号、倒计时
- 中部：题目内容、答题区域
- 底部：提交按钮、等待提示

### 5.3 大屏端页面

**大屏展示页面** (`/bigscreen/:classroomId`)

- 顶部状态栏：课堂名称、题号、在线人数、已答人数
- 选择题：饼图展示（ECharts）
- 填空题/文本题：词云 + 答案信息流

---

## 六、性能优化

### 6.1 Socket.IO 优化

- 连接池管理，支持 100-500 并发
- 房间隔离，每个课堂独立房间
- 心跳检测，断线自动重连
- 消息压缩，减少带宽

### 6.2 数据库优化

- 课堂答案表索引优化
- 批量写入，减少数据库压力
- 查询优化，避免 N+1 问题

### 6.3 前端优化

- ECharts 数据增量更新
- 答案信息流虚拟滚动
- 词云增量更新

---

## 七、安全性

### 7.1 权限验证

- 学生加入课堂：检查 CourseStudent 关系
- 教师创建课堂：检查课程所有权
- 管理员全局权限

### 7.2 数据安全

- 独立数据表，不影响现有数据
- 级联删除配置正确
- 数据加密存储（如需要）

---

## 八、部署架构

```
┌─────────────┐     ┌─────────────┐
│   Nginx     │────▶│  Node.js    │
│  (反向代理)  │     │  Express    │
└─────────────┘     │  Socket.IO  │
                    └─────────────┘
                           │
                    ┌─────────────┐
                    │ PostgreSQL  │
                    └─────────────┘
```

**Nginx 配置要点**

- WebSocket 升级支持
- Socket.IO 长连接超时配置
- 静态资源缓存策略

---

## 九、测试用例

### 9.1 功能测试

| 场景 | 步骤 | 预期结果 |
|------|------|----------|
| 创建课堂 | 教师填写表单提交 | 课堂创建成功，生成课堂码 |
| 学生加入 | 学生扫码加入 | 通过课程关系验证，成功加入 |
| 开始答题 | 教师点击开始 | 题目推送到学生端和大屏 |
| 提交答案 | 学生提交答案 | 实时统计更新，大屏显示 |
| 结束答题 | 教师点击结束 | 停止接收答案，展示最终统计 |
| 关闭课堂 | 教师关闭课堂 | 课堂状态更新，学生退出 |

### 9.2 性能测试

- 单课堂 100-500 学生并发
- Socket.IO 连接稳定性
- 大屏渲染流畅度

---

## 十、验收标准

### 功能验收

- ✅ 教师可在课程下创建课堂
- ✅ 学生通过课程关系参与课堂
- ✅ 实时答题、实时展示
- ✅ 三端协同工作正常
- ✅ 现有作业、打卡、问卷功能不受影响

### 性能验收

- ✅ 单课堂支持 100-500 学生并发
- ✅ Socket.IO 连接稳定
- ✅ 大屏渲染流畅

### 安全验收

- ✅ 学生权限验证正确
- ✅ 数据独立存储
- ✅ 不影响现有数据

---

## 十一、文件变更清单

### 后端新增文件

| 文件路径 | 说明 |
|----------|------|
| `/backend/prisma/migrations/20260329121700_add_classroom_module/migration.sql` | 数据库迁移文件 |
| `/backend/src/services/socketService.ts` | Socket.IO 核心服务 |
| `/backend/src/services/classroomSocketHandler.ts` | 课堂事件处理器 |
| `/backend/src/services/statsAggregator.ts` | 实时统计聚合 |
| `/backend/src/controllers/classroomController.ts` | 课堂管理控制器 |
| `/backend/src/routes/classrooms.ts` | 课堂管理路由 |

### 前端新增文件

| 文件路径 | 说明 |
|----------|------|
| `/frontend/src/hooks/useClassroomSocket.ts` | Socket 连接管理 Hook |
| `/frontend/src/pages/teacher/ClassroomList.tsx` | 教师端课堂列表 |
| `/frontend/src/pages/teacher/ClassroomControl.tsx` | 教师端控制面板 |
| `/frontend/src/pages/student/ClassroomJoin.tsx` | 学生端扫码入场 |
| `/frontend/src/pages/student/ClassroomAnswer.tsx` | 学生端答题界面 |
| `/frontend/src/pages/bigscreen/BigScreen.tsx` | 大屏端展示页面 |

### 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `/backend/prisma/schema.prisma` | 添加课堂相关模型 |
| `/backend/src/index.ts` | 集成 Socket.IO，注册课堂路由 |
| `/frontend/src/App.tsx` | 添加课堂相关路由 |

---

## 十二、后续优化方向

### 12.1 功能增强

- 支持课堂题目预设（从问卷导入）
- 支持课堂数据分析报告导出
- 支持课堂录像回放
- 支持匿名课堂模式

### 12.2 性能优化

- 引入 Redis 缓存实时统计数据
- 优化词云生成算法
- 支持大规模并发（>1000 学生）

### 12.3 微信小程序支持

- 小程序端课堂页面开发
- 小程序 WebSocket 连接
- 小程序答题逻辑

---

## 十三、常见问题

**Q: 学生无法加入课堂？**  
A: 检查学生是否在课堂关联的课程中，CourseStudent 关系是否正确。

**Q: Socket.IO 连接失败？**  
A: 检查 Nginx 配置是否支持 WebSocket 升级，检查防火墙设置。

**Q: 大屏词云不显示？**  
A: 检查 echarts-wordcloud 插件是否正确安装，检查词频数据格式。

**Q: 课堂删除失败？**  
A: 已有学生参与的课堂无法删除，请先关闭课堂或等待课堂结束。

---

**文档结束**
