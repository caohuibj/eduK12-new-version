# 普通问卷提交与事实协议：第一阶段实施设计

日期：2026-10-24。依据：仓库 `692b2338`，保留的产品实现 `d01f77b5`。

**状态：设计提案，尚未实现、部署或启用。** 本轮仅新增本文；不修改业务、数据库、开关，不运行构建、性能测试或 CI。后续实施仍须按切片审查和验证。本文中的逻辑状态/字段不是现有数据库枚举或已上线 API。

## 1. 已确认范围与结论

用户确认：普通静态量表/表单允许最终整份提交；复杂报告允许先可靠保存，随后短时生成。其余采用兼容默认值：固定科学版本、现有计分方式、立即/教师定时开放、恢复保障、旧作答和旧格式支持均保留。不据此授权全系统重写，不承诺未经测量的报告 SLA，不新增固定 24 小时等待，不改变保留期。

整份提交是**接收协议**，同步还是 worker 生成报告是**执行选择**，教师何时开放是**访问策略**，三者必须解耦。目标是复用已有 whole receipt、compact facts、outbox、共享 artifact 和单元科学适配器，而非再建队列、另一套事实或另一套计分引擎。

首个产品切片限定为新建且可证明普通静态的 SCALE/FORM_SECTION 问卷，采用一次原子最终提交。首片仅接受不建立/改变量表所依赖科学上下文的表单；人口学/参考选择等上下文表单若影响量表 admission，继续先提交并冻结上下文的既有流程，再批量提交其余静态单元。不得用旧/空 context 预评分后同时提交改变 context 的表单。纯表单也属于目标，但现有 whole 要求至少一个 SCALE，不能假称已经支持。SJT、认知、条件分支、分卷/变体和关系测评继续原协议；混合批量能力后续按服务端接受回执接入，不信任客户端 `completed`。

## 2. 现状与不应重复发明的能力

以下引用均相对仓库根目录，行号对应上述基线，后续实现以符号名为准：

- `server-version/backend/src/modules/composite/whole-questionnaire.service.ts:99–119`：已有 owner/recovery 身份、冻结槽位 hash/epoch、单元 runtime 绑定校验；whole 目前耦合 async eligibility，排除条件流程，批处理 SCALE。required 槽位允许 FORM_SECTION 不代表本次命令接收表单答案。
- 同文件约 `181、348` 的 requiredFormSlots，以及 `assessment-runtime/whole-receipt-atomic.ts:48–51`、`assessment-runtime/report-outbox.service.ts:446–447`：现有表单需先完成。不能用打开两个开关代替混合协议实现。部署默认 whole/async 为 false，保持不变。
- `assessment-runtime/persistence.ts:31–68`：单元快照写入与 outbox 入队同事务；快照限制一个父对象、一个有效 payload 类型。
- `scale/unified-final-submit.service.ts:334–425、500–570`：提交事务重读、锁、epoch/runtime/admission 绑定、应急停止、CAS 和 batch/replay 校验。复用这些语义，不能只复用其事务前评分结果。
- `assessment-runtime/typed-form-facts.ts`：typed form facts 是表单科学/类型事实来源；旧字符串答案是兼容投影，不倒置权威。
- `situational-final-submit.service.ts:329–407、446–454`：SJT 原始提交、科学结果、canonical 快照及父完成；协议事件不能简化成选择题答案。
- `server-version/backend/prisma/schema.prisma:3788–3814、3852–3868`：CompositeReportJob 同时保存 whole 原件和调度信息；compact fact 可以引用该 job 的 `(attemptId, attemptEpoch)` 原件。现有 FK 与不可变约束不可绕过。
- `scale/scale-admission.service.ts:210–255` 的请求内 runtime 复用、共享 AssessmentRuntimeArtifact/PublicTemplate/FrozenBinding、compact fact 与已有 batch worker 均优先复用。没有新增全局权限缓存的需求。

本节 `assessment-runtime/`、`scale/` 和 `situational-final-submit.service.ts` 均位于 `server-version/backend/src/modules/` 下；SJT 文件位于 `situational/` 下。实施前须按具体变更复核引用及消费者，不以本文代替代码审查。

## 3. 权威归属与五层边界

