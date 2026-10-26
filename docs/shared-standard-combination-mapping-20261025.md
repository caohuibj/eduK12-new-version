# 共同三轴映射：第二块实现与 Training 消费缺口

## 本块已实现的范围

在首轮 `5703bccbfda53b92564f62e7d52f7265d2dadec7` 上继续，本地代码提交为
`d7826bfe8bb5642e99c360adbbb3f22d6fe09837`。没有等待 dot 的来源、文案或标签修改，
没有执行实际安装、正式发布、合成试运行、迁移或 CI。

最新分工：任务 `01a17181-e464-749a-a717-a10d2e304037` 负责公库管理 UI、分类检索与批量入库管理读模型。
本节点保持共同 C/P/R、Training 精确消费/21B 和项目发布预检。下述 `versionMappings` 仅描述已有标准批准组合，
没有改写公库批量读模型或分类。与新节点的文件/API 交集由父对话协调，不在这里并行重做。
父对话报告新节点基于 #355 `f7b6c766` 加 #356 和 dot 五提交；本节点尚未获取其完整 SHA/Library 身份，
本块继续原精确基线，不据此重建或自动变基。dot 五提交已存在，不再作为停止独立开发的理由。

新增 `measurement-content/standard-combination.ts`，由现有 Survey 组合器、来源快照和正式内容发布输入复用：

- `standardCombinationHash` / `standardAxisHashes` 保留原 C/P/R 组合公式和轴身份；不重新发明版本 hash。
- `standardCombinationMeasurementInput` 提取已有平台 MEASUREMENT 的原生产合同；没有增加另一套发布或计分路径。
- `describeStandardCombination` 只把现存批准行、轴快照及已验证的正式测量记录映射成共同管理事实，
  不生成 release、grant、试运行结果或使用凭证。
- 现有系统管理详情 `GET /api/platform/survey-standard/candidate/:key/:version` 返回新增 `versionMappings`。
  最多 50 条既有组合的 MEASUREMENT 指针通过现有仓储一次批量读，不逐条查询、不使用 latest。
  原系统角色检查、history/trials/reference 返回和写入入口不变。尚未增加管理 UI 展示。

这意味着两入口可以共用同一份“版本是什么”的映射；**尚不表示 Training 已有真实消费适配**。
当前存储表历史名称 `survey_standard_*` 保留，未新建 Training 版本表、组合表或第二套批准/试运行机制。

## 管理事实如何避免假通过

| 字段 | 表达的事实 | 明确不能据此推导 |
| --- | --- | --- |
| identity | 已记录组合 ID、toolKey、combinationHash | 入口/用户已获得权限 |
| axisIdentity | 三轴 payload/hash、工具/来源版本和组合 hash 的对应关系 | 科学效度、全部内容兼容性或运行就绪 |
| compatibility | 当前映射未重跑兼容性，标 NOT_EVALUATED | 用映射替代批准和冻结校验 |
| axes.*.axisHash | 轴快照身份，保留各自 version/sourceVersion | 把轴 hash 改名成正式 release.contentHash |
| axes.*.configuration | 明确 null 为 EXPLICITLY_UNCONFIGURED，非 null 为 CONFIGURED | 目录未返回字段就是明确留空 |
| axes.P/R.formalReleaseBinding | 当前组合行没有记录正式 P/R 指针 | 全库没有 P/R release、参数为空或需要从零编写 |
| measurement.pointer/status | 已记正式 C 指针；区分未记录、找不到、身份不符及各生命周期 | C 存在即 P/R 已分配，或组合撤回后还能新用 |
| consumers.SURVEY | 现有来源适配已接通；P/R 目前按项目物化 | 所有入口准入和目标 grant 已通过 |
| consumers.TRAINING | 精确组合消费适配尚未接通，并列出缺少的合同 | ONLINE 已等于 Training 可用 |
| entryAdmission/targetUseGrant/runtimeAuthorization | 本接口未读取对应权限，统一 NOT_EVALUATED | “未核验”是批准、缺失或拒绝的另一种写法 |

