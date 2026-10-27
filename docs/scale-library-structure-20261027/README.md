# 量表公共库：三部分结构准入（Draft）

当前分支 `scale-library-structure-20261027`。初始 main 为 `5c427f2bfe646def2200162bab449a0711a6e133`；已普通合并 PR #364 后的 main `6203a829dc8d7de707e67f413acfa5a354a21e09`，无冲突、未强推。最小范围为现有 Scale source/package 校验、registry 隔离诊断、安装/发布预览与证明、定向测试及只读 Git 盘点。没有新引擎、并行注册表、数据库表、CSV STANDARD 导入或 CI 路线。仓库 AGENTS.md 和 release 规则已读取；本节点的 `.agents` 目录为空，仓库无相关 SKILL.md。

## 真实来源与数量

完整 SHA 清单见 [sources.json](sources.json)，逐项结论见 [candidate-list.md](candidate-list.md) 和 [candidates.json](candidates.json)。另对远端所有名称含 scale/library/wccl 的非认知、非 SJT 分支核对 ancestry 与 instrument 路径；[remote-scale-branches.json](remote-scale-branches.json) 只发现下列三个未合并来源新增身份。没有切换、修改或接管认知任务与四入口人工验收。

| 来源 | 实际 SHA | 本 main 尚无的版本身份 |
|---|---|---:|
| content/dot-local-scales-20261025 | b92c69aefa2472775fa7ee86b9c208366886c908 | 85 |
| PR #328 / public-library/scales-20261022 | fa355ff2dcd859b57a4bf2e8bddd77f8d428e3cf | 5 |
| PR #362 / release/dbt-wccl59-v1-0-2-20261027 | 2612a9f5bf22c1370ec786f3d6feb50805003065 | 1（与首来源重复） |

main 本来有 57 个 source 版本。主候选来源的新增 85 版本去重为 78 个 instrumentKey；联合来源共 90 个新版本身份、最新 79 个工具。这里排除 main 原有身份，不把 142 个主分支快照来源或 85 个新增版本称为 142/85 个新工具。保留 11 个被新版覆盖的旧版本，仅标 `NOT_EXECUTED_SUPERSEDED`，不重跑旧版本。

79 个最新身份中：3 个三部分结构完整且现有 runtime compiler 返回 supported；56 个缺独立 source.instruction；19 个缺 report.audienceContract；另 1 个是 CATALOG_ONLY、三部分未构建。3 个完整项为 `ars30_2016_zh_cn_research@1.0.0`、`cfq7_zh_cn_research@1.0.0`、`psyflex6_zh_cn_research@1.0.0`，**均仍是 DRAFT**。独立指导语缺失只表示未接入可冻结呈现字段，不证明资料文档没有指导语；本次不抽取或改写正文凑通过。

额外阻碍均保留：

- APQ42 源 schema 使用 `applicability.subject.ageMonths.maxInclusive`，现有协议只有 `maxExclusive`，因此整源 schema 检查失败。题本/计分完整结论保留未执行；独立 report 检查仍记录缺受众契约。不能让源 schema 错误掩盖报告缺项，也不擅自猜年龄边界。
- FIDL21 最新是 **1.0.1、21 题**。旧 1.0.0 仅保留历史。APQ42 的五条、FIDL21 的一条原 100 字门槛错误留在 `originalMainAudienceIssues`；这些文字长度不再是技术准入错误，缺契约仍是错误。
- SPANE12 的 JSON 不含函数插件，候选 wrapper 明确声明 `spane12BalanceScorer`。本次不执行候选分支代码，保留当前引擎的未注册 scorer/golden 错误，并把计分状态标为 `NOT_EXECUTED_CANDIDATE_PLUGIN_NOT_LOADED`，不谎称远端没有插件或该计分已通过。
- DBT-WCCL59 **同 key/1.0.2 在 b92c69ae 与 PR362 的 blob 不同**。差异涉及 releaseStatus、目录/译审状态、许可备注与报告边界等；[冲突原件](evidence/dbt-conflict.json) 列出完整字段路径。只补查 PR362 的另一个输入，保留主候选已有结果。两者都缺 report.audienceContract。没有自动取“最新”、覆盖旧版或把候选状态提升为专家/科研/法律批准。

## 技术门槛与人工事项

题本保留稳定身份、题项/选项结构、指导语语言与版本、适用人群/披露策略等。新的安装、物化和发布明确要求可冻结的独立指导语；已有运行/历史定义保持兼容，不因旧 source 缺字段改变已冻结尝试。指导语/报告文字不重写。

