# 教育入口原生认知 T3 与新 main 整合检查点

2026-10-30。本阶段正常整合 `origin/main=dc796e04203696b4a579aa6fd2428df592031ee3`，
merge commit `bdd7f6987`。包含已合入的 #392/#393/#394，`.github` 相对该 main 没有差异；
没有改 Task 2 Bundle 引擎、计分、刺激时序或布局。本页接续而非改写
[前阶段 T1/T2 记录](education-cognitive-profile-progress.md)。

## 本次应用改动与检查范围

正式 Run 的两个读取接点此前遗漏精确 profile 身份：
`private-tool.composition-source.ts` 投影移除仅用于编辑的 `profile` 字段后交给严格
selectedBinding parser；`educationCompositionExecution.ts` 保留 seal 中的 artifact hash，
读出认知原 T1 指针，并以原入口验证 `COGNITIVE_PROFILE` 来源及精确 use。
只有带数据库封存身份的新 profile 格式走新授权链。旧无此身份的 Cognitive 仍核原
MaterialGrant；已入场续答保持既有策略，紧急停用仍生效。

本次直接风险是正式 Run 挂载失败、误借旧配置权、撤权后新 START 错放行，以及已入场
续答/旧报告漂移。主要验证位置为本节点受限角色的真实 PostgreSQL/保护 HTTP；另补
3 个定向 collection 边界单测及当前后端类型。没有再跑原同输入量表计分、全平台 CI、
无关引擎或规模压测。类型首轮漏声明可选 artifact 字段，补类型后通过；该补充不改运行行为。

新 main 的 package-key 合并冲突保留整包 key 与精确 profile 两种合法入口，2 个契约通过。
前端 main 整合后的新 tree 单次 build/类型通过，保留构建全部路径/hash；真实 School 管理页
只读连接恢复原已完成请求 1 case 通过、Teacher 1 case 过滤、0 POST。前阶段两入口实际
替换 POST 及只读恢复证据继续保留，不能将这次只读画面说成两次新授权写入。

## 独立环境、实际链路与回读

新库 `precise_education_cognitive_runtime_test_20261030` 从已迁移至 260 的前阶段库克隆。
仅 fixture 使用 owner 复用仓库原身份初始化器，准备新学校/教师组织、正常注册学生/教师
及草稿流程，8→13 名合成人员；没有重建科学内容、伪造 grant、session 或结果。
fixture 与正常运行证据分开记录。正式 manager/author/participant HTTP 始终为
`precise_task1_runtime`，无超级用户、建角色或 BYPASSRLS 权限。

所有试次使用现有 main reaction 1.1.0 / engine 1.0.0 / scorer 1.1.0，同一 config
`fdc65a61-68e1-4087-9218-059286d7b9ef`；profile 不是另一个 testType。
系统精确入口审批和全局 M 来源从原库保留；指定新组织的分发依据走原系统保护 API，
manager 签发 use、使用者目录选择唯一固定配置、保存/冻结两个根、挂载两个正式 Run
track、发布、参与者 consent/START、native FINAL/重放均走实际模块和权限中间件。
这是 loopback HTTP 集成，不是人工浏览器刺激体验或正式生产登录演练。

| 入口/profile | 实际试次 | 结果 |
| --- | ---: | --- |
| School experience | 8 | 原阶段分步续验；已完成原件只读恢复通过 |
| Teacher research | 60 | 原阶段分步续验；已完成原件只读恢复通过 |
| School research | 60 | 对应新流程完整链路通过 |
| Teacher experience | 8 | 对应新流程完整链路通过 |

体验 artifact `8ac36a4ea708c73367c55c0cba298a2ae21c1063f651fd6afe248bc7bd1ba4fa`；
科研 artifact `9029e5cbac5a6b16541954bf92df1fe81b2149accca9c6b758f7416357890027`。
T2 与 T3 都保留各自原 use ID、profile、hash；每次 attempt 使用自己的 seed。
两波各在入场后普通撤权：新的等待 START 403；原已入场 START 重放、seed 保持不变，
FINAL 幂等，父 attempt COMPLETED，冻结 T3 binding 不变。
另一 profile 的新授权也不能给原波等待任务开门。新授权及新任务完成后，原波已完成
反馈再次读取与之前 hash 相同；自有反馈 READY，其他使用者读取为原有隐匿资源 404。
未放宽报告访问策略，也没有以当前 grant 替代历史定义。