正式 C 的只读映射核对真实 releaseId、layer/family、contentHash、key/version、scope、provenance、sourceReleaseId 和 assetRefs，
并复用原生产合同校验；仓储的内容完整性错误继续抛出，不被静默改成“尚未发布”。
映射不包含轴 payload、模板、原始答案或授权清单，不创建用户使用权。

## Training 究竟缺哪一层

以下六层是已有代码的具体缺口，不是六个新的人工作业或新审批。
共同的 C/P/R 登记、批准、组合 hash 和试运行仍复用已有实现。

| 缺少的合同 | 当前代码证据 | 需要的最小接线与应复用的能力 |
| --- | --- | --- |
| EXACT_COMBINATION_SOURCE | `questionnaire-product/scale-resources.ts` 只选 Scale ID；`composite.service.ts:584` 的 SCALE 仅接收 scaleId；`training-content-binding.ts:22` 没有标准组合来源变体 | 在当前已授权 Scale/问卷资源上显式绑定批准组合 ID＋hash，按它解析 C/P/R；不按标题、instrumentVersion 或最新 Scale.definition 猜组合 |
| COMBINATION_ENTRY_ADMISSION | Survey `tool-policy.ts` 已有 standard-release＋fingerprint；Training 未消费这份精确组合 | 由入口适配解释同一组合的本入口准入；共用版本事实，不把 Survey 准入复制为 Training 许可。是否需独立人工动作以真实产品需求为准，不能凭空加每工具审批 |
| COMBINATION_TARGET_GRANT | Training 资源 grant 主要按 Scale ID，Survey tool grant 按精确来源快照 | 复用现有目标使用权与 21B 管理资格，补上组合范围及当前 issuer 的重验。不要新造通用万能授权表，也不要从“系统已批准”自动发教师 grant |
| FROZEN_COMBINATION_BINDING | Training 冻结引用测量/参考/报告，但 source union 仍是 Scale/config/SJT；`CompositeAssessmentItem` 没有组合选择，Assessment 的 scaleId 仍是必需 FK | 在既有冻结结构和子任务引用上保存精确共同组合来源；不把组合 UUID 冒充 Scale ID，不覆盖旧冻结，也不为新来源重写全部历史协议 |
| PARAMETER_REPORT_BINDING | 标准组合行只记录 C；Survey `copyTripletContent` 创建本项目 P/R；Training 参考和报告消费者有自己的来源/scope 合同 | 共同读取已有轴与正式仓储，形成可信的批准标准组合消费者分支；共享正文/规范参数，轻量绑定入口与受众，保留私有和正式常模原守卫 |
| CURRENT_COMBINATION_STOP_CHECK | Survey `tool-policy.ts:83` 在采集时锁定精确组合并检查 ONLINE/hash；Training 的 scale-collection-guard 目前只从 Scale 解析 release 依赖 | 在 Training 已有采集/FINAL 事务中复用同一组合状态/精确停止判定，并保留当前用户 grant/范围检查。已完成 receipt 幂等重放及历史报告读取仍按原策略 |

上述内容已通过本块映射直接返回 `consumers.TRAINING.missingContracts`，不是泛称“Training 未完成”。
`sourceAdapter: NOT_CONNECTED` 保持真实，未开放任何目录分配或运行路径。

## 参数和报告有两处不能用“换产品名”解决

### 现有平台正式参考消费者限定正式常模

`composite/training-reference-selection.ts:validateTrainingReferenceRelease` 对 PLATFORM 记录调用
`measurement-content/formal-reference-resolver.ts:resolveFormalReferenceRelease`。后者要求候选和审阅身份、
正式同意/提升材料、一个 normative_distribution 条目及其内容与来源一致。
它处理的是正式常模发布，不能将任意 PLATFORM 标签或 Survey 组合批准当成该合同的证明。

