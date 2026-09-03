<!-- Commit 17: see 07-pr46-final-review-checklist.md; keep Draft PR #46; do not merge. -->
# 新电脑 / 仅 GitHub 开工 Handoff

给**另一台能访问 GitHub、没有原本地磁盘**的机器和下一个 AI。不要找 `/Users/Qiang`、`/tmp/eduK12-*`、`ptool-*` 或任何原机路径。clone 之后以仓库内文件为准。

仓库：https://github.com/caohuibj/eduK12-new-version  
进行中 PR（Draft，不要 merge）：https://github.com/caohuibj/eduK12-new-version/pull/46  
工作分支：`feature/unified-assessment-bundle-v1`

本文 GitHub：  
https://github.com/caohuibj/eduK12-new-version/blob/feature/unified-assessment-bundle-v1/docs/unified-assessment-bundle-v1/05-fresh-clone-handoff.md

---

## A. 从零 clone（第一件事）

需要：`git`、`gh`（可选）、**Node 20**（CI 用 20，不要用 Node 25 当权威）、`npm`、Docker（仅当跑 postgres integration / `release-verify-local.sh`）。Commit 3 的 focused tests **不需要** Docker。

```bash
git clone https://github.com/caohuibj/eduK12-new-version.git
cd eduK12-new-version
git fetch origin --prune
git checkout feature/unified-assessment-bundle-v1
git status -sb
git log --oneline origin/main..HEAD
git rev-parse --short HEAD origin/main
```

期望（写本文时）：

| 项 | SHA / 值 |
|---|---|
| `origin/main` | `e932298` `feat: detach unified aggregate finalization and freeze Cognitive/Form admission (#45)` |
| 工作分支 HEAD | 至少包含 `b4397b7` 或更新的 handoff commit |
| PR | #46 Draft，base=`main`，**不要 auto-merge** |

若 `origin/main` 已前进：把 `origin/main` **merge 进本分支**并重跑测试。禁止直接改 `main`，出现分叉立即停。

安装依赖（Commit 3 只需 backend）：

```bash
cd server-version/backend
npm ci
npx vitest run src/__tests__/assessment-bundle
npx tsc --noEmit
```

当时这组测试 25 passed。失败则先修环境/基线，不要开始写 registry。

读完再写代码（clone 后的路径）：

1. `docs/unified-assessment-bundle-v1/05-fresh-clone-handoff.md`（本文）
2. `docs/unified-assessment-bundle-v1/README.md`
3. `docs/unified-assessment-bundle-v1/03-implementation-plan.md`
4. `docs/unified-assessment-bundle-v1/02-frozen-branch-inventory.md`
5. `docs/unified-assessment-bundle-v1/01-gate-c-closeout.md`
6. `docs/unified-assessment-bundle-v1/04-next-session-handoff.md`（同机续作版，含 commit 4–17 细则）
7. `server-version/backend/src/modules/assessment-bundle/`

---

## B. GitHub 上有什么 vs 原机丢失什么

### 已在 GitHub，足够开工

| 资源 | 位置 |
|---|---|
| 工作代码 + 契约 + 测试 | 分支 `feature/unified-assessment-bundle-v1`，PR #46 |
| V3.2 底座 | `main@e932298`（PR41–45） |
| 产品计划原文 | `docs/unified-assessment-bundle-v1/03-implementation-plan.md` |
| 冻结分支 inventory | `docs/unified-assessment-bundle-v1/02-frozen-branch-inventory.md` |
| Gate-C **结论** | `docs/unified-assessment-bundle-v1/01-gate-c-closeout.md` |
| 参考原型代码（只读） | 远端分支 `feat/mental-health-bundle-v1` @ `bba5cdf`。**禁止 cherry-pick，禁止给它开 PR。** |

查看冻结参考：

```bash
git fetch origin feat/mental-health-bundle-v1
git log -1 --oneline origin/feat/mental-health-bundle-v1
# 需要某文件时：
git show origin/feat/mental-health-bundle-v1:server-version/backend/src/modules/mental-health-bundle/mental-health-bundle.types.ts | head
```

### 原机才有、新电脑没有、也不需要找

