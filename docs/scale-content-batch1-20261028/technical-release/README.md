# ARS-30 技术发布与隔离库单包入库

在 root 独立读取 source、计分/报告、测试和 17 文件原件后，按本任务明确批准，
仅将 ARS-30 `executable.releaseStatus` 从 DRAFT 改为 PUBLISHED。
这是技术内容发布，不是科研批准、译审通过、版权新增授权或生产公共发布。
原题文、五组 golden、计分/参数、指导语、报告及所有版本均未修改。
catalogStatus=CANDIDATE、scientificMaturity=PILOT、译审/专家 PENDING、
缺少 scientificReview 和原版权声明全部保留。

## 单字段与历史身份

| 源状态 | Git blob | SHA-256 |
| --- | --- | --- |
| 原 DRAFT（5e64d33 / b92c69 来源） | 08a648420b4413282bbd14ef6c23fb2be89b6209 | 970cd97ea150ae055e6a27096e99cd8e95d74dcf15ad7df3a1147121864f6b45 |
| 本次技术 PUBLISHED | 33c423f39f08ddb0706aa177ccc251554519c49c | 6bd98d3462d23146ae258d171fc81ef7fa993f3493af2b5a7428b98ed9ef9477 |

[source-change.json](source-change.json) 记录原/新字节数、唯一 JSON 路径差异和其余
16 个原文件仍相同的清单。上层 batch.json 的 17 文件一致性保留为原执行历史，
不覆盖原报告、原失败或原 hash，也不声称当前 source 仍与原文件完全一致。
既有版本冻结机制不改；先技术发布、再首次物化。本库无旧轴快照；未制造或覆盖
旧冻结行，也未放宽 `SCALE_AXIS_VERSION_CONTENT_CONFLICT`。

## 实际隔离库路径

数据库 `eduk12_scale367_9cd3f7ef4f` 在本云端 `127.0.0.1:55432` 新建，
先核实名称不存在，使用现有 `prisma migrate deploy` 初始化；无 seed。
只启动既有 PostgreSQL 服务，不启动应用、Redis、worker 或外部入口。
创建一个随机密码且已丢弃密码的合成 SYSTEM_ADMIN（TRAINING 账号域），
没有真实账号、组织或 capability 授权。数据库保留供本节点检查。

执行现有 `src/scripts/install-scale-instrument.ts` 与
`src/scripts/publish-scale-instrument.ts`（直接调用 npm scripts 对应的 tsx 入口）。
没有新 CLI、引擎、注册表或数据库状态旁路。安装参数精确为：

```text
--instrument-key ars30_2016_zh_cn_research --instrument-version 1.0.0
--locale zh-CN --territory CN --localization-version 1.0.0
--revision 1 --modes STANDALONE --actor-user-id <isolated synthetic admin>
```

| 现有 CLI 操作 | 实际退出 | 实际状态/结果 |
| --- | --- | --- |
| 未安装时 publication preview | 2 | SCALE_NOT_INSTALLED / DEPLOYMENT_BINDING_MISSING；无写入 |
| install preview | 0 | allowActivation=true / createScale=true；无写入 |
| install --apply | 0 | 创建 STANDARD 1.0.0，DRAFT/HIDDEN；ACTIVE deployment revision 1；冻结源/版本轴 |
| 相同 install --apply | 0 | 所核业务行、updatedAt、deployment、轴快照完全相同，不覆盖 |
| publication preview，PUBLIC / [SURVEY] | 0 | allowPublish=true，proof 绑定原 DRAFT/HIDDEN 和精确入口；无写入 |
| publication --apply + 原 proofHash | 0 | PUBLISHED/PUBLIC，一条 measurement release、一条 publication audit，仅 SURVEY policy APPROVED |
| publication 传 SCHOOL / TEACHER | 各 1 | 现有 schema 拒绝枚举；无写入，原非零退出不改写为成功 |

