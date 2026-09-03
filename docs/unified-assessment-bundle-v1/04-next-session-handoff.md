# Handoff：同机续作

本文假设还能访问原来的本地仓库。若在**另一台只有 GitHub 的电脑**上开工，改用 [05-fresh-clone-handoff.md](./05-fresh-clone-handoff.md)，不要找 `/Users/Qiang` 或 `/tmp`。

同机续作：把本文整份贴进新对话即可。不要重开 V3.2 性能工作，不要 cherry-pick 冻结分支。

## 0. 立刻要做的第一件事

**Commit 3：`BundleAnalysisEngineRegistry` + exact `key@version` generic dispatch。**

不要先回头改 V32，不要接 Composite finalizer / API / Prisma / 七个 PUBLISHED 包。Commit 2 契约已硬化，review 要求先 registry、后 orchestration。

开工命令：

```bash
cd /Users/Qiang/Documents/eduK12-dev
git fetch origin --prune
git checkout feature/unified-assessment-bundle-v1
git status -sb
git rev-parse --short HEAD origin/main
# 期望：HEAD 至少包含 8954b72；origin/main 当时是 e932298
# 若 origin/main 已前进：把 origin/main merge 进本分支并重跑 focused tests，禁止改 main
```

---

## 1. 项目与约束（不可违反）

| 项 | 值 |
|---|---|
| Canonical repo | `/Users/Qiang/Documents/eduK12-dev` |
| GitHub | `https://github.com/caohuibj/eduK12-new-version` |
| 进行中 PR | Draft **#46** https://github.com/caohuibj/eduK12-new-version/pull/46 |
| 分支 | `feature/unified-assessment-bundle-v1` |
| 当时 head | `8954b72` `fix: harden Bundle v3 snapshot and legacy reader contracts` |
| 当时 `origin/main` | `e932298`（PR45 V32-4 已合入） |
| 工作方式 | **一个大型 PR、多个语义 commit**；每步 push 到 #46；**不要 auto-merge** |
| 代码改动 | 一律从最新 `origin/main` 的这个 feature 分支推进；禁止直接改 `main` |

硬约束：

- 只碰 canonical repo。不要碰 protected worktrees（`eduK12-pr39-*`、`eduK12-instrument-*`、`/tmp/eduK12-gate-*` 等）。
- 禁止 `docker compose down -v` 作用于共享 runtime。不要删 `server-version_*` / `ptool-*` 持久卷。
- DB 集成测试用隔离 PostgreSQL，不连 `ptool-postgres`。
- 不发明生产 SLA；不扩 Prisma pool；不加 429 admission；不把 finalize 塞回 UNIT submit。
- 禁止整分支 cherry-pick `feat/mental-health-bundle-v1`（远端只读参考分支 `origin/feat/mental-health-bundle-v1`，不要给它开 PR）。
- 题目/翻译/评分规则不得编造；源文件没有就阻断该 package，不要假数据。
- 不实现 History Engine、Cross-Informant 综合/平均分、实时 LLM、诊断。

V3.2 **已冻结**。Gate-C 证明 mixed 75 下 UNIT 不被 GET finalize 拖死。last-GET ~41 rps 是 4C4G / pool=10 的已接受上限。详见 `01-gate-c-closeout.md`。

---

## 2. 当前真实进度

### 已完成

| Git commit | 内容 |
|---|---|
| `9987f73` | 计划 §4 commit 1：基线 / Gate-C 收口 / 冻结分支 inventory / 实施计划原文 |
| `3b3fd7f` | Gate-C last-GET 记为已接受 pool 上限（文档） |
| `60e1250` | 计划 §4 **commit 2**：Bundle 契约、Evidence、Facts、snapshot v3、compatibility reader |
| `8954b72` | **commit 2.1 契约硬化**（review 要求，必须在 commit 3 之前） |

代码入口：`server-version/backend/src/modules/assessment-bundle/`  
测试：`npx vitest run src/__tests__/assessment-bundle`（当时 25 passed）  
`tsc --noEmit` 当时通过。

### Commit 2 已锁定的契约（不要推翻）

