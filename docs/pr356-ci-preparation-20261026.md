# PR #356：合并前 CI 准备与再次激活清单

**结论：准备记录已形成，当前决定为暂不激活 CI。** 11 项审查修复已经提交；这不自动完成 PR 原有全部 P0/内容验收，不等同合并门禁通过。本次只做源代码/配置/身份/路由的有限预检，不运行应用回归、构建、压测或正式 CI。

## 1. 候选和实际规则

验收目标 ID：`PR356-merge-qualification`。该目标的 GitHub CI 当前 0 次，累计正式 CI 失败轮次 0；此前本地夹具失败另行保留，PR355 历史 CI 也不改写或抹去。

| 输入 | 本次实读结果 |
|---|---|
| main / base | `ff8471e529e7b3c56e1e20f17d1e2581040fc896` |
| 产品及修复 Head | `d0dd0ca983c1364c73de6ff423296b20c6077060` |
| 完整产品候选 tree | `7ae431b14112a1a2fe76985e04e8f62e839d43da` |
| backend / frontend tree | `c7ddfa4134b511706c8514c25deacee0856db331` / `160d8bd143b6c27a87dade8b787e206be7b60b35` |
| GitHub 合并预览 | `86173a6312760cd4ad3aef37d109c083e857c96f`；父提交为上述 main、Head；tree 与产品候选一致 |
| 完整 main→Head 差异 | 314 路径，+22652/−2356；以完整 NUL raw diff 核路径/模式/blob，未用最近 8 个修复提交替代整个 PR |
| 依赖与 CI 控制 | 两端 package.json / package-lock.json、整个 `.github`、既有 release README 均与 main 一致；schema 有差异 |
| 数据库 | main 230 个 migration SQL → 候选 237；7 个增量，含角色/委托依据、使用权版本/哈希、UTC 及报告预算格式 |
| 当前远端状态 | Open / Draft，GitHub 报 mergeable=true、mergeable_state=blocked；未合并 |
| main 实际 required | `merge gate / ready PR`，strict up-to-date；未改 ruleset、required checks 或审批数 |

本文与 AGENTS 指南是后续准备提交，不修改两个 application tree。上表固定原产品候选，**不是未来激活 Head 的占位替代**。激活前须重新读取真实远端 base/head、实际 merge checkout/tree，并重新生成完整差异。后续任何代码、配置、依赖、schema 或 fixture 变化均重新判断受影响证据。

完整输入与预检结果见 [机器记录](evidence/pr356-ci-preparation-20261026.json)。