| 丢失物 | 处理 |
|---|---|
| `/Users/Qiang/Documents/eduK12-dev` | 用 clone 目录，不要硬编码该路径 |
| `/tmp/eduK12-gate-c-4c4g` 原始 k6 JSON | 以 `01-gate-c-closeout.md` 为准 |
| Gate-C / Gate-A / Gate-B Docker volume | 新机没有。**不要**去原机清；也**不要** `docker compose down -v` |
| 原机 `ptool-*` 容器（可能不是 e932298 镜像） | 新机没有。Commit 3 不依赖它 |
| 原机 protected worktrees | 忽略 |
| Gate-C k6 harness（/tmp 脚本） | 不重跑 Gate-C；V3.2 已冻 |

---

## C. 不可违反的约束

- 一个大型 PR（#46）、多个语义 commit；push 到 `feature/unified-assessment-bundle-v1`。
- 禁止直接推 `main`、禁止 auto-merge、除非用户明确要求不要 merge。
- 禁止整分支 cherry-pick `feat/mental-health-bundle-v1`。
- 禁止 `docker compose down -v` 打共享栈；测试用隔离 Postgres（Commit 3 的 vitest 不需要 DB）。
- 不发明 SLA；不扩 Prisma pool；不加 429 admission；不把 finalize 塞回 UNIT submit。
- 不实现 History Engine、Cross-Informant 综合/平均、实时 LLM、诊断。
- 题目/翻译/评分不得编造；没源文件就阻断该 package。
- V3.2 **已冻结**。Gate-C：mixed 75 UNIT 不被 GET finalize 拖死；last-GET ~41 rps 是 4C4G/pool=10 已接受上限。不要重开性能 PR。

---

## D. 当前进度（不要重做）

| 计划 commit | Git | 状态 |
|---|---|---|
| 1 基线 / inventory / 计划 | `9987f73` + `3b3fd7f` + handoff docs | 完成 |
| 2 契约 / snapshot v3 / reader | `60e1250` | 完成 |
| 2.1 契约硬化 | `8954b72` | 完成（commit 3 前置） |
| **3 Registry + exact dispatch** | — | **下一步，立刻做这个** |
| 4–17 | — | 未开始 |

代码：`server-version/backend/src/modules/assessment-bundle/`  
测试：`server-version/backend/src/__tests__/assessment-bundle/`

已锁定、不要推翻：

- 不是第三套 runtime：v3 和 legacy 都进现有 `compileBundleRuntime()` / `compileBundleRuntimeFromSnapshot()`。
- Reader ≠ upgrader：decrypt once → 结构分类 → 一个 parser。v3 损坏不 fallback。
- v3 Zod `.strict()`，拒绝 unknown keys。
- snapshot 顶层 `reportDefinitionKey/version` 必须等于 definition。
- `EvidenceItemV1.role = PRIMARY | SUPPORTING | CONTEXT | SAFETY`。`FACET` 只在 `MentalHealthRuleBindingV1.tier`。
- Bundle 只编排，不复制 Scale/Cognitive definition，不新建 submit/completeness。
- Facts 是投影；`evidenceSourceHashes` = Cognitive/Scale `sourceResultHash` 的 sorted unique exact set。
- `frozenAt` 在 Context facts 上，不进 context hash。
- legacy profile 仅 `standard|research`；package+protocol 同时成立 → reject。
- architecture test 扫描整个 `assessment-bundle/` 目录。

未做：Prisma migration、registry、finalizer 接线、新 API、PARENT、授权 overlay、Safety、七个 PUBLISHED 包内容。冻结分支的 SCARED/RCADS 包 **IGNORE**。

---

## E. 立刻执行：Commit 3

**目标：** `BundleAnalysisEngineRegistry`，exact `{key, version}` lookup，派到一个纯函数 engine。legacy v1/v2 **不准**进 registry。

```text
Frozen Bundle v3 → engine {key, version} → registry.resolve() → ONE pure engine → payload
```

建议文件：

```text
server-version/backend/src/modules/assessment-bundle/registry.ts
server-version/backend/src/__tests__/assessment-bundle/registry.test.ts
```

只准：`register` / `resolve` / `dispatch`。  
禁止：`resolveLatest`、`resolveCompatible`、`fallbackEngine`、`inferEngineFromPackageKey`、semver `^` / `latest`。`1.0.1` 不得落到 `1.0.0`。

Commit 3 **不要实现**四个产品引擎，只做合同 + 测试 stub（stub 不要占用产品 key，或只在测试里 register）。

| 产品 engine | 放到哪个 commit |
|---|---|
| `cognitive-domain-v1` | 4 |
| `scale-evidence-v1` | 5 |
| `mental-health-rule-v1` | 6 |
| `integrated-evidence-v1` | 13 |

输入保持窄（类型可先定义）：

