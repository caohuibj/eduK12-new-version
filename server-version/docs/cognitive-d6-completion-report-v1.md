# Cognitive D6 Completion / Scoring 收口报告 v1

**Repo:** `caohuibj/eduK12-new-version`
**Branch:** `feature/cognitive-core`
**D6 Base SHA:** `195b3c8`（D5 收口后 HEAD）
**D6 Final SHA:** 见 §7

---

## 1. 范围与决策

由服务端读取 Session 已保存的 config snapshot 与 raw trials，通过 D2 versioned scorer 完成评分，并原子写入 encrypted score/metrics/qualityFlags，关闭 Session。

- **唯一 API**：`POST /api/cognitive/sessions/:id/complete`，body = **strict `{}`**；客户端提交 score/metrics/rawData 一律被 schema 拒绝（Score/metrics/rawData 不由客户端决定）。
- **Registry 用 frozen 三 version**（session.testType/engineVersion/scoringVersion），**绝不回退"最新 scorer"**；缺失 = 服务端配置错误 500。
- **config**：decrypt `configSnapshotEncrypted` → `configSchema.parse`，**不重读 DB config**。
- **trials**：`orderBy trialIndex asc` → 逐条 decrypt → `trialSchema.parse` → `{trialIndex, payload}`；不信任未 parse 的 decrypted JSON。
- **`CognitiveScoringInputError` → 400 且 Session 保持 IN_PROGRESS**（学生可补交后再次 complete；不因一次 premature completion 自动置 INVALID）。
- **结果三列** encryptCognitivePayload，无明文副本。
- **原子 close**：`updateMany where id + status=IN_PROGRESS`；count=0 → 重读：已 COMPLETED 返回 stored result（幂等），否则 reject；无 Redis lock。
- **GET /sessions/:id 扩展**：COMPLETED 额外 decrypt 三列返回 result；不新增 `/result` endpoint。
- complete 后 status=COMPLETED → D5 自然拒绝新 trial。

## 2. Git / 远程状态

- 提交：
  - `feat(cognitive): add server-side completion and scoring`
  - `test(cognitive): cover fake end-to-end completion`
  - `docs(cognitive): close D6 checkpoint + add D6 completion report`（本条）
- 已 push `origin/feature/cognitive-core`。

## 3. 文件与关键导出（`server-version/backend/src/modules/cognitive/`）

新增：
- `completion.service.ts`：`completeSession(userId, sessionId)`（幂等/评分/原子 close；`decryptResult` 内部 helper）。

修改：
- `cognitive.controller.ts`：+`completeSession`（先 `completeSessionSchema.parse`）。
- `cognitive.routes.ts`：+`POST /sessions/:id/complete`（`requireRole(STUDENT)`）。
- `cognitive.schema.ts`：+`completeSessionSchema`（`z.object({}).strict()`）。
- `session.service.ts`（D4 已含）：`getSession` COMPLETED 分支返回 decrypted result。

## 4. 路由表

```text
POST   /api/cognitive/sessions/:id/complete   authenticate, requireRole(STUDENT) -> completeSession
```

## 5. 测试 / 构建 / Docker 结果

- `npm run build`（tsc）：**0 error** ✅
- `npx vitest run src/__tests__/cognitive`：**13 files / 122 tests PASS** ✅
- `npm test`（全量）：8 failed / 5 文件 —— 与 approved baseline **完全一致，0 新增失败** ✅
- Docker：build → migrate（no pending）→ seed（幂等 no-op）→ up → **4 服务 healthy** ✅

### Docker E2E（实测结果，最重要验收）

| 步骤 | 结果 |
|---|---|
| Teacher 建课 + publish assignment（maxAttempts=3） | ✅ |
| Student /my 可见 → POST /sessions | ✅ attempt=1 |
| **premature complete（0 trials）** | ✅ **400** "fake v1 expects exactly 3 trials, got 0"；**Session 保持 IN_PROGRESS** |
| append trials 0,2,1（乱序） | ✅ |
| complete | ✅ COMPLETED score=66.67、metrics{trialCount:3, correctCount:2, accuracy:2/3, meanRtMs:500} |
| GET /sessions/:id | ✅ COMPLETED + decrypted result（score≈66.67） |
| 重复 complete（幂等） | ✅ 返回同一 stored result |
| complete 后 append trial | ✅ **400** "Session is not IN_PROGRESS" |
| DB：session COMPLETED + 三加密列非明文 + random_seed NOT NULL | ✅ |
| DB：trials 3 行 / 3 个 distinct index | ✅ |
| 旧核心 API smoke（courses/assignments/checkins/questionnaires/classrooms） | ✅ 均 code=0 |
| 4 服务 healthy | ✅ |

## 6. DoD 核对（D6 §16）

- [x] tsc PASS
- [x] D6 tests PASS
- [x] D1–D5 tests 全 PASS
- [x] full regression = approved existing failures only，0 新增失败
- [x] Docker E2E fake chain 全通（含 premature 保持 IN_PROGRESS、幂等、append 拒绝）
- [x] 旧核心 API smoke 无回归
- [x] 无客户端 score/metrics/rawData、无 percentile/norm/导出/history/recompute/queue、无新 migration
- [x] 未顺手开始 Reaction/Memory/Stroop/UI/History/Export

## 7. Milestone D Backend Core Review Handoff

```text
D6 base SHA:  195b3c8
D6 final SHA: 3a7be823981d28d983ca7d374eb0af259c68c03c
Build: PASS
Cognitive tests: PASS (122/122, 13 files)
Full regression: 0 new failures (baseline 5 files / 8 failures)
Docker E2E: PASS (premature/complete/idempotent/append-reject + DB + old API smoke)
Ahead/behind dev: ahead 31 / behind 0
```

**建议后续**：触发一次 **Milestone D backend core review**（覆盖 A1–A15 架构不变量、留存矩阵、加密/幂等语义）；Reaction/Memory/Stroop、Frontend Runner、History、Export 需单独立任务书，不在本批次。

## 8. 已知问题 / 风险

- 8 个预存失败（checkin/scoring/cache）仍为基线，另行跟踪。
- smoke 产物（测试课程/学生/多个 assignment/session）保留在 dev DB；如需清理请单独处理（认知留存矩阵允许保留历史）。
- 任务书引用的 `Huisurvey_eduK12_New_Version_Project_Introduction_v0.1` 文档缺失（不影响执行）。