这不证明“Training 所有理论范围都被禁止”：Training 自己的合法 PRIVATE 参考是另一条已有路径。
真正缺的是**可信已批准标准组合的公共参数消费分支**。项目历史经验和理论范围应沿各自真实类型，
不能伪造全国常模 candidate/review、改 referenceKind 或削弱原正式常模守卫来接入。

### 当前报告绑定限定 Training 私有 scope

`training-report-selection.ts:validateTrainingReportPointer` 要求 PRIVATE/TRAINING、正确 owner/composite、
teacher/researcher 受众、精确 measurement 及 metric。Survey PRIVATE 报告或普通 PLATFORM 报告不能直接作为它的替代。
未来标准报告消费者应核验共同组合与 R 轴身份，并复用声明式 renderer；私有报告路径维持现行规则。
是否向 participant 反馈仍按未决产品规则处理，不能借共享模板开放私有数据或受众。

本块新增 7 个只读边界用例，使用真实现有 parser/参考/报告消费者确认这些边界，未 mock 掉相关权限和科学判定。
合成记录只在内存中构造，不是实际已批准/已发布的工具，也不是运行过一次业务试运行。

## 下一步怎样复用，而不复制一套版本机制

1. 沿同一 `survey_standard_releases` / `survey_standard_versions` 的不可变事实读取组合；共用本块 hash 和 C 发布输入。
   表名本身不成为永久 Survey 独占的产品限制，也不因此把旧 SURVEY_ONLY 审计改写成双入口已完成。
2. 为 Training 设计一个窄来源适配，而非重新编制/复制 registry 和审批服务。保留现有 scaleId 子任务 FK，
   显式保存“该槽位选择的组合”及 hash；调查新增来源指针落在 item 还是已有冻结/来源结构的最小兼容位置。
   旧 Scale、config、SJT 和旧 snapshot 的解析保持有效，新的版本不能自动替换已有选择。
3. 参数/报告必须能映射到真实不可变版本。可复用现有正式 REFERENCE/REPORT 仓储记录；若批准轴尚无可供跨入口消费的正式指针，
   由已有系统批准链提供一次受控物化/关联能力，而非另走一轮科学作者审批。后续只绑定精确 ID/hash，不能合成假的 StoredRelease。
   是否需要抽离正文由复制规模和消费者合同决定；本轮没有预设新正文表或迁移全部记录。
4. 目标使用权和入口资格仍通过产品适配，21B 与当前 issuer 重验一起接；版本身份共用不等于两个产品的私人数据/会话通用。
   只有来源、准入、目标 grant、冻结、参数报告及停止检查接齐并验证后，才把 Training 支持状态改为已接通。
5. 实际 C/P/R 正式发布、工具转正与合成试运行仍由父对话 dot 执行。本节点可以继续编写来源 parser、匹配器、
   scope/生命周期与旧冻结兼容合同，不能把本块元数据映射当作那些业务操作的替代。

不增加第二套版本注册/批准/试运行表；不默认队列或 ordinary 协议；不放宽外部许可、当前凭证、隐私或停止守卫。
HIDDEN 正式发布及入口分配的边界不变，PUBLIC 可见性不参与本块映射判定。

## 哪些工作独立可做，哪些确实需要 dot 的成果

| 工作 | 是否可独立推进 | 准确依赖 |
| --- | --- | --- |
| 共同身份、正式 C 映射、系统管理读模型及兼容合同 | 已完成 | 仅本次 #355＋#356 精确基线及已有 release/组合合同 |
| Training 精确来源 selector/parser、槽位和冻结来源最小持久化方案、版本竞争合同 | 可以继续 | 现有 Scale ID/FK、snapshot、MaterialGrant/entry 管理代码；不依赖 36 份文案或标签 |
| Training 标准 P/R 消费者的来源、scope、metric、生命周期及错误身份合同 | 可以继续 | 现有 shared renderer/reference 类型与批准组合身份；先用合成 fixture，不执行入库 |
| 21B 的管理资格/目标范围、能力读模型、授权列表与 issuer 当前资格 | 可以独立做一小块 | 既定角色规则及其现有入口/能力实现；不依赖中文标签或 P/R 文案 |
| 把 36 个实际候选映射为端到端正式 C/P/R/组合，确认生成器与来源一致 | 需要复用时由父对话提供已存在成果的 Library 身份 | 父任务五提交的完整 SHA/补丁与验证输入；每工具 source/instrument/scoring/reference/report 版本及 hash；实际正式 ID/hash、scope、生命周期、组合 ID/hash 或明确未配置事实 |
| 可信自编来源政策的当前读取及第三方对照 | 复用父任务实现，不重做 | 服务端可信来源字段/判定入口及精确版本/hash；第三方约束的原合同；不能由客户端标记或分类代替 |
| 原始答案/报告历史回放、真实写事务与小型用户闭环 | 由父任务协调主执行位置和已有输入 | 实际已准备的精确对象与脱敏结果证据、缺失步骤清单；不要求父任务把业务入库转交本节点或重复安装/发布 |

