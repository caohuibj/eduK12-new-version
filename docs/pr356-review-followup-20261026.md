# PR356 补充 review 修复与候选交接

本记录覆盖 `22e4717`、`57c143f` 及另一份补充 review 的重复发现，沿实际调用链去重处理。接手时最新已推送为 `5c05355daf8a0b17087dc7139c9b410e43e870a4`，main 为 `ff8471e529e7b3c56e1e20f17d1e2581040fc896`，PR 为 Open / Draft，Actions 为 0。它们是本次收口前的历史身份；最终产品提交、控制提交、完整 tree 与 merge preview 另由精确冻结清单和候选触发记录确定，不用旧 SHA 代替。

## 修复对照

| Review 发现 | 结论与最终处理 | 实际证据或未执行边界 |
|---|---|---|
| School / Teacher 被套用 Training 新准入 | 成立。独立新 START/restart 按数据库中实际 principal 的 accountDomain；Teacher 会话仍是 SCHOOL 域。旧 Questionnaire 从数据库读取 creatorId（匿名入口使用 token 已绑定的真实 questionnaireId）。组织资源保持共享入口。来源访问、发布、部署、归属和适用性检查保留，不能由 caller 的 product 声明替代 | 合成独立 PostgreSQL 2 例通过；共享发布/守卫契约 11 例通过。没有宣称传统 Questionnaire/组织资源完整 HTTP 都已跑 |
| 已开始作答 FINAL 重查当前 Training 准入 | 成立。独立 FINAL/已有 admission 先验证原轮次、冻结 runtime 与主体，再执行共享紧急停用；普通组合当前 epoch 只免重复准入，仍执行紧急停用。新 START/restart 不借旧轮次豁免。精确 STANDARD 已入场及持久回执保持其单独的冻结完成合同 | 新增普通 child 紧急停用反例 1 FAIL→1 PASS；真实 PostgreSQL 生命周期 1 PASS，涵盖 restart/旧 epoch、撤回准入、错误主体、紧急停用与历史完成保留 |
| 原冻结 21B 被后来的入口管理员身份替代 | 成立。记录为委托依据时直接复验原 grantId、原工具、TRAINING 作用域与 material.distribute；新任入口角色不能替换原委托。原角色依据的新发放合同保留；撤销只限原发放者的有效精确根或现有 SYSTEM 紧急路径 | 73 项原组的实际结果为 72 PASS/1 消息合同 FAIL，修正消息后只补该 1 PASS；不冒称原 invocation 全绿。真实身份变化、根撤销与历史读取已补进原 vertical case，留待 Actions 唯一执行 |
| Training 整卷/当前单元刷新读实时指导语 | 成立，已在 `0e8e1181b` 修复。runtime 中有字段时读冻结值，包括显式 null；仅旧快照缺字段兼容行文本 | 现 receipt 用例补行文本变动后的整卷/current-unit 断言。当前完整正常 worker invocation 未在本地重跑，留到 Actions |
| 独立量表 START/恢复/重启返回实时指导语 | 统筹沿真实共用 responseEnvelope 再确认一处同类遗漏。复用已加载 runtime 的 instruction，冻结文本/显式 null 优先；只有旧快照缺字段才回退行文本，不增加数据库读取 | 无 mock 实际 helper 先复现文本错误 1 FAIL，修后 1 PASS，含三种冻结状态。原 registry-mocking 夹具阻塞导入的 5 秒/30 秒失败原样保留，不当作产品红例。只对此文件追加静态诊断 0 |
| Survey 默认逐题指导语遗漏 | 成立，已在 `0e8e1181b` 将冻结 unit instruction 传入逐题组件 | 真实 PublicApp 恢复→逐题展示→FINAL：1 FAIL→1 PASS，52 个过滤项不计通过，FINAL 协议不增字段 |
| 精确标准组合指导语遗漏 | 成立。Survey 与 Training 均从已批准 CONTENT reference 的 metadata 取版本化指导语并校验 metadataHash，不从后来 registry 默认值取值。将原 instruction schema 原样移出循环依赖，不改 schema 合同 | 首次 import cycle 0 测试未执行，修后 9 PASS/1 夹具 FAIL；仅补精确组合夹具 1 PASS、2 filtered。保留全部原报告 |
| 成人在同一参照集重选高中分层 | 成立，`57c143f` 已把完整身份/阶段谓词用于 resolver 可见条目，`5c05355d` 禁止成人与学校点被标 COMPATIBLE_LATER_REFERENCE；只保留学校间既有明确跨学段许可 | 原混合参照 3 FAIL；受影响组 12 PASS。成人/学校兼容标记另 1 PASS |
| 同一参照集多个年龄窗共用错误生效日 | 独立复核额外确认。按真实冻结人口在既定 referenceKind 下选唯一窗口；LATER 每点核 generatedAt，TIME_MATCHED 每点核施测时间。缺失人口或歧义不可提前启用，不合成年龄 | 新 3 例修前 2 FAIL/1 PASS，修后 3 PASS；因生产 selector 改变，再只复验受影响原 13 例，13 PASS，新增 3 例未重复 |
| 精确组合授权/发布前未核入口批准 | 成立。发放、choices 和新的 COLLECTION 来源均核精确组合 TRAINING 策略；HISTORY 不重新套当前准入 | 早期定向 68 PASS；后续严格委托、新 DTO 用各自非相交报告保留。真实完整链留到 Actions |
| 原生量表仅 Survey、组合已获 Training 的双准入矩阵 | 用户明确选择“精确组合独立准入”。组合 START 依自己的精确批准/当前使用权/部署/来源完整性/停用合同；普通 item 仍走原生 Training 准入，逐 item 区分，同一物理 Scale 不能借组合豁免 | 原 vertical case1 现用真实 SURVEY-only 原生发布，并断言其 Training 被拒，随后精确 TRAINING 组合继续全链；尚未执行该新完整 invocation |
| 教师网页缺精确组合选择与提交 | 成立。仅已支持的 Training COURSE 展示获授精确组合，POST 提交 combination 指针和 scaleId；同内容不同 P/R 显示独立版本，none-v1 显示未配置。保存/刷新由严格解码的冻结 summary 返回版本标签，不泄露 grant/hash/内容，也不依赖后来当前授权 | picker、原生工具兼容、新轴标签、GENERAL 范围均有定向报告。最终两个新 UI 用例各 1 PASS/83 filtered；summary 隐私/校验 1 PASS/74 filtered，choices 1 PASS/73 filtered。前端最终 app types 退出 0，改动 UI lint 退出 0 |
| 父级前端 mock 旧状态页 URL | 成立。精确改为实际分页 `?limit=25`，未用 URL 前缀匹配吞掉查询 | 1 PASS/16 filtered |
| CI 冻结清单仍绑定旧 blob/tree | 成立。旧 48516ef 清单不能用于后续源码。业务与普通证据文档提交后，从完整 main→产品 HEAD 原始 NUL diff 统一重生成路径/status/mode/blob、两组件 tree、schema/locks；校验保持严格 | 最终冻结尚待本业务提交完成。不能将当前未更新清单称就绪，更不能放宽 SHA 校验 |
| consumer 重跑用错 artifact attempt | 成立，`cf00cb039` 已以成功 producer 的原名称/ID/attempt 传递；本轮补下载前非空、同 run/head、精确名称拒绝，缺输出不 download-all。source 顶层反向 import 的实际 CLI 卡死也已最小解除 | 控制契约和真实 CLI 拒绝有独立日志。尚未故意触发远端失败/retry，不声称真实 retry 已完成 |