来源：[Notion《CI 常见错误清单》](https://app.notion.com/p/404d27635a388186ac80de3593da05a5)，实际读取版本 last-edited `2026-10-25T11:23:36.298Z`；仓库 `AGENTS.md`、`docs/release/README.md`、真实 GitHub rules 与工作流。Notion 中旧 PR/main 状态不覆盖本次 GitHub 实读结果。

## 2. 本地已判定的启动风险

1. **当前路由不适合作为本轮直接启动方案。** 现分类器在准确 base/Head/branch 的只读模拟中返回 `scenario=platform`、`application_route=legacy`、`run_performance_tests=true`。同时打开媒体五组、app shell、canonical visual、perf、Ops 与整套平台消费者。不得直接取消 Draft 或手动 full_acceptance，借整套 CI 试错。
2. **关键数据库用例可能静默跳过。** 11 份有变更的 opt-in 测试，其专用变量均未出现在现有 workflow 接线中；R5 固定清单和现有非空报告断言没有覆盖这些新 suite。当前 full job 的共享 seeded DB 也不能满足其中部分用例的 fresh-schema、专用端口/库名 guard。不能仅把所有开关填上就混跑，也不能把退出 0/全部 skip 当通过。
3. **本地结果的正式接纳尚未实现为本候选路线。** 已有定向报告、失败历史、类型和 lint 实际结果是开发证据；本候选不属于 README 内既有精确候选白名单。空类型日志本身不能证明退出 0，更不能补造历史运行的签名、生成物/工具绑定或审批记录。现有文档签名机制不自动扩张到应用资格。需要先审查可接纳的实际输入闭包与证据，再决定缺失项的唯一执行位置；不默认重跑已通过且输入相同的应用检查。
4. **SAST 范围需明确。** 当前 platform 的 CodeQL 默认仅 JS/TS，而完整差异还含两个 Python 量表生成脚本。不能只看平台 job 名称就宣称变化的 Python 已扫描。候选路线须明确变化 JS/TS/Python 的实际扫描范围及预算，不降低规则或严重性阈值。
5. **原合并范围尚未全部收口。** ①指导语的平台路径已修，但 NFC10 等内容线采用/正反验收仍按精确工具处理；PHQ9/PCL5/PC-PTSD-5 保持 HOLD；完整纵向及 356-01 cold/hot 基线等仍保留未完成状态。独立审查须判断最终必需合并项与后续事项，不能由开发者把 HOLD/NOTRUN 静默视作通过或移出合同。

本次实际预检：分类器退出 0（确认了上面的广范围问题，并非 CI 通过）；真实 FINAL 路由清单 22 条一致；前端生成路由清单 158 条一致。曾误调用只供临时测试目录使用的 checker fixture，ENOENT 原报告保留；改用真实入口通过，没有修改 fixture 或伪造路由清单。没有因此重跑业务用例。

## 3. 拟选路线：限定当前消费者，先审方案再接线

以下是设计，**当前未接入 workflow，未授予正式资格**。优先沿既有精确候选/可复用组件组织，不建立通用新签名体系、不新增长期凭据或持久权限。当前有界路线未完成审查前，不以 legacy/full 作为自动后备。

| 检查闭包 | 要捕获的具体失败 | 主要执行/复用策略 |
|---|---|---|
| 候选 scope、证据接纳、拒绝与 merge 汇总 | 漂移 base/head、漏路径/mode/blob、错 merge tree、skip 被冒认通过 | 只读预检先做；若有控制面实现变更，只执行相关控制契约，并由独立复核确认完整候选 |
| 精确 STANDARD、参考参数、审核/标签/文献、指导语 | 版本错配、错误成年年龄、历史快照漂移、批准范围/授权串用 | 逐 suite/case 审查已有报告及实际 import/callee/schema/fixture 输入；已通过且兼容者复用，缺失消费者才在唯一位置补证 |
| Training / Survey 真实 HTTP 与 PostgreSQL | START/FINAL/ACK/worker/父完成/报告断链；下架/租约/撤销边界漏测 | 11 个 opt-in 逐项决定“已审接纳”或“缺失执行”；未执行者独立库/fixture/Redis 命名空间，不共享 seeded fixture；明确非空、无 skip 的精确 required suite 及其 reporter |
| 本页及共享目录前端消费者 | 状态误称上线、旧响应回写、服务器 query/cursor、批准 scope 重试漂移 | 既有 unit 证据按实际输入复核；缺失的操作旅程覆盖本次影响的管理工作区、共享筛选及入口分配，不扩成所有产品页面回归 |
| main schema 升级与相关事实保护 | 旧精确委托/已完成报告损坏，NULL 预算标记被回填，约束/不可修改保护失效 | fresh 237 migrations 已有本地结果，不能替代带旧数据的 230→237 升级；先确定真实旧 schema/合成完成记录，再做一次相关升级/还原/事实保护，保留两边来源，不接生产 DB |
| 类型、变化 lint、依赖 audit | 跨包类型缺 backend Prisma/锁定依赖，或误接纳空执行 | 两端锁一致、现 frontend job 已准备锁定 backend 依赖及 Prisma；已有本地 types/lint 需有可审核的实际退出与输入证明。audit 只按锁/工具/环境/有效期及可核验官方来源决定复用，不重做安装/全测试凑证据 |
| backend/frontend 生产编译与 runtime | 源码与可部署产物不一致、原生模块/worker runtime 不兼容、扫描缺失 | 只构建实际变化组件各一次；worker 消费同 backend 镜像；固定 head、lock、生成物、镜像/产物 ID 与 digest，后续消费者不重建 |
| 受影响浏览器与安全消费者 | 相同产物上的交互/窄屏/权限提示问题，或 JS/TS/Python/SAST/runtime 漏扫 | 消费同一次真实 build；按正式选中引擎分别记录，不拿 Chromium 代表 Firefox/WebKit。先核真实启动能力及共享 fixture；运行 HIGH/CRITICAL 扫描及当前变化语言 SAST，不用超时或少数查询冒认扫描通过 |

不选择无关媒体/视频/全平台 Ops、整站浏览器、容量压测和正式生产流程。既有 required 检查不得被“本计划不选择”绕过；需要改变路线时，先完成真实范围/接纳/拒绝/汇总实现与审查，再触发。准备不引入新的自动 checking-list gate 或逐 commit 全量验证。

准备预算为约 15–25 分钟的有限读取、分类与清单整理；这不是正式 CI 的耗时承诺。正式 job 的执行预算需随最终路线列到各作业，并保留实际检查预算；约 5 分钟未结束时报告真实排队/下载/构建/扫描阶段，不能为赶时限扩大重跑或放宽断言。

## 4. Notion 旧错误逐项适用性

状态仅覆盖右栏指定事实，历史“已修”不自动成为本候选 PASS。

| ID | 本候选状态 | 准确范围/证据或缺口 |
|---|---|---|
| CI-001 | BLOCKED | 11 个隔离 suite 的正式接纳/执行、opt-in、guard、非空 reporter 未接入本候选路线 |
| CI-002 | NOTRUN | `.github` 未变；新路线若改 YAML/表达式，需要其准确语义 lint、嵌入脚本及 reusable 条件检查，不能只 YAML 可解析 |
| CI-003 | NOTRUN | 锁定 backend 安装/Prisma 接线已存在；本地 app types 有实际退出 0，正式候选的可核验接纳/干净 job 证据待定 |
| CI-004 | N_A | 当前未改安装检查器；若为类型准备改接线，保留正常生命周期与允许/拒绝两边契约 |
| CI-005 | BLOCKED | 专用 fresh DB 与当前共享 seeded full job 不兼容；需要具体隔离/复用设计，不清全局 DB/Redis |
| CI-006 | PASS | 限本地已验证的正式入口管理员、精确委托原发放者、越权拒绝及真实 ONLINE/发布/入场链；不是全 CI 权限验收 |
| CI-007 | PASS | 真正入口检查 FINAL 22 条、前端 routes 158 条一致；生成物一致不代替权限验证 |
| CI-008 | NOTRUN | 受影响 UI 契约有本地结果；当前候选的完整受影响浏览器旅程未执行/接纳 |
| CI-009 | PASS | 限本地真实 Survey 来源→导入→冻结→公开展示，以及 Training ACK→下架/停用→租约恢复→worker READY/父 COMPLETED/回执重放 |
| CI-010 | N_A | 未升级 Zod 或修改旧私有草稿空数组合同；保持原正式 definition 校验 |
| CI-011 | N_A | 未修改认知副本发布入口；共享模块的 Bundle 反向影响仍须范围审查，不借此跳现有 required |
| CI-012 | N_A | 未改 ZIP/Archiver 及流式导出背压实现，不追加无关内存/吞吐检查 |
| CI-013 | PASS | 状态刷新/失败/卸载/新检索覆盖旧 rows/cursor 的本地竞态契约通过，原 School 页面不复测 |
| CI-014 | NOTRUN | 当前 Head 没有正式 SAST；保留全部查询/语言与预算，超时不能通过 |
| CI-015 / CI-016 / CI-017 | NOTRUN | 本次未启动新浏览器、安装 OS 依赖或做浏览器 TLS 验证；不预判环境故障，不绕过 sandbox/证书 |
| CI-018 | BLOCKED | 完整 314 路径/7 迁移已冻结；原 P0/内容 HOLD/基线与最终合并范围仍需既有独立判断 |
| CI-019 | PASS | 限开发报告的原 FAIL、setup 错误、过滤项及不相交复验均保留；正式 CI 下游仍 NOTRUN |
| CI-020 | BLOCKED | base/head/tree/merge tree 已实读，正式证据接纳、最终独审与激活事件未完成；不补签旧日志 |
| LOCAL-001 | PASS | worker 兼容存储通过 encoding-aware reader 核原答案、唯一计分、规范快照及 FINAL 重放；未为测试强开 compact |
| LOCAL-002 | PASS | 已有编码感知 fixture 分别核 sourceDefinitionHash、measurement/legacy definition hash 与各自冻结 payload，不跨 hash 域比较 |

## 5. 一次激活与失败后的再次激活

激活前冻结“同一验收目标、精确候选、所选作业、可复用证据、缺失项、授权范围、独立复核决定”。取消 Draft 本身可触发 `ready_for_review`；不能把它当普通元数据更新。当前 commit 含 `[skip ci]`，也不能假定取消 Draft 一定会产生合格的 required 结果；现有 `workflow_dispatch` probe 不是正式 merge gate 的替代。最终方案须明确一个受支持事件及目标，不同时推激活提交、改 Ready、dispatch 多路试跑。

若后续正式 CI 失败，依次执行：

1. 固定原 run URL、workflow、job、attempt、目标 ID、base/head/merge tree、原始报告/产物 digest、首错及首错之后未执行消费者；首次失败读回后就记录，不等第二轮才复盘。
2. 对照本页适用 ID；区分产品、fixture/脚本、CI 配置/环境、检查器或未归因。同根因挂复发实例，不按浏览器/断言数量重复开 bug，不先把失败归为 main 或本 PR。
3. 在唯一主要环境修复、验证整个受影响旅程；保留原强断言、授权和科学边界，不删除用例、全局延长等待或重建已合格产物。代码修复继续以 `[skip ci]` 提交，避免自动触发未设计的新一轮。
4. **再次激活之前，按用户本轮授权写回同一个 Notion 错误页**：错误/根因或未归因、原 run 与 SHA、准确修复 diff、新证据、未执行下游、适用错误 ID、下一轮 checking list、累计失败轮次及下一候选。不得覆盖原 FAIL、改维护人/共享权限或存入凭据/真实答卷。
5. 写后核实成功。若 denied/pending/uncertain，报告准确页面/动作/原因；不重复新建条目或绕过权限。没有证据证明写回完成时，不宣称已记录或自动开始下一轮。
6. 同 Head 的环境/消费者失败只在真实支持的相同 run/artifact/attempt 边界内重试相关 job；新 Head 重新判断输入与失效范围，不泛用“rerun failed jobs”继承旧产物资格。同目标连续两轮失败仍不收敛，换 SHA 也不重置，暂停全量并重新冻结/独审；广泛共同根因可更早停止。

可复制回写字段：`目标ID/累计轮次；run/job/attempt；base/head/merge tree；FAIL首错；BLOCKED/NOTRUN下游；根因分类与已有ID；精确修复；原断言；验证/产物digest；下轮逐项checking list；独立复核及重启决定`。

## 6. 本轮完成边界

完成：读取 Notion 历史错误，核远端身份与保护规则，完整差异/迁移/输入分析，分类器只读规划，两个路由清单检查，11 个 suite 接线盘点，本方案和仓库长期执行约定。准备材料不代表已经启动任何 CI。

未执行：正式 CI、旧通过检查复跑、全量回归/压测、生产构建/扫描、生产 DB、合并、部署。未新增 Notion 错误条目，因为本轮没有发生 GitHub CI 失败；后续实际失败按第 5 节写回现有页面，不把本地准备错误冒充 CI 事故。

启动前仍须解决：限定路线及证据接纳/缺失项接线；原 P0/内容/基线最终范围与独审；准确单次触发方式。当前状态为 BLOCKED/NOTRUN 的事项不得被 PR 描述或本记录写成 PASS。