交接不需要凭据、原始学生数据或生产访问。若只给 source 版本而没有正式 release 记录，
应明确停在来源层；若只给 Survey ONLINE 而没有 Training 消费证据，Training 状态继续 NOT_CONNECTED。
历史撤回读取和未来 participant 受众尚未决定，本块保持现有行为；这两点不阻塞上述独立合同开发。

## 与公库节点的接口/文件交接

本块唯一两个已有文件交集是 `survey/standard-triplet.model.ts` 和 `survey/standard-triplet.service.ts`。
新增公共模块 `measurement-content/standard-combination.ts` 由本任务维护；新节点可消费共同映射，避免另写一套 hash 或版本阶段判定。
现有系统详情的 `versionMappings` 为新增字段，原 history、trials、reference 和来源快照形状保留；
没有修改 `scale-library-read-model.ts`、`unified-catalog-model.ts`、公库 UI、source JSON、标签或分页代码。
两个交集文件的精确 before/after blob 记录在验证 JSON 的 interfaceFiles，供父对话按实际功能合并。
不能把新节点私有 bundle 的父机器路径当成本节点可读来源；需要时使用父对话提供的同一 Library 文件身份。

## 本块检查、结果和限制

- 新增共同身份/映射 30 例、现有系统管理读取 6 例、旧输入兼容 3 例、Training 边界 7 例，共 46 个不同用例通过。
- 原兼容文件 3 例先通过；定向测试类型发现一处合成 Triplet 缺 Part.reference。补足 fixture 类型后仅重跑相应快照用例，
  该例仍通过，另 2 例未重复运行。没有 `unknown as`、放宽类型或改断言规避问题。
- 旧公式、平台 C 发布输入和来源快照的 golden 由未修改的 `6fedb640...` Git archive 在相同合成输入上真实计算，
  不调用安装、发布、批准或试运行服务。三个摘要与新实现对应相等，不重标既有来源快照或 grant 指纹。
- 生产后端类型检查和当前新增测试的定向类型检查退出 0；`git diff --check` 通过。
- 11 个既有失败的原始证据仍在首轮验证文件，未改动或重跑它们，不宣称整个仓库或基线全绿。
- 没有进行真实 HTTP、数据库验证、镜像构建/扫描或 CI；内存 SQL/方法替身只证明这些合同，不能替代实际双入口消费资格。

原始报告与日志摘要、输入绑定及首次类型失败见
[common-mapping-validation.json](evidence/tool-onboarding-next-20261025/common-mapping-validation.json)。

## 关联记录

- [首轮公共版本分析](public-version-workflow-analysis-20261025.md)
- [集成来源与后续 main 对齐规则](tool-onboarding-next-20261025.md)
- [下一轮 Notion 计划](https://app.notion.com/p/404d27635a38810dbd19e1f820bd37bf)
- [独立云端详细报告](https://app.notion.com/p/404d27635a3881789d87cb01194b73f0)
- [本块 Notion 续报](https://app.notion.com/p/404d27635a388146893fd73620108552)：已保存并读回核实，首轮报告追加本块摘要；未替换旧问题或失败记录。