计分保留 item/score/reference 引用、参数 schema/边界、计分器注册与固定实现、golden 算例执行及版本关系。`referencePolicy=none` 继续表示明确无常模/阈值；没有新增全国常模、翻译专家签字或科研验证的要求。

报告保留 schema、版本、语言/受众契约、主指标覆盖、重复 band key、呈现协议的字段与引用约束。`qcReview` 改为可选，不伪造审校记录；移除 summary 最少 100 字、强制 guidance 分类和措辞正则。旧错误码 `AUDIENCE_LANGUAGE_QC_REQUIRED` 为兼容保留，现仅表示结构化语言/受众契约缺失或 locale 不匹配，不要求 QC 签字。两套 respondent 词汇不做错误的直接相等比较。

译审/专家审校的 PENDING、RETURNED、科研资格和版权声明保留原值，转入安装计划、预览及发布 proof 的 manualReview；科研判断函数仍真实返回未达资格。build 资格检查打印人工科研诊断，仍拒绝 PUBLISHED 产品结构错误及未固定 scorer。人工流程不改变任何科研标签，也不赋予公开再分发受限材料的权利；真实组织、本人/受测者身份、入口 capability、急停、本人报告披露、冻结快照、幂等和审计逻辑未修改。

registry 继续使用同一静态 generated source 和现有执行注册表。schema 不合格项从可执行/目录投影隔离，完整原错误经 `listScaleInstrumentSourceDiagnostics` 和接入状态 API 的 `sourceDiagnostics` 返回；重复精确身份仍抛异常，禁止覆盖。schema 合格但语义缺项的候选可供诊断发现，选取 executable/runtime policy、安装/物化/发布时仍拒绝，验证结果按同一不可变身份缓存，避免开始流程反复执行 golden。真实 TS 解析或静态 import 错误仍由编译器拒绝，不吞异常。

## 沿用现有操作进入公共库

本次只提交机制与清单，**没有复制候选题文进入 main，没有执行注册、安装或发布**。将来每个明确选中的结构完整候选沿原流程处理：

1. 先确定精确 source SHA/key/version，解决同身份冲突，保留旧版本；按原目录接入 package/wrapper 与既有 generator。只修真实结构缺口，不能改题文、公式、阈值或编造 QC；DRAFT 必须逐项经过明确发布操作，不能整批改 PUBLISHED。
2. 通过已有 source/package 结构检查与现有引擎编译，显式确定该精确包的 releaseStatus。CSV 导入服务仍只允许 CUSTOM_DESCRIPTIVE 的 DRAFT，拒绝覆盖 STANDARD。
3. 由真实有效 SYSTEM_ADMIN 用现有 `scale:instrument:install` CLI dry-run 核对 locale、territory、localizationVersion、revision、modes、runtimePolicyHash，再明确 apply。install 物化 STANDARD 内容和 ACTIVE deployment，数据库 Scale 仍为 DRAFT/HIDDEN；安装不等于公共库发布。版本/definition/reference/deployment revision 冲突及不可变历史仍拒绝。
4. 用现有 `scale:instrument:publish -- --input <publication.json>` 先取得 proofHash；明确 visibility、allowedProducts 和当前 proofHash 后再 apply。原 serializable 事务、媒体保留、measurement release、精确入口 policy 与 publication audit 保留。版权/科研待审仍载入 proof，管理员依法决定公开/使用边界，不自动取得版权许可。
5. 通过原 library projection 核对真实发布、可见性、ACTIVE deployment 与角色访问，再检查真实产品入口/组织 capability、paused/急停与个人适用身份，才能声称可分配。`PUBLIC`、源 PUBLISHED、安装完成或目录发现任一单独状态都不等于已获入口授权或已上线。

数据库状态逐项记录为 `queried=false`、`installed/published/publicLibraryVisible/assignable=NOTRUN`、`production=NOT_QUERIED_NOT_MODIFIED`；本工作分支新增候选 `registeredOnCurrentBranch=false`。既有生产安装数未知。本次无测试数据库演示或真实权限写入；发布/安装测试使用合成对象和 mock 数据库，不代表真实数据库生命周期已经验收。

## 检查、原失败与证据边界

