# Cognitive D6.1 Backend Core Hardening 收口报告 v1

**Repo:** `caohuibj/eduK12-new-version`
**Branch:** `feature/cognitive-core`
**D6.1 Base SHA:** `20c2d39`（D6 收口后 HEAD）
**D6.1 Final SHA:** 见 §7

---

## 1. 背景与结论

D2–D6 代码级复核结论：Backend Cognitive Core 主体成立、架构方向正确，但合并 dev 前需先做一轮 Hardening。本阶段（D6.1）修复评审发现的 **1 个 P0（并发一致性）+ 2 个 P1（resume 语义 / Assignment 时间窗不变量）**，补齐真实 DB 并发集成测试，并收口文档 SHA。**未改任何 Prisma schema / 无新 migration / 无架构返工。**

## 2. P0 — Trial / Completion / Restart 并发数据一致性（已修复）

**问题**：appendTrial / completeSession / restartSession 原先各自"读 Session → 校验 → 写"无事务串行化，理论上允许 complete 读 trials 0,1,2 评分的同时 append 写入 trial 3 → Session=COMPLETED 但 DB 实际有 0,1,2,3，破坏"评分数据集 == 完成时冻结数据集"；append 与 restart 同样可能交错。

**修复**（不引 Redis lock，用 PostgreSQL 行锁）：
- 新增 `session-lock.ts`：`lockSession(tx, sessionId)` —— `SELECT ... FROM cognitive_sessions WHERE id = $1 FOR UPDATE`，返回 camelCase 行。
- `appendTrial` / `completeSession` / `restartSession` 三操作统一进入 `prisma.$transaction`，锁内完成 校验 → 写/评分/状态迁移 → commit。
  - append：锁内校验 owner + IN_PROGRESS → trialSchema → hash+encrypt → **锁内查重**（同 hash replay 返回 existing / 异 hash 409 不覆盖，不再依赖 P2002 兜底）。
  - complete：锁内 Load + status 分支 → frozen 版本评分 → 三列加密 → 条件 `updateMany where id+status=IN_PROGRESS` 原子 close；`CognitiveScoringInputError` → 400 且 Session 保持 IN_PROGRESS（事务回滚，零写入）。
  - restart：锁内再校验仍 IN_PROGRESS → ABANDONED + 新建 attemptNo+1（attemptNo 取自 locked 行）。

**并发集成测试**（真实 DB，`npm run test:integration`，默认 `npm test` 无 DB URL 时整组 skip）：
- complete vs append：3 轮断言 **绝无 "COMPLETED 且含评分时不存在的新 trial"**（complete 先赢 → append 400；append 先赢 → complete 400 且 IN_PROGRESS）。
- append vs restart：3 轮断言旧 session ABANDONED、新 attempt IN_PROGRESS、trial 至多落在一个 session；append 被拒时两边均无该 trial。
- complete vs complete：并发双 complete 幂等成功、仅一次状态迁移、score 一致。
- restart vs restart：并发双 restart 至多一个新 IN_PROGRESS attempt。

**运行记录**：`COGNITIVE_INTEGRATION_DB_URL=postgresql://ptool:ptool123@127.0.0.1:5433/ptool npm run test:integration` → **4 passed**（postgres 端口经临时 compose override 发布到宿主机 127.0.0.1:5433 后运行；跑完已还原，5432 仅容器内网）。注意：宿主机 Prisma 引擎无法直连容器 IP（172.18.0.x），需发布端口或容器内执行。

## 3. P1 — createSession "继续当前 attempt" 顺序（已修复）

**问题**：原实现先 `loadStartableAssignment`（重查 opensAt/dueAt/membership/archive）再找 existing IN_PROGRESS → 已开考的 session 在 dueAt 之后刷新会被 400 拒，与 D5 冻结思想不一致。

**修复**：`createSession` 调整为
```
participantKey
  → find existing IN_PROGRESS (assignmentId + participantKey)
      ├─ 存在 → 直接返回冻结的现有 Session（不重查资格）
      └─ 不存在 → loadStartableAssignment（新 attempt 才走完整资格链）→ 创建
```
Restart 保持"主动新 attempt 重新判定资格"不变（resume ≠ start new）。

