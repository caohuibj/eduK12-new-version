# 分级 CI 与历史资格证据复用：独立改造

该文档记录实施边界，不授权跳过任何必需的合并检查。

## 风险分类

- L0：严格限定的非执行文档。
- L1：局部 CSS/SCSS；全局字体、主题、tokens、依赖或构建配置不适用。
- L2：独立前端单测；或明确白名单内的后端 SJT 纯单测。
- L3：限制明确的单模块业务变更，仍执行其完整模块资格。
- L4：跨模块、共享 runtime、CI 配置、依赖、安全边界或未知变化，继续使用原有严格门禁。

Git raw diff 的新增/修改类型与模式必须安全；删除、重命名、软链或混合输入默认升级 L4。分类以 PR 对最新 main 的完整变更为准，不能只取最后一个 commit 降级。

## 已接入的提速

backend-unit 仅在 PR 完整差异全由白名单 backend/src/__tests__/situational/**.test.ts 构成且没有 PostgreSQL/integration/fixture 文件时启用。
执行 Node 24.21.0 的 npm ci、Prisma 类型生成、真实变更测试集合，并要求至少有一条通过的测试。新路由仍通过原来固定的 merge gate / ready PR，门禁会重算完整 diff，避免伪造范围。

其他旧的高风险应用路径保留不变，不会因新分类器自动跳过旧门禁。

## 历史结果复用：证据验证契约

ci-qualification.mjs 提供 closureDigest 和 verifyHistoricalSuccess。跨 commit 复用必须同时证明：

1. 官方 GitHub Actions 来源的相同仓库、相同 PR、相同 base，已完成的 run（允许整体 failure）、已完成且成功的具体 job。
2. 源 run 必须关联当前 PR，源提交位于当前 PR 历史；不能跨 PR、跨主分支或使用失败/取消的证据。
3. 72 小时以内的未过期 artifact；原始归档字节与 GitHub 官方摘要一致。
4. 原始与当前的所有资格输入 blob SHA/文件模式一致，包含 .github、相关代码、测试、夹具和共享脚本。
5. 复核必须产生当前 HEAD 绑定的 REUSED_VERIFIED，不能把旧 HEAD 的绿色 check status 复制给新 HEAD。

当前阶段只实现了验证纯函数与负向测试，未接入跨 run artifact 下载/认证，也没有授权生产合并门禁使用历史证据。
要全面缩短 #601 的重复检查，需要将官方 artifact 读取、闭包证明和可审计的执行/复用结果接入每个 job。验证不成立则正常执行。不得以缓存命中替代证据。

## 简化原则

仅保留一个固定 required context merge gate / ready PR。新路由小规模增量接入；禁止先关闭旧门禁再逐步补上。逐步将 6,000 行以上的旧历史 PR 特例抽出为生命周期隔离的 reusable workflow，并在消除行为差异后删除，不做一次性不受控重写。

在独立改造 PR 验收成功前不合并、不改变 #601。

## 首个接线的跨提交复用 lane

Backend Regression 使用独立的 `backend-regression-reuse` 任务，检索相同 PR 的官方历史 Actions run。原运行的整体 CI 可以失败，但完整的 backend regression 及其每个分片、汇总必须已成功；检验原始完整报告 ZIP 的 GitHub 官方 SHA256、每个分片的真实 checkout SHA 与覆盖范围，并比较旧 checkout 和当前 checkout 的整个 Backend Regression 依赖闭包，才发放 `REUSED_VERIFIED`。

无法取得任何证明时任务输出 `reuse_backend_regression=false`，原 Backend Regression 照常执行；复核过程发生异常、未完成或缺乏报告时不准绕过门禁。所有结果都经当前 HEAD 的固定 merge gate 校验。不采用旧提交的 success status 作为新提交的结果。

注意：这是真实接线的 **Backend Regression 一个 lane**；其他昂贵检查仍使用原执行方式。分级和检查点机制将逐步扩展，不应将单 lane 的复用描述成全 CI 全自动复用。

## 过时 CI 清理（2026-11-02，PR #613）

所有“精确候选/单 PR”路线对应的 PR 均已合并，它们的固定 head/tree/run 绑定无法准入任何未来 PR，因此整体移除，而不是继续在 DAG 中保留僵尸 job：

- `ci.yml` 由 93 个 job 缩减到 46 个；`merge gate / ready PR` 的 `needs` 仅含保留 job。
- 删除所有不再被 `ci.yml` 调用的 `ci-*.yml`（survey、training、school-teacher、scale-authoring、campus、measurement-browser、shared-assessment-foundation、cognitive-step 等）、整个 `.github/evidence/`、对应 bindings/reuse/functional 脚本及测试、`maintenance-merge.py`，以及 `ci-maintenance.yml` 中固定历史 run 号的 `ops_followup`/`cache_policy_followup` 资格步骤。
- 同步删除被可复用 workflow 中的单 PR 输入（`survey_selection`、`performance_smoke`、`merge_proof`、`run_performance_tests` 等）。
- 新增 `ci-legacy-retirement.test.mjs` 断言：每个 `ci-*.yml` 都被 `ci.yml` 调用；workflow 与非测试脚本引用的 `.github/{scripts,workflows,config}` 文件都存在；被删除的历史路线不会被重新引入。
- 保留原则：每个保留 job 或脚本都应服务于未来 PR 的通用分级（见下），或是固定的合并门禁/发布/维护工具。`docs/release/README.md` 中历史小节仅作审计记录，其 bindings 与脚本已不存在，不能作为新 PR 的路线。

不在本次范围：`server-version/e2e/*`、产品源码与 `docs/evidence/**` 下的历史证据文档，未修改其内容。

## 缩短全量 CI 关键路径（2026-11-03）

PR #613 合并后的首个完整 run（41563144407，22 分 7 秒）实测：除 Backend Regression 外所有 job 均在约 13 分钟内结束（codeql 765s、browser products 501s、frontend 473s），关键路径是 Backend Regression：shard-4 1223s、shard-1 1112s、shard-2 948s、shard-3 900s、fixtures 888s。每个 shard 耗时主要是约 340 个文件的 vitest 导入/转换成本（单文件测试执行约 0.5s，导入约 3s），而不是数据库测试本身。

- 修复复用缺陷：`closureDigest` 用 ICU `localeCompare` 排序却用码元比较校验，真实仓库树上必然抛出 `Invalid or duplicate git tree entry`，导致 `backend-regression-reuse` 恒为 `RETEST_REQUIRED`，同一 PR 的每次后续推送都重跑约 20 分钟的完整回归。现改为码元排序，并以含大小写/标点路径的回归测试固定该行为。复用不变量未放宽（同一 PR 的历史 run、全部分组与汇总成功、报告 ZIP SHA256、祖先关系、整个依赖闭包摘要一致）；`.github/`、`server-version/backend/`、`server-version/scripts/` 任一变化仍重跑。每个 PR 的首轮 run 总是完整执行。
- Backend Regression 的串行 shard 由 4 个增加为 6 个（`regressionShardCount`，每个约 226 个文件，仍保持互斥且覆盖完整）；该常量同时驱动分区、报告汇总、复用验证，workflow matrix 由测试断言与其一致。串行的 `fixtures` 分组（有序 producer/consumer，约 888s）成为最长的 backend-regression job；并发峰值由 16 增加到约 18，低于免费计划 20 个并发上限。
- 回归 job 的 npm 缓存纳入 `server-version/frontend/package-lock.json`，减少每个分组约 50s 的跨树前端 `npm ci` 的下载时间。
- 未采用：并行文件执行（每组独占一个 Postgres/Redis，本机实测 80 个文件 86s→60s 且暴露共享数据库冲突）、全局 `isolate`/`pool` 调整（大量测试依赖 `vi.mock`），以及未经验证的“无 DB 文件”分类。
- 不改变：必需检查 `merge gate / ready PR`、任何断言或扫描阈值。
- 实测（PR #614 首轮全量 run 41570391106）：全流程 16m 50s（原 22m 7s）；backend regression 各组 fixtures 880s、shard-6 884s、shard-2 841s、shard-5 783s、shard-1 624s、shard-3 610s、shard-4 544s，其余 job 均 ≤ 755s。此后串行 `fixtures`（有序 producer/consumer，无法在不改变保留数据库顺序的前提下拆分）与 shard 之间的文件权重不均（轮询按文件数而非耗时分配）是剩余的关键路径；进一步按实测耗时均衡 shard 预计只再节省约 1 分钟，未在本 PR 实施。

## 保留的分级与复用（以实际代码为准）

- 分级路由：documentation、content、presentation（CSS）、frontend-test、affected-frontend、backend-unit、edge-config、cognitive-product、cognitive-intake-light、catalog-discovery、homepage-copy、maintenance、release-tooling、dependencies、A/B scoped-release；其余/混合/未知差异走 legacy/platform 全量。
- Draft 平台 PR 只运行 `pr-light-*`；重型 browser/media/ui/ops/perf 仅在 Ready 的全量路线运行；轻量路由不会激活这些 job（`content-scope.test.mjs`、`ci-topology.test.mjs` 断言）。
- 跨提交复用目前只有 `backend-regression-reuse` 一条：同仓 PR、legacy/platform 路线、失败关闭；其他检查没有跨 run 复用，同一提交内的 artifact 由 producer 构建一次、consumer 校验后使用。
- 本次清理 PR 因删除大量 CI 控制文件且修改了 browser/frontend/backend-regression 可复用 workflow，按 release 策略归为 C/legacy 全量路线；未为它新增“删除豁免”。其后仅触及轻量范围的 PR 不会激活这些重型 job。

## 下一阶段：按历史耗时均衡 Backend Regression（2026-11-04）

- 第一期只调整六个普通 shard 的**分配顺序**。用 PR #619 最后一次完整成功回归（run 41754088324）日志中的串行测试完成时间间隔，按测试目录计算保守权重；低样本目录采用 3 秒默认值。
- 保持每组文件数差值不超过一、固定 `fixtures` producer/consumer 顺序、不变的 `backendOwnedFile` 和显式排除集；所有完整文件清单、分组 inventory、失败报告和 merge-gate 检查继续拒绝遗漏。
- 基于该 run 六个普通 shard 的日志，原分组相对耗时估算约 542–780 秒；目录加权重新分配的离线模拟约 618–661 秒。**模拟不等于新 CI 实测**，且同一 runner 的导入/缓存可能变化；必须以新 PR 的 Full Gate 作为准入。
- 下一步再依据至少三轮实测更新权重或升级至按文件统计；评估独立 fixtures 链的安全拆分。不得取消安全、数据库恢复或跨浏览器必需覆盖。
