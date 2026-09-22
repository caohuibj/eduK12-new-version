# Huisurvey 并发与访问成本优化开发执行文档 v1.0

**文档日期：2026-09-22**
**仓库：caohuibj/eduK12-new-version**
**复核基线：main@f89354d32c7ac3dc4a9abd3a6abdca851667b8b5**
**性质：实施规格与交接手册；未实施、未压测、未创建 PR。**

本文可单独交给一个没有前文上下文的新对话。它规定要做什么、不能改变什么、按什么 commit 推进、怎样证明完成。前一份调查报告仅作背景，实施不依赖它的本地路径，也不依赖任何 /tmp 快照或旧对话记忆。

## 0. 快速执行约定

### 0.1 本轮交付

默认 **3 个必做 PR、20 个计划 commit**；只有满足本文证据触发条件时，才启动 **1 个可选 PR、5 个计划 commit**。

| PR | 建议分支 | 目的 | 计划 commit 数 |
|---|---|---|---:|
| PERF-01 | perf/measurement-baseline-v1 | 可信测量、兼容基线、完整 HTTP 访问账本 | 5 |
| PERF-02 | perf/runtime-hotpath-v1 | SJT、Cognitive、reference、Controller 和 Aggregate 的确定性重复工作优化 | 9 |
| PERF-03 | perf/ingress-capacity-v1 | 解析前入口保护、媒体负载验收、4C4G 容量与生产运行手册 | 6 |
| PERF-04（条件） | perf/measured-bottleneck-v1 | 仅解决前三个 PR 后仍被实测确认的一个主导瓶颈 | 5 |

“PERF-01”等是计划编号，不是 GitHub PR number。创建 PR 后将实际 URL/number 写入进度记录。

默认依赖：PERF-01 → PERF-02 → PERF-03 → 有证据才启动 PERF-04。每个 PR 从前一 PR 已合并后的最新 main 建立，不并行修改相同热路径，不机械移植历史 PR #53/#54/#55。计划 commit 可加小型修复提交，但不得删减验收或把额外功能塞入本轮。

### 0.2 默认执行权限与边界

本文件自身不是已经执行的动作，也不授权向生产发送负载。用户在新对话要求“按本文实施”后，可进行授权范围内的实现、测试、隔离实验和提交 PR。默认工作止于可审查的 PR 与证据，不自动发布生产、变更线上账户、合并 PR 或改全仓规则；用户有进一步明确指令时按其指令执行。

日常实现选择、等价函数命名、补测试、修复本轮引入的问题无需反复请示。缺少目标主机时先完成不依赖该主机的工作，明确留下容量证据缺口，不把“未测”写成“通过”。

### 0.3 三种“完成”必须区分

1. **CODE_READY**：实现及必需正确性检查通过。
2. **MEASURED**：同条件 A/B 证据完整，给出 KEEP/REVERT/INCONCLUSIVE。
3. **CAPACITY_VERIFIED**：在目标整机 4C4G 拓扑完成正式容量、混合与故障验收。

代码可合并条件由各 PR 专节规定。没有真实 4C4G 不妨碍写代码或运行本地正确性测试，但不能宣称生产容量已验证。不能用 CI 一次绿灯替代容量验收。

### 0.4 执行前的 10 项检查

1. 找到真实 Git 仓库；不要把 ChatGPT 项目镜像目录当作开发仓库。
2. 读取当前仓库及路径下实际适用的 AGENTS.md。sources/ 如属同步参考文件，始终只读。
3. 查看工作树改动、当前分支、origin 和最新 main SHA；不覆盖别人的改动。
4. 建立隔离工作区；禁止在其他正在开发的任务目录上复用脏状态。
5. 将当前 main 与本文件基线对比，重点核对第 2 节路径。只分析相关增量，不从头重复全仓调查。
6. 检查已存在的 PERF 分支/PR/进度文件；如已有同项工作，续做它，不重复创建。
7. 检查当前 workflow、ruleset 和实际 required checks；运行时/网关改动不得误标为 content-only。
8. 确认可用的隔离 PostgreSQL/Redis、性能目标环境及 load generator。不得回退到开发共享库或生产库。
9. 生成 baseline.md、route-inventory.csv 和 state.json 的初始版本。
10. 从第一个未完成 commit 开始。相关热点已被其他 PR 修复时，以当前证据标记 SATISFIED_BY_UPSTREAM，并补本轮验收；不制造重复实现。

main 变化不自动使整份计划失效。若源码变化仍能用本文契约处理，直接更新映射继续。只有评分、冻结、授权、提交协议等发生实质冲突时，暂停受影响项，记录差异与建议，继续其他独立工作。

## 1. 不可改变的产品与正确性契约

### 1.1 本轮保持不变

- Unified FINAL_ONLY：逐题/trial/场景答案继续由本地草稿保存；不引入逐题数据库写入。
- 合法同一输入的服务端评分、quality、reference、分支轨迹与报告科学含义保持不变。
- submissionId、payloadHash、attemptEpoch、runtime hash、冻结配置和父子绑定语义保持不变。
- 同 submissionId 同 payload 可以幂等确认；异 payload 必须冲突；旧 epoch 不得提交到新 attempt。
- raw submission、UnitSnapshot、父报告的持久化唯一性和原子性保持不变。
- 账户状态、tokenVersion、role/platformRole、组织访问、同意授权和结果可见性检查保留。
- frozenReport 必须继续驱动 Cognitive 历史及已分发的报告；不能改成 live registry 文案。
- READ COMMITTED FINAL helper、现有 CAS 和 parent → child 锁序不随意更改。
- 公开入口 recoveryToken 的 header/body 兼容、CSRF、请求 cookie 和客户端重试契约保留。
- HTTP 成功响应形状默认不变；不悄悄增加内部字段，不删 SJT instrument/definition，不改成 202 异步提交。

### 1.2 本轮明确不做

前三个 PR 不引入：数据库 schema migration、评分算法变更、密文格式变更、跨请求 auth/reference/report 缓存、Redis 分布式锁、PgBouncer、Bull FINAL 队列、通用 scorer worker、多 API 生产实例、CDN 权限协议迁移。

不提高 Prisma pool 来掩盖问题；不删除事务二次校验；不缩短原始行为数据或剔除 trial 字段来追求更小 payload；不放宽 gate、golden、错误率、时间断言或权限限制。

PERF-04 只可按第 8 节选择一个被证据触发的方向。未选方向记录为 DEFERRED，并解释原因；不偷偷扩大到全系统重构。

### 1.3 两种允许的、有意行为修正

- **SJT 重试修复父聚合**：已提交 child 的合法 replay 也能继续父完成检查，处理上次 child commit 后中断的情况。成功数据仍唯一。
- **入口繁忙快速拒绝**：FINAL 请求可在 JSON parse 前收到现有可重试容量错误；这是保护资源的预期行为。合法、未过载请求结果不得变化。

其余可观察差异必须单独说明、证明符合旧契约；不能以“优化”名义改变业务。

## 2. 当前代码地图与已确认问题

以下路径相对业务仓库根目录，是基线中已存在的定位。后文新建文件名均标为“建议新建”，不要误认为当前已有。

