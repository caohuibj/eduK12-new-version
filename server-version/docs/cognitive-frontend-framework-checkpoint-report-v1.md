# Cognitive Frontend Framework Checkpoint 收口报告 v1

**Repo:** `caohuibj/eduK12-new-version`
**Branch:** `feature/cognitive-runner`
**任务书:** `Huisurvey_Cognitive_Next_Session_Backend_Merge_and_Frontend_Runner_v1.1.md`
**Base:** `bad600a`（dev，2026-08-19）
**Final SHA:** 见 §7

---

## 1. 本阶段范围与状态

按 v1.1 §1/§13，本阶段完成 **Frontend Cognitive Framework（Runner shell + Fake Task + Browser E2E）**；**Reaction / Memory / Stroop、Baseline Test Debt Closeout、admin seed 硬编码均另立任务，本轮不做**。

```text
Stage B 完成项
  Frontend test baseline            ✓（vitest+jsdom+RTL+typecheck gate）
  Frontend Registry                 ✓（fake/1.0.0，无 latest fallback）
  Cognitive api contract            ✓（复用共享 apiClient）
  CognitiveHome / Assignment entry  ✓
  CognitiveRunner 状态机            ✓（LOADING→READY→RUNNING→…→COMPLETED + UNSUPPORTED/ERROR/RECOVERY_REQUIRED）
  CognitiveResult（只读，不重新评分）✓
  Fake Task（trial 0..2 独立 append）✓
  StudentLayout 导航 + 路由（Option A flag）✓
  Resume/Refresh 契约 + RECOVERY_REQUIRED ✓
  前端单测/组件测试                  ✓（6 files / 32 tests）
  Fake Browser E2E                  ✓（11/11 PASS）
  Docker 4 服务 healthy             ✓
  Legacy smoke                      ✓（0 新增 regression）
```

## 2. 关键实现要点

- **`src/modules/cognitive/`**（独立 domain）：`types.ts / api.ts / registry.ts / feature.ts` + `core/{runner.types,runner.state,session-ledger,useCognitiveSession}.ts` + `pages/{CognitiveHome,CognitiveAssignmentEntry,CognitiveRunner,CognitiveResult}.tsx` + `tasks/fake/{FakeTask.tsx,fake.registry.ts}`。
- **api.ts 复用共享 `src/api/client.ts` 的 apiClient**（baseURL=/api、JWT、401 处理）；未新建 axios 实例/第二套 ApiResponse（v1.1 §14）。
- **Runner 状态机**（纯 reducer，`core/runner.state.ts`）：`TRIAL_CONFLICT(409)→RECOVERY_REQUIRED`，禁止重试/猜测/重提旧 trial；`TRIAL_SUBMIT_FAILED→RUNNING`（可重试）；`COMPLETE_SUCCESS→COMPLETED`（仅携带服务器 result，客户端不持久化权威 score）。
- **Resume/Refresh（v1.1 §21）**：本地 `session-ledger.ts` 记录每笔 append 成功后的 trialIndex（可证明进度）；entry 页**先写账本再跳转**；runner 无账本 + IN_PROGRESS → **RECOVERY_REQUIRED**（实测：API 新建 IN_PROGRESS session + 无账本 context → 明确提示，无静默重跑）。
- **complete() 结果归一化**（E2E 发现并修复）：`POST /complete` 返回扁平 `{score,metrics,qualityFlags}`（completion.service），`GET /sessions/:id` 返回 `{result:{…}}`（session.service COMPLETED 分支）——hook 两种都兼容。
- **Feature Flag Option A**：`VITE_COGNITIVE_MODULE_ENABLED` 构建期注入（Dockerfile ARG/ENV + compose frontend build args，默认 false，与 backend flag 一致）；flag=false 时隐藏导航与路由入口（实测 flag=true 产物含"认知测评"）。
- **路由**（v1.1 §17）：`/student/cognitive`、`/student/cognitive/assignments/:assignmentId`、`/student/cognitive/sessions/:sessionId`、`/student/cognitive/sessions/:sessionId/result`，URL 以 Assignment/Session 为核心；StudentLayout 加"认知测评"导航（prefix active 策略）。

## 3. 测试 / 构建 / Docker 结果

- `npm run typecheck`（tsconfig.cognitive.json 严格门禁，覆盖 Cognitive 新代码）：**PASS**
- `npm run test:cognitive`：**6 files / 32 tests PASS**（registry/api/runner.state/CognitiveRunner/FakeTask/CognitiveResult）
- `npm run build`（vite）：**PASS**
- `docker compose config`：**PASS**
- 后端回归（runner 分支 = dev 基线）：**Repository regression: PASS against approved baseline**（8 failed / 5 files，0 新增；认知后端测试随 backend merge 后生效）
- Docker（`COGNITIVE_MODULE_ENABLED=true` + `VITE_COGNITIVE_MODULE_ENABLED=true` 构建）：**4 服务 healthy**