- **不是第三套 runtime。** v3 / legacy 都编译进现有 `compileBundleRuntime()` → `instrumentType: 'BUNDLE'`。
- **Reader ≠ upgrader。** decrypt once → 结构分类 → 只跑一个 parser。`snapshotFamily/v3` 永远进 v3，损坏 v3 不 fallback。
- v3 **拒绝 unknown keys**（Zod `.strict()`）。
- snapshot 顶层 `reportDefinitionKey/version` **必须等于** `bundleDefinition` 里的值。
- `EvidenceItemV1.role = PRIMARY \| SUPPORTING \| CONTEXT \| SAFETY`。`FACET` 只属于 `MentalHealthRuleBindingV1.tier`。不要给通用 Evidence 加 CONVERGENT/DIVERGENT。
- Bundle 只编排：slot 绑 `instrumentKey/version` + 可选 `valueSelectors`，不复制 Scale/Cognitive definition，不新建 submit/completeness/child result。
- Facts 是投影：`sourceResultHash` + selector + value + quality，不复制整份 `ScaleResultV2` / Cognitive result / raw answers。
- `evidenceSourceHashes` = Cognitive/Scale `sourceResultHash` 的 **sorted unique exact set**。Context 只用 `contextSnapshotHash`。
- `BundleContextFactsV1.frozenAt` 存在，**不进入** context hash。
- legacy `profile` 只接受 `standard \| research`；outer/inner version 与 profile 必须一致；package+protocol 同时成立 → reject。
- architecture test 扫描整个 `assessment-bundle/` 目录（commit 3 加文件后自动覆盖）。

### 明确未做（不要误当成已有）

- Prisma migration / 新表
- Engine registry / dispatch
- Composite finalizer 接线
- 新 HTTP API
- PARENT / 邀请 / 授权 overlay / SafetyCase
- WHO-5 / SDQ / TEXI / 七个 PUBLISHED 包的内容落地
- 冻结分支上的 SCARED/RCADS 综合包：**IGNORE**，不是首发产品

---

## 3. 接下来的细致开发目标（Commit 3）

### 目标

在 `assessment-bundle/` 增加 **exact lookup registry**，把冻结的 `{ engine.key, engine.version }` 派到一个纯函数 engine。legacy v1/v2 **不准**进这个 registry。

理想数据流：

```text
Frozen Bundle v3
      │
      ▼
exact engine ref { key, version }
      │
      ▼
BundleAnalysisEngineRegistry.resolve()
      │
      ▼
ONE pure engine
      │
      ▼
engine result / enginePayload（本 commit 可用 UNAVAILABLE/not_computed 或最小 stub）
```

### 建议文件

```text
server-version/backend/src/modules/assessment-bundle/registry.ts
server-version/backend/src/__tests__/assessment-bundle/registry.test.ts
```

engines 目录可以建，但 **commit 3 不要实现四个真实引擎**。只允许：

- registry 合同 + 拒绝未知 key/version
- 可选：一个 test-only stub engine（不叫产品 key，或仅在测试注册）

产品引擎放到后续 commit：

| engine | 哪个 commit |
|---|---|
| `cognitive-domain-v1` | 4 |
| `scale-evidence-v1` | 5 |
| `mental-health-rule-v1` | 6 |
| `integrated-evidence-v1` | 13 |

### Registry 只准三个能力

```text
register(key, version, engine)
resolve(key, version)
dispatch(input)
```

禁止：`resolveLatest` / `resolveCompatible` / `fallbackEngine` / `inferEngineFromPackageKey` / `inferEngineFromBundleCategory` / semver `1.x` `^1.0.0` `latest`。

`1.0.1` 绝不能落到 `1.0.0`。

### 不要把 legacy 塞进 Registry

```text
ASSESSMENT_BUNDLE v3     → BundleAnalysisEngineRegistry
LEGACY_REPORT_PACKAGE    → 现有 compatibility/compileBundleRuntimeFromSnapshot
LEGACY_ANALYSIS_PROTOCOL → 现有 compatibility/compileBundleRuntime
```