上两轮原始 11 项（UTC、预算版本边界、独立指导语物化、批准幂等/审计、状态分页等）的修复和报告见 [原修复记录](pr356-review-fixes-20261026.md)；本轮没有回滚它们，也没有重跑未受影响整套检查。

## 证据、输入及执行边界

原件目录 `/workspace/scratch/pr356-review-followup`。随附 [机器索引](evidence/pr356-review-followup-20261026.json) 记录每份真实 reporter 的 SHA-256、原 pass/fail/pending/success，以及实际退出 receipt/log。CI 控制证据另在 `/workspace/scratch/pr356-ci-closure-20261026`。过滤、全部跳过、0 测试和 setup 失败均保留，不能计 PASS。分段通过只说明列出的不同用例，不改写任一原 invocation。

本轮前端最终 `tsc -p tsconfig.app.json --noEmit` 退出 0；后端仅选 17 个已改生产文件做 syntactic/semantic 及 program options/global diagnostics，0 error，不 emit。后端最初 17 文件 receipt 保持历史身份，最后独立响应修复后仅追加该 1 文件的诊断 0；其余 15 文件的旧 SHA-256 与当前一致，schema 拆出文件仅删除末尾空行并另记前后 digest，最后响应文件使用新的精确 SHA-256，不覆盖旧 receipt；前端类型记录有真实退出码与日志 digest，但未生成执行时签名或完整当时源码 manifest。所有本地资料均为开发观察，`ciExecuted=false`、`originalExecutionSigned=false`、`qualificationClaim=false`；收集时的工作树绑定不能反向补签执行身份。暂存检查发现两个新增文件末尾多余空行，随后只删除末尾空行并保留前后 digest；无语句/合同变化，不因此重跑测试。正式干净生产编译只在计划的 Actions producer 构建一次。

