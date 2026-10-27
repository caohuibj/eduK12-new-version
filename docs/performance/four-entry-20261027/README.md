# 四入口共同优化：基线与能力盘点

状态：M0 合并基线完成，M1 进行中；不是四入口优化完成或生产容量承诺。

- 主干：`dff80f0604163a04e2f5a8119d7d4295116eeb41`，tree `1273c9b0f9580f257bd9e3fab6a25d24b176a394`。
- PR357 正式 CI40455202809、main40455763941成功；未部署。
- [实施计划](https://app.notion.com/p/406d27635a38819ca344e5dd8074f7fe)。功能、科学、权限、耐久与幂等不退化，兼顾反馈速度、总体存储成本、可持续成功吞吐。
- 按能力选择最佳基础并推广到全部适用入口。实质业务差异允许独立适配，不强制统一权限或协议。

## 已有能力，不重新开发

| 能力 | Survey | Training | School / Teacher |
|---|---|---|---|
| 开始/恢复 | 研究波次冻结、checkpoint及任务回执协议 | CompositeAssessmentPage current-unit | SchoolCompositeRunner / HuiteacherMyScaleTasks 已消费 current-unit |
| 可靠交卷 | Survey FINAL事务、提交ID/摘要重放 | 普通同步与whole异步耐久ACK分开 | 共用FINAL、量表receipt已接入；Form section不等于整个parent结束 |
| 即时反馈 | 首次generalReceipt已回；描述报告仍需权限读取 | whole先接受再worker报告，不能把ACK称完整报告 | 完成后返回/刷新任务列表，另点本人反馈 |
| 读取复用 | frozen结果再读取，不在读取时重计分 | composite-report-read-batch已有请求内事实reader | 357已让canonical/display共享reader，并在异步后重新核当前权限 |
| 存储 | Survey结果密文和package report自有结构 | compact facts、whole引用、共享控制已有 | 共用runtime；不能由代码存在推断运行开关已启用 |

具体调用者：
- backend/src/modules/survey/final.service.ts；frontend/src/survey/SurveyPublicApp.tsx。
- backend/src/modules/composite/whole-questionnaire.service.ts；frontend/src/modules/composite/CompositeReportPage.tsx。
- frontend/src/school/SchoolCompositeRunner.tsx、SchoolStudentTasks.tsx。
- frontend/src/huiteacher/HuiteacherMyScaleTasks.tsx。
- backend/src/modules/reporting/education-scale-personal-report.service.ts。

Teacher 本人量表链明确拒绝进入认知/SJT，后端限定SCALE资源，不能为统一优化顺手扩权。
School composite宿主有COGNITIVE/SITUATIONAL适配和对应后端路由，但本轮未将它们标为实测通过；存在适配不证明任意候选内容已发布。
main认知FINAL仍有cognitiveRawSubmission写入，未合并PR360的native/COS候选不算既有生产归档能力。

## Survey首次/热态诊断：已取得，不冒充四入口基线

先运行旧夹具失败：新治理审批要求明确allowedProducts；原夹具漏传，随后仍尝试expectedVersion=0的重复准入。只修夹具：审批明确`['SURVEY']`，然后用真实`assertToolEntryPolicy`核对已获准入口，不绕权限、不模拟批准。诊断prepare通过；重新创建独立合成库后完整原探针exit0。

源码执行身份：本地commit`7bbfb0f26193ff32bfaa2d7e16f3613e67464b75`，等价远端commit`8771727c5e361a600025d1e8e7cdd2bee2c03463`，两者tree均`7c7127bce40dfbcd951279974b5603c611bbbc3a`。原件保留原本地身份，不补签为远端执行。

环境：dot本地Node24.22.1，Debian官方签名仓库软件包PostgreSQL17.11、Redis8.0.2；解包在本任务目录，不安装系统服务。新合成DB，restricted runtime role、精确runtime-table-policy；PG shared_buffers64MB/max_connections20/jitoff；Redis64MB，不落盘。未改生产或既有数据库。结束后两个自有进程已停止，数据及日志保留。

现有探针分别为三组启动新API进程，每组一个PROCESS_FIRST和一个PROCESS_WARM样本，无隐藏热身。DB在建库/fixture后可能已预热，所以不是冷数据库测试。HTTP driver在同一进程，CPU含驱动；test模式跳过普通Redis/IP限流，不是生产并发证明。

| 场景 | 首次FINAL ms | 热态FINAL ms | FINAL SQL事件 | 结果密文bytes | package报告密文bytes |
|---|---:|---:|---:|---:|---:|
| 普通20题Form |35.32|20.15|23|1116|0|
| Form＋native SJT |89.54|30.75|30|6686|0|
| whole Form/native package |103.96|83.16|31|6786|1412|

每组两样本均验证真实HTTP成功、FINAL唯一、丢响应后同回执重放/不改持久化事实；涉及native的还验证子任务恢复，package还验证授权报告。

这些数值仅为本地这六个样本，不求p95、不外推稳定并发、不声称用户端渲染时间。普通general读取10个SQL事件、约12–13ms，但首次GENERAL_ONLY前端本已消费inline receipt，不能把探针额外read当成所有真实用户都会发生的浪费。描述反馈另需专门fixture。

原测量文件在`survey-baseline/`，仅源码哈希/协议哈希、计数、字节及时间，无账号、密钥、答案、报告正文。physical allocation delta受页分配影响，不等于每份答卷增量；SQL事件时间不是DB服务器CPU，transaction区间不是精确锁持有时长。

## 待办与实施顺序

1. School/Teacher本人成果与Training同步/whole分别建立同口径代表链；复用合法fixture结构，但不能伪造Actions环境或绕现有CI-only fixture保护。
2. 补真正描述性反馈的读取/展示计时，区分授权延迟与多余请求，不强制提前开放报告。
3. 给四入口列工具/协议/阶段矩阵：已有待补证、缺代码、内容未批准、真正不适用分别标记。
4. 使用同等加密/恢复保障比较重复事实、模板引用及压缩；纯codec大小不是数据库总成本。
5. 完成正确性与代表基线后才进行有界并发，固定SLO、资源/开关与停止阈值，不关闭安全限流。

本轮尚无Training/School/Teacher同口径新测量、用户可见反馈端到端计时、四入口容量或生产成本结论。未运行新CI、未部署。

## 首个共享热点候选：School／Teacher 本人报告的 SQL 规划

定位过程与失败保留：真实报告HTTP基线School首读323.79ms/再读240.63ms，Teacher264.15/225.58ms。一次额外查询诊断发现同一权限SQL每请求执行两次，各约100ms；EXPLAIN ANALYZE显示planning98.94/96.82ms，execution仅1.50/1.13ms。不能因此删除前后两次权限检查。

先尝试把相关EXISTS包为标量子查询，planning仍103.51/92.88ms，没有可靠改善，已经撤回，未提交该实验。隔离PG进程的join规划限额诊断进一步证明联接枚举为热点；不将该全进程诊断参数用于生产或最终候选。

最终小候选只在`readEducationRespondentScaleReport`的现有事务内使用固定`SET LOCAL join_collapse_limit = 1`，依已有单execution ID锚点的显式联接顺序限制规划搜索。没有改变SQL授权谓词、两次readOwn、报告投影或版本规则，没有权限/结果跨请求缓存。只影响这一事务，提交/回滚后由PG恢复池连接设置。没有更改全局/数据库/角色配置。

默认PG配置下候选HTTP观察：School首读90.01ms/再读55.05ms；Teacher49.00/47.64ms。每次多1条事务内设置语句，SQL总数21/20；四次读取均验证报告READY，并在前后确认同一backend session、join_collapse_limit恢复为8。响应均1655bytes。不由少量样本推算生产改善百分比或吞吐倍数；高基数/并发与其他版本仍须评估。

检查：5项服务编排单元断言保留两次当前权限读取及先执行SET LOCAL；3文件9项真实PG覆盖School/Teacher公共库与私有版本、图片与独立权限、作者变更/撤回、家长及教师他评不得获得个人报告。5根/1567源码的定向类型闭包0诊断。初轮类型诊断13项来自漏带Express全局声明，另1项为已有测试fromEntries直接断言；补正确ambient根及纯类型unknown转换后通过，原失败留存。没有全平台重测或新CI。

范围不是“只优化两入口就关闭四入口任务”：该具体权限SQL目前由School/Teacher共用，二者一起修；Survey/Training不是该SQL消费者，继续分别核实际热点和反馈链，不给其加无用设置、不宣称整体任务完成。

脱敏记录和探针源码快照：`education-report/`。source manifest绑定本次产品文件字节；旧基线与候选、无效实验、环境诊断分开。测量日志与合成DB仅留dot本地，无生产数据。尚未合并/部署此优化。

## Training 整卷代表链（06:23 UTC）

原件在`training-whole/`。固定两个3题量表的既有合成outbox fixture，**预先准备的parent/children不是通过产品发布/START产生**，不能把本诊断当完整发布旅程。使用真实认证Composite路由进行whole definition、durable ACK、同摘要重放、report-status与授权report读取；手动claim真实lease并执行真实worker，不伪造READY或报告。

| 阶段 | 首份prepared ms | 第二份prepared ms | SQL事件 |
|---|---:|---:|---:|
| 整卷定义 |158.65|21.85|27|
| 耐久ACK |33.74|11.12|13 / 12|
| 同回执重放 |7.37|5.31|3|
| worker处理前状态 |9.76|6.04|6|
| claim＋worker＋READY校验 |246.87|52.70|70|
| READY状态读取 |7.65|6.33|6|
| 授权完整报告读取 |10.18|6.37|6|

两次都验证ACK接受、重放不变、处理前不是READY、真实worker后READY且两个不可变量表FINAL存在。worker耗时不是生产排队时间；整体用户等待还包括浏览器、调度和网络，不能将单个ACK作为报告可见时间。Node/PG/Redis同前述版本，另建独立合成DB，async/whole/durable-backlog/atomic-receipt开启，background worker自动循环关闭，compact/shared-control未开启。结束时自有进程均停止。

现在四入口均有一条代表性观测，但口径不完全相同：Survey是独立研究协议；Training是prepared whole链；School/Teacher是service completion＋实际权限报告HTTP。完整工具矩阵、浏览器展示、同口径容量尚未完成，不把它们直接排名或计为M1全部关闭。

## 有界并发与已有存储机制（06:32 UTC）

不是持续容量：对每入口一个已完成合成报告，分别concurrency1/4/8、每档24次、单请求5秒上限、任一失败停止。School/Teacher合计144次HTTP均成功。School三档批次耗时733.7/368.2/358.7ms，单请求最大82.1/105.8/160.6ms；Teacher665.2/268.5/282.8ms，最大51.4/57.2/109.7ms。批次后规划设置恢复8。不是不同用户到达模型、不是长期稳定负载、不能用24/短批次耗时外推生产吞吐。

已有`ASSESSMENT_COMPACT_FACTS_ENABLED`与`ASSESSMENT_SHARED_CONTROL_ENABLED`在独立合成进程对照开启，没有改生产开关，没有新存储引擎：

- Survey三个场景再次完成原六个HTTP样本及持久化重放验证。选中结果密文：ordinary1116→546bytes；native-mixed6686→2275/2279；whole-package6786→2295，包报告1412→718。不是总DB空间或备份费用。
- Training prepared whole两样本在这两个开关开启下，真实ACK/重放/worker/READY/报告同样闭环。
- School/Teacher真实私有量表完成和授权报告均正常。明确8张运行/事实/模板表的fixture＋完成逻辑行增量：School28395→17431bytes，Teacher28393→16131bytes，已包含新增fact/template/binding，而不是只拿assessment行变小报节省。
- 首份compact样本会为新事实/模板/绑定表分配页与索引，**物理分配可能比旧格式更大**；Teacher又复用了部分已建立模板，不能把两份简单平均当每答卷固定成本。尚缺多答卷摊销、WAL/备份/COS总体成本。实际报告读取也不是免费：本轮compact样本School90.5/47.5ms、Teacher70.3/44.8ms；legacy对照83.8/42.2、60.4/40.7，小样本仅记录，不下显著性或稳定代价结论。

这些结果说明现有共享机制确实能被四入口代表链消费，下一步应核配置、摊销和实际负载，不重复开发一套压缩/引用逻辑。完整原件及边界在`storage-and-bounded/`。未合并本优化、未启用生产开关、未部署。