如果以后要统一入口，另做 `LegacySnapshotAdapter`（family-level），不要建 packageKey→engine 表。那是旧 dispatcher 换皮。

### Engine 输入保持窄（类型可先定义，字段可随 4/5 补齐）

```ts
BundleEngineInputV1 {
  snapshot          // FrozenAssessmentBundleSnapshotV3
  compiledRuntime   // 现有 CompiledInstrumentRuntimeV1
  evidence          // EvidenceItemV1[]
  contextFacts      // BundleContextFactsV1 | null
  aggregateInputHash: string | null
}
```

禁止 engine 接受 Prisma / Attempt / CompositeAssessment / Express。禁止 engine 自己查库、解密、判断 complete、重抽 Scale/Cognitive。

### Commit 3 不要做

- Prisma schema / migration
- 接 `unified-aggregate-finalizer` / `composite.service` / 任何 submitter
- 新 API / UI
- 改 `compile.ts` 去按 packageKey 选引擎
- 实现 WHO-5/SDQ/TEXI 内容
- 扩大 Evidence role

### Commit 3 最低测试

1. `key@version` 精确命中  
2. unknown engine key 拒绝  
3. known key + unknown version 拒绝  
4. 同 key 不同 version 可并存  
5. duplicate `key@version` register 拒绝  
6. `1.0.1` 不 fallback 到 `1.0.0`  
7. dispatch 一次只调一个 engine  
8. registry 模块禁止 Prisma、Composite finalizer、unified-final-submit import（现有 architecture test 会扫全目录，保持它绿）  
9. legacy package/protocol **不能**经 packageKey 推断新 engine  
10. 同一 frozen input 两次 dispatch 结果/hash 确定

验证：

```bash
cd server-version/backend
npx vitest run src/__tests__/assessment-bundle
npx tsc --noEmit
```

提交信息建议：`feat: add exact BundleAnalysisEngineRegistry dispatch`  
push 到 `feature/unified-assessment-bundle-v1`，保持 PR #46 Draft。

---

## 4. 其余未完成 commit（计划 §4）

每个 commit 后：focused tests + 相关 integration + lint/typecheck；关键阶段再跑前后端全量。仍是 **同一个 PR #46**。

### Commit 4 — Cognitive adapter + `cognitive_response_inhibition_v1`

**任务：** 实现 `cognitive-domain-v1`；定义 Go/No-Go + SST Bundle（cognitive-only、描述性领域画像、无认知总分）。只引用现有任务 identity，不改 UNIT submit。

**检验：** engine 只读冻结 Cognitive Result；缺源/版本不符 → limited/invalid；无参考阈值不得分类成异常；unknown engine/version 仍走 registry 拒绝；standalone Cognitive 回归不破。

### Commit 5 — Multi-score Scale + `scale-evidence-v1`

**任务：** Scale slot 一次选多个 `scoreKey`；`scale-evidence-v1` 做 WHO-5/TEXI 风格的**严格描述性**报告。分类只能读冻结 `criterionBand.key`，禁止从显示标签推断。

**检验：** 多 score selector；混用 `metricKey/scoreKey` 继续被 Evidence source union 拒绝；不复制完整 ScaleResultV2；ADEXI 现有路径不回归。

### Commit 6 — `mental-health-rule-v1`

**任务：** CORE/FACET/CONTEXT/SAFETY 规则与 feedback 版本化。`MentalHealthRuleBindingV1.tier` 使用 FACET；Evidence.role 不加 FACET。

**检验：** 未命中 CORE fail-closed；WHO-5/SDQ/TEXI/ADEXI **低分不得当危机**；首版生产 Bundle **不触发 safety**。不要把冻结分支的 SCARED/RCADS 综合包当首发。

### Commit 7 — Bundle ContextDefinition、冻结、加密

**任务：** Context 定义、归一化、加密、幂等冻结。沿用 V3.2 加密；submit 不重读原始表单行。

**检验：** required/optional/type/enum；冻结后修改拒绝；损坏密文拒绝；定义版本不符拒绝；`frozenAt` 写入、hash 不含 `frozenAt`。

