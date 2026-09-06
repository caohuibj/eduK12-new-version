# Cognitive Library COG-P1 Gate Report（Pilot Catalog + Dual Contract Inventory）

- 日期：2026-09-07
- Baseline：main @ `8a05036`
- 分支：`feat/cognitive-library-pilot-catalog`（worktree：`eduK12-cognitive-wt`）
- 性质：纯 additive 科学/产品元数据 + 文档 + 测试。**无 Runtime 热路径改动、无 scorer 改动、无 DB migration、无 payload 变化。**

## 1. Commits

| SHA | 内容 |
|---|---|
| dfd40a2 | docs(cognitive): pilot library inventory v2（24 任务权威盘点，全部字段来自代码内权威源） |
| d54e596 | feat(cognitive): library catalog contract（轻量 catalog 自有字段；scientificStatus=PILOT/RESEARCH_GRADE；交互族/敏感度） |
| d87f05e | feat(cognitive): catalog registry + authoritative identity joins（24 任务绑定；import-time fail-fast 校验 duplicate/orphan/invalid） |
| dc7b903 | feat(cognitive): dual scoring/research-capture contract declarations（仅声明；headline/primary/secondary/quality 从 registry 派生，bundleEligible 从 evidence-mapping 派生） |
| 9ee60a7 | feat(cognitive): audience projection contract（student/teacher/admin 三级显示边界；reference 摘要由调用方从 Reference Core 传入） |
| （本 commit） | test(cognitive): catalog/contract/projection 门禁测试 + 本 gate report |

## 2. Gate 检查（指令 §13 逐项）

| 检查 | 结果 |
|---|---|
| catalog identity uniqueness | ✅ Record 结构 + 显式断言 + `validateCatalogIntegrity()` import-time fail-fast |
| all 24 real tasks resolvable | ✅ 27 个真实 registry entry（24 testType，reaction/memory/stroop 双版本）全部经 testType+engineVersion+scoringVersion 解析成功 |
| fake excluded from product catalog | ✅ import-time 断言 + 测试 |
| domain derived from authoritative evidence mapping | ✅ `deriveCatalogDomainSummary` 只消费 `evidence-mapping.registry`；6 个 standalone 任务返回 `[]` |
| no second domain truth | ✅ catalog entry 字段白名单测试（11 个 catalog 自有 key，无 domain/metric/publication/reference 字段） |
| scientificStatus enum only PILOT/RESEARCH_GRADE | ✅ 全部 24 任务 = PILOT（无 RESEARCH_GRADE 证据，不自行升级） |
| publication independent from scientificStatus | ✅ 9 个 v2 PUBLISHED 任务全部同时为 PILOT（PUBLISHED+PILOT 合法共存）；library 模块源码不 import v2/registry 与 publication-gate |
| reference status not duplicated | ✅ library 源码不含任何 reference 状态机词汇（无 LITERATURE_DESCRIPTIVE 等）；teacher 视图的 reference 摘要由调用方从 Reference Core 解析传入 |
| catalog metadata change does not change task/scorer/runtime hash | ✅ 结构性保证：全 backend 源码扫描确认除 library 自身与测试外**零文件** import `cognitive/library`（hash 计算路径不可能触及） |

## 3. 测试

- `npx tsc --noEmit`：**通过（0 错误）**。
- `npx vitest run src/__tests__/cognitive src/__tests__/cognitive-analysis src/__tests__/assessment-runtime/v32-1.architecture.test.ts`：**56 文件 passed / 1 skipped，438 tests passed / 4 skipped，0 failed**（含新增 `library-catalog.test.ts` 15 项）。
- 无 DB 集成文件自动 skip，属预存本地环境约定（CI 有库实跑）。
- 本地环境注意（预存，非本 PR 引入）：全新 checkout 的 node_modules 下 vitest 不自动加载 `.env`，首次跑 pr11 等依赖 `DATA_ENCRYPTION_KEY` 的测试需在 shell 导出 env（与交接文档记录的 DATABASE_URL 静态导入链已知问题同族）；主仓库既有 node_modules 下无此现象。CI 显式配置 env，不受影响。
- **性能 gate：不适用**（指令 §13：纯 metadata PR 不碰 runtime hot path，不跑 K6 capacity gate）。全 backend 源码扫描证明 runtime/scorer/hash 路径不 import library 模块。

## 4. 架构偏离与重复工程规避

- 按指令 §0 取消项执行：**未建** ScientificEvidenceCard/证据矩阵、六级 maturity、第二套 Reference Status、Domain Registry 修改。Stage 0 的旧 PR1 建议（含分支名 `content/cognitive-library-scientific-foundation`）已废弃；分支按 §22 改为 `feat/cognitive-library-pilot-catalog`。
- `estimatedMinutes` 不复制进 catalog，投影时从 registry profiles 读取（单一真值）。
- headline/primary/secondary/quality 指标键运行时从 registry 派生并校验，catalog/contract 文件中零复制。
- `referenceEligibleMetricKeys` 是面向 COG-P4 的声明意图，逐版本校验 ⊆ metricDefinitions；不代表当前存在任何 reference。

## 5. 行为变更

- 生产行为变更：**NO**（新增文件无任何 runtime 消费者；唯一 import-time 副作用在 library 模块自身加载时，而该模块当前仅被测试引用）。
- 数据库：无 migration、无种子变化。

## 6. 遗留风险

- `referenceEligible` 与 Research Capture 建议为人工声明，正确性依赖 review（尤其 COG-P4 消费时）。
- inventory v2 的交互族/敏感度为 curate 判定，COG-P2 审计时可能修订（catalog 字段 versioned 即可吸收）。
- 9 个无 golden 任务（COG-P3 瘦身前置条件）与 6 个 standalone 任务（不进 domain aggregation）已在 inventory v2 标记。

## 7. STOP

**STOPPED — waiting for review.（Draft PR 已创建；未进入 COG-P2。）**