| 范围 | 当前路径/入口 | 本轮重点 |
|---|---|---|
| SJT FINAL | server-version/backend/src/modules/situational/situational-final-submit.service.ts | normalizeSituationalSubmission、lock/reread、commit 后 finalize |
| SJT scorer | server-version/backend/src/modules/situational/situation-scoring.ts | validateSituationalResponse → validateResponses 每回答重建 Map/Set |
| SJT response/runtime | server-version/backend/src/modules/situational/situational-runtime.service.ts | 大 select、fresh 加密后再解密、响应投影 |
| SJT Controller | server-version/backend/src/controllers/situationalController.ts | 后置 binding reread、busy 错误映射 |
| Composite Controller | server-version/backend/src/modules/composite/composite.controller.ts | authenticated/public embedded SJT gate、privacy projection |
| Scale FINAL | server-version/backend/src/modules/scale/scale-final-submit.service.ts；unified-final-submit.service.ts | wrapper 定位与已加载 child、内部结果上下文 |
| Scale Controller | server-version/backend/src/controllers/scaleController.ts | FINAL 后查 binding |
| Cognitive FINAL | server-version/backend/src/modules/cognitive/final-submit.service.ts；unified-final-submit.service.ts | runtime/config 重复解析、返回内部 context |
| Cognitive scorer/snapshot | server-version/backend/src/modules/cognitive/v2/authoritative-scorer.ts；session-snapshot.ts | 已验证输入复用；通用边界防御性校验 |
| Cognitive frozen report | server-version/backend/src/modules/cognitive/profile-freeze.ts | 保留真实消费字段，拆分观测而非删读取 |
| Cognitive Controller | server-version/backend/src/modules/cognitive/cognitive.controller.ts | FINAL 后 binding reread |
| Reference | server-version/backend/src/modules/assessment-runtime/reference-binding.ts | START 批量、FINAL 同版本 parse/hash 去重 |
| Aggregate | server-version/backend/src/modules/assessment-runtime/unified-aggregate-finalizer.service.ts | headers.find、父完成观测 |
| 权限/隐私 | middleware/auth.ts；modules/organization/principal.ts；modules/assessment-relational/result-authority.ts | 实时 principal、privacy 不可省略 |
| 路由授权 | modules/composite/composite.routes.ts；modules/cognitive/cognitive.routes.ts | runOrLegacyRespondentAccess、relational final consent 等必须计入 HTTP 账本 |
| Gate | services/unitSubmitAdmission.ts；aggregateFinalizationAdmission.ts；boundedAdmissionGate.ts | 默认 UNIT 7/queue16/500ms，Aggregate 3/queue4/250ms |
| 事务 | services/questionnaireProgressService.ts | withFinalOnlyCompletionTransaction 使用 READ COMMITTED |
| 数据库池 | config/databasePool.ts | 默认 10；DATABASE_URL 显式参数优先 |
| 解析/限流 | src/index.ts；middleware/publicAssessmentRateLimit.ts | parser 在 UNIT/认证前；public limiter 为进程内计数 |
| 入口代理 | server-version/frontend/nginx.conf | 普通 API buffering 已开，不能重复宣称新增 |
| 重试 | server-version/frontend/src/services/persistence/finalDraftCapacityRetry.ts | 默认 4 attempts、抖动、Retry-After、普通429不重试 |
| 图片 | backend/src/modules/assessment-media/assessment-image-delivery.ts | auth/runtime/StoredAsset/COS proxy 成本 |
| 视频 | backend/src/modules/situational/situational-video.service.ts；modules/assessment-media/assessment-media-capability.ts | capability、冻结资源绑定，不得公开受保护资源 |
| 观测 | backend/src/services/runtimeObservability.ts；config/database.ts | 现有 phase 与 Prisma logical-call 统计优先复用 |
| 历史 harness | server-version/perf/gate-e/；backend/scripts/gate47-seed-fixtures.ts | 复用 fixture ledger、fresh accounting，扩展 current-main 场景 |
| Query budget | backend/src/__tests__/hotpath/query-budget.postgres.integration.test.ts | 现有统计不是完整 HTTP/SQL 网络往返计数 |

之前的“约5/7/12次”只是特定 service/controller 分支静态估计。实际路由还可能有组织与同意 guard；本轮不得用这些数作为完整 HTTP 的固定上限。必须通过 PERF-01 逐路由测量。

SJT 算法目标也要准确：仅回答验证上下文应从 O(R×(C+O)) 降为 O(C+O+R)，不宣称整条含评分/分支/报告的链路都变成相同复杂度。

## 3. 交付文件与恢复状态

实施时在业务仓库建议新建：

```text
docs/performance-optimization-v1/
  implementation-plan.md        # 本文件的完整副本，唯一执行规格
  state.json                    # 当前进度；不放凭证
  baseline.md                   # SHA、环境、现有行为、相关主线增量
  route-inventory.csv           # HTTP 方法、完整路径模板、guards、service、gate
  decisions.md                  # 有限的设计选择、上游已解决项、条件项结论
  query-budgets.csv              # 分场景 before/after；标明 logical/SQL 两种口径
  compatibility.md              # 不变契约、golden来源、已完成测试映射
  performance-results.md        # 可读 A/B、失败点、额定点，不只摘成功截图
  release-runbook.md            # 候选配置、限制、恢复、回滚
server-version/perf/current-main-v1/  # 建议的新一轮 harness、manifest、校验器
```

沿用现有目录更合适时允许调整，但要在 baseline.md 写映射。大体积原始数据放 CI artifact/指定证据目录，仓库保存摘要、manifest 与 checksum。数据必须能在新窗口定位，不能只写“上个窗口已通过”。

state.json 至少包含如下结构；初始值必须如实保持未执行：

```json
{
  "planVersion": "1.0",
  "repository": "caohuibj/eduK12-new-version",
  "analysisBaseSha": "f89354d32c7ac3dc4a9abd3a6abdca851667b8b5",
  "workingBaseSha": null,
  "currentPr": "PERF-01",
  "currentCommitId": "P1-C01",
  "status": "NOT_STARTED",
  "workspace": null,
  "pullRequests": [],
  "completedCommits": [],
  "evidence": [],
  "blockedItems": [],
  "conditionalDecisions": [],
  "nextAction": "核对仓库/main/已有工作并生成 baseline",
  "updatedAt": null
}
```

commit 记录含：计划 ID、实际 SHA、涉及契约、tests/结果、测量结果、证据路径。status 使用 NOT_STARTED/IN_PROGRESS/CODE_READY/MEASURED/CAPACITY_VERIFIED/BLOCKED；不得让顶层“完成”掩盖子项缺证据。条件项使用 KEEP/REVERT/INCONCLUSIVE/NOT_TRIGGERED/DEFERRED/SATISFIED_BY_UPSTREAM。

每个 commit 将必要测试一起提交，分支在每个提交点均可构建、测试无预期红灯。不可先提交失败测试再留下断开的工作状态。不靠修改预期输出、snapshot 全量重录或跳过测试制造通过。

## 4. PERF-01：测量基础与行为基线（5 commits）

**建议 PR 标题：perf: establish current-main assessment cost and capacity baseline**

目的：得到可复现的成本账本与兼容对照。此 PR 可以增加低成本观测与测试工具，不改变运行规则、gate 参数、scorer 或响应。

### P1-C01 — docs(perf): pin execution scope and runtime baseline

工作：

- 固定 main SHA、记录与分析基线的相关差异，核对现有 PR/CI，建立第3节目录和状态文件。
- 按 Scale/Cognitive/SJT/Form、standalone/embedded、authenticated/public、fresh/replay、last-unit/not-last-unit 建 route inventory。
- 显式包含 auth、组织/consent、privacy、聚合、reconciliation；不能只抄 service 调用图。
- 固定默认对照：1 API process；UNIT=7/queue16/500ms；Aggregate=3/queue4/250ms；pool=10。实际 URL 或 env 覆盖另记。
- 区分资源口径：正式目标是整机4C4G；其他主机只用于开发或可比A/B。

验收：

- 每个计划热点有当前路径与负责人/执行项。
- 新窗口单读 baseline + state 能定位下一个 commit。
- route inventory 覆盖第7.2节全部 FINAL 模板；未来新增入口需要自动覆盖测试提醒。

### P1-C02 — perf(observability): expose bounded assessment cost phases

工作：