[原报告索引](evidence/test-index.json) 保存每次命令实际 case 状态/摘要。Node 24.21.0，复用云端已有锁定依赖；不运行 npm scripts 的 pre/build/onboarding 全链，不新增 CI。验证只覆盖新增与直接受影响行为。

- 首轮 16 项：4 PASS / 12 FAIL。新增的 respondent 直接比较错误地混用了两套命名；撤回该条。原失败 reporter 保留。
- 其后一次编辑命令路径错误，错误后的测试仍执行了旧输入：13 项 1 PASS / 12 FAIL。该次无效重复如实保留，没有重标 PASS。
- 正确修复后 13 PASS；新增指导语准入及合成安装 fixture 后，相关 20 PASS（含旧 registry 六项和 direct publish 一项）。
- 新 schema 隔离补充检查 10 PASS / 1 FAIL（新 fixture 对不存在 ageMonths 赋值），仅修 fixture 并只重试该项：1 PASS / 4 filtered。现有成功项不重跑。
- pending-review 5 PASS / 1 DB 状态用例 filtered；真实 DB 状态用例未执行。新 publication 2 PASS（人工科研/权利诊断、管理员授权与 stale proof）。既有 WHO5/SDQ/TEXI 三项原成功保留，schema 筛选保留原始 executable descriptor 字节后，仅重核一个 package/hash 消费者：1 PASS / 5 filtered。
- 三次后端类型检查分别因后续源码变化执行；其中最后一次与 main merge 重叠，虽退出 0，不授予整合 tree 资格。整合后在冻结源码上单独执行一次，命令、开始/结束、源码 tree、工具/config/lock 哈希和退出状态见 [integrated-types-receipt.json](evidence/integrated-types-receipt.json)，日志见 [backend-types-integrated.log](evidence/backend-types-integrated.log)。没有额外应用编译或全量测试。
- 盘点工具最初路径错误返回空清单（保留 log，不能当成功盘点）；其后旧门禁依赖默认 bands 导致错误（保留堆栈）。初次成功摘要少计 APQ 的报告缺项，最终逐部分检查纠正为 19。初次成功完整 JSON 在报告修订时被覆盖，只有原摘要 log 留存；明确披露，不补造原件。最终 JSON/源码输入记录见 [inventory-receipt.json](evidence/inventory-receipt.json)。旧版本、schema 错误、候选插件未加载和 runtime 未执行均保留。

测试 reporter 是实际本云端执行，未签名；逐 case 索引与多数源码绑定为事后记录，未记录各历史进程完整 node_modules 字节。不能伪装成正式 CI 成功或已接纳的执行证明。TypeScript excludes `src/__tests__`，未声称类型检查覆盖测试或 scripts。未执行整应用 build、全量 onboarding/goldens、浏览器、CodeQL、依赖/镜像扫描、CI、真实 DB 写入、Ready、merge 或 deploy。

## #364 对齐与待 dot 独审

[整合记录](integration.json) 列出 #364 的 23 个改动路径：本任务直接 scale 校验/目录/计分/报告/锁定依赖输入均无变化，因此不因 main 合并复跑候选/成功 case。其教育资源选择器分页与 SAST 成功由主线负责，本节点不接管、不复制为本任务检查成功。

dot 需独立审阅本任务最终精确 base/head/tree、完整 raw diff、原始报告及复用边界，再决定需要的正式检查与任何后续候选接入操作。本任务保持 Draft、所有提交 `[skip ci]`，不自行启动 CI、不 Ready、不合并、不部署。若后续 main 或候选 SHA 再变化，只重核受影响的 source/schema/scorer/compiler/report/安装发布消费者；不新增另一套 CI。

保留的特殊边界：`huiteacher/teacherPilotContent.ts` 仍对既有第一方 Teacher Pilot 本人报告协议要求完整 hash、self_authored/allowed、成人 teacher 受众及旧 QC/字数字段。它被 `scaleLicense.service.ts` 和 `scalePersonalReport.service.ts` 用于该狭窄试点的资源发放/本人报告，不是本次 STANDARD 公共库安装入口。本次没有用“删除 license/grant”扩大此试点来源或改动本人报告披露。它的旧编辑性约束尚未随公共库结构门槛统一，作为 dot 独审的剩余适配项明确保留；不能声称本 PR 已清除所有产品特殊路径中的编辑/版权规则。接入状态前端目前也未渲染新增 sourceDiagnostics 字段，原诊断已可由管理员 API/CLI 读取，未把隔离项称为通过或已安装。