## 4. Fake Browser E2E（Playwright + Chromium 真实浏览器，11/11 PASS）

脚本 `server-version/e2e/cognitive-browser-e2e.cjs`，截图 `server-version/docs/e2e-screenshots/`：

```text
✅ login                   学生登录
✅ nav-cognitive-visible   导航"认知测评"可见（flag=true）
✅ cognitive-home          CognitiveHome 见 PUBLISHED assignment
✅ session-created         entry → POST /sessions → runner URL
✅ runner-started          READY → RUNNING
✅ trials-0-1-2-submitted  trial 0/1/2 逐笔 append（每笔等待下一试次）
✅ result-shown            服务器 score/metrics 展示
✅ result-refresh-reloads  刷新结果页恢复（不重新评分）
✅ api-created-inprogress-session
✅ recovery-required-shown 无账本 IN_PROGRESS → 明确安全提示
✅ recovery-no-silent-rerun 无作答/开始按钮（不静默重跑）
```

DB 断言（§24）：主链路 session **COMPLETED**；**恰好 3 行 CognitiveTrial / 3 个 distinct index**；payload/score/metrics/qualityFlags/configSnapshot **全部密文**；**randomSeed 保留**；recovery session 保持 **IN_PROGRESS / 0 trials**。

Legacy smoke（§31）：`/student`、`/student/scales`、`/student/profile`、`/student/courses/:id` 直接刷新均 200（nginx SPA fallback + /api proxy 正常）；`/courses/my`、`/assignments`、`/scales/available`、`/checkins` API 均 200（0 新增 regression）。

## 5. 与任务书 DoD（§33）对照

- [x] frontend test infrastructure / typecheck gate / Cognitive frontend registry / shared apiClient reused
- [x] CognitiveHome / Assignment entry / CognitiveRunner / CognitiveResult / FakeTask / StudentLayout navigation / routes frozen
- [x] Session create/resume wired / Trial append wired / Completion wired / Completed result reload works
- [x] unsafe mid-run replay prohibited / RECOVERY_REQUIRED implemented
- [x] frontend unit tests PASS / typecheck PASS / build PASS
- [x] Backend regression PASS against approved baseline / Docker 4 services healthy / Fake Browser E2E PASS / legacy smoke PASS
- [x] no Teacher Cognitive UI / no Reaction-Memory-Stroop code / no History-Export scope creep / checkpoint report written

## 6. Blockers 对照（§34）

- 后端 Core **未 merge dev**（Stage A 被 GitHub 私有仓库访问阻塞，见 §8）→ ⏳ 未闭合（不阻塞本阶段前端验证，但按 §34 属"不得进入 Reaction"的前提）
- PR CI 未验证成功（无 PR）→ ⏳
- 其余 blocker 项均不成立（前端非 host-only、Fake 有真实 CognitiveTrial、客户端不计算权威 score、Completed refresh 不重新评分、无 fallback、mid-run 不静默重跑、无新增 legacy regression、SPA 未破坏、D1 migration 无未解释变化）

## 7. Final SHA

```text
Stage B commits（feature/cognitive-runner，全部已 push）：
  d679cc9  test(frontend): add cognitive test baseline
  533090e  feat(cognitive): add frontend registry and api contract
  8dc1a1c  feat(cognitive): add runner shell and routes
  751fe56  feat(cognitive): add fake task flow
  d5c6977  test(cognitive): cover fake runner browser checkpoint
  41c6a55  docs(cognitive): close frontend framework checkpoint（本条）
HEAD: 41c6a551b2057bd534d98eb5d851c3eee9426fbe（后续收尾修复会推进，见 §7.1）
```

## 8. 已知事项 / 偏差（如实记录）

