# Cognitive D4 Session / Attempt 收口报告 v1

**Repo:** `caohuibj/eduK12-new-version`
**Branch:** `feature/cognitive-core`
**D4 Base SHA:** `5d0b78a`（D3 收口后 HEAD）
**D4 Final SHA:** 见 §7

---

## 1. 范围与决策

学生从合法已发布 Assignment 创建/继续 Session，在 `maxAttempts` 约束下管理 attempt；Session 冻结 config snapshot、版本、participantKey 与 randomSeed。

- **资格链**（`loadStartableAssignment`，9 步）：Assignment 存在 → PUBLISHED → courseId 非空 → Course 存在 → membership ACTIVE/APPROVED → 时间窗（opensAt/dueAt，null 不限）→ Config 存在 → Registry entry 存在 → configSchema.parse 成功。
- **Create body 只含 assignmentId**：不接受 userId/participantKey/attemptNo/testType/config/randomSeed（strict schema 拒绝）。
- **Attempt 规则**：已有 IN_PROGRESS → 返回同 session（继续当前 attempt）；否则已用次数（COMPLETED/ABANDONED/INVALID 均计入）< maxAttempts → `attemptNo = max+1` 新建；达上限 → 409。`@@unique([assignmentId, participantKey, attemptNo])` 冲突 → 重读，**不引 Redis lock**。
- participantKey = `getParticipantKey(userId)`（D1 HMAC，64 hex）；participantSnapshot 只存 `{nickname}` 加密；configSnapshot 存 validated config 加密；randomSeed = `randomBytes(16).hex`。
- **Restart**：仅 IN_PROGRESS→ABANDONED + 新建 attemptNo+1（重新生成 seed、重新冻结 config），`$transaction` 原子；不提供 un-abandon / reset attemptNo / delete。
- **响应不回敏感列**：participantKey / *Encrypted / userId 绝不返回；GET 返回运行信息 + decrypted config + randomSeed，**D4 不返回 score/metrics**。

## 2. Git / 远程状态

- 提交：
  - `feat(cognitive): add assignment-based session attempts`
  - `test(cognitive): cover session eligibility and restart`
  - `docs(cognitive): close D4 checkpoint + add D4 session report`（本条）
- 已 push `origin/feature/cognitive-core`。

## 3. 文件与关键导出（`server-version/backend/src/modules/cognitive/`）

新增：
- `session.service.ts`：`loadStartableAssignment`（内部 helper）、`createSession`、`getSession`、`restartSession`；`toRunnerPayload` 组装安全响应。
- `cognitive.errors.ts`：共享 `CognitiveServiceError` + NOT_FOUND/FORBIDDEN/BAD_REQUEST/CONFLICT（D3 assignment.service 复用并 re-export，controller 改从此导入）。

修改：
- `cognitive.controller.ts`：+`createSession/getSession/restartSession`。
- `cognitive.routes.ts`：+3 条 Session 路由（`requireRole(STUDENT)`）。
- `cognitive.schema.ts`：+`createSessionSchema`（仅 assignmentId）、`restartSessionSchema`（strict `{}`）。
- `assignment.service.ts`：错误类抽取至 cognitive.errors（行为不变）。

## 4. 路由表

```text
POST   /api/cognitive/sessions              authenticate, requireRole(STUDENT) -> createSession
GET    /api/cognitive/sessions/:id          authenticate                        -> getSession
POST   /api/cognitive/sessions/:id/restart  authenticate, requireRole(STUDENT) -> restartSession
```

## 5. 测试 / 构建 / Docker 结果

- `npm run build`（tsc）：**0 error** ✅
- `npx vitest run src/__tests__/cognitive`：**9 files / 97 tests PASS** ✅
- `npm test`（全量）：8 failed / 5 文件 —— 与 approved baseline **完全一致，0 新增失败** ✅
- Docker：build + up → **4 服务 healthy** ✅

### Docker smoke（实测结果）

| 步骤 | 结果 |
|---|---|
| 新建并 publish assignment（maxAttempts=2） | ✅ |
| 学生 login → POST /sessions | ✅ attemptNo=1、randomSeed 有值、config 解密返回 |
| 响应含 participantKey/configSnapshotEncrypted/userId？ | ✅ 均不含 |
| 再次 POST /sessions | ✅ 返回同一 sessionId，行数不增 |
| DB 列校验 | ✅ participant_key 64hex；config/participant snapshot 非明文；random_seed NOT NULL；attempt_no=1 |
| POST /sessions/:id/restart | ✅ 新 attemptNo=2、新 sessionId |
| DB 复核 | ✅ 旧行 ABANDONED(1) + 新行 IN_PROGRESS(2) |
| 4 服务 healthy | ✅ |

## 6. DoD 核对（D4 §16）

- [x] tsc PASS
- [x] D4 tests PASS
- [x] D1–D3 tests 继续 PASS
- [x] 全量相对 approved baseline 0 新增失败
- [x] Docker/DB smoke：participant_key/encrypted/random_seed/attempt_no 校验通过；重复 POST 返回同 session；restart 语义正确
- [x] 无 Trial persistence / Completion / score / metrics / History / 匿名 session / 跨设备 resume / server timer / Redis lock / 新 migration

## 7. D5 Handoff

```text
D4 base SHA:  5d0b78a
D4 final SHA: f9a60acc6d825ea6b91956d244e1d5d4cd5e277c
Build: PASS
Cognitive tests: PASS (97/97)
Full regression: 0 new failures (baseline 5 files / 8 failures)
Docker smoke: PASS (DB 列校验 + restart)
```

下一阶段只进入：**D5 Append-only Trial API**。

## 8. 已知问题 / 风险

- smoke 产物（测试课程/学生/两个 session）保留供 D5/D6 复用；D5 将对 IN_PROGRESS session（attempt=2）写 trial。
- 8 个预存失败仍为基线，另行跟踪。
