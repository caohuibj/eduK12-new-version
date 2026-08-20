# Cognitive D5 Append-only Trial API 收口报告 v1

**Repo:** `caohuibj/eduK12-new-version`
**Branch:** `feature/cognitive-core`
**D5 Base SHA:** `0f14c91`（D4 收口后 HEAD）
**D5 Final SHA:** 见 §7

---

## 1. 范围与决策

为 IN_PROGRESS Session 提供严格校验、严格加密、append-only 的单 Trial 写入 API，落实 D1 已设计的 `payloadHash` 幂等/冲突语义。

- 唯一 API：`POST /api/cognitive/sessions/:id/trials`，body `{trialIndex, payload}`；client 不传 sessionId/payloadHash/payloadEncrypted/createdAt（strict schema 拒绝）。
- **写前校验**：session 存在 + owner + IN_PROGRESS + Registry entry（frozen 三 version）；**不重查 membership/时间窗**（资格由 D4 冻结，避免 dueAt 进行中到点阻止写入）。
- payload 必须过 `RegistryEntry.trialSchema`；成功后只加密/哈希 **parsed 值**，绝不加密原始 `req.body.payload`。
- `payloadHash = hashTrialPayload(parsed)`（D1 keyed HMAC，canonical JSON 键序无关）；`payloadEncrypted = encryptCognitivePayload(parsed)`；DB 无 plaintext payload。
- **幂等/冲突**：同 index + 同 hash → replay 返回 existing（不新增）；同 index + 不同 hash → **409**，禁止覆盖首份 raw trial（不 UPDATE / 不 DELETE 重插 / 不 last-write-wins）。
- **允许 out-of-order arrival**（0,2,1 均可写），不检查 nextTrialIndex==count；最终 sequence 由 D6 验证。

## 2. Git / 远程状态

- 提交：
  - `feat(cognitive): add append-only trial API`
  - `test(cognitive): cover trial encryption and idempotency`
  - `docs(cognitive): close D5 checkpoint + add D5 trial report`（本条）
- 已 push `origin/feature/cognitive-core`。

## 3. 文件与关键导出（`server-version/backend/src/modules/cognitive/`）

新增：
- `trial.service.ts`：`appendTrial(userId, sessionId, {trialIndex, payload?})` —— 校验 → schema.parse → hash+encrypt → create → P2002 分支（replay/409）。

修改：
- `cognitive.controller.ts`：+`appendTrial`。
- `cognitive.routes.ts`：+`POST /sessions/:id/trials`（`requireRole(STUDENT)`）。
- `cognitive.schema.ts`：+`appendTrialSchema`（trialIndex int>=0 + payload any，`.strict()`）。

## 4. 路由表

```text
POST   /api/cognitive/sessions/:id/trials   authenticate, requireRole(STUDENT) -> appendTrial
```

## 5. 测试 / 构建 / Docker 结果

- `npm run build`（tsc）：**0 error** ✅
- `npx vitest run src/__tests__/cognitive`：**11 files PASS** ✅
- `npm test`（全量）：8 failed / 5 文件 —— 与 approved baseline **完全一致，0 新增失败** ✅
- Docker：build + up → **4 服务 healthy** ✅

### Docker smoke（实测结果）

| 步骤 | 结果 |
|---|---|
| POST trial 0 → trial 2 → trial 1（乱序） | ✅ 均 200，返回 {trialId, trialIndex, createdAt} |
| DB：3 行 + unique trialIndex + encrypted + hash | ✅ |
| replay trial 1（同 payload） | ✅ 同一 trialId，仍 3 行 |
| trial 1 不同 payload | ✅ **409** "Trial index 1 already exists with different content"，原行不变 |
| 4 服务 healthy | ✅ |

## 6. DoD 核对（D5 §14）

- [x] tsc PASS
- [x] D5 tests PASS
- [x] D1–D4 tests 继续 PASS
- [x] 全量相对 approved baseline 0 新增失败
- [x] Docker/DB smoke：3 rows + unique + encrypted + hash；replay 不增行；冲突 409 原行不变
- [x] 无 update/delete/bulk/history API、无 Completion/Scoring/metrics、无 client-provided hash/encrypted、无 queue/offline sync、无新 migration

## 7. D6 Handoff

```text
D5 base SHA:  0f14c91
D5 implementation SHA: 3cc07cd（trial.service + 测试的最后实现 commit）
D5 checkpoint SHA: 195b3c8（docs closeout，即 D6 base）
Build: PASS
Cognitive tests: PASS
Full regression: 0 new failures (baseline 5 files / 8 failures)
Docker smoke: PASS (append/replay/conflict)
```

下一阶段只进入：**D6 Completion / Scoring**（服务端权威评分 + encrypted result）。

## 8. 已知问题 / 风险

- smoke 中 session（attempt=2，含 trial 0/1/2）保留供 D6 E2E 直接 complete。
- 8 个预存失败仍为基线，另行跟踪。
