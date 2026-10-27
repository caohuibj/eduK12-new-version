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