- 复用 AsyncLocalStorage/现有 metrics；给 SJT 验证索引、snapshot parse/hash、frozen report DB读取与解密、父聚合、response build 增加必要分段。
- Prisma 逻辑调用与真实 SQL 统计分开。生产默认不打印完整 SQL/参数；SQL events 只在明确的测试采集模式启用。
- 进程 CPU/RSS/ELU、DB连接/等待、各gate active/queue/rejection 按现有低基数标签输出。
- 嵌套 phase 需标明 inclusive/exclusive，不能把重叠时间求和；进程 CPU delta 不能冒称单个并发请求CPU。
- 测试采集模式禁止 raw payload/token/用户标识进入 metrics label。任何开关均默认关闭详细敏感采集。

验收：

- 现有 metric 名字与告警契约不被无故破坏；标签集合有界。
- no-scrape 与5秒scrape对照；3轮中位数的吞吐降低超过3%或p95增加超过5%，应进一步降开销/采样，未解释前不得进入正式测量。
- 观测异常不改变业务结果；不可把 unavailable 指标填0用来宣布低负载。

### P1-C03 — test(perf): add fresh fixtures and compatibility corpus

工作：

- 扩展现有隔离 seeder，不另建不受约束的生产造数工具。
- 每次逻辑 fresh submit 消耗唯一未完成 child/epoch/submissionId；warmup与steady使用不相交fixture。
- 保留 nback-100/cpt-180 历史对照，同时覆盖当前注册任务、实际profile、可变trace；不同profile缺失时记“不支持”，不伪造。
- SJT 10/30/60场景、多通道、线性/分支；新增“很多回答共享同一验证索引”的压力样本。
- Scale 覆盖最长合法题量、有/无reference；共享version但多个score selection的reference样本。
- 用当前基线生成稳定输入及预期评分/hash/报告；所有ID/账户均为测试专用，凭证不提交。

验收：

- fixture pool不足、意外 first-attempt replay、错误epoch、输入身份不符均使实验失败。
- 负向样本明确400/403/409等预期，不计入正常负载成功率。
- golden 不依赖随机IV/密文字节；固定时钟和seed，比较解密后的语义、payloadHash、definition/runtime身份。
- 生产内容/科学定义目录不加入fixture；测试内容不得变成可发布资源。

### P1-C04 — test(perf): implement full-request accounting and repeatable reports

工作：

- 新一轮 runner复用k6 existing library，补SJT、mixed、start/resume、媒体、same-parent、故障恢复。
- 对齐真实客户端默认4次retry、Retry-After与抖动；不把普通429自动重试。
- 记录 offered/start/drop/fresh/replay/retry/HTTP error类别；DB durable delta与逻辑完成对账。
- 每轮run manifest记base/head、image digest、host/cgroup、完整非敏感参数、fixture checksum、时间窗口与原始证据位置。
- 超过rate ceiling、出现OOM/持续错误/fixture耗尽可自动停止；只清理本轮ledger资源。
- 输出summary JSON + CSV + Markdown；校验器缺指标/空样本/负计数/不一致时退出非0。

验收：

- 构造“全部replay、只发503、k6 dropped iterations、commit成功但响应丢失”四类场景，汇总不能误报高容量。
- 记录窗口内持久化完成率和窗口结束后drain完成率，不能把drain成功除以steady时间夸大吞吐。
- 负载机与被测机共享资源时显式UNQUALIFIED_FOR_CAPACITY。
- 新测试脚本应有 package script 或文档化命令；新增命令名在完成前不得被报告为“现有可用”。

### P1-C05 — docs(perf): record baseline query and latency evidence

工作：

- 先跑本地/隔离正确性和低速HTTP smoke，随后在可用相同主机采before基线。
- 对每条代表路由输出模型调用分布、SQL事件数、响应字节、phase latency。
- 单独记录generic vs relational/organization；unknown status不得被当成non-relational跳过检查。
- PostgreSQL实体表基数、索引、ANALYZE状态必须记入manifest。
- 明确每个优化候选的前置观测是否出现，列出必要/条件/暂缓项。

验收与PR出口：

- CODE_READY：工具自检、低速fresh accounting、完整HTTP query budget、正确性corpus、类型/相关测试均通过。
- **PERF-01可在非4C4G但有真实隔离PostgreSQL的环境建立可比基线后合并**；容量状态仍未验证。
- 连真实PG基线都没有时保持Draft，不把mock调用次数当SQL证据；继续完成不受阻的工具部分。
- 新增工具及观测不改变业务输出，不调运行参数；当前PR head所需CI完成。

## 5. PERF-02：运行路径去冗余与SJT恢复（9 commits）

**建议 PR 标题：perf: remove repeated assessment validation and database work**

目标：集中完成已确认的运行路径优化。提交数较多但属于同一“减少重复工作且保持语义”的交付；每个commit单独可回退。

### P2-C01 — test(runtime): pin finalization and privacy invariants

工作：

- 在PERF-01 corpus上补实际PostgreSQL并发、权限与响应兼容断言。
- 建立下表的测试映射；针对“释放UNIT后才聚合”等新行为，测试与实现放到对应后续commit，不在这里留下红灯。
- 覆盖当前全部exact Cognitive identities的代表合法输入与历史snapshot，不以旧任务固定数量为上限。
- 明确允许变化仅是第1.3节；其他输出按相同输入/时钟逐字段对照。

最低矩阵：

| 场景 | 必须结果 |
|---|---|
| fresh成功 | 一份raw、一个有效unit snapshot，合法结果一致 |
| 同id同payload并发 | 持久化只发生一次；成功replay返回winner结果 |
| 同id异payload/异id抢同attempt | 沿用当前冲突契约，无覆盖 |
| restart/parent close与FINAL竞争 | stale请求不能污染新epoch/终态 |
| anonymous recovery错误/跨parent item | 拒绝，无数据写入和结果泄露 |
| frozen config/runtime/reference篡改 | fail closed |
| 普通、observer、cohort-only、organization | 原有结果可见性一致 |
| raw create/update/snapshot中途失败 | 事务原子性，不留下半完成 |
| child commit后HTTP丢失 | 恢复后可确定唯一结果 |

### P2-C02 — perf(situational): reuse response validation indexes

工作：

- 建立一次性的scene/channel/options验证上下文；整份FINAL复用，不能每candidate重建。
- 保留重复回答检查和原有错误优先级；批量化不能把原403/409变成500，或改变前端依赖的error code。
- 保留规范化顺序、分支轨迹、required reachable和terminal验证。
- 范围查找如一起改，必须复用相同key索引，保留原累加顺序与浮点行为；不修改scoring权重。

验收：

- 有效corpus payloadHash、trajectory、score、quality、range逐字段一致。
- 错误类型/公开code/status一致；不要求内部堆栈文本相同。
- 10/30/60场景及大合法样本上一次FINAL仅构造一次完整回答验证索引。
- 在3轮交错A/B微基准中，60场景多通道的验证phase中位CPU或墙钟下降目标≥20%；若不足，报告分段原因，不能造整体吞吐收益。
- 小场景端到端非劣标准见第9节。结构改善明确但墙钟噪声过大时标INCONCLUSIVE，保留证据不夸大。

### P2-C03 — fix(situational): release unit admission before aggregate recovery

确定的目标流程：

```text
route auth/consent/schema
  → submit orchestration（全路径只有一个UNIT gate owner）
      → UNIT gate:
           load/authorize/frozen validate/normalize
           → fresh score/encrypt/short transaction 或合法replay
           → 返回 internal committed context
      → UNIT已释放
      → embedded fresh或合法replay：await 父聚合/恢复
      → privacy projection
      → 原HTTP响应
```

工作：