| 层 | 权威内容 | 允许派生/复用 | 禁止混淆 |
|---|---|---|---|
| 不可变定义 | 发布版本、计分/常模、runtime/artifact hash、冻结槽位与个体 binding | 按身份/hash 共享公共 artifact；请求内 verified view | 当前可编辑定义不能覆盖既有作答冻结版本 |
| 当前权限 | owner/recovery、有效访问上下文、应急停止、必要 admission/截止条件 | 单次命令内明确时点的验证结果 | 冻结定义不等于当前可提交；不能跨请求缓存可变授权 |
| 作答控制 | attempt epoch、执行模式、游标/单元终态、幂等绑定 | 状态 DTO、完成计数 | 客户端完成标志、计数不代替槽位/分支证据 |
| 最终事实 | 已接受原始答案/必要事件、submission/payload 身份、结果与 provenance | compact facts、canonical snapshot、可追溯引用 | 草稿、报告文本不能成为原始事实 |
| 报告投影 | 输入事实 hash、投影版本、生成状态 | 从冻结事实重建、缓存公共模板 | READY 不等于允许向当前访问者披露 |

原件不必重复存于每个孩子：若 compact fact 引用 whole receipt，必须保持可恢复 FK/hash 链。详细结果与 canonical 子集并非可随意删除的完全重复。首片不迁移/删除旧 answers、result、snapshot、report 字段。

## 4. 冻结执行模式和适用性

在新 attempt 的冻结阶段，由服务端决定一个版本化 execution profile（逻辑名称，字段承载位置在实施切片中明确）：协议版本、静态批量资格、槽位集合 hash、epoch、定义/runtime 身份、原件存储格式以及报告调度兼容版本。资格不可由客户端参数或当前 mutable definition 推定。

普通资格须能正面证明：受支持的冻结 runtime；仅静态 SCALE/FORM_SECTION；没有条件流程、变体/分卷、关系/特殊分析协议或未知 marker；所有必要冻结绑定齐全；量表使用的科学 context 已按现有协议冻结，本次答案不会改变它。服务端须基于冻结协议证明没有未解决的跨单元依赖，包括年龄/性别常模、参考绑定、资格判定、评分上下文及后续单元冻结；不能仅凭 FORM_SECTION 类型或无条件分支判定。未知依赖回到原路径。已有 context 由服务端回执及 context hash 绑定，命令不能替换。不完整/未知/历史模式回到现有协议，不把 undefined 当作“无特殊能力”。有未知实际子记录时保留现有完整性检测，不靠空数组隐藏。

部署开关只控制新 attempt 的入组；已入组 receipt/job 必须在关闭新入口后仍能恢复与完成。不得让一次重启切换同一 attempt 的执行协议。首片不改变旧 attempt 模式、不把所有现存开关一并合并或删除。

## 5. 逻辑状态机

三条独立轴，不覆盖现有枚举的兼容语义：

1. 提交：`EDITABLE → ACCEPTED`。事务未提交仍为 EDITABLE；非法输入/过期 epoch/权限拒绝不进入 ACCEPTED。ACCEPTED 对该 epoch 绑定的最终 payload 不可修改。已有特殊路径保留其单元状态机。
2. 物化/报告：`NOT_REQUESTED → PROCESSING → READY`；可重试失败回到 PROCESSING，治理阻断进入 `BLOCKED`，非自动可恢复/耗尽策略进入 `NEEDS_ATTENTION`（对外错误码与现有状态映射待契约确定）。失败不撤销 ACCEPTED、不要求用户重填、不删除原件。
3. 可见性：现有立即/定时/角色策略。READY 且当前访问允许才返回报告；READY 但尚未开放只返回不泄漏内容的状态；已开放但 PROCESSING 显示已提交、报告生成中。

ACCEPTED 必须意味着提交时应做的身份、完整性、必填、模式和科学 admission/治理检查已经通过，且原件与恢复工作已 durable commit；不能把“以后 worker 再判断是否有权提交”包装成成功。昂贵的确定性计分/报告可后置，具体哪些检查可后置须由对应适配器明确列出，未知则维持原同步验证。

## 6. 命令与响应契约（拟定，不是已存在路由）

复用/版本化现有 whole 命令与恢复入口，避免平行 API。实施时以现有路由命名约定落地。

### 最终提交命令