```ts
BundleEngineInputV1 {
  snapshot            // FrozenAssessmentBundleSnapshotV3
  compiledRuntime     // 现有 CompiledInstrumentRuntimeV1
  evidence            // EvidenceItemV1[]
  contextFacts        // BundleContextFactsV1 | null
  aggregateInputHash  // string | null
}
```

禁止 engine 碰 Prisma / Attempt / Express / 自己解密 / 自己判断 complete。

**不要：** migration、接 `unified-aggregate-finalizer` / `composite.service` / submitter、新 API、按 packageKey 选引擎。

**最低测试：** exact hit；unknown key 拒绝；known key + unknown version 拒绝；同 key 多 version 并存；duplicate register 拒绝；无 semver fallback；一次 dispatch 只调一个 engine；architecture test 仍绿；legacy 不能靠 packageKey 进新 registry；同一 input 两次结果确定。

```bash
cd server-version/backend
npx vitest run src/__tests__/assessment-bundle
npx tsc --noEmit
```

```text
git add ...
git commit -m "feat: add exact BundleAnalysisEngineRegistry dispatch"
git push -u origin feature/unified-assessment-bundle-v1
```

保持 PR #46 Draft。做完 **停下来等用户**，除非用户说继续 commit 4。

---

## F. 其余未完成 commit（摘要）

细则在 clone 后的 `04-next-session-handoff.md` 第 4 节和 `03-implementation-plan.md`。顺序不要跳。

| # | 任务 | 检验要点 |
|---|---|---|
| 4 | `cognitive-domain-v1` + `cognitive_response_inhibition_v1`（Go/No-Go+SST） | 只读冻结 Cognitive Result；无参考不得当异常；不改 UNIT submit |
| 5 | 多 scoreKey + `scale-evidence-v1` | 只读 `criterionBand.key`；不复制 ScaleResultV2 |
| 6 | `mental-health-rule-v1` | FACET 仅 rule tier；低分≠危机；首版不触发 safety；不要 SCARED/RCADS 首发 |
| 7 | Context 定义/冻结/加密 | 幂等冻结；`frozenAt` 写入、不进 hash |
| 8 | ReportFacts projector / audience / export | HTML 非权威；provenance invariant 仍成立 |
| 9 | 授权 overlay + 管理员 Publish UI | **本 commit 才允许 additive Prisma migration**；WHO-5 仅 NON_COMMERCIAL |
| 10 | WHO-5 / SDQ / TEXI 内容 | 没官方源文件就阻断，不编造 |
| 11 | episode / PARENT / 邀请 / consent | 禁止从旧 userId 猜 subject；学生加入是 ACTIVE，家长审批不依赖学生审批字段 |
| 12 | 教师分配 / 家长自助 / observer UI | 家长只看自己作答投影；不做跨 informant 综合 |
| 13 | `integrated-evidence-v1` + 18+ Go/No-Go+ADEXI | 无阈值不得称 convergence；CONVERGENT 不进 Evidence.role |
| 14 | SafetyCase | 只消费冻结结果；Bull 仅 wake-up；test-only fixture；不接邮件/LLM |
| 15 | 显式 `{targetBundleKey, version}` reanalysis | ≠ rescoring；不覆盖旧 snapshot |
| 16 | 全量 E2E / 迁移 / 兼容 | 隔离 DB；0 非预期 skipped；不 down -v |
| 17 | 两轮 review 后再 merge | 用户明确要求才合 main |

首发七个包（不要换成冻结分支 DRAFT）：  
`cognitive_response_inhibition_v1`、`wellbeing_who5_youth_self_zh_cn_v1`、四个 SDQ/TEXI observer、`integrated_gonogo_adexi_adult_zh_cn_v1`。

---

## G. 给新对话的最短提示词

若用户只想贴一段，用这段：

```text
从 GitHub 冷启动 eduK12 Unified Assessment Bundle。
Repo: https://github.com/caohuibj/eduK12-new-version
Clone 后 checkout feature/unified-assessment-bundle-v1（Draft PR #46）。
不要使用 /Users/Qiang 或任何原机路径。
先读 docs/unified-assessment-bundle-v1/05-fresh-clone-handoff.md 并执行其中 Commit 3。
V3.2 已冻结。禁止 cherry-pick feat/mental-health-bundle-v1，禁止 docker compose down -v，禁止 auto-merge。
Node 20。backend: npm ci && npx vitest run src/__tests__/assessment-bundle && npx tsc --noEmit
做完 Commit 3 就停，等我确认。
```
