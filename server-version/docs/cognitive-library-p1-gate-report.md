# Cognitive Library COG-P1 Gate Report（Pilot Catalog + Dual Contract Inventory）

- 日期：2026-09-07（review 修订轮更新）
- Baseline：main @ `8a05036`（分叉点）；当前 origin/main @ `e793766`（Merge #58 Scale Library）——PR #60 与最新 main **MERGEABLE/CLEAN**，未 rewrite 既有历史
- 分支：`feat/cognitive-library-pilot-catalog`（worktree：`eduK12-cognitive-wt`）
- 性质：纯 additive 科学/产品元数据 + 文档 + 测试。**无 Runtime 热路径改动、无 scorer 改动、无 DB migration、无 payload 变化。**

## 1. Commits

| SHA | 内容 |
|---|---|
| dfd40a2 | docs: pilot library inventory v2（24 任务权威盘点） |
| d54e596 | feat: library catalog contract（轻量 catalog 自有字段） |
| d87f05e | feat: catalog registry + authoritative identity joins（import-time fail-fast） |
| dc7b903 | feat: dual scoring/research-capture contract declarations |
| 9ee60a7 | feat: audience projection contract（student/teacher/admin） |
| 6d89064 | test: catalog/contract/projection 门禁 + gate report |
| 9b587b1 | **fix(review): scope scientific status by task identity**（Fix 1/5：scientificStatus 移出 catalog family、exact-identity resolver、student/parent 删除 isPilot、admin 走 resolver） |
| （本 commit） | **fix(review): align dual contracts with authoritative facts**（Fix 2/3/4 + docs §9 措辞） |

## 2. Review 修订落实（PR #60 review Fix 1–5）

| Fix | 落实 |
|---|---|
| Fix 1 scientific status identity-scoped | `scientificStatus` 从 `CognitiveLibraryCatalogEntry`（family 级）移除；新增 `resolveScientificStatus(testType, engineVersion, scoringVersion)` + `RESEARCH_GRADE_IDENTITIES`（当前为空）→ 一切未授权身份默认 PILOT，新 engine/scoring 版本不继承。全部 27 个真实 registry identity = PILOT，无任何任务自行升级 |
| Fix 2 删除第二份 reference eligibility | 手写 `referenceEligibleMetricKeys` 声明全部删除；`deriveCognitiveScoringContract` 直接读 authoritative v2 `TaskDefinition.metrics[key].referenceEligible`（不复制 v2 adapter 计算规则）。import 边界测试改为：仅 `dual-contracts.ts` 允许 read-only `getCognitiveV2TaskDefinition`；catalog/audience-projection 禁止 import v2/registry；一切 library 文件禁止 publication-gate / cognitive/reference / reference-protocol / reference-adapter |
| Fix 3 raw facts 三分 | `requiredRawFacts` → `clientObservedFacts` / `runtimeReconstructableFacts` / `serverDerivedFacts`，24 任务全部分类，import-time 非空校验；P1 只分类不删字段，瘦身在 COG-P3 |
| Fix 4 capture current/future | `suggestedFacts` → `currentlyAvailableFacts` / `futureCaptureFacts`；真实 input modality、device provenance、viewport/dpr、per-response modality、typing timing 等一律归 future。inventory 文档废除"COS 化属存储迁移"旧表述，改为"COG-P5 同时包括 storage migration 与 research-capture enrichment" |
| Fix 5 student/parent 不暴露 maturity | `StudentParentCatalogView` 删除 `isPilot`（类型层面 + 测试断言 key 不存在）；Teacher 视图不继承 maturity，仅 domain/facet + key metrics + reference summary + interpretive boundary；Admin 视图的 `scientificStatus` 来自 exact-identity resolver。未来结果报告中的"试行参考"属 Reference status，不是工具科研成熟度 |

保留不变（review §6）：catalog family metadata（educationalPurpose/plainAbilityHint/interactionFamily/sensitivities/adminScientificNotes/knownLimitations/sourceNotes/rightsProvenance）；rtSensitivity/fineMotorSensitivity 在文档中明确为 **COG-P2 provisional audit hint**，非正式 scientific evidence。未新增 Evidence Matrix / 六级 maturity / Norm Engine / 新 taxonomy / 第二套 publication / 第二套 reference status。

