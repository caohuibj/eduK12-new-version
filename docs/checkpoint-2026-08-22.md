# eduK12 本地 Checkpoint — 2026-08-22

> 当前停点已前移到 `docs/checkpoint-2026-08-22-followups.md`（标签 `checkpoint-2026-08-22-followups`）。本文是当时快照；§7 里若干缺口已在后续停点关闭。

**仓库工作树：** `/Users/Qiang/Documents/eduK12-dev`  
**Git 分支：** `dev`（跟踪 `origin/dev`）  
**基底提交：** `59c8d9c` Merge PR #9: composite assessments and anonymous cognitive access  
**本 checkpoint 含义：** PR #9 已合入后的完整系统，再加上本轮功能测试中确认并落地的缺口修补。后续功能应在此提交之上继续，而不是另起截断快照。

---

## 1. 这是不是一个合适的停点？

**是，适合作为「当前可交付功能面」的停点**，前提是把下面几件事先说清楚：

- 教学 LMS、量表/问卷、认知任务、综合测评、公开匿名入口，主路径都已能在本地跑通。
- 本轮补上的是真实使用会踩到的产品缺口（越权列表、结课误冻、教师认知管理、教师审核、档位、公开链接计数），不是半截功能。
- 下面这些**刻意没做完**，不应假装已经关闭：GitHub Actions 因账单无法跑 CI；公开问卷 POW 仍关闭；`feature/cognitive-phase1-phase2-optimization` 的专项优化**没有**合进本 checkpoint；微信小程序仍落后于 Web（无认知/综合测评）。

可以停下来做试用、写手册、或开下一阶段。不要在停点上再混入无关重构。

---

## 2. 系统框架

### 2.1 产品定位

独立部署的教学管理 + 心理/认知测评平台（PTool / 慧育空间 Web）。不再依赖微信小程序登录或 CloudBase。角色为管理员、教师、学生，以及持公开链接的匿名参与者。

### 2.2 技术栈

| 层 | 实现 |
|---|---|
| 前端 | React + TypeScript + Vite，路由在 `server-version/frontend/src/App.tsx` |
| 后端 | Express + TypeScript，入口 `server-version/backend/src/index.ts` |
| 数据 | PostgreSQL + Prisma（`server-version/backend/prisma/`） |
| 缓存/队列 | Redis（Socket.IO adapter、Bull 视频/图片队列） |
| 实时 | Socket.IO 命名空间 `/classroom` |
| 媒体 | 本地 `uploads/`，文档强制 COS；视频 FFmpeg 转码 |
| 部署 | Docker Compose（Postgres / Redis / backend / frontend） |

目录刻意保持 `server-version/{backend,frontend}`，不提升到仓库根。

### 2.3 运行时开关

- 后端：`COGNITIVE_MODULE_ENABLED=true/false`。为 false 时不挂载 `/api/cognitive` 与 `/api/public/cognitive`，旧 LMS 路由不变。综合测评路由**始终挂载**。
- 前端构建期：`VITE_COGNITIVE_MODULE_ENABLED=true` 才注册认知相关页面与教师「认知任务」菜单。
- 生产：`CORS_ORIGIN` 必须为具体 origin，禁止 `*`；`JWT_SECRET` ≥32；`DATA_ENCRYPTION_KEY` 64 hex；认知开启时还要 `DATA_PSEUDONYM_KEY` 64 hex。
- 导出上限（可用环境变量覆盖）：记录 10000、试次 100000、字段 2000、文件 50MB、生成文件保留 24 小时。

### 2.4 请求与鉴权骨架

- JSON 上限 10MB；`/api` 禁用缓存；`/uploads` 静态 7 天。
- JWT Bearer。`authenticate` **不查库**；冻结/过期/教师待审在 **登录** 和 **`GET /api/auth/me`** 检查。
- `requireTeacher` = 教师或管理员。
- 公开测评接口：15 分钟 600 次/IP（`/api/public`、公开认知、公开综合）。
- 登录限流 15 分钟 5 次，注册 20 次；`NODE_ENV=development` 时跳过。

### 2.5 核心数据模型（按域）

- **账号：** `User`（`teacherApproved`、`isFrozen`、`expiresAt`）、`TeacherCode`
- **教学：** `Course`、`CourseStudent`、`CourseShare`、`Assignment`、`Submission`、`Checkin`、`CheckinSubmission`、`CheckinAccessToken`
- **量表：** `Scale`、`ScaleItem`、`Dimension`、`ItemDimension`、`Assessment`、`CourseScale`
- **问卷：** `Questionnaire`（COURSE / GENERAL）、表单项、公开令牌、匿名测评
- **综合测评：** `CompositeAssessment` + `Item` + `Attempt` + `FormAnswer` + 公开令牌
- **认知：** `CognitiveTestConfig`、`CognitiveAssignment`、`CognitiveSession`、`CognitiveTrial`、`CognitiveAccessToken`
- **课堂：** `Classroom`、`ClassroomSession`、`ClassroomQuestion`、`ClassroomAnswer`
- **媒体：** `Video`、`Document`