请求携带：`attemptId`、`attemptEpoch`、`protocolVersion`、`submissionId`、冻结 `slotSetHash`，静态槽位答案集合；后续混合版本另含已接受单元回执引用。服务端解析和规范化后计算 payload hash，客户端 hash 仅用于匹配，不是证明。hash 必须覆盖协议、epoch、冻结身份、槽位及答案/相关回执身份；规范化使用现有 canonical 工具，明确顺序和数值类型，不能任意重写既有科学 hash。

身份从认证/匿名恢复上下文取得，不接受请求内 owner。限制 envelope 字节、单元和答案数量，不因批量扩大既有限额；在持锁前完成便宜格式拒绝和可复用解析。

响应为小型 receipt：`submissionId`、`attemptId/epoch`、`payloadHash`、`acceptedAt`、提交状态、报告生成状态、后续状态读取位置及必要控制摘要。未开放时不附报告；默认不把完整 runtime、原始答案或每个详细 result 再发回。响应 HTTP 状态码、已有错误码映射在契约切片中固定并保留旧消费者。

### 状态和恢复读取

仅以服务端已保存 receipt 为准，重新核验当前请求的 owner/recovery 与披露权限。查询既定 attempt/epoch/submission 身份，不提供跨用户 submissionId 枚举。返回接受状态与报告状态，不从客户端本地标记推断成功。请求超时后客户端先按原 submissionId 查询，再重发同一 envelope；不得自动生成新 ID 造成重复提交。

### 幂等规则

同一 attempt/epoch、同一 submissionId、同一服务端 canonical payload：返回原 receipt，不重写原件、不重复计分/入队计数。相同 ID 不同 payload、不同 ID 竞争已经接受的最终提交：明确冲突，不静默覆盖。历史重复提交行为如需保留，由旧协议适配器承担，不改变新协议定义。重放仍做必要当前身份/披露核验，但不任意套用新发布版本重评分；治理中“停止新收集”与“撤销历史读取”沿用现有各自规则。

## 7. 原子边界与两种受控执行方式

### 首片：同步事实、可异步报告

复用现有事务 primitive，按稳定顺序获取父/孩子及必要治理锁；事务内重新核验 owner/epoch/冻结绑定、父状态、admission 和停止条件；一次保存所有普通静态单元的原始事实/typed form facts、canonical snapshots、父接受状态、幂等 receipt 与必要 outbox。任一必要单元失败整体 rollback，不对用户表示部分整份提交成功。新原子协议须在同一事务验证命令内静态表单事实及已有服务端接受的上下文回执，不能原样沿用旧 whole 的 requiredFormSlots 全部预完成条件，也不能从客户端标记补齐完成槽位。尚未支持同一事务客户端的表单 writer 必须先抽取原有逻辑，而不是在批量入口嵌套独立提交。

事务外允许预解析/预计算，但写入必须重新绑定受锁记录；发生竞争时不能把预计算结果套到赢家 receipt。同步 report 可在提交后生成；worker 模式同样从已提交事实生成。**commit 之前不发送成功响应。** ACK 丢失通过 receipt 恢复。

### 上下文表单的后续扩展条件

若希望人口学/背景表单与依赖其 context 的量表真正同一 envelope，必须先由原 typed-form 适配器规范化/验证上下文事实，在权威作用域下生成并绑定唯一 context hash，然后使 admission、参考选择、计分及写入全部使用同一上下文；事务内检查没有并发改变/跨 epoch。不能仅凭 envelope 原子落库就认为科学绑定正确。该能力不属于首片；在适配器证明及对应参考/常模/上下文竞争测试通过前，保留上下文先行，不承诺任何静态表单均可直接合批。

### 后续选择：durable envelope、延后确定性物化

仅在首片资源证据表明必要时扩展既有 whole receipt，而非第二套 intake 表：一次事务冻结并接受完整原件、提交时验证证据、父接受状态和 durable outbox。worker 可以逐单元幂等物化，但父报告只有在全部必需事实完整且校验通过后 READY。外部只能看见一个已接受 envelope，不将内部部分物化冒充可用整份报告。

此方式不自动适用于所有科学协议，不能把提交时治理检查推迟。worker 仍须执行现有必要 runtime/hash/lease/治理校验；遇到后续停止须进入逻辑 `BLOCKED`，保留原件及接受身份，不继续绕过现有停止守卫、不宣告 READY，也不把已接受的提交改称未提交；损坏则保留证据并进入受控故障/人工恢复流程。恢复必须经当前授权和必要科学检查，不自动解除停止。接受后治理变化对尚未物化结果的处理沿用现有规则，若需改变由产品/安全单独决定。首片不引入此额外模式。

