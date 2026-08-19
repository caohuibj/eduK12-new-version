# Cognitive D2 Registry Contract 收口报告 v1

**Repo:** `caohuibj/eduK12-new-version`
**Branch:** `feature/cognitive-core`
**D2 Base SHA:** `aa36cc1bac1140f124c5e3a4988250ebc88eaefe`
**D2 Final SHA:** `849f6e5`（见 §7）

---

## 1. 范围与决策

D2 只解决"后端如何认识一个 Cognitive Test"，锁定后端插件契约、Fake Test 的 Config/Trial Schema 与 v1 Scorer。

- 固定链路：`CognitiveTestConfig → RegistryEntry → Config Zod Schema → Validated Config → Trial Zod Schema → Versioned Scorer`。
- 本阶段**不建立 HTTP API**，不创建 Assignment / Session，不写 Trial，不做 Completion，不做前端 Runner。
- Registry 定位键 = `testType + engineVersion + scoringVersion`；错误版本**不回退最新版**。
- Scorer 为纯函数式领域逻辑：不访问 Express / JWT / Prisma / Redis。
- 不改 Prisma schema、无新 migration。

## 2. Git / 远程状态

- 开始前：HEAD = `aa36cc1`，working tree clean，`dev...feature/cognitive-core` = `0 14`（behind 0）。
- 提交（2 条，任务书允许合并 1、2 为一条）：
  - `277f99e` feat(cognitive): add versioned registry and fake schemas
  - `849f6e5` feat(cognitive): add config status transition guard
- 已 push `origin/feature/cognitive-core`。

## 3. 文件与关键导出

新增（`server-version/backend/src/modules/cognitive/`）：
- `cognitive.types.ts`：`ScoringTrial<TTrial>`、`CognitiveScoreResult`、`RegistryEntry<TConfig,TTrial>`、`CognitiveScoringInputError`（仅领域错误，无大型错误码体系）。
- `schemas/fake.config.ts`：`FakeConfig` + `fakeConfigSchema`（`.strict()`，与 seed `1.0.0` 一致）。
- `schemas/fake.trial.ts`：`FakeTrial` + `fakeTrialSchema`（`.strict()`，`{correct, rtMs}`，`rtMs >= 0`）。
- `scoring/fake.v1.ts`：`scoreFakeV1` 纯函数（排序 → 数量==trialCount → index 0..n-1 连续 → rtMs<=maxRtMs → 计算）。
- `cognitive.registry.ts`：静态 `Map` registry；`has/get/requireCognitiveRegistryEntry`；模块加载期注册 `fake/1.0.0/1.0.0` 并查重。
- `cognitive.schema.ts`：仅轻量跨阶段 helper（`trialIndexSchema`、`versionStringSchema`），**未预写 API schema**。

修改：
- `config-immutability.ts`：**取消注释并实现** `assertConfigStatusTransition(from, to)`（仅 DRAFT→PUBLISHED、PUBLISHED→RETIRED 合法；同状态视为非 transition 抛错）；`assertConfigCoreMutable` 语义不变。

## 4. Registry key 与校验顺序

- key：`${testType}/${engineVersion}/${scoringVersion}`；Fake entry = `fake / 1.0.0 / 1.0.0`。
- 无 runtime register / unload / hot reload / filesystem discovery / remote registry。
- fake scorer 校验顺序：排序 → 数量严格相等 → index 连续性（缺口/重复均失败）→ rtMs 上限 → `correctCount/accuracy/meanRtMs/score=accuracy*100`。

## 5. 测试 / 构建 / Docker 结果

- `npm run build`（tsc）：**0 error** ✅
- `npx vitest run src/__tests__/cognitive`：**5 files / 49 tests PASS**（新增 registry/fake-schema/fake-scoring 3 文件 + config-immutability 扩展；既有 security/config-immutability 测试不回退）✅
- `npx vitest run src/__tests__/config/keys.test.ts`：4 PASS ✅
- `npm test`（全量）：**8 failed / 5 文件** —— 与 approved known-failure baseline **完全一致，0 新增失败**（失败文件：checkinIntegration / scoringService / checkinSecurity / checkinTokenService / utils/cache）✅
- Docker：`docker compose build backend` 成功；`up -d backend frontend` → **4 服务 healthy**（backend/frontend/postgres/redis）✅
- 无 Prisma schema 变更、无新 migration ✅

## 6. DoD 核对（D2 §15）

- [x] Base SHA 已记录（`aa36cc1`）
- [x] `cognitive.types.ts` 完成
- [x] Registry 使用 `testType + engineVersion + scoringVersion`
- [x] fake config schema 与 seed 1.0.0 一致
- [x] fake trial schema 完成
- [x] fake.v1 scorer 完成
- [x] scorer 纯领域逻辑，无 Prisma/HTTP/JWT
- [x] `assertConfigStatusTransition` 完成
- [x] Registry/schema/scorer/status tests 全过
- [x] `npm run build` PASS
- [x] Cognitive tests 0 regression
- [x] 全量测试 0 新增失败
- [x] Docker backend build PASS
- [x] 4 services healthy
- [x] 无 Prisma schema 变更
- [x] 无 API/Assignment/Session/Trial/Completion 实现
- [x] 已 push `feature/cognitive-core`

## 7. D3 Handoff

```text
D2 base SHA:  aa36cc1bac1140f124c5e3a4988250ebc88eaefe
D2 final SHA: 849f6e549a9b26a94c0e7db8e88fe1d6fe82fdfc
Registry fake key: fake / 1.0.0 / 1.0.0
Build: PASS
Cognitive tests: PASS (49/49)
Full regression: 0 new failures (baseline 5 files / 8 failures)
Docker: 4 services healthy
```

下一阶段只进入：**D3 Assignment / Distribution**。不提前创建 Session。

## 8. 已知问题 / 风险

- 任务书"设计依据"引用的 `Huisurvey_eduK12_New_Version_Project_Introduction_v0.1` 文档在当前资料集缺失，约束已内联于任务书/冻结文档，不影响执行。
- 8 个预存失败（checkin/scoring/cache）仍为基线，另行跟踪，不阻塞 Cognitive 推进。