认知 trial / 完成结果加密存储。量表完成后答案与分数加密；进行中答案为明文 JSON。

---

## 3. 功能与实现细节

### 3.1 账号与门户

| 功能 | 实现要点 |
|---|---|
| 门户 | `/` 三角色入口。学生卡片进 `/student/course-login` |
| 管理员登录 | `/admin/login`，种子账号仅从受保护环境变量 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 读取 |
| 教师码 | 管理员生成；提交注册后作废（`isActive=false`） |
| 教师注册 | 验证码 → 填资料 → **不发 JWT**，`teacherApproved=false` → 管理员「用户管理」点通过 → 才能登录 |
| 教师登录 | `/teacher/account-login`；待审提示「正在等待管理员审核」 |
| 学生注册 | 课程码验证 → `/student/register`；课程码页与注册页均有「已有账号，去登录」 |
| 学生登录 | `/student/login` |
| 冻结 / 延期 | 教师可冻单个学生账号；管理员可给教师延期。**结束课程不再全局冻结学生** |
| 结课 | 课程 `COMPLETED` + `endedAt` + 停止招募；学生仍可登录并参加其他课 |

### 3.2 课程与选课

- 教师建课即 `PUBLISHED`，生成课程码。
- 学生用课程码加入，成员状态为 `ACTIVE`。
- **列表权限（本 checkpoint）：** 学生 `GET /api/courses`、`/assignments`、`/checkins` 只返回自己 ACTIVE/APPROVED 课程内的数据。教师看自己的课，管理员看全部。
- 学生「我的课程」仍走 `/api/courses/my`。
- 结束课程、停止/恢复招募、封面上传。课程分享目前是管理端能力。

### 3.3 作业

- 教师创建（选择/文本/媒体 JSON）、批改评语（无独立数字总分字段）、导出 XLSX。
- 学生提交；可改交并留 `SubmissionHistory`。
- **提交仍不校验 deadline**（已知，本 checkpoint 未改）。

### 3.4 打卡

- 教师创建；可开匿名；令牌 `ck_`。
- 登录学生提交；匿名走 `/api/checkins/public/:token`。
- GET 预览不占用 `maxUses`；提交才算一次参与。

### 3.5 课堂互动（刻意开放）

- 教师创建课堂（6 位数字码）、出题、控制台、大屏 `/bigscreen/:id`。
- **课堂码查询与 Socket 入场不要求课程选课**，供临时听课。这是产品设计，不要按 LMS 选课去收紧。
- 实时：教师 start/next/end；学生作答；词云统计。

### 3.6 量表

- 草稿：题目、维度、题目-维度权重、反向计分、课程绑定。
- **档位（本 checkpoint）：** `config.points = N`（2–10）。`labels` 必须连续覆盖 **1…N**，教师只改文字，不能跳过 2/3/4 只留 1 和 5。改点数保留已填文字。发布时后端用 `scaleLabelsError` 拦截跳档或空文案。
- 学生作答 UI（独立量表 / 问卷 / 公开问卷 / 综合测评）用 `resolveScaleOptions` 渲染 1…N，**每一档可点**。
- 判分：`1..points` 为合法答案。完成后 AES-GCM 加密。
- 等级反馈（维度解读区间）是另一套配置，与李克特档位不是同一件事。

相关文件：

- `server-version/backend/src/utils/scaleLabels.ts`
- `server-version/frontend/src/utils/scaleLabels.ts`
- `server-version/frontend/src/pages/ScaleEdit.tsx`

### 3.7 聚合问卷与泛化问卷

- **聚合问卷（COURSE）：** 绑定课程，量表 + 表单按 position 混排，学生在课内作答。
- **泛化问卷（GENERAL）：** 教师端另一套 UI，公开令牌，匿名作答。
- 公开问卷 **GET 预览不再 `usedCount++`**；`POST .../start` 创建新测评时 `claimAccess` 原子占名额（`maxUses=0` 不限制）。续答不占第二次。
- POW 接口仍在，**开始测评时验证被注释掉**。

### 3.8 认知任务

**配置：** seed 写入已发布 config：`fake/1.0.0`、`reaction|memory|stroop/1.0.1`。无教师在线编辑 config JSON 的 API；教师只能从已发布 config 建任务。`GET /api/cognitive/configs` 列出可选配置（不含运行参数全文）。

**教师 UI（本 checkpoint 新增）：** `/cognitive-assignments`

- 选课程 + 任务类型、标题、须知、最大次数 → 草稿
- 发布 / 归档
- 已发布后可生成公开匿名链接、导出 summary/full CSV

**学生：** `/student/cognitive` → 进入任务 → Runner（Fake / Reaction / Memory / Stroop）→ 结果 / 历史。

**运行不变量：**