## 4. P1 — Assignment PATCH 时间窗不变量（已修复）

**问题**：`updateDraftAssignment` 只在 request 同时提供 opensAt/dueAt 时 refine 校验；只 PATCH 其一可与既有行组成非法时间窗（如 opensAt 改到 dueAt 之后）。

**修复**：更新前合并计算
```
nextOpensAt = input.opensAt !== undefined ? new Date(input.opensAt) : existing.opensAt
nextDueAt   = input.dueAt   !== undefined ? new Date(input.dueAt)   : existing.dueAt
```
两者均存在且 `nextDueAt < nextOpensAt` → 400，再 update。新增 4 个单元测试（只改 opensAt 越界拒绝 / 只改 dueAt 提前拒绝 / 双字段合法通过 / 无关字段通过）。

## 5. 文档收口（P2）

- `cognitive-d5-trial-report-v1.md`：`D5 final SHA: <push 后 HEAD>` 占位收口为
  `D5 implementation SHA: 3cc07cd` + `D5 checkpoint SHA: 195b3c8`（即 D6 base），消除 "Final SHA ≠ 下一阶段 Base SHA" 的观感不一致。

## 6. 测试 / 构建 / Docker 结果

- `npm run build`（tsc）：**0 error** ✅
- `npx vitest run src/__tests__/cognitive`：**14 files / 128 passed / 4 skipped**（4 个并发集成测试默认 skip）✅
- `npm test`（全量）：8 failed / 5 文件 —— 与 approved baseline **完全一致，0 新增失败** ✅
- `COGNITIVE_INTEGRATION_DB_URL=... npm run test:integration`：**4 passed**（真实 DB）✅；跑后 fixture 清理验证 0 残留 ✅
- Docker：build backend → **4 服务 healthy**；运行时 E2E smoke（premature complete 400 + IN_PROGRESS → append 0/1/2 → COMPLETED 66.67 → append 400）✅
- 无 Prisma schema 变更、无新 migration ✅

## 7. Milestone D Backend Core Review Handoff

```text
D6.1 base SHA:  20c2d39
D6.1 final SHA: 4a327065676c48f303751d7ee45d94409f5ecfb3
Build: PASS
Cognitive unit tests: PASS (128 passed / 4 skipped)
Concurrency integration tests: PASS (4/4, real DB)
Full regression: 0 new failures (baseline 5 files / 8 failures)
Docker: 4 healthy + E2E smoke PASS
```

**当前状态**：P0 / 2×P1 / 文档 P2 已闭合。建议下一步：
1. **Milestone D Backend Core Review PASS**（架构不变量 A1–A15 / 留存矩阵 / 加密幂等语义终审）。
2. 建立 **PR CI / merge gate**（backend npm ci + prisma generate + build + cognitive tests + config tests + frontend build + docker compose config；DB 集成 / Docker E2E 仍人工）——目前 `.github/workflows` 尚不存在，且 dev 分支 8 个既有失败需正式 baseline 化。
3. 开 **PR feature/cognitive-core → dev**，merge 后进入 Frontend CognitiveRunner shell / Fake Test E2E，再 Reaction / Memory / Stroop。

## 8. 未在本阶段处理（按评审建议，另立任务）

- **CI / PR gate**（merge gate，非代码 blocker）。
- **Baseline Test Debt Closeout**：dev 分支 8 个既有失败（checkinIntegration / scoringService / checkinSecurity / checkinTokenService / utils/cache）单独收口，避免 Cognitive PR 顺手扩大范围。
- **Admin seed 硬编码**（`rateK12admin/2026coding` fallback + console.log 明文密码）属既有基线问题，Milestone G / Production blocker，单独处理。
- **Encryption key rotation 债务**（`payloadHash` 完整性密钥从 `DATA_ENCRYPTION_KEY` 派生；envelope 无 keyId/version）→ P2 Production security evolution，后续可升 envelope v2 或引入独立 `DATA_INTEGRITY_KEY`。
- **D2–D4 报告 SHA 观感**：D3/D4 已补 final SHA；如需彻底消除歧义，可统一改为 "implementation SHA + checkpoint SHA" 双字段（与 D5 一致）。