## 8. 混合和高级协议

SJT、认知任务继续服务端呈现/计时/事件/hash 与原科学提交入口；条件分支保留冻结路径证据，关系测评保留参与者/关系与分析绑定，分卷保留 allocation。不可直接将这些任务转换为一次裸答案批量 POST。

后续混合 envelope 可以引用服务端已接受回执，但事务必须验证其属于同一 owner/父 attempt/epoch/冻结槽位、定义/runtime 身份、终态、submission/payload hash 和 source provenance，且不能重复填充或遗漏 required 槽位。客户端 `completed=true`、其他 attempt 的合法回执、旧 epoch 回执均不构成证明。先完成的高级单元保持原独立事实，不因后续静态批量 rollback 而删除；整份父接受必须验证引用齐全，语义是“原有事实加本次静态事实组成完整 envelope”。

未知协议、未实现混合适配、缺失必要原始事件或分支证据继续现有逐单元路径，不静默降级科学校验。

## 9. 草稿、回退、离线和恢复

草稿与最终事实独立：复用 server checkpoint 的 revision/CAS、expiry、累计预算和终态清理规则；自动保存频率及离线承诺本轮不新增。IndexedDB/localStorage 只作可丢失的本机副本与 receipt 查询线索，不能当作提交证明或唯一跨设备恢复来源。

在普通问卷真正启用“最后一次提交”前，必须核对其现有草稿保障不会因取消逐单元 final 而降低：可复用现有服务器 checkpoint；若新整份草稿格式尚不受支持，先保留现有逐单元保存路径，不直接切换 UI。最终命令携带完整最终答案；不能未经 revision/hash 绑定把后来变化的草稿当成最终 payload。

返回修改/上一页、允许更改已提交单元以及跨设备离线冲突均保留现有规则。用户允许最终整份提交不等于允许撤销已接受事实。checkpoint 清理不删除 receipt/fact，遵守现有预算记账约束。

## 10. 队列、lease 和原件保留

复用 CompositeReportJob 的 `(attemptId, attemptEpoch)` 唯一键、requested/claimed revision、leaseToken/leaseExpiresAt、nextAttemptAt、预算许可和重试机制。只有持有当前 lease/revision 的 worker 可以提交对应结果；过期 worker 的完成写入必须失败。崩溃重试通过事实唯一键和 payload 绑定恢复，不产生第二份原件或重复释放预算。重试上限、退避和管理员恢复入口沿用现有配置，不新增无限重试策略。

`CompositeReportJob.wholeAnswersEncrypted` 并非普通可删队列载荷：AssessmentResultFact 可能以 rawReceiptAttemptId 引用它。`20261016130000` 迁移中的不可变/引用保护与 schema FK 必须保留。队列完成、预算释放、清理任务、关闭开关都不是删除 receipt 原件的授权。所谓 detached receipt/backlog 能力也不能被描述为已存在独立原件表。

若将来拆分 receipt 与 job 的物理生命周期，必须先盘点所有读取与引用、双读兼容和恢复证据，再单独迁移；本文不授权删表、删原件或改变保留期。

## 11. GET 副作用的迁移

当前 `composite.service.ts:3980–4003、4619–4634` 的状态 GET 会准备当前单元/推动完成与修复。不能直接改成纯 GET，否则会破坏掉响应、旧父状态和 crash recovery。

新命令在事务中保存接受与待执行意图；必要 advance/finalize 通过现有幂等服务/outbox 的显式执行路径完成。先验证重放与修复可以不依赖浏览器 GET，再对新冻结协议去掉 GET 写入。旧协议 GET 修复暂留，记录退役条件，不借新协议偷偷移除旧恢复入口。返回 next-state 摘要可以减少一次重读，但不能仅把同一全图读取搬进 POST 就声称减少数据库工作。

## 12. 最小实施切片与提交顺序