### Commit 8 — BundleReportFacts projector / audience / export

**任务：** 填真实 enginePayload（不再只是 `UNAVAILABLE/not_computed`）；student/parent/teacher/admin 投影；HTML/Markdown **不是**权威。

**检验：** 原始答案和敏感 Context 不进 audience 投影；`evidenceSourceHashes` invariant 仍成立；历史 snapshot 可导出。

### Commit 9 — 授权管理 + 动态 publication overlay + 管理员 UI

**任务：** 授权记录、单管理员可自批但必须确认声明、append-only audit、批准后改动出新版本；Publish 统一校验科学/权利/语言/报告/安全/golden。`EXPIRED/REVOKED/SCOPE_MISMATCH` 停新建、目录 HOLD；在途 Attempt 按冻结截止完成。WHO-5 仅 `NON_COMMERCIAL` 可发布。

**检验：** EVIDENCE_PENDING 只告警不阻断已批准发布；私有证据资产 IDOR；locale/territory mismatch；**本 commit 才允许 additive Prisma migration**（更早不要为 registry 迁库）。

### Commit 10 — WHO-5 / SDQ / TEXI 本地化与 Scale package gates

**任务：** 落地三个 Scale 包的官方内容与 gates。TEXI 固定源版本和 item codes；翻译/回译/术语/大陆语言审核 + 签字 manifest；只描述、不声称大陆常模。SDQ 电子施测/评分必须绑已批准授权。

**检验：** 源文件不可得 → 阻断该 package，不编造题目。WHO-5 来源：https://www.who.int/publications/m/item/WHO-UCN-MSD-MHE-2024.01 ；SDQ：https://www.sdqinfo.org/py/sdqinfo/c0.py ；TEXI 年龄 13–19。

### Commit 11 — subject/respondent/episode、PARENT、邀请、审批、consent

**任务：** additive Attempt 字段；`AssessmentEpisode`；`PARENT` 角色；学生邀码；家长待审；关系全局多对多可撤销不物理删。历史行保持 null，**禁止从旧 userId 猜 subject/respondent**。当前学生加入课程是自动 `ACTIVE`，家长审批不得依赖不存在的学生审批字段。

**检验：** subject ≠ respondent；邀请过期/重放/枚举；错误教师不能批；撤销后不可再看。

### Commit 12 — 教师分配、家长自助、报告分享、observer UI

**任务：** 教师给获批家长发独立 observer 任务；家长从允许自助的 PUBLISHED 目录为绑定孩子发起。家长自助默认私有，可显式分享给当前有权限的课程负责人。家长只能看自己作为 respondent 的投影。

**检验：** 四条 observer 路径；不得看孩子自评/其他家长/教师原始答案/跨 informant 报告。本 PR **不做** SELF/PARENT/TEACHER 综合或平均分。

### Commit 13 — `integrated-evidence-v1` + `integrated_gonogo_adexi_adult_zh_cn_v1`

**任务：** Go/No-Go + 已授权 ADEXI 中文 self-report；subject 18+。只输出 complementary cross-method evidence。无参考阈值不得声称 convergence/divergence/异常/诊断。

**检验：** 年龄拒绝；engine 结果不把 CONVERGENT 写进 Evidence.role。

### Commit 14 — Safety policy / case / 通知 / 升级 worker / 员工 UI

**任务：** SafetyPolicyTemplate；持久 SafetyCase；append-only 事件；确认/处置/升级。Redis/Bull 只作 wake-up，DB 是 authority。不接邮件短信、不引入 LLM。首版生产 Bundle 不触发 safety；用 **test-only** authoritative fixture 做闭环。

**检验：** 原子建案、重复完成幂等、未授权不可见、普通低分不触发、reanalysis 不自动关旧 case。Safety 只消费 CanonicalUnitResult / BundleReportFacts / CompositeAnalysisSnapshot，禁止 raw answers/trials。

### Commit 15 — 显式版本 reanalysis

**任务：** `{ targetBundleKey, targetBundleVersion }`；只复用原冻结单项结果和 Context；缺必需 Context 拒绝；永远新增 snapshot；新 safety → 新 case。