## 3. Gate 检查（指令 §13 逐项）

| 检查 | 结果 |
|---|---|
| catalog identity uniqueness | ✅ Record 结构 + 显式断言 + `validateCatalogIntegrity()` import-time fail-fast |
| all 24 real tasks resolvable | ✅ 27 个真实 registry entry 全部经 testType+engineVersion+scoringVersion 解析成功 |
| fake excluded from product catalog | ✅ import-time 断言 + 测试 |
| domain derived from authoritative evidence mapping | ✅ `deriveCatalogDomainSummary` 只消费 `evidence-mapping.registry`；6 个 standalone 任务返回 `[]` |
| no second domain truth | ✅ catalog entry 字段白名单测试（10 个 catalog 自有 key，无 domain/metric/publication/reference/scientificStatus 字段） |
| scientificStatus enum only PILOT/RESEARCH_GRADE + identity scoped | ✅ resolver 测试：全部 identity=PILOT；**假想的 RESEARCH_GRADE 授予不向 sibling scorer/engine 版本继承**（reaction@1.1.0 授予后 reaction@1.0.0 仍 PILOT）；非法/未注册身份抛错 |
| publication independent from scientificStatus | ✅ 9 个 v2 PUBLISHED 任务全部同时为 PILOT；catalog/audience-projection 不 import v2/registry |
| reference status not duplicated | ✅ library 无任何 reference 状态机词汇；无人工 `referenceEligibleMetricKeys: [...]` 声明（源码级断言）；派生值 === v2 权威过滤结果（对全部 27 identity 断言） |
| catalog metadata change does not change task/scorer/runtime hash | ✅ 结构性保证：全 backend 源码扫描确认除 library 自身与测试外**零文件** import `cognitive/library` |
| raw fact boundary | ✅ 三类 facts 结构性存在且非空（import-time 校验）；CPT/Stroop/Reaction 语义 fixture 锁定代表边界 |

## 4. 测试

- `npx tsc --noEmit`：**通过（0 错误）**。
- `npx vitest run src/__tests__/cognitive/library-catalog.test.ts`：**19 项全部通过**。
- 认知回归（以最新 main merge context）：`__tests__/cognitive` + `cognitive-analysis` + `v32-1.architecture` → **56 文件 / 438+ tests passed，0 failed**（4 skip 为无 DB 集成预存约定，CI 实跑）。
- 本地环境注意（预存，非本 PR 引入，按 review §11 不做 production code 修复）：全新 checkout 的 node_modules 下 vitest 不自动加载 `.env`，跑 pr11 等依赖 `DATA_ENCRYPTION_KEY` 的测试需在 shell 导出 env（与交接文档 DATABASE_URL 静态导入链已知问题同族）；主仓库既有 node_modules 下无此现象。CI 显式配置 env，不受影响。
- **性能 gate：不适用**（纯 metadata PR 不碰 runtime hot path，不跑 K6 capacity gate）。

## 5. 行为变更 / 影响面

- 生产行为变更：**NO**（新增文件无任何 runtime 消费者；library 模块仅被测试引用）。
- 数据库：无 migration、无种子变化。FINAL payload：无变化。

## 6. 遗留风险

- `referenceEligible` 派生正确性完全依赖 v2 adapter（单一真值，无重复实现，风险在于 v2 语义后续演进时 COG-P4 需同步理解）。
- 三分 raw facts 与 capture current/future 为人工分类，COG-P3/P5 实施时可能修订（declaration 为 versioned catalog 元数据，可吸收）。
- 交互族/敏感度为 provisional audit hint（COG-P2 审计时修订）。
- 9 个无 golden 任务（COG-P3 前置）与 6 个 standalone 任务（不进 domain aggregation）已在 inventory v2 标记。

## 7. STOP

**STOPPED — waiting for formal CI + review.（PR #60 转 Ready for Review；不 merge；未进入 COG-P2，且 #54 仍 OPEN，COG-P2 前置条件未满足。）**