- 建议由一个共享service wrapper负责UNIT acquisition，三个Controller（standalone/auth embedded/public embedded）调用同一wrapper，删除外围重复gate。
- 内部persist函数不做父聚合；直接service调用也不能意外绕过生产必需gate。测试需要低层入口时限制导出/命名，路由不得引用。
- standalone不做父聚合。embedded fresh和已验证replay均可触发父完成检查，不对异payload冲突触发修复。
- 保持同步HTTP契约；不改202、不fire-and-forget。
- 对聚合繁忙统一映射现有completion busy → HTTP503 + Retry-After；检查SJT与Composite错误handler，不能掉进generic500/400。
- 子提交已持久化、父聚合失败时，不回滚已完成child，也不删除浏览器草稿后假装整卷已完成；重试/GET恢复有明确路径。
- 若被父重启/关闭竞争影响，按当前epoch语义回报stale；不能把“旧child确曾提交”误投影为新parent成功。

验收：

- 人工阻塞aggregate阶段时，UNIT active已释放；其他Scale/Cognitive可取得UNIT。
- Aggregate queue full/timeout三入口均得到可重试响应；默认4次客户端逻辑仍适用。
- child commit后kill进程，再合法replay/GET可完成父聚合，无新增raw/snapshot。
- 2/10/50 same-parent重复触发及多parent并发，保持唯一结果与无名额泄漏。
- cancellation/error/early return都释放名额；不把req.close当作事务自动已回滚。
- 保留现有aggregate gate；不得为减少503取消限制。

### P2-C04 — perf(final): reuse authoritative child bindings across response paths

工作：

- 三族内部返回区分公开data与internalContext，例如 { data, internalContext }；具体命名可适配现有类型。
- internalContext至少提供可信compositeAttemptId及必要epoch，来源必须是已授权且提交/replay确认的数据库记录。
- Controller取data作HTTP响应，使用internalContext调用原privacy projection，消除提交后再查child binding。
- 不把内部字段混进data后依靠黑名单delete；类型与序列化测试保证不会泄露。
- Scale wrapper初始findFirst/findUnique若能返回统一child投影并传入core，可以省掉紧随的同child重复加载；所有owner/parent binding验证仍执行。
- 仅复用身份，不顺便缓存mutable principal/consent/结果可见性。result-authority的parent/policy检查本commit保持。

验收：

- 适用generic authenticated三族HTTP路径各少1次后置child查找；不适用路径标N/A，不硬凑总次数。
- 同一逻辑child的wrapper定位/加载去重有独立before/after记录。
- 普通/匿名/relational/cohort-only/organization响应投影与错误一致。
- 在初始load与commit之间插入restart/binding冲突测试，context不得来自失败方计算。
- 直接公开响应中无internalContext、额外parent身份、冻结秘钥或policy数据。

### P2-C05 — perf(situational): narrow commit reads and reuse fresh response values

必做：

- 建立专用transaction read投影，仅含owner/binding、状态、epoch、runtime指纹、提交身份及replay需要的结果；不重复传输已经验证的完整runtime blob。
- fresh winner使用已验证且确实提交的result/canonicalResult构建原响应，避免加密后马上解密。
- replay/竞争失败方必须读取winner持久化结果；保留历史/GET解密校验。
- 返回结构仍包含原instrument/definition；本轮不缩短公共响应协议。

条件工作：

- 仅当P1/P2证据显示lock+reread是实质成本时，合并child lock-and-read。
- SQL必须参数化，显式列选择、显式锁目标，保持parent→child顺序；关系读取/类型映射不得偷漏。
- 若为了合并一次读取反而增加关系查询或破坏可审查性，保留锁+窄read，记录NOT_TRIGGERED/INCONCLUSIVE，不视为遗漏。

验收：

- fresh数据库返回字节下降，legacy/terminal/replay不丢字段。
- fresh不再执行刚生成结果的解密；结果内容与replay完全一致（除允许的replayed标志）。
- 若合并lock-read，目标路径真实SQL减少1次并通过PG并发/权限测试；不能仅凭Prisma计数声明减少。
- 加密失败、损坏持久化结果、CAS失败路径不返回未提交结果。

### P2-C06 — perf(cognitive): reuse verified request preparation

工作：

- 引入仅内部可构造的PreparedCognitiveContext，整合同一次请求对session snapshot、compiled runtime、protocol signature与config schema的验证。
- 先完成权威snapshot校验，再准备trials、预算、canonical hash；scorer消费同一只读validated config/runtime/trials。
- 通用runAuthoritativeScorer对未准备输入仍完整验证。可拆内部已验证入口，但不得允许任意JSON/布尔标记跳过校验。
- 不把TypeScript类型标记当成运行时授权；通过闭包/模块私有构造与路由调用边界确保用户无法构造prepared对象。
- 只复用本请求；不新增全局snapshot cache。避免给对象多次deep-clone抵消收益。
- 如scorer会修改输入，先查明并修复为行为等价的局部copy；不共享可变对象。
- loadFrozenMeasurementContext保留，并继续使用四类frozen report字段；DB与解密观测分开。

验收：

- valid config/runtime/protocol在统一准备边界各完整校验一次，后续不重复执行同一全量parse/hash；任务内部科学校验不计作应删除重复项。
- 全部当前exact identities的合法fixture及适用profile通过；历史冻结snapshot兼容。
- 刻意篡改configHash、runtimeHash、protocolSignature、trial order/phase、maxTrials、schema、reference applicability仍拒绝。
- 普通入口与内部prepared入口得到相同score/quality/report/payloadHash；不比较随机密文。
- request CPU/allocation降低或结构性重复被移除且端到端非劣；未测到收益不能宣称提升百分比。

### P2-C07 — perf(reference): batch freeze lookups and deduplicate request work

工作：

- START按instrumentType+instrumentKey+referenceVersion去重，用findMany批量读取；不要改成无界Promise.all产生N个并发查询。
- 更新ExactReferenceDb等类型和调用方mock；真实Prisma/transaction client均可用，不用unsafe全局prisma绕开caller transaction。
- 每个唯一version只构造定义/hash一次，按原selections顺序输出bindings；允许多个score指向同一version。
- FINAL保持至多一次批量读；同version复用definition/hash，再对每个binding逐一验证其expected referenceHash。
- START继续要求ACTIVE；FINAL按现有hash/status契约，不能用缓存忽略数据库改变。

验收：

- 0 selections → 0 DB；1/10/50 selections → 1批查询（在当前schema合法规模内）。
- 相同version有冲突expected hash的binding必须失败，不能因去重漏检。
- missing/version mismatch/status变化/坏definition行为一致。
- bindings顺序、内容、hash与原实现相同。
- 不引入跨请求缓存，不修改reference身份/冻结格式。

### P2-C08 — perf(aggregate): index snapshot headers once

工作：

- 用一次headerBySlot构建代替requiredSlots循环内headers.find。
- 使用现有completeness/duplicate校验；Map不能悄悄把重复slot覆盖后当合法输入。
- 不把本commit扩大为single-flight、任务队列或预先缓存结果。
- 不擅自减少父权威状态重读或隐私查询；这些不是简单索引优化。

验收：

- 5/20/50/100单元、缺slot、重复slot、错误epoch、payload/header身份不一致场景。
- aggregateInputHash、报告、排序与终态完全一致。
- 匹配工作按slot/header总数线性增长；整个Aggregate耗时收益如实报告。

### P2-C09 — test(perf): close runtime optimization evidence and recovery gates

工作：

- 对P2-C02…C08逐项保存临近父commit vs 当前commit的微基准/调用预算；PR整体做P1合并基线 vs 最终head的full HTTP A/B。
- 所有候选按第9节决策；未触发lock合并须有明确记录。
- 重新跑SJT standalone/embedded/branching、三族FINAL、relational privacy、reference、aggregate、client retry/草稿恢复。
- 在真实PG上故障注入，附durable accounting。
- 若主线已变，更新最终base/head并重测受影响部分，不能引用过期head通过结果。

PR出口：

- 所有必做正确性/兼容/query-budget通过，无必需PG suite skip。
- 确认重复操作已减少，full HTTP在相同可比环境非劣；不能仅用unit mock测量。
- 允许未有目标4C4G正式容量认证，但本PR的可比A/B必须存在。
- 受影响浏览器流程通过，当前head所需Full Gate完成。可合并状态为CODE_READY+MEASURED；CAPACITY_VERIFIED留给PERF-03。