publication input、apply input、每条 argv、进程退出、原始 stdout/stderr 和各步骤
数据库快照见 [evidence/isolation-report.json](evidence/isolation-report.json)。
每次只读 CLI 前后所核业务行一致；这不声称数据库内部事务计数或序列从未变化。
安装阶段没有 publication audit，安装归属由 deployment.created_by_user_id 与冻结源记录；
真正发布后才产生 publication audit，不伪造另一类安装审计。

实际 scaleId：`34a32540-5a64-40c8-80db-e994c7f87e36`。
instrument/scoring/report/instruction/localization 均冻结为 1.0.0，references=[]。
冻结 source canonical hash 为
`9a96fdda238eda75684e42df2cad5929781c974c455019579e94756a0fa6ebb8`，
数据库源快照重算相同，重复安装及公共发布前后冻结快照未变化。
该 hash 是 schema 规范化对象的 canonical hash，与上面的文件 SHA-256 分属不同合同。
发布 proofHash 为
`15bc0be9ddb2961306540a7defa7a1c681c1255f2f69876dfe324643322d69c2`，
实际审计的 actor/proofHash 与预览及 apply 输入一致。

## 入口真实边界

| 入口 | 本次实际观察 | 未执行/不能据此宣称 |
| --- | --- | --- |
| SURVEY | 明确只选择此入口；实际入口 policy 守卫通过；现有 Survey 目录返回精确 1.0.0、available=true | 无研究者 grant、项目分配、被试作答或浏览器验收 |
| TRAINING | 未选择；实际 Training 新增使用守卫拒绝该源 | 不代表安装失败，不自动批准此入口 |
| SCHOOL | 现有发布 CLI 不接受此产品值；相同合成 TRAINING 域账号调用 School 目录被账号域守卫拒绝 | 未建立真实组织、适配、分发或 workflow；不能据此断言该包在所有 School 适配中不支持 |
| TEACHER | 现有发布 CLI 不接受此产品值；同账号调用 Teacher 目录被账号域守卫拒绝 | 同样未验证组织适配/分发，也不宣称教师入口已上线 |

标准量表公共发布沿用 Scale/measurement release/精确入口 policy/审计机制。
本库 `scale_library_entries` 为 0（另一个 CUSTOM_DESCRIPTIVE 治理来源路径），
不因此另造一套入库。content_capability_grants、material_grants、survey_tool_grants、
scale_library_use_grants、education_assessment_deliveries、assessments 均为 0。
这里的 PUBLIC 仅发生在合成隔离库；生产未查询、未写入、未部署。

## 检查原件和复用

隔离流程共 33 个断言通过，无失败，wrapper/subprocess/外层退出均 0。
原始 CLI 的预期拒绝退出 2/1/1 按原值保留，不能称这些命令退出成功。
另只运行受影响的安装/失效 actor 用例：1 PASS / 2 filtered，进程及外层均 0；
精确 fullName 和 reporter 见 index.json 与 evidence/released-source-install-actor.json。
首次用例的状态期望同步改为技术 PUBLISHED；未重跑其整个结构/指导语 case，
相同状态变化由实际 CLI 的选中源校验及安装/发布结果覆盖，不冒充整 case 新执行。
中间值计分/报告、原 golden 输入未变，不单独重跑旧套件。
新 CLI 进程会按既有机制执行选中源的冷缓存校验（包含内置 golden），本次未改
缓存或消除它；没有额外手工 golden 回放或全目录检查。

执行前后输入 hash 清单一致，Node、配置、锁及选定生成物/工具字节保留。
完整 node_modules 与进程环境字节未记录，凭据不入库；原件未签名。
迁移 stdout 含原生行末空格，按 evidence/log-transports.json 无损 gzip 保存，
原 SHA 不变；原 diff-check 失败与其外层退出区别保留，转运后 diff-check 实际退出 0。
这些是本次云端原件，是否接纳由 root 独立复核；没有运行 CI、全量测试、
tsc、build、SAST 或生产步骤。迁移仅为建立本次空库 schema，不是平台迁移验收。
