# 当前状态：四入口精确授权工程候选，尚未正式合格/合入 main

Task 1 分支 `task1-scale-exact-authorization-20261029` 正常整合 main
`13884d7386987068f14b77ec5bbbcb8d431681d8`（merge `f008a76f`），保留已合入的
Task 2 Bundle 工作；`.github` 相对该 main 无差异。逐阶段文件记录各自实际基线和执行范围，
不是用本页把旧证据重新标记为当前完整候选通过。

DOT 集中审阅提出的三项认知管理缺口已修复，9 个组件契约、2 个受限角色保护 HTTP/PG
及合并后相关类型通过；见[本轮修订](cognitive-management-review-progress.md)。未重跑
已认可的 136 次试次或 #395 加载验证，正式限定 CI 的本候选登记仍未完成。

| 范围 | 实际状态 |
| --- | --- |
| 共同 binding、不可变修订及草稿/发布/入场 | 已实现并有分阶段本地证据；复用既有 grant/source/snapshot，不新建权限中心 |
| 量表四入口 C/P/R、分权/委托、业务命名、替换与原请求恢复 | 工程已接线；真实保护 HTTP/PG、旧/新边界、管理与消费者 UI 见各阶段。缺同 C/P 双非空 R 的合法内容对照 |
| 量表 Training COURSE + GENERAL、Survey、School、Teacher | 分阶段已有实际链路；School READY、Teacher WITHHELD、Survey 空 R、Training full R 分别保留原合同，不能把不同报告策略说成两个非空 R |
| 认知系统批准与精确使用权 | immutable artifact v2 保存执行/配置/profile/报告/指标等定义；入口发行和系统审批分离，旧 resourceId-only 行为保留 |
| Training 认知 | 原生与 COURSE/GENERAL 问卷接线、精确 grant、冻结、撤权/续答/完成回读及真实管理页写入已有阶段证据 |
| Survey 认知 | 管理者授权与真实页面写入、研究者只读导入；reaction 体验 8／科研 60 两条原生完成链。薄适配仅支持声明的 reaction/gonogo 无媒体/无 reference 配置 |
| School/Teacher 认知 | 两入口分别体验 8、科研 60 均有正式 Run/保护 API/受限 PG 原生完成证据；新授权不能解锁旧 waiting，已入场 seed 与旧反馈不漂移 |
| 运行身份 | 新认知四入口实际 API 为受限角色；教育仅身份/组织 fixture 与正式运行分开。量表各阶段仍按原身份记录，不借认知结果替旧路径补资格 |
| 页面/构建 | 真实管理写入与只读恢复各有记录；新 main 前端 tree 单次构建/类型、代表 School 真实连接只读恢复通过。旧 mock 画面不等于授权写入 |
| 性能 | 有限既有读性能记录保留；未新增全角色/规模/写/START 压测，未宣称达到 10% 或每页 2 查询的全部目标 |
| 素材 | 三份 basic 既有装载回读保留；后续 main 素材总数未假称本节点重新装载；fun JSON 未独立注册。11 认知候选独立 DRAFT 装载与主干原生 reaction 运行分别报告 |
| PR、正式 CI、合并/部署 | Task 1 未创建 PR、未激活 Actions、未合入 main、未生产部署、未授真实用户。CI 最终控制路线独立复核 pending |

最新教育 native T3 的详细结果、失败/续验、准确来源和输入限制见
[运行检查点](education-cognitive-runtime-progress.md)及其原始证据。Training/Survey 的
历史阶段见 `training-cognitive-profile-*-progress.md` 与 `survey-cognitive-profile-progress.md`；
这些旧文档末尾“待做其他入口”只适用于其提交时点。

仍缺同一 C/P 的第二个合法、非空、注册可执行 R，见
[素材阻碍](nonempty-r-blocker.md)。DOT 特定拒绝的混合 seed/趣味 R 工程未执行，
没有通过复制旧树绕开审批。新 main 新增的不同教师 instrument/Bundle 报告不能补此缺口。

完整认知工具/媒体适配、全权限并发矩阵、人工作答体验和规模性能尚未验证；不扩大范围为
全平台复测。[原 CI 准备](scale-ci-review-preparation.md)保留当时的实际 platform 回落观察，
后续认知差异与当前准确候选须另纳入独立复核，不以本地局部通过冒充正式门禁。
现有 limiter 在 test 环境跳过限流，近期 MFA 为合成 proof；不声称生产限流/MFA 人工体验通过。

`implementation.md` 初始段落、旧 SHA 和先前数量保持历史原貌；不能覆盖后续逐阶段记录。