| 顺序 | 新行为/边界 | 复用点 | 必需针对性验证 |
|---|---|---|---|
| 0 契约与资格 | 明确版本化 ordinary profile、错误和 receipt DTO；入口默认不启用 | 冻结槽位、marker、whole 身份规范 | 普通/纯表单资格；unknown/legacy/flow/variant/关系拒绝入组；缺失字段不视为 null；旧路由响应不变 |
| 1 原子静态提交（最小首个功能切片） | 新入组、科学 context 已冻结且本次表单不改变它的 SCALE/FORM_SECTION 整份最终提交；上下文表单仍先行；事实同步，报告可复用现有执行路径；不接高级混合 | whole canonical/receipt、scale batch、typed form writer、snapshot/outbox | 量表、表单、二者混合；上下文建立/改变拒绝合批并沿用原流程；一个单元失败全 rollback；锁内 epoch/权限/admission 变化；同 ID 重放/异 payload；并发最终提交；原件与 canonical 等价 |
| 2 恢复与前端接入 | 小 receipt、丢响应恢复；保留 server draft；生成状态与开放状态独立 | whole recovery/checkpoint、现有状态/report 授权 | commit 前断开/commit 后丢响应、跨设备恢复、本地缓存丢失；READY 未开放不泄漏；开放但 PROCESSING 不误报失败；键盘返回与刷新 |
| 3 无 GET 依赖 | 新协议显式完成与修复，逐步纯读取 | 幂等 finalizer、outbox、已有 repair | worker/API 各故障点重启；没有任何 GET 仍最终完成；旧协议恢复不变；多 worker lease 竞争 |
| 4 高级混合引用 | 服务端接受回执加静态批量 | SJT/认知等原适配器及 canonical snapshot | 错 owner/父/epoch/slot/hash、伪 completed、重复/缺失引用；原科学事件完整性；已接受高级事实不因静态失败丢失 |
| 5 按证据收敛资源 | 必要时 durable envelope 延后物化、共享 artifact/compact 引用消费收敛 | 既有 whole durable 原件、compact facts、runtime/template cache、batch worker | 崩溃恢复、原件引用、输出等价；API/PG CPU、峰值内存、锁时间、字节与时延，不只 SQL 条数 |

顺序 0–1 可拆成小提交，但不能在资格/原子性未完成时开放 UI。首个功能切片不得顺带替换 SJT、关系测评、旧存储或完整 worker 系统。每片仅运行受影响检查，复用输入未变化证据；之后独立审查，再进行隔离的重复前后测量。性能不改善或复杂度不合理时回退该片，不用开关永久堆积来掩盖失败。

## 13. 故障验收清单

- 身份与生命周期：另一用户/匿名 token、撤销/应急停止、admission 临界到期、旧 epoch、冻结 hash 损坏均沿用正确拒绝语义；必要最终时点检查在锁/数据库时钟边界完成。
- 原子性：任一 form/scale 验证失败、写事实失败或 outbox 失败，事务不留“已成功”的父状态；已有高级事实不被误删除。
- 幂等：双击、网络重试、两个 submissionId 竞争、相同 ID 异 payload、赢家回执与预评分结果不一致均有确定结果。
- 恢复：commit 前/后断线、API crash、worker claim 后 crash、lease 过期、重复唤醒、关新入口后旧 job 恢复；原件可读、事实不重复、预算不重复释放。
- 科学与投影：新旧路径对相同冻结输入的必要原始事实、计分、canonical、报告含义和 provenance 等价；不是只比较一个总分。
- 披露：PROCESSING/BLOCKED/NEEDS_ATTENTION 不泄漏答案、题库私密字段或未开放报告；READY 的每次实际读取仍有当前访问和释放校验。
- 兼容：旧 inline/compact 原件、job 引用、旧 whole、逐单元、特殊协议和已有 checkpoint 恢复均保留；没有 GET 的新流程和仍需 GET 修复的旧流程明确分离。

## 14. 未决规则与保守默认

未确认详细报告 SLA、失败后的人工处理承诺、草稿保存频率/跨设备离线保障、交卷前回看策略、已 final 单元能否修改、原始事件/报告保留期、旧格式停止支持时间。全部保留现有行为，不能借“允许/接受”自行指定。实施若碰到不可兼容规则，暂停该分支并请求具体决策，其余已明确切片可独立前进。

本设计预期减少重复控制图读取、解析、序列化和往返，但不承诺查询数或毫秒降幅。批量也会增加 envelope 峰值内存、锁持有时间和失败重试范围；提前报告投影增加写入/容量；缓存有容量与失效成本。验收目标是完整流程资源与可靠性改善，而非把安全检查藏到别处后仅减少表面 SQL 数。
