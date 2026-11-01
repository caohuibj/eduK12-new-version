# Survey native Bundle 冻结年龄补线

本增量针对未合并的六包候选，不描述为 main 或生产事故。原函数反例：B10 保存的 `birth_year_month=2010-01`、`adult_confirmed=true` 仍产生成人联合报告 `READY`。

## 有界修复

- 新 schema 3 包已声明的年龄范围与 admission context 在测量前统一核对。DOB 必须来自该包冻结的 context 映射，按服务器 `SurveyWaveAttempt.startedAt` 通过既有 `buildAssessmentContext` 生成出生年月、`ageMonthsAtFreeze` 和固定时间。成年布尔声明和手填年龄都不能代替 DOB。
- 认知 START、已有会话读取/重开/提交复用原锁定前置答案和同一个服务器时间。普通 Survey Scale 没有独立测量 START API，因此在 FINAL 计分前校验，不声称研究入口创建 Attempt 时已收到或校验 DOB。
- 合格准入事实保存在原加密 FINAL 内；独立读取保留原年龄，不按当前日期重新推算。单叶、联合和纵向个人反馈均使用相同的保存事实，缺失或年龄不符时不披露对应工具。V1/V2 历史包沿原合同。
- FINAL、SCREEN_OUT、认知/情境化前置路径和隔离试算传入各自既有的固定时间。试算只为明确 DOB 映射生成标记为 synthetic 的有效年月，真人路径没有默认 DOB。
- 不修改叶工具题本、计分、C/P/R、披露权限或发布状态；不新增表、引擎、权限、通用导入框架或哈希资格。

## 真实范围与剩余缺口

B10、情绪信念/策略 0.2、在线学习自我调节/拖延 0.2、成人兴趣 0.2 已有 DOB 映射，可复用本接线。当前组合候选中的 `working_memory_everyday_adult_zh_cn@0.1.0` 和 `parenting_burden_efficacy_zh_cn@0.1.0` 声明成人年龄范围却没有 DOB 映射；本补丁让它们保持准入/报告不可用，不能假造其出生年月或宣称六包全部贯通。其内容负责人需补真实的必需 DOB context 与叶准入映射，再做相应有界验证。没有因本补丁给它们创建新报告版本。

## 验证边界

Node 24.21.0，真实 B10 声明，手工记录的既有分数，无叶 scorer 重跑、无 DB/生产数据。保留修复前 `READY` 反例及一次前置 FORM 夹具错误（错误地把显示定义只放进 compiledDefinition），修正夹具后只复验失败项。

五个定向用例覆盖：2010 DOB + 成年确认时单叶/联合/纵向均不披露；计分前拒绝未满18岁/缺 DOB；恰满18岁可读原分与联合反馈；以后读取仍为保存的216月龄；真实 FORM 前置路径和已存答案锁拒绝改 DOB；旧 V2 包保持原行为。各用例最终结果由非重叠定向运行合并，未再整组复测。

受影响的14个类型根与其依赖闭包使用当前 schema 对应的隔离 Prisma 类型、原 Express 全局声明核验；不连接数据库。所需正式运行时 CI 与授权安装/FINAL 出口验证尚未执行；此增量不是 content-only 路线，也未合并或部署。