- Session 冻结 `testType/engineVersion/scoringVersion` 与 config 快照。
- Trial 只追加；同 index 同 hash 幂等；不同内容 409。
- `complete` body 必须是 `{}`，分数服务端算。过早 complete 保持 `IN_PROGRESS`。
- 行锁串行化 append 与 complete。
- 常模为模拟数据 `sim-k12-v0.1`，非临床、非常模测验；无「综合认知总分」。

**公开认知：** `/public/cognitive/assignments/:token`；恢复凭证一次明文，库中只存哈希；GET 用 `X-Recovery-Token`，写入放 body。

### 3.9 综合测评

容器：按教师配置顺序跑 **量表 / 表单 / 认知**，**不算跨模块总分**。

- 登录学生：课内 Tab「综合测评」，attempt 绑 `userId`。
- 匿名：公开令牌 + 恢复凭证（与入口令牌是两种东西）。
- 全部模块完成后才 `COMPLETED`；GET attempt 可能把进度收口到完成。
- 认知子任务会跳到认知 Runner，再 `returnTo` 回容器。
- 导出 summary / full，教师强制匿名化。
- 教师统计图、跨模块聚合分析 **规格上未做**。

### 3.10 媒体库

- 视频：上传或 URL，Bull 转码（默认可 480p），可选 COS。
- 图片：压缩队列。
- 文档：上传要求 COS。

### 3.11 导出

| 对象 | 形式 |
|---|---|
| 作业 / 打卡 / 课堂 | 请求内 XLSX |
| 量表 / 问卷 | CSV / SAV 等 |
| 认知 / 综合 | 落盘 + 下载，有体积/条数上限与 24h 清理 |

---

## 4. 前端路由（Web）

**教师/管理员（`Layout`）：** 课程、学生、作业、打卡、课堂、量表、聚合问卷、综合测评、**认知任务**（flag）、泛化问卷、视频/图片/文档、用户与教师码（仅管理员）。

**学生（`StudentLayout`）：** 课程、认知测评（flag）、设置。作业/打卡/问卷/综合测评主要在课程详情 Tab。

**公开：** 问卷、打卡、综合测评、认知（flag）、课堂大屏。

---

## 5. 本 checkpoint 相对 PR #9 合入后的增量

1. 学生课程/作业/打卡列表按选课隔离。  
2. 结课不再 `User.isFrozen`。  
3. 教师认知任务管理页 + `GET /api/cognitive/configs`。  
4. 学生课程码/注册页「已有账号，去登录」。  
5. 教师注册待审 + 管理员通过（迁移 `teacher_approved`）。  
6. 量表档位连续 1…N，学生全可选。  
7. 公开问卷 GET 不占次数，start 才占。  
8. 课堂码免登录：**保持原设计**。

Prisma 迁移：`20260822090000_add_teacher_approved`。

---

## 6. 验证情况

本工作树曾在隔离 Postgres（不碰本机正在跑的 ptool 容器）上做过功能测试：

- PR #9 基线：后端 37 文件 / 295 测试通过；前端 cognitive 14 文件 / 59 通过；`tsc` / Vite build / compose config 通过。
- 缺口修补后的针对性 API 校验：选课隔离、结课仍可登录、教师待审/通过、档位 1…N、公开问卷预览不占次，均已实测。

GitHub Actions 在合入 PR #9 时因账号账单/额度未能真正跑 runner，**不能用 CI 绿勾代替上述本地结果**。

---

## 7. 明确留下的缺口（下一阶段，不是本停点范围）

- GitHub Actions 账单/额度恢复后重跑 CI。  
- 公开问卷 POW 仍关闭。  
- JWT 有效期内，冻结/待审主要靠重新登录或 `/auth/me`，中间件不每次查库。  
- 作业 deadline、打卡 endTime（登录学生）仍未强制。  
- 两套问卷产品（聚合 vs 泛化）仍然并存。  
- 手册与部分文案仍可能落后（`/login`、旧冻结说明等）。  
- `origin/refactor/cognitive-phase1-phase2-optimization` 未合入。  
- 小程序无认知/综合测评。  
- 认知常模仍为模拟数据。  
- 本 checkpoint **未 push**；远程 `origin/dev` 在提交前仍是 `59c8d9c`。

---

## 8. 本地如何从本 checkpoint 启动

工作树：`Documents/eduK12-dev`，分支 `dev`。

后端需要：`DATABASE_URL`、`JWT_SECRET`、`DATA_ENCRYPTION_KEY`、`COGNITIVE_MODULE_ENABLED=true`、`CORS_ORIGIN`（开发可用前端 origin）、`REDIS_URL`。  
前端：`VITE_COGNITIVE_MODULE_ENABLED=true npm run dev`（默认代理 `/api` → `localhost:3000`）。

```bash
cd server-version/backend && npx prisma migrate deploy && npm run db:seed && npm run dev
cd server-version/frontend && VITE_COGNITIVE_MODULE_ENABLED=true npm run dev
```

不要用 `/tmp` 里的 worktree 当长期基准。专项旧分支（`feature/cognitive-reaction` 等）不要当作本停点。