## 6. PERF-03：入口保护、媒体负载与4C4G验收（6 commits）

**建议 PR 标题：perf: bound final ingress and verify production capacity**

核心设计已固定：先做有界、无等待的FINAL入口保护，不在本轮重排整个auth/parser架构，不引入新缓存协议。

### P3-C01 — test(ingress): inventory final routes and resource-bound cases

工作：

- 建立与route inventory一致的FINAL路径匹配规则，用集成测试确认没有漏入口/误挡资源上传。
- 所有FINAL路由在JSON parse之前接受同一个进程级入口预算，不依赖body的token/用户ID。
- 覆盖Content-Length缺失/超限、chunked、gzip（遵循当前支持范围）、坏JSON、错误Content-Type、断连、慢客户端、header/recovery兼容。
- 记录Nginx缓冲已有事实；加入真实proxy smoke，不能只测绕过Nginx的supertest。

验收：第7.2节入口清单逐条至少一个正常与容量拒绝用例，路径query/trailing slash/大小写等与Express真实匹配规则一致；不通过宽泛“路径包含submit”保护所有写接口。

### P3-C02 — feat(ingress): bound final requests before body parsing

目标：

- 建议新增FINAL_INGRESS_LIMIT；实验初始值32，仅为候选值，PERF-03后续校准后固定。
- 在request observability、基本header/CORS处理之后，JSON/urlencoded parser之前，对已识别FINAL请求获取permit。
- **入口队列为0**：满额立即用现有ASSESSMENT_SUBMIT_BUSY语义返回503和Retry-After。指标gate单列final_ingress；不修改public429的意义。
- permit覆盖整个已接纳HTTP请求的解析、auth、UNIT等待、提交、Aggregate与response；只保护parser瞬间后释放不合格。
- finish/close/error路径释放且仅释放一次；固定实现契约为“响应已结束或断开，并且该请求已登记的服务器工作全部结束”才释放。引入仅内部使用的请求工作计数/生命周期token，在parser回调、auth/consent异步guard、FINAL orchestration的首个await之前登记，finally注销；Express next交接不得出现permit已释放而后续任务才登记的空隙。
- 客户端close后，尚未开始的下游阶段不再派发；已经开始的UNIT队列等待、scorer、事务、聚合继续按原契约完成并保留token，不能因socket关闭擅自宣称回滚。每个受保护路由必须由适配器追踪完整异步链，不能只包最后Controller。无需把这个机制扩展为全站中间件框架。
- 若当前路由组织无法证明上述生命周期，先用focused HTTP测试复现并重构最小受保护路由适配层；不得以“close就release+已有UNIT大概能保护”为替代实现。测试必须证明断连后真实工作仍受界限约束。
- early reject不要把完整body再次读入JS对象；网络连接关闭/keepalive行为由受控HTTP处理，不能无界drain或泄漏socket。
- Content-Length只作快速拒绝；实际body parser字节限额继续是权威，不信任header绕过限制。
- 内存预算按原始body+JS对象+trials+canonical bytes+加密输出等多份表示测算；32×2MiB不是总RSS上界。

验收：

- 满额后的请求JSON parser调用为0，无authDB/scorer/transaction工作。
- malformed/413/401/403/429/503/成功/连接中断后无permit泄漏。
- 断连后仍执行的slow scorer/DB事务不会使真实工作数超过预算。
- 混合长短任务下已接纳请求可完成；health等非FINAL不被同一gate挡住。
- 进程内计数事实写入文档；不得宣称分布式全局保护。

### P3-C03 — test(ingress): preserve proxy and client retry contracts

工作：

- 保持JSON2MiB及既有业务canonical限额，不因个别样本较小而任意收紧。
- 保留multipart上传例外、普通API buffering、CSRF、cookie、body recoveryToken；本轮不统一压缩所有请求超时。
- 增加Nginx配置语法/路由smoke，证明生产推荐部署只暴露受控入口，API直连限制由部署配置证明。
- 配置经环境模板注入时记录实际渲染值；不能只改未使用的配置文件。
- frontend把新增早期503按既有busy契约重试；必须保留相同sealed payload和submissionId，普通429不自动重试。
- gateway如果返回HTML/plaintext502/503/504，客户端仍按现有transport规则恢复，不要求服务端错误JSON一定存在。

验收：

- authenticated/public三族+Form在正常负载完全兼容。
- recovery凭证在header/body各路径仍可用，CSRF正负向测试通过。
- 4次失败后草稿仍可恢复，刷新/重开继续提交，不能误显示成功或清理答案。
- 错误体不含stack/credential；限流不会泄露目标attempt是否存在。

### P3-C04 — test(media): cover protected assets in classroom workloads

本commit必须测量媒体，**默认不改图片/视频传输架构**。

工作：

- 真实图文SJT及视频SJT分别测冷/热加载、capability刷新、range、开始尖峰与FINAL重叠。
- 记录每人asset请求数、runtime解密次数、DB操作、API代理字节、对象存储/出口带宽。
- branch场景检查是否加载大量不可达素材；只能在确认无用且不改变体验时做局部去重，不新增无限预取。
- 若资源是主要瓶颈，输出PERF-04 MEDIA候选决策。不得为了拿数字把资源请求从“在线人数”测试中静默剔除。

验收：

- 越权attempt、错误hash、删除/不可用资产、过期capability、错误audience均拒绝。
- 不出现public长缓存绕过权限；保持现有no-store策略，除非后续有独立设计和验收。
- 测试报告分别标注“FINAL计算容量”“图文完整流程容量”“视频带宽限制”。

### P3-C05 — perf(config): calibrate the whole-host capacity envelope

工作：

- 使用真正四核/4GiB整机或等价受限VM；不能靠各容器额度相加假称整机4C4G。
- API+DB+Redis+Nginx+必要系统开销共用资源；load generator放外部机器。
- 先测试原UNIT7/Agg3/pool10；新增ingress候选16/24/32逐档比较。若32内存压力大，降低而非扩大heap掩盖。
- 除非有证据，pool保持10、UNIT/Agg保持原值。需调整时单变量实验，保存配置来源优先级，不能env与DATABASE_URL冲突。
- 单类、mixed、start/resume、500人burst、长稳态均按第9节跑。
- 分别记录无背景任务和生产合理背景任务；FFmpeg若不允许同时运行，运行手册明确“测评期间禁止同机转码”，不能隐藏这一限制。

验收：

- 选定额定R_safe及失败/拐点，给每个task/profile/媒体类别的适用范围。
- 工程目标未达时记录缺口，不降低成功率或延迟标准；确定PERF-04是否触发。
- 在目标rate无持续queue增长、无OOM/进程重启、无durable accounting差异。
- 不能仅提供RPS，必须给对应p95/p99、CPU/RSS、DB等待和retry amplification。

### P3-C06 — docs(release): publish verified capacity and rollback runbook

工作：

- 完整整理最终SHA、配置、证据、课堂规模适用条件、开放容量与保留容量。
- 给出部署检查、灰度与回滚操作、abort条件、草稿/commit后断连恢复、备份恢复演练结果。
- 所有生产动作仍是runbook，不在本轮文档/代码开发时擅自执行上线。
- 更新state，明确前三PR是否只完成CODE_READY/MEASURED，或已达到CAPACITY_VERIFIED。
- 可选PR触发时记录唯一选择，其他方向明确暂缓。

PR出口：

- **代码合并门槛**：入口保护实际HTTP/代理测试、权限/客户端恢复、真实PG回归和所需CI通过；至少有隔离环境饱和/内存边界实验。
- **生产容量门槛**：目标整机4C4G全部正式矩阵通过。若目标机器不可用，可合并正确保护代码，但release-runbook必须标CAPACITY_NOT_VERIFIED，不得宣称整个优化项目容量验收完成。
- 任何额定规模都附“任务/profile、媒体、交卷窗口、峰均比、后台负载、带宽、SLO”，不能只写“支持1000人”。

