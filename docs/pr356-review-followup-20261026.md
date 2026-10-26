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