1. **分支拓扑**：`feature/cognitive-runner` 基于 **pre-merge 的 dev**（Stage A 后端 merge 被 GitHub 私有仓库访问阻塞：Connector token 无 repo 权限→私有 404；SSH deploy key 仅 git 协议）。因此本分支**不含后端 cognitive 代码**；后端回归 = dev 基线。后端 merge dev 后需将 dev 并入本分支（路径不重叠，冲突面小）。
2. **前端 typecheck 范围**：`tsconfig.cognitive.json` 聚焦 Cognitive 模块（严格门禁覆盖新代码）。全仓 `tsc -b` 存在 **~90 个 pre-existing 类型错误**（前端从未有 typecheck 门禁的存量债务，涉及约 20 个 legacy 页面），按 §13 范围纪律不在本 PR 修复，**登记为独立清理项**（与后端 baseline debt 同类）。
3. **E2E 运行环境**：浏览器 E2E 需后端 cognitive API 在线。由于 runner 分支 backend 无 cognitive 代码，E2E 期间用 `git worktree`（feature/cognitive-core）+ `docker compose -p server-version up -d --build backend` 加载 cognitive backend（frontend/DB/redis 不动）；`docker compose up -d frontend` 会因配置漂移重建 backend，需重新执行该步。登录限流（15min/5 次）遇阻时 `docker compose -p server-version restart backend` 清计数。
4. **Feature Flag**：本阶段实测 flag=true 构建；flag=false 行为（隐藏导航/路由）由构建期注入保证，CI 前端 job 不带 flag 即隐藏。
5. **E2E fixture**：`e2estudent/e2e123456`（courseCode 260819XMB 自动 ACTIVE）与 assignment "E2E Fake Test v2" 为 E2E 预留数据。

## 9. 下一步（按任务书 §43）

1. **Stage A 收尾**：解决 GitHub 私有仓库访问（PAT/gh CLI 或网页 PR）→ PR feature/cognitive-core → dev → PR CI → merge → tag `cognitive-backend-core-v1`。
2. **Runner 分支对齐**：后端 merge 后 `git merge dev` 进 feature/cognitive-runner（后端 cognitive 测试随之生效）→ 本分支 PR → dev。
3. 再进入 **Reaction**（Session 2）。

## 10. 任务书 §44 十一问验收（当前状态）

```text
1. Backend Cognitive Core 是否已 merge dev？          → ⏳（GitHub 访问阻塞，待解决）
2. PR CI 是否真实 PASS？                              → ⏳（无 PR）
3. Frontend 是否有独立 typecheck？                    → ✅（tsconfig.cognitive.json 门禁）
4. Frontend Cognitive tests 是否 PASS？               → ✅（6 files / 32 tests）
5. Fake 是否从浏览器完整运行？                        → ✅（Playwright 11/11）
6. Raw trials 是否真实加密落库？                      → ✅（DB 断言 3 行全密文）
7. 最终评分是否仍只由服务器决定？                     → ✅（客户端不提交/不持久化 score）
8. Completed Result 是否可 reload？                   → ✅（刷新恢复，不重新评分）
9. Mid-run unknown progress 是否不会被静默重跑？      → ✅（RECOVERY_REQUIRED 实测）
10. Docker 中是否完整运行？                           → ✅（4 服务 healthy + E2E）
11. 旧 eduK12 是否 0 新增 regression？                → ✅（legacy smoke + SPA 刷新全过）
```

**Milestone D 完成判定**：本阶段把 Frontend 框架与 Fake E2E 贯通（§35 链路：Auth→Assignment→Home→Registry→Runner→FakeTask→Session→Encrypted Trial→Server Scoring→Encrypted Result→Result Page 全部走通）；**剩余 Blockers 仅剩 Stage A 的 GitHub 访问与 merge**，闭合后即可正式进入 Reaction。

## 7.1 收尾修复（typecheck 收口）

E2E 后复跑 typecheck 暴露 1 处类型问题（complete 结果归一化时 metrics/qualityFlags 可空），已修：
`useCognitiveSession.ts` → `metrics: d.metrics ?? {}`、`qualityFlags: d.qualityFlags ?? {}`；typecheck / 32 tests / build 复跑全 PASS。另将 vite 配置加载产生的 `*.timestamp-*.mjs` 临时文件加入 frontend .gitignore。

## 11. Stage A 收尾完成（2026-08-20 补充）

- PR `feature/cognitive-core → dev` 已创建（#2）→ **PR CI 三 job 全 PASS** → **merge**（merge commit `0f73181`，树与 feature/cognitive-core 一致；注：期间 dev 经 PR #1 squash 至 `c22fa9b`，二次合入内容等价，已验证树零差异）。
- **Milestone D Backend Core dev SHA = `0f73181`**；tag `cognitive-backend-core-v1` → `0f73181` 已推送。
- `feature/cognitive-runner` 已 `git merge origin/dev` 同步（含 cognitive 后端；ci.yml 冲突保留升级版）→ push `abbff0c`。compose config / frontend typecheck / 32 tests 复验全 PASS。
- 任务书 §44 十一问验收：第 1 问（Backend merge dev）与第 2 问（PR CI PASS）现为 **✅**；Milestone D 剩余 Blockers 全部闭合。