## 7. 入口、授权与数据库的验收细则

### 7.1 完整HTTP query budget的字段

建议query-budgets.csv每行：

```text
case_id,method,route_template,family,auth_mode,policy_domain,
standalone_or_embedded,fresh_or_replay,last_unit,reference_versions,
base_sha,head_sha,logical_calls_before,logical_calls_after,
sql_statements_before,sql_statements_after,
db_rows_or_bytes_before,db_rows_or_bytes_after,notes,evidence
```

SQL stats包含raw SQL但分别列BEGIN/COMMIT；不得将pg_stat_statements调用数直接标成网络round-trip。PG全局统计应在隔离实例、无并行其他负载时取delta。Prisma query event若不能可靠关联request，就用单请求实验确定预算，再用并发测试测整体成本，不能伪造关联。

服务返回可信context只能节省后置child定位，不能直接取消以下调用：

- 当前principal查库；
- current组织/同意授权；
- cohort-only/observer的结果可见性policy；
- 事务内authoritative reread/CAS；
- latest epoch/status和父完成必要检查。

### 7.2 已核对的FINAL路径模板

以下全部为POST，实施时仍需与最新router复核。Form虽非本轮主要优化对象，但共享入口预算，应一并保护和回归。

| 家族 | 完整模板 |
|---|---|
| Scale | /api/scales/assessments/:assessmentId/submit |
| Cognitive | /api/cognitive/sessions/:id/submit |
| Public Cognitive | /api/public/cognitive/sessions/:id/submit |
| Standalone SJT | /api/situational/attempts/:attemptId/submit |
| Questionnaire Scale | /api/questionnaires/assessments/:assessmentId/scales/:scaleAssessmentId/submit |
| Questionnaire Form | /api/questionnaires/assessments/:assessmentId/form-sections/:sectionId/submit |
| Public Questionnaire Scale | /api/public/assessments/:sessionId/scale/:scaleAssessmentId/submit |
| Public Questionnaire Form | /api/public/assessments/:sessionId/form-sections/:sectionId/submit |
| Composite Scale | /api/composite-assessments/attempts/:attemptId/items/:itemId/scale/submit |
| Composite SJT | /api/composite-assessments/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/submit |
| Composite Form | /api/composite-assessments/attempts/:attemptId/form-sections/:sectionId/submit |
| Public Composite Scale | /api/public/composite-assessments/attempts/:attemptId/items/:itemId/scale/submit |
| Public Composite SJT | /api/public/composite-assessments/attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/submit |
| Public Composite Form | /api/public/composite-assessments/attempts/:attemptId/form-sections/:sectionId/submit |

route parity测试不得只把同一份新建常量重复导入自证；需启动真实router或用已有route inventory机制验证可达handler。功能flag关闭的Cognitive仍需在启用测试环境覆盖。

### 7.3 冻结/身份回归要求

- current registry报告文案变化后，已冻结assignment报告不变。
- 客户端增加prepared字段或伪造“已验证”标志，不能跳过schema/hash。
- 同version不同referenceHash必须逐binding判断；数据库reference status改变仍按旧语义反映。
- 未授权请求不能因single-flight/缓存/shared context拿到另一用户结果。
- replay必须用已提交winner结果，不能用当前计算结果覆盖完成时间、科学解释或报告。
- 索引/Map优化保留重复键拒绝和稳定排序，不能默默采用last-write-wins。

## 8. PERF-04：条件触发的单瓶颈优化（5 commits）

此PR不是必开。前三PR完成后根据证据选择下面**一个**方向；如果多个都重，选择对额定混合负载限制最大的一个。其余记录为下一轮候选，不能在一个PR同时worker+CDN+缓存+数据库重构。

| 方向 | 触发条件 | 允许实现 | 本轮限制 |
|---|---|---|---|
| CPU | 在未达SLO点，Node单核/ELU持续高；profiler明确可外移纯CPU占主要成本，DB/IO有余量 | 单API+有界worker pool，先1再2个worker | DB/授权/事务仍留API；不新增HTTP202 |
| 多API | event loop成为瓶颈但worker边界收益差，整机内存与DB有余量 | 固定2进程、静态划分总gate/pool预算 | 不自动4进程；共享public限流需等效实现 |
| MEDIA | 完整课堂流程先耗尽媒体代理CPU/带宽，而FINAL尚有余量 | 经授权后的受控文件转发或现有capability能力内优化 | 不公开bucket，不更改撤权/过期语义 |
| DATABASE | SQL/lock/IO成本明确主导，EXPLAIN显示具体问题 | 一个查询/锁读/索引问题的窄优化 | 索引变更需新增独立迁移/回滚论证，不以pool扩大代替 |
| DUPLICATE_AGGREGATE | same-parent重复计算明显挤占资源，多parent正常 | 进程内bounded single-flight | 每请求仍授权，DB CAS仍保留，key含epoch/input身份 |

Cognitive frozen report或reference跨请求cache默认仍不选：在没有immutability/撤销/失效协议证据前，不因为“看起来适合缓存”启动。

### P4-C01 — docs(perf): select one measured bottleneck and freeze the experiment

- 附profiler、队列、CPU/DB/media证据，写为何前三PR不能解决。
- 固定唯一候选、允许文件/依赖、失败判据、baseline与head实验方式。
- 定义目标：同等正确性和tail SLO下R_safe提高至少20%，或资源成本显著下降且为达到业务规模提供所需余量；不能预先宣称必达。
- 没有触发条件即NOT_TRIGGERED，不创建空架构PR。

### P4-C02 — test(perf): pin candidate failure and equivalence contracts

按选项补测试：

- worker：崩溃、超时、任务排队满、结果乱序、输入转移/拷贝后身份一致。
- 多API：合计admission/pool预算、不均衡路由、重启、public限流总预算、跨进程同attempt竞争。
- MEDIA：跨用户、过期/撤销、Range、断连、错误hash、资产删除、不可达分支。
- DB：索引计划、写放大、锁序、migration与回滚；不对生产数据做EXPLAIN ANALYZE写操作。
- single-flight：跨epoch、异输入、失败清理、内存上限、取消一请求不取消其他已合法提交。

### P4-C03 — perf(runtime): implement the selected bounded candidate

- 只实现C01选择的一个方向。
- worker queue有界，不能让它与UNIT queue叠出无界延迟；端到端deadline包含worker等待。
- 多API总pool和gate起点不超过单进程总预算；例如pool5+5，UNIT3+4，Aggregate1+2仅为候选，并记录不均衡损失。启动第三实例必须被部署配置禁止/校验，不能让总额悄悄扩大。
- 不需要分布式semaphore就不新增；需要时其故障语义必须在C01先明确，不能临场拼凑。

### P4-C04 — test(perf): run same-host A/B and choose keep or revert

- 同机交错至少3轮；计入传输/序列化、总RSS、重启和DB成本。
- 不同方向各有等价检查，混合与burst不得退化。
- 复杂度新增而收益低于预注册目标，默认REVERT，不为保留代码编造未来收益。
- 只有微基准提升、端到端无收益时必须解释是否值得保留；不能自动晋级生产方案。

### P4-C05 — docs(release): close selected optimization and final capacity status

- 更新R_safe、部署拓扑、限制、回滚与handoff。
- 必需CI和目标环境验收通过后才标CAPACITY_VERIFIED。
- 未通过则回退候选，前三PR成果保留；本轮记录未满足的业务规模，不自动追加第5个PR。

## 9. 测量、通过门槛与数字口径

### 9.1 必须区分的数字