最后在 `SET TRANSACTION READ ONLY` 下回读 4 个已完成 native session、4 份
`CognitiveRawSubmission`、总计 136 次试次。用仓库正式解密/严格 parser 核原始数组长度、
attemptEpoch、schema 1、`CANONICAL_JSON_SHA256_V1`；不是旧 `CognitiveTrial` 行数。
4 条 waiting task 各 0 parent attempt。原生 unit terminal snapshot 与 session 身份一一对应。
没有在文档中保存明文试次、密码、JWT、私有检查点或密钥。

近期 proof/MFA 是合成签名会话。**现有限流代码在 NODE_ENV=test 下直接跳过限流**；
本轮未改限流、未冲洗 Redis，也不能据此声称验证了生产 15 次/15 分钟限流。
这也限定前阶段“保留 Redis 限流”一语：代码及配置保留，测试模式并未实际执行该限流。

## 原失败与有界恢复

原始命令、时间、退出、reporter、日志/回读及文件 hash 见
[本地原始证据](education-cognitive-runtime-raw.json)。原件保留，不改称首次全通过。

1. 首轮已完成每入口 T1 和一个冻结根，挂载报 400：SQL 多投影编辑 profile 字段。
   修 reader 后继续原根，无重复签发；挂载/发布 2 case 通过，START 仍失败。
2. 正式 manifest reader 丢 artifact 标记，错误要求 legacy MaterialGrant。补完整精确来源
   链后仅执行尚缺 START：两条 native 链实际完成、撤权/重放等断言已通过，最后错误期待
   他人反馈 403，而现有策略实际返回 404。保留已完成会话，不重新 START/交卷。
3. 首次只读完成恢复错误地统计旧 CognitiveTrial 为 0。改为原统一加密原始提交的正式
   parser，原 School 体验/Teacher 科研 2 case 通过、2 个发布 case 过滤。
4. 再用同一人员/组织/来源 M 的另一 profile 各建新流程，5 case 全部通过；这是新输入，
   没有重做原波。另一个 profile 的授权不得解锁旧 waiting，旧反馈 hash 不变。
5. 新增 collection 三边界单测通过；最终类型首轮失败和修正后的成功均保留。

前端主干整合 build 约 32 秒、类型约 61 秒；对向 profile 5 case 总计约 18.3 秒，含模块
初始化，业务 case 约 1.8/2.3 秒。它们是实际检查耗时，不是同环境主干 p50/p95 比较，
不据此启动性能改造。上述结果未签名，尚未被正式 CI 接纳。证据中的最后源码 hash 是
保存时快照，不倒填为每次旧 WIP 执行时的完整源码绑定；类型补充不改变运行逻辑。

## 当前边界与阻碍

- Training/Survey 既有精确 profile 原生流程和管理页实际写入见各自阶段；本次补的是
  School/Teacher 的正式 Run 接线和两个 profile。代表工具为 reaction；Survey 薄适配只
  支持已列出的 reaction/gonogo 无媒体/无 reference 配置，未声称所有 11 候选均四入口可用。
- 同一 C/P 的第二个合法、非空、已注册可执行量表 R 仍缺；null/GENERAL_ONLY 不能
  作为第二 R。新 main 十份教师素材为不同 instrument，Bundle 报告也不是量表第二 R。
  没有重新装载后编造新的量表总数，没有复制被拒 DOT 混合工程树。
- 完整权限/并发矩阵、所有认知工具、人工作答体验及规模性能未执行。本阶段复用既有迁移
  和初始化证据，未从空库重复整平台 setup，也不将克隆误称完整初始化验收。
- 正式 CI 最终控制路线独立复核仍 pending；没有为试错创建 PR 或触发 platform fallback。
  Draft PR 的精确候选资料可以准备，正式门禁未成功前不合并。无生产、真实用户授权、
  保护/安全设置变更或部署。