复用节点已有 Node 24.21.0 / npm 11.9.0、锁定依赖和当前 Prisma Client；本次 followup 未改两端锁、package 声明或 schema，仍是 main 230→候选 237 个迁移。数据库仅使用本地 127.0.0.1:55439 的合成隔离库，Redis 127.0.0.1:56380；未连接生产。

最初一次大范围权限改写被自动审批拒绝，状态 denied、已知未执行，理由是未验证的广范围权限变化可能扩大访问。原动作已放弃；随后基于真实失败、用户明确业务决策和逐路径边界完成最小替代修复并验证，没有绕过拒绝或重试原动作。

## 进入 CI 与最终合并的剩余边界

最新接管要求为：精确候选准备后先交 dot 独立审查，收到针对同一 head/tree/base 的明确放行后才激活。当前未 dispatch、未 Ready、未 rerun；保留 [Notion CI 清单](https://app.notion.com/p/404d27635a388186ac80de3593da05a5) 的同目标失败累计规则，正式 CI 失败为 0，未虚构事故回写。

下一唯一执行位置为计划中的限定 Actions：完整 source 身份、锁依赖审计、旧 230→237 升级/还原与真实旧 FINAL/报告读取、正常 fresh Training vertical 4 例与真实 worker 1 例、backend/frontend 各一次 runtime 生产构建、同产物镜像扫描/状态页 Chromium、JS/TS+Python security-extended。它不自动授予 merge eligibility；现有 required `merge gate / ready PR` 与 strict up-to-date 保持，不能将 skipped 汇总变为成功，也不自动回退全平台 CI。

原承诺 NFC10 正反内容验收、PHQ 家族 HOLD、完整 Training 纵向、356-01 cold/hot 基线以及其余 opt-in 的正式资格仍分别保留 NOTRUN/BLOCKED/HOLD。来源与缺口见 `docs/pr356-ci-preparation-20261026.md`、`docs/pr356-standard-dual-entry-20261026.md` 及原 PR 计划，最终由独立接管方核对实际合并范围和证据链，不静默删项、不新增 MOT。本记录完成 review 修复与候选准备；不声称完整功能验收、正式 CI、可合并、已合并或上线。

## a65 独立复核后的 child 物化修复

独立接管方在已推送 `a65cca258d0c70933cf2378c64b0ef189617b6fe` 发现新的确定阻塞：`createChildRecords` 读取 `attempt.compositeAssessment.productKind`，但真实 Prisma `create({data})` 和 `findUnique({where})` 都只返回 scalar。此前 standalone 的两个边界用例未覆盖这两条组合调用，旧 lazy 测试又在 runtime sentinel 提前结束，不能证明 child 创建。

现以调用者已加载的 server-owned composite 显式传入两个真实消费者，不添加 include、默认产品判断或重复数据库读取。新本地 PostgreSQL 回归用真实 ordinary course START 和教育内部 relational START 验证 scalar 父返回、真实 child 持久化、runtime hash 与冻结槽位。它使用明确的既存历史描述性发布夹具，不冒称新 STANDARD 审批或完整教育资源分发验收。补齐首次未完成的教育夹具后，修复前两个消费者均真实 TypeError；修后 2 PASS、零 skip，成功库保留不重置。

普通 Training flow 在父 START 已冻结全部候选，未物化的当前 SCALE 不能因后来普通准入撤回而重新走新入场。专用 materialization resolver 现把它原已验证的返回对象绑定到同事务、父 id/epoch、唯一当前 item/Scale；guard 只接受这个原对象，把当前普通候选视为 entered，仍执行真实共享紧急停用。复制、伪造、错事务/父/epoch/item、未来 Scale 或扩大 item 集均拒绝，不添加 SQL、第二次解密或第二次 resolve。精确 STANDARD 的独立合同未改，也没有把此证明用于未验证的其他候选。

新增真实 resolver→真实共享 guard 的报告为修前 10 FAIL/2 PASS；修后只执行受影响 11 PASS，1 项过滤并复用原通过，不冒称整次 12/12。实际 lazy 消费者夹具去掉 transaction parent 的伪关系，新增两例越过 runtime 加载进入真实 guard/child 创建；成功例仅在物化事务完成后的公开投影读取边界停止，不宣称整个 HTTP 响应已验收。紧急停用例在实际 child 创建前 409。原“停用后物化成功”的旧测试名改为实际验证的“runtime 不可读时未触及采集守卫”，原断言保留。

该消费者文件首轮 5 PASS/5 FAIL：四个负例是 scalar 夹具过早复制未反映后续变更，一个新正例是手写槽位缺生产 `scaleCode`。仅修夹具并复验相关 6 例，6 PASS/4 filtered；其余原通过保留，不改原 invocation 为全绿。单独检查本轮三个生产文件 TypeScript diagnostics 为 0；前端、其它后端文件和旧 PostgreSQL 成功未重跑。

原件仍在本目录索引，新增 reporter、实际命令/退出与有限输入 SHA receipt 将随控制证据中的 `followupReports` / `followupAttachments` 原始字节移交，不能要求独审节点访问这里的绝对路径。a65 曾已本地 apply 的 CI 清单随新业务修复明确失效，尚未提交为最终冻结、未触发 CI。最终新候选仍须独立放行。

## b5 独审后的 exact flow 与普通 durable ACK

独立接管方继续核对 `b5e9bb81741db686939f23547c2cbc569b58879c` 后，两处剩余 R1 边界成立；不把前一小步说成全部闭合，也不撤销其已经证实的修复。

- 合法 Training COURSE flow 并未拒绝精确 STANDARD 组合，父 START 已冻结全部候选。现在专用 resolver 也为当前 exact SCALE 产生同事务原 proof，真实物化调用与 standard collection 均已接线。仅这个同父/epoch/item/Scale 当前候选按已入场处理，继续走原 HISTORY 全量 reference/measurement/C/P/R 身份验证；使用权/入口后来撤回不能替换或重开来源。新 START 继续核当前授权，whole ACK 仍必须有实际 current-epoch child，proof 不能替代它。新增真实加密 resolver＋冻结 parent binding＋HISTORY 守卫 13 PASS、零 skip；首轮新增 blockKey 夹具错误的 13 FAIL 保留，不当作产品复现或删除原校验。
- 普通非 exact 整卷有一条真实合同冲突：receipt 注册先前未检查来源停用，而 singleton/batch worker 后来重查共享停用。三个独立 PostgreSQL 反例实际复现了停用后错误 ACK，以及已 ACK 后两个 worker 路径进入 FAILED。现在所有新 whole ACK 都在 receipt 的同一事务核对实际 selected child/id/item/epoch 并持有共享来源/停用锁；ordinary 使用共享停用合同，exact 保留其独立冻结合同。原 ACK replay 不重新准入。
- worker 消费 ordinary RAW 的豁免只在实际 current-epoch child/item/Scale 集完全匹配，并通过数据库 receipt/submission/hash/acceptedAt/current lease/slot/context/mode/非空 RAW 验证后生效；没有客户端 skip 参数。single 与 batch 都显式传当前 epoch。原 receipt fence 先锁 job，再用新的 statement 与 UTC wall clock 校验，避免等待锁后借过期 lease；canonical 写后既有最终 fence 保留。
- 开启所有 ordinary source callback 时不能退化 detached backlog。callback 事务保持 `budgetHeld=false`、不触碰或等待旧共享 budget、NULL queue depth 合法；legacy 仍使用原 permit。锁定后还核当前 manifest hash；没有关闭 detached、放宽扫描/授权或修改 schema。

实际验证分开保留：新 outbox 产品红轮 5 FAIL/4 PASS（另有最早 tag 夹具错误）；修后选中 8 PASS/13 filtered，其中 7 个直接新/受影响用例和 1 个既有 whole consumer，未变的拒绝/replay 原通过继续复用。三个真实 PostgreSQL 旅程各自为修前 1 FAIL/2 filtered、修后 1 PASS/2 filtered；single/batch 直接恢复原 FAILED job，保持原 ACK/密文/hash，不重做先前已接受提交。停用前拒绝使用新的合法 fixture，原错误接收记录保留。两个真实 worker 均最终 parent COMPLETED、job READY，canonical 单元数及 ACK replay 无重复；旧租约、错误 payload hash/acceptedAt/epoch/item 均拒绝。detached ACK 同时跨过真实持有的旧 budget 行锁，没有等待它。

另只补一个尚缺的真实锁等待用例：lease 有效时 receipt fence 已在 job 行锁等待，等真实时钟越过到期再释放，结果为 LEASE_LOST；1 PASS/3 filtered，未复跑已经 READY 的两个 worker。7 个变化生产文件的有限 TypeScript diagnostics 为 0，原退出/source SHA 原件保留；这仍不是整个 backend 生产编译。

接收事务使用现有 callback 安全路径，ordinary ACK 不再走原无 callback 的单语句入口；detached 与 legacy 存储合同保持，但没有把其额外读写成本称为已测资源优化。原 356-01 资源/SQL/cold-hot 基线继续待审，不为本轮修复追加无关压测。旧正式 CI 与生产操作仍为 NOTRUN，全部新原件将随最终控制证据移交。b5 本地控制冻结随新业务明确作废，须以本产品修复提交重新生成完整候选。


## c064 独审后的 ordinary 测试编排修复

独审指出同一文件 single/batch 共用 database-name ledger：single READY 后 batch 会读入同一个记录并触发原 READY 禁止断言。此前分库、过滤执行的恢复结果有效，但不能证明整个文件一次执行成功。固定 `/workspace/scratch` 输出也不能直接用于 hosted runner。

现在仅改测试接入：fresh 显式配置 single/batch/prestop/lockwait 四个不同物理数据库，每旅程独立 ledger；逐 case 重置模块，并分别核实际 production Prisma 的 `current_database()`、`prisma` 与 `prismaObservabilityClient` 两个 global 的所有权，关闭自己创建的队列/客户端，未知现存客户端直接阻断。全库 claim 前要求队列只含本旅程唯一 parent/epoch，不能消费别的待处理作业；原 READY、停用、RAW、lease/hash/epoch/item、canonical/回放断言全部保留。

CI 的证据目录必须在真实 RUNNER_TEMP 内；本地显式配置受控根目录。拒绝越界/符号链接/覆盖旧 ledger。只有显式本地 replay 可读取指定 single/batch 未settled旧 ledger，先核 parent/subject/epoch/job/hash/cipher/source/停用，再允许 worker；原 ledger 只读，READY 仍拒绝，不会重新创建旧 fixture。测试不创建/迁移/清空数据库。

实际仅运行新 harness 的临时文件系统与 fake-loader/client 合约：最终 30 PASS、0 FAIL、0 skip。新 helper/unit 的 standalone strict TypeScript 退出 0（首轮 never-helper 控制流窄化错误退出2保留，改函数声明后仅复验该小范围）；三个测试文件语法转译 0 诊断。原命令、退出、三源码前后 SHA 与原 reporter/log 均保留。它们不调用 PostgreSQL 或真实产品模块，不是四旅程 PG 通过或全项目类型检查。

四库完整文件的新编排尚未执行，唯一未来位置是经独审放行后的隔离 PG job，一次无过滤4case，不能把旧分库结果换名成新文件成功。本轮未重跑历史 single/batch/prestop/lockwait，未构建、压测或激活 CI；只收口测试可移植性。新产品提交之后重新生成严格 source/blob/tree 清单，c064 旧冻结明确失效。普通新 ACK 的安全 callback 路径没有改回旧 atomic 路径，356-01 旧SQL/性能数字不代表当前候选。