- HTTP RPS：包括失败与重试，不是学生完成能力。
- fresh durable FINAL/s：数据库真正新增的逻辑完成。
- eventual success：规定deadline内最终确认成功，包括允许重试。
- 在线人数：取决于开始/素材/恢复/单元数/交卷集中度，不由单个RPS直接决定。
- steady window成功与drain-tail成功分别报告。

在线模型仅作规划：峰值约 b×N×k/W；N人数、k每人FINAL数、W交卷窗口、b峰均比。完整产品容量取FINAL、START、DB、媒体、网络、内存等约束中的最小值。

### 9.2 性能实验分层

| 层 | 目的 | 最低安排 |
|---|---|---|
| 正确性/调用预算 | 快速防回归 | 每相关commit针对性测试；PG required不能skip |
| 局部微基准 | 判断重复CPU减少 | 足够warmup、固定合法corpus、交错3轮；报告中位数与离散 |
| 探索曲线 | 找安全区与拐点 | 每档60–120秒，连续两个过载点停止增加 |
| 正式额定 | 验证R_safe | 选定负载每档至少15分钟×3轮；足够fresh fixture |
| 混合soak | 检查持续积压/泄漏 | 最终mixed至少60分钟，含正常资源访问 |
| burst/fault | 考试交卷与恢复 | 100/300/500 simultaneous，3轮；真实4次retry |
| 生产规模数据 | 防小表误导 | 至少小数据集与预期规模两档，记录统计信息 |

15分钟100/s每轮至少90,000 steady fresh fixture，另加warmup和余量。必须先算fixture与磁盘/WAL预算，不能重复用旧attempt填数，也不能因造数太重与被测阶段同时竞争资源。正式读写过程中正常autovacuum/WAL成本不能关闭以美化数据。

### 9.3 A/B非劣与收益判据

- 同一机器、数据库基数、配置、fixture分布、相同观测开销；轮序建议A-B/B-A/A-B，避免只用一次before对多次after。
- 正确性任何差异直接REVERT/修复。
- 在相同offered rate，fresh成功率不得变差，原来没有的业务错误不可出现。
- 对p95/p99：三轮中位数恶化超过 max(10%, 10ms) 视为明确回归候选；结合轮间离散复核。基线本身不满足目标SLO时，“非劣”不能冒充SLO达标。
- 对throughput：同SLO下R_safe下降超过5%且可复现，不通过。
- 对内存：无持续增长/泄漏；纯去冗余PR稳定RSS增加超过10%须解释并补soak，不能只看heap。
- 性能测量噪声覆盖效果时INCONCLUSIVE，保留确定的调用次数/算法证据；不可报未证实的百分比。
- CI不设不稳定的纳秒/毫秒微基准硬阈值。确定性行为/次数可以进CI；速度门槛走受控性能环境。

### 9.4 本轮生产SLO与工程目标

这是目标，不是当前已有能力：

- 额定steady fresh逻辑提交deadline内成功率≥99.9%。
- 普通FINAL p95≤1s、p99≤2s；预定义重型Cognitive p99≤3s，单独标记，不事后把慢例子全部划“重型”。
- steady每成功逻辑提交平均HTTP尝试≤1.1；首次成功率单列。
- 500人burst目标：每轮≥99.9%在15s内确认。500人的99.9%按整数要求等价于本轮全500成功，不能向下取整成499；三轮都报告人数。
- 零重复持久化、零错误归属、零丢失已确认提交；未确认请求保留可恢复草稿。
- 不允许持续队列增长、OOM、进程重启、未解释PG错误；总CPU/RAM以保留约25%余量为规划目标，另看Node单核ELU，整机CPU低不等于event loop空闲。
- 跨多轮/足够样本达标仅证明测试条件，不能宣称数学证明长期99.9%可靠。

负载台阶：

| 单一负载 | 首轮寻找基线的参考区间 | 优化后争取的验收台阶 |
|---|---:|---:|
| Scale | 75–100 fresh/s | 120–150 fresh/s |
| Cognitive nback-100 | 40–60/s | 70–90/s |
| Cognitive cpt-180 | 25–40/s | 45–60/s |
| 代表性文字SJT | 25–40/s | 50–80/s |

未达到右列不允许把不正确优化合并，也不应误判所有正确的小优化“失败”。代码价值与业务容量目标分开记录；实测R_safe满足产品需要且有余量时，不因追求表中上限再添加复杂架构。

历史Scale150、Cognitive85/55不能直接填入本轮results。没有任何固定百分比或1.5倍承诺。

### 9.5 mixed、媒体与课堂场景

至少三种mixed：

1. 60% Scale / 30% Cognitive / 10% SJT（仅为固定验收样例，不声称真实业务分布）。
2. Cognitive-heavy，覆盖长profile/可变trace。
3. SJT媒体加载+START/RESUME+FINAL重叠，包含保护资源访问。

同NAT、同start-token和不同token均测；auth/public分开再混合。初始在线场景Scale500、普通Cognitive300、重Cognitive200、文字SJT300，20秒交卷，并测峰均比2；达标后再试翻倍。Bundle按单元数计FINAL，不只计最后整卷。

若无法模拟真实媒体码率/资源位置，报告资源场景未验证，不把文字SJT结果泛化成视频SJT人数。

## 10. 测试与CI执行手册

以下为基线确实存在的命令/文件；新主线有变化时按脚本内容更新。命令路径从业务仓库开始，不能在ChatGPT参考目录执行。安装依赖用现有lockfile，不顺便升级依赖。

### 10.1 Backend基本检查

在server-version/backend：

```sh
npm ci
npx prisma generate
npm run cognitive:contracts
npm run situational:contracts
npm run build
```

上述部分包含重叠gate，日常commit只跑受影响集合；最终候选按当前CI规定执行，避免每小改动重复整个昂贵管线。

重点现有测试：

```text
src/__tests__/situational/situation-scoring.test.ts
src/__tests__/situational/situational-final-submit.contract.test.ts
src/__tests__/situational/situational-authoritative-trajectory.test.ts
src/__tests__/situational/situational-runtime-admission.test.ts
src/__tests__/situational/situational-standalone.postgres.integration.test.ts
src/__tests__/situational/situational-branching.postgres.integration.test.ts
src/__tests__/composite/situational-bundle.postgres.integration.test.ts
src/__tests__/hotpath/query-budget.postgres.integration.test.ts
src/__tests__/integration/instrument-final-submit.postgres.integration.test.ts
src/__tests__/assessment-runtime/v32-1.architecture.test.ts
src/__tests__/assessment-runtime/unified-aggregate.test.ts
src/__tests__/cognitive/profile-freeze.test.ts
src/__tests__/cognitive/frozen-reference-applicability.test.ts
```

用npx vitest run指定受影响文件/目录。新增测试应按现有测试布局落位，并在compatibility.md将验收ID映射到测试名。不要只写新的“实现调用次数测试”而缺少故障与结果等价验证。

### 10.2 隔离PG必需

现有integration-env helper在CI=true或RELEASE_VERIFY_LOCAL=true时缺DB会报错。沿用此fail-closed行为。

- 从当前suite读取所需env名；可能包括WORKC_QUERY_BUDGET_DATABASE_URL、V32_*、SITUATIONAL_BUNDLE_INTEGRATION_DATABASE_URL、INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL等。
- 明确指向本任务可销毁测试库；不使用dotenv里可能指向生产/共享库的DATABASE_URL兜底。
- db:migrate:guarded/db:seed只在核实隔离库后运行，不从本文命令复制后直接对未知库执行。
- 必需integration suite skipped即未验收。CI全套所需其他DB变量从当前workflow同步，不能只设置一个变量然后宣称full backend通过。
- 清理失败不删除共享volume；输出本任务残留ledger等待修复。

### 10.3 Frontend/浏览器

在server-version/frontend，受影响时执行：

```sh
npm run typecheck
npm test
npm run build
```

实际浏览器覆盖：

