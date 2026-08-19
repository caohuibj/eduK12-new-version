# Cognitive D3 Assignment / Distribution 收口报告 v1

**Repo:** `caohuibj/eduK12-new-version`
**Branch:** `feature/cognitive-core`
**D3 Base SHA:** `cffd2d3`（D2 收口后 HEAD）
**D3 Final SHA:** 见 §7

---

## 1. 范围与决策

让教师可把一个已发布、Registry 可识别的 Cognitive Config 分发到自己的课程；学生能看到自己课程中的已发布 Cognitive Assignment。

- API 前缀 `/api/cognitive`，仅在 `COGNITIVE_MODULE_ENABLED=true` 时挂载（`src/index.ts` 条件挂载，flag=false 走 404，旧路由零改动）。
- `/assignments/my` 必须注册于 `/assignments/:id` 之前（镜像 `routes/assignments.ts` 约定）。
- create 只建 `DRAFT`，`createdBy` 由 JWT 决定；`.strict()` schema 拒绝 body 携带 createdBy/status/courseSnapshot/publishedAt。
- publish 重检 Course/Config/Registry/schema，单次 `updateMany` 写 `PUBLISHED + publishedAt + 最小 courseSnapshot {id,title,courseCode}`。
- archive 仅 DRAFT/PUBLISHED→ARCHIVED，不物理删除，不提供 ARCHIVED→PUBLISHED。
- 学生 `/my` 只回 PUBLISHED + membership ACTIVE/APPROVED；**不按时间隐藏过期**。
- **GET /:id 学生侧不返回运行 config JSON**（运行 config 由 D4 解密后给）。

## 2. Git / 远程状态

- 提交：
  - `feat(cognitive): add assignment distribution API`（routes/controller/service/schema/index.ts 挂载）
  - `test(cognitive): cover assignment lifecycle and student distribution`
  - `docs(cognitive): close D3 checkpoint + add D3 assignment report`（本条）
- 已 push `origin/feature/cognitive-core`。

## 3. 文件与关键导出（`server-version/backend/src/modules/cognitive/`）

新增：
- `cognitive.routes.ts`：`/api/cognitive/assignments*`（7 条路由，见 §4 路由表）。
- `cognitive.controller.ts`：`cognitiveController`（create/list/my/get/update/publish/archiveAssignment；统一 `handleError`：ZodError→400、CognitiveServiceError→statusCode、带 statusCode 对象兜底、其余 500）。
- `assignment.service.ts`：`CognitiveServiceError`（带 statusCode 业务错误）+ create/listTeacher/listStudent/getTeacher/getStudent/updateDraft/publish/archive。

修改：
- `cognitive.schema.ts`：追加 `createAssignmentSchema`（strict + dueAt>=opensAt refine）、`updateAssignmentSchema`、`listAssignmentsQuerySchema`。
- `src/index.ts`：`if (config.cognitiveModuleEnabled) app.use('/api/cognitive', cognitiveRoutes)`。

## 4. 路由表

```text
POST   /api/cognitive/assignments            authenticate, requireTeacher   -> createAssignment
GET    /api/cognitive/assignments            authenticate, requireTeacher   -> listAssignments
GET    /api/cognitive/assignments/my         authenticate                   -> myAssignments   （在 /:id 之前）
GET    /api/cognitive/assignments/:id        authenticate                   -> getAssignment
PATCH  /api/cognitive/assignments/:id        authenticate, requireTeacher   -> updateAssignment
POST   /api/cognitive/assignments/:id/publish  authenticate, requireTeacher -> publishAssignment
POST   /api/cognitive/assignments/:id/archive  authenticate, requireTeacher -> archiveAssignment
```

## 5. 测试 / 构建 / Docker 结果

- `npm run build`（tsc）：**0 error** ✅
- `npx vitest run src/__tests__/cognitive`：**7 files / 76 tests PASS** ✅
- `npm test`（全量）：8 failed / 5 文件 —— 与 approved baseline **完全一致，0 新增失败** ✅
- Docker：`docker compose build backend` + `up -d backend frontend` → **4 服务 healthy**；运行时 `COGNITIVE_MODULE_ENABLED=true` 已注入 ✅

### Docker smoke（实测结果）

| 步骤 | 结果 |
|---|---|
| ADMIN 登录（rateK12admin） | ✅ token 获取 |
| POST /api/courses 建课 | ✅ 200 |
| psql 取 fake configId (1.0.0) | ✅ |
| POST /api/cognitive/assignments 建 DRAFT | ✅ status=DRAFT |
| POST /assignments/:id/publish | ✅ PUBLISHED + courseSnapshot{id,title,courseCode:'260819XMB'} + publishedAt |
| 学生 student-register（courseCode 自动加入） | ✅ ACTIVE |
| 学生 GET /assignments/my | ✅ 可见（count=1） |
| 学生 GET /assignments/:id | ✅ 不含运行 config JSON |
| POST /assignments/:id/archive | ✅ ARCHIVED |
| 归档后学生 /my | ✅ 不再出现（count=0） |
| 旧 API smoke（courses/assignments/checkins/questionnaires） | ✅ 均 code=0 |

## 6. DoD 核对（D3 §15）

- [x] tsc PASS
- [x] D3 tests PASS
- [x] D1/D2 Cognitive tests 继续 PASS
- [x] 全量相对 approved baseline 0 新增失败
- [x] Docker runtime 门（flag=true + pseudonym key）：teacher→DRAFT→publish→student /my→archive 可见性变化
- [x] 旧 `/api/courses`、`/api/assignments` 等仍工作
- [x] 4 服务 healthy
- [x] 无 CognitiveSession / attemptNo / randomSeed / Trial / Completion / History / UI / 物理删除 / 新权限模型 / 新 migration

## 7. D4 Handoff

```text
D3 base SHA:  cffd2d3
D3 final SHA: <push 后 HEAD>
Ahead/behind dev: 记录 push 后实际值
Build: PASS
Cognitive tests: PASS (76/76)
Full regression: 0 new failures (baseline 5 files / 8 failures)
Docker smoke: PASS (teacher/student 全链)
```

下一阶段只进入：**D4 Session / Attempt**。禁止提前创建 Session。

## 8. 已知问题 / 风险

- 任务书引用的 `Huisurvey_eduK12_New_Version_Project_Introduction_v0.1` 文档缺失（不影响执行，约束内联）。
- 8 个预存失败（checkin/scoring/cache）仍为基线，另行跟踪。
- smoke 中创建了测试课程/学生账号（D3 Smoke Course 等），供后续 D4–D6 复用或清理。