**检验：** reanalysis ≠ rescoring；不读 raw；不覆盖旧结果。

### Commit 16 — 全量 E2E / 安全 / 迁移 / 性能 / 兼容

**任务：** 七个 PUBLISHED Bundle、observer 四路径、anonymous self、现有 standalone Scale/Cognitive/Composite 回归；空库 migrate + 当前 schema 升级。

**检验：** 0 非预期 skipped；typecheck/build/lint；授权/安全/IDOR/tamper；依赖审计。隔离库。只清本任务 fixture。结束时核对 `ptool-*` 仍在、卷还在。

### Commit 17 — 两轮独立 review、再 merge main

不要自行 merge。用户明确要求才合。合前把 `origin/main` 再合进本分支并重跑完整 gate。

---

## 5. 首发 PUBLISHED 清单（不要换成冻结分支那四份 DRAFT）

1. `cognitive_response_inhibition_v1` — Go/No-Go + SST  
2. `wellbeing_who5_youth_self_zh_cn_v1` — 9–18 自评，非商业描述性  
3. `sdq_parent_observer_zh_cn_v1`  
4. `sdq_teacher_observer_zh_cn_v1`  
5. `texi_parent_observer_zh_cn_v1`  
6. `texi_teacher_observer_zh_cn_v1`  
7. `integrated_gonogo_adexi_adult_zh_cn_v1` — 18+

IGNORE：`youth_anxiety_comprehensive_v1` 等 SCARED/RCADS 包。

---

## 6. 关键文件

| 路径 | 用途 |
|---|---|
| `docs/unified-assessment-bundle-v1/README.md` | 索引与约束 |
| `00-git-baseline.md` | git / ptool / 基线测试 |
| `01-gate-c-closeout.md` | Gate-C，不要再优化 V32 |
| `02-frozen-branch-inventory.md` | REUSE/ADAPT/REIMPLEMENT/IGNORE |
| `03-implementation-plan.md` | 产品规范原文 |
| `server-version/backend/src/modules/assessment-bundle/` | 本 PR 代码 |
| `server-version/backend/src/__tests__/assessment-bundle/` | 本 PR 测试 |
| `server-version/backend/src/modules/assessment-runtime/compiler.ts` | `compileBundleRuntime` |
| `server-version/backend/src/modules/cognitive-analysis/report-package-freeze.ts` | 旧 v1/v2；**不要**再扩大 `readLegacyOrPackageSnapshot` 的 try/catch |

---

## 7. 运行时杂项（不挡 commit 3）

- `ptool-*` 是共享生产向栈，镜像可能不是 `e932298`。不要假设它等于最新 main。不要 down -v。
- Gate-C 一次性资源：容器 `eduk12-gate-c-pg` / `eduk12-gate-c-redis` 已 stop；volume `eduk12-gate-c-pgdata` 仍在。这是 **Gate-C 任务** 的 fixture，不是 Bundle commit 3 创建的。收口时只 `docker rm` 这两个容器、`docker volume rm eduk12-gate-c-pgdata`（以及若不再需要的 Gate-A/B volumes）。**不要**碰 `server-version_postgres_data` 等。不需要为了清洁执行 `docker compose down -v`。
- 原始 Gate-C 结果在 `/tmp/eduK12-gate-c-4c4g/results/`（可能已不在）。结论以 `01-gate-c-closeout.md` 为准。

---

## 8. 给执行 agent 的最短指令

1. 核对 git：feature 分支、#46 Draft、main 无分叉或已 merge origin/main。  
2. 实现 **Commit 3 registry**，按上面「只准三个能力 / 不准 legacy 进 registry / 不准 DB」。  
3. 跑 `vitest run src/__tests__/assessment-bundle` + `tsc --noEmit`。  
4. commit + push 到 #46，保持 Draft。  
5. 停下来等 review，不要连续把 commit 4–17 一口气做完，除非用户明确说继续。  
6. 若用户说继续：严格按 commit 4 → 5 → … 顺序，每个 commit 可独立审查。
