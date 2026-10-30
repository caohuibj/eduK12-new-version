# 三项认知管理修复与限定验收

按 DOT 对 `cac1775f0c9892396f78264a1c6fee6284b77a04` 的独立审阅修复。
正常 merge `f008a76fde60c3334a344f80f289b5865bbfd82f` 已整合指定 main
`13884d7386987068f14b77ec5bbbcb8d431681d8`；没有冲突，没有改 #395 应用或控制文件。

## 修复

1. 复用量表管理页的接收者搜索/分页与授权分页，25/100 的后台页上限保持不变。
   替换固定原接收者，原人不在当前查询页也不会清空或换人；保存仍由后台验证当前资格。
2. 仅首次保护 POST 的明确业务拒绝允许修正，沿用既有 HTTP error 与 pending 存储。
   限定确定拒绝状态；408/429 等、网络失败、已有 unknown 的重试继续保留原意图。
   POST 已返回成功即保留 unknown 待回读，之后 GET 的 4xx 或 null 不能解除原请求保护。
   明确未写入时保留替换对象/原因，可改日期重新提交；没有新审批或对账系统。
3. 管理目录保留本人在本入口、本学校发行过的精确 artifact 历史来源。
   来源或入口政策停用、最后一项分发委托失效后，行仍可选作回读；assignable=false，
   不请求新接收者/报告预览，不恢复来源权限。既有本人授权可查看及正常撤销。
   新发行仍走原 selected/approval/entry/root/recipient 检查，没有改变发权服务。

## 实际验证及边界

- 本组件 9 个直接用例分两次通过：原有 3 个发送/恢复契约输入直接受影响，连同新增 5 个
  用例一次运行（8 PASS）；包含第 26 位接收者、第 101 条授权、搜索及页外原接收者替换，明确
  拒绝改正、POST 成功后回读拒绝、unknown 在 null/重试拒绝后保留、历史来源可撤销。
  随后仅补恢复页面时将旧 pending 视为 unknown 的直接用例（1 PASS、8 filtered），未重跑其余 8 个。
  这些是 mock transport 组件契约，未冒称真实浏览器写入。
- 新独立克隆 `precise_education_cognitive_management_test_20261030` 保留原 8 个合成用户、
  来源/审批/授权，实际运行身份是受限 `precise_task1_runtime`。两个正常保护 HTTP case
  分别撤销 School 最后一项委托、用系统正常审批移除 Teacher 精确 profile 入口范围；
  旧来源仍列出且不可发新权，原 use 可查看和正常撤销，原 T1 metadata 不变。
  没有新用户或使用授权，没有 native attempt、计分器或其他已认可链路重跑。
- 合并后直接相关后端类型闭包及 frontend app types 实际成功；无需新 Prisma/schema/
  migration/lock。当前 UI 输入已变化，旧 dist 不再证明本组件的新分页/恢复行为；未在本地
  重复构建，没有声称旧产物等于新产物。最后恢复页修正仅补组件/测试类型闭包；首次增量 tsconfig 在库外无法解析包名 types，改为已安装类型文件的绝对路径后续验，原失败保留。#395 未受影响的已过组件/加载验证没有重跑。
- 原始命令、时间、结果、当前直接改动文件摘要见 `cognitive-management-review-raw.json`。
  仅记录本次四个相关文件，不重复核验此前已由 DOT 审核的 235 个源 hash。

现有四个教育组合 136 次试次与 Training/Survey 旧链保留资格，不机械重放。
Survey 仍只支持声明的无媒体/无 reference reaction/gonogo。未发布认知 Bundle 的薄接入
问题保持非阻塞清单，不扩展引擎；没有依据首次授权并发的假设增加锁/事务重构。
test 环境仍跳过原 limiter，MFA 为合成近期 proof，未声称生产限流/人工体验资格。

## PR / CI 范围

本修复是单个产品提交；最终精确 head/tree、main-to-candidate 全差异与此次 4 文件 delta
另置审阅清单。复用现有 onboarding-structure 的候选绑定/已审阅本地证据接纳机制，
不新增另一套权限、版本、报告或 CI 框架。原失败、过滤与续验的身份保持，不改称 CI 实跑。

当前该分支尚未登记到已有限定路由；直接打开 PR 会落入 platform/legacy，不执行该操作。
需要的最小控制接入是精确 branch/base/product/component tree 与完整文件/mode/blob 白名单，
绑定已审阅原件及本次 9+2 用例；未知输入拒绝，不能回落全量。原字段级审计/冻结证据按原
实际输入接纳；本次直接变化只使管理目录与新页面行为的旧证明失效。
正式缺项是现有接纳机制的本候选登记、当前变化应用/控制 CodeQL，以及限定 route 判断
后的必要编译/产物消费者；不能用旧 dist 代替当前输入，也不在路由未定时本地/CI 各建一次。
准确 jobs/预算须由该精确 route 决定，不能把 platform 默认 jobs 当已授权选择。
没有伪造 formal success、跳过必需检查、创建 PR 或激活工作流。

双非空 R 为 **BLOCKED（附加趣味 JSON 的正常登记工程尚未获特定解除）**，不是仅缺文本。
未复制或间接替代被拒工程树。无生产访问、真实用户授权、GitHub APPROVE 或部署。