- 三族local draft保存、seal、正常FINAL、busy retry、刷新恢复、server已commit但响应丢失。
- SJT最后单元+父聚合繁忙+replay恢复。
- public recovery与authenticated cookie/CSRF。
- 受保护媒体错误凭证无内容返回，正常图片/视频可加载。
- 当前main使用的浏览器构建/启动方式优先沿用；不顺便改CI基础设施。#158等若已合并可复用其现行方式，不机械拷贝旧PR。

### 10.4 Full Gate

基线CI有merge gate / ready PR；实施时以GitHub实际required checks和完整base/head状态为准。runtime/parser/nginx变更不是content-only，不能为了省时间把路径排除Full Gate。

本地focused通过、远端旧SHA通过、PR-light通过，都不能代替最终候选所需CI。新commit或rebase后重跑受影响检查；最终合并候选必须是被验证的实际版本。

## 11. PR描述、证据与回滚

每个PR正文必须包含：

- 用户能观察到的问题和变化；例如“SJT并发FINAL等待父聚合时不再占UNIT名额”。
- 范围/计划commit ID、最终base/head、必要的有意行为修正。
- 正确性矩阵摘要、实际测试结果、未执行/跳过及原因。
- before/after成本表与实验条件；附失败点，不只附最佳一次。
- 是否CAPACITY_VERIFIED；未验证时显式说明。
- 迁移/依赖影响（前三PR应为无schema/无密文变更）和回滚方式。
- 未触发的条件项及理由。

回滚原则：

- PERF-01观测若有负担，可关闭详细模式或回退观测commit，业务不受影响。
- PERF-02按commit逆依赖回退，不只回退类型定义留下调用方；部署整体回退使用已验证前镜像。
- PERF-03入口限额过低造成课堂误拒绝时，优先回到已经测过的配置；如无安全候选，回退前镜像并降低接纳班级规模，不能直接设无限。
- child已提交而aggregate未完成的记录必须可由旧/新合法恢复路径识别；上线前做升级/回滚中断演练。
- 回滚不删除成功答案、raw submission或UnitSnapshot，不重建生产数据库，不改完成记录的submission身份。

停止并记录的条件：

- 出现评分/hash/冻结报告/权限/持久化唯一性变化；
- 发现当前主线契约与计划冲突，无法通过等价实现处理；
- 目标资源不可用或被其他负载污染，正式测量应停而不是继续刷数据；
- 接近磁盘满/OOM/数据库持续异常；
- 条件优化没有净收益。

只暂停受影响工作；继续文档、独立测试、工具修复。需要用户信息时给出具体缺项、已经完成部分和下一步，不用笼统“是否继续”。

## 12. 新窗口启动与交接

### 12.1 可复制启动指令

> 请按随附《Huisurvey 并发与访问成本优化开发执行文档 v1.0》实施，仓库为 caohuibj/eduK12-new-version。先核对最新main、现有分支/PR和docs/performance-optimization-v1/state.json；没有记录则从PERF-01/P1-C01开始，有记录则从第一个未完成项续做，不重复已完成工作。严格遵循3个必做PR、1个条件PR的范围、逐commit验收与不变契约。在隔离工作区实现、测试并提交可审查PR，默认不自动合并或生产部署。常规实现选择直接推进；缺少4C4G主机时先做不依赖它的工作，明确保留容量验收未完成，不伪造通过。结束时更新state、证据位置和下一步，让其他窗口可继续。

如果只执行一个PR，在上述指令末尾加：“本窗口仅执行PERF-02，完成后交接。”不要让新窗口只拿到“优化性能”一句话而看不到本文件。

### 12.2 每次交接必须写入的内容

- 仓库与当前工作区、branch、base/head SHA；
- 实际PR链接、当前计划commit ID；
- 已完成与未完成内容，不能只写“差不多完成”；
- 最近测试命令、结果、对应SHA、artifact路径；
- 性能环境/参数/噪声问题与是否可用于容量结论；
- 未提交改动是否存在、为何保留；
- 条件项决定和已授权范围；
- 下一步精确到一个可执行动作。

state.json不得写token、密码、连接串。另一台机器读取文档时，本地路径仅作线索，必须通过repo/PR/可访问artifact恢复证据；无法取得证据就重跑对应检查，不假设原窗口说过就成立。

### 12.3 最终项目完成定义

同时满足：

1. 3个必做PR的必做项均完成并可追溯到提交；条件项有明确决策。
2. 评分、冻结、权限、幂等与事务正确性保持，SJT恢复修正经过故障验证。
3. 确认重复CPU/DB工作减少，完整HTTP在可比条件下非劣。
4. 入口保护在parser之前生效，真实在途工作和内存有界，客户端恢复有效。
5. 目标部署容量及课堂/媒体条件已完成正式验收；若目标环境缺失，此项保持未完成。
6. 上线/回滚/恢复runbook可执行，所有证据与最终SHA一致。
7. 没有把未触发的worker、缓存或CDN工作包装成已实现，也没有把这些方向全部悄悄塞进本轮。

## 13. 固定证据链接

- [审查基线](https://github.com/caohuibj/eduK12-new-version/commit/f89354d32c7ac3dc4a9abd3a6abdca851667b8b5)
- [SJT FINAL：验证与提交编排](https://github.com/caohuibj/eduK12-new-version/blob/f89354d32c7ac3dc4a9abd3a6abdca851667b8b5/server-version/backend/src/modules/situational/situational-final-submit.service.ts)
- [SJT scorer：单回答验证的完整索引重建](https://github.com/caohuibj/eduK12-new-version/blob/f89354d32c7ac3dc4a9abd3a6abdca851667b8b5/server-version/backend/src/modules/situational/situation-scoring.ts)
- [Cognitive FINAL：冻结报告仍被使用](https://github.com/caohuibj/eduK12-new-version/blob/f89354d32c7ac3dc4a9abd3a6abdca851667b8b5/server-version/backend/src/modules/cognitive/unified-final-submit.service.ts)
- [Cognitive scorer：校验与preparedTrials](https://github.com/caohuibj/eduK12-new-version/blob/f89354d32c7ac3dc4a9abd3a6abdca851667b8b5/server-version/backend/src/modules/cognitive/v2/authoritative-scorer.ts)
- [Reference冻结与加载](https://github.com/caohuibj/eduK12-new-version/blob/f89354d32c7ac3dc4a9abd3a6abdca851667b8b5/server-version/backend/src/modules/assessment-runtime/reference-binding.ts)
- [Aggregate](https://github.com/caohuibj/eduK12-new-version/blob/f89354d32c7ac3dc4a9abd3a6abdca851667b8b5/server-version/backend/src/modules/assessment-runtime/unified-aggregate-finalizer.service.ts)
- [入口parser顺序](https://github.com/caohuibj/eduK12-new-version/blob/f89354d32c7ac3dc4a9abd3a6abdca851667b8b5/server-version/backend/src/index.ts)
- [客户端retry](https://github.com/caohuibj/eduK12-new-version/blob/f89354d32c7ac3dc4a9abd3a6abdca851667b8b5/server-version/frontend/src/services/persistence/finalDraftCapacityRetry.ts)
- [现有query-budget口径](https://github.com/caohuibj/eduK12-new-version/blob/f89354d32c7ac3dc4a9abd3a6abdca851667b8b5/server-version/backend/src/__tests__/hotpath/query-budget.postgres.integration.test.ts)
- [现有CI](https://github.com/caohuibj/eduK12-new-version/blob/f89354d32c7ac3dc4a9abd3a6abdca851667b8b5/.github/workflows/ci.yml)
- [历史Gate-E，仅用于参考](https://github.com/caohuibj/eduK12-new-version/blob/f89354d32c7ac3dc4a9abd3a6abdca851667b8b5/server-version/docs/gate-e-capacity-plan.md)

这些链接证明本计划的起点，不替代实施时对最新main及最终候选head的检查。
