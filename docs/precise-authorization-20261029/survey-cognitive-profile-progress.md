# Survey 精确认知 profile 的授权、冻结与受控运行

基于分支提交 `febdc06e79b39835f3d8d600c7c4e40f273111e2`，main 集成基线仍为
`dc0f46ba506d51d42c5bb379059df82f18860b72`。这是 Task 1 的独立 Survey 切片，
不是四入口全部完成、CI 通过、合入 main 或生产上线的声明。

## 实现范围

复用系统对不可变认知 artifact v2 的入口审批和既有 `survey_tool_grants`。
管理员选择精确配置并命名，研究者直接导入只读工具；不新增 testType、授权中心
或认知引擎。原请求恢复比较 profile、完整 artifact hash、接收者、业务名称及替换依据，
改配置发行新授权修订。T1 只保存小型指针；T2 在当前资格检查后按精确身份装配
原执行闭包、报告和测量定义。START 使用发布快照及独立参与者 seed，不查 latest。

初始适配限定已有 reaction / gonogo、无媒体 presentation 且无参考表依赖的原生配置。
其他配置明确显示适配不可用，不能以版本字段存在冒充可执行。新增审批 receipt 保留
执行要求摘要供目录批量查询；旧审批不伪造补填。专业常模、反馈策略和计分未改变，
Survey 被试仍只获得原 GENERAL 完成文字，科研输出仍从原冻结数据读取。

新建项目自编认知 API 仍返回原 403；本切片只允许经系统批准、管理员授权的导入路径。
原标准量表、legacy 120 次 gonogo、自建限制及已完成数据保留。

## 隔离环境与实际结果

独立库 `precise_survey_cognitive_profile_test_20261030` 来自已有合成 Survey 流程库，
从 255 正常迁移至 259，运行身份为 `precise_task1_runtime`，无超级用户、建角色或
BYPASSRLS 权限。只在迁移命令使用隔离库 owner；运行 API 没有切换 owner。
原样使用 main 现有 reaction 1.1.0 / engine 1.0.0 / scoring 1.1.0，正常安装和发布，
再由系统角色分别明确批准 SURVEY 的 experience / research。无真实用户授权。

- experience：真实管理 API 授权、原请求重放及变更原意拒绝、研究者导入只读，
  发布绑定原 T1，匿名 START 为 8 次；普通撤权后新 START 409，已入场 seed 不变，
  8 次 native FINAL 与重放、父任务 COMPLETED、原 raw/profile 读取和 GENERAL 策略通过。
- research：同一 config 的独立 artifact，真实报告预览不写授权；正常授权、只读导入、
  发布及 START 锁定 60 次，native FINAL 和父任务 COMPLETED，发布快照不变。
- 浏览器：使用真实构建、auth/me、受保护 API 和上述运行库；一条体验授权实际 POST 200，
  数量增加 1、hash/profile/业务名称匹配。随后只读恢复验证该记录及原请求，未重复 POST。
  所有请求被拦截后只转发至本节点 loopback；无生产或其他外部请求、无 pageerror。
  MFA 为合成签名会话，不是人工验证器体验。

数据库最终回读包含两个 profile 的完整 hash、3 条精确认知授权（体验撤销、科研有效、
另一研究者的浏览器体验有效）、2 个发布快照、8/60 次结果各 1、2 个已完成父 attempt。
原始身份见 `survey-cognitive-profile-raw.json`，不把纯素材文件当已注册执行内容。

## 迁移 259 的边界

旧表 CHECK 固定 120 次，不能直接装入冻结的 8 次结果。新增 BEFORE INSERT 约束
从原不可变 publication 的唯一认知 slot 和已入场 session 取精确预算：旧格式仍须 120，
新格式须冻结的 maxTrials，另保留 1–1000 绝对上限；现有不可变触发器及外键不变。
不在 FINAL 重新检查当前 grant，普通撤权后的已入场作答可完成。

另一独立技术测试库 `precise_survey_cognitive_budget_test_20261030` 运行仓库既有
120 次并发 FINAL 用例（1 通过、13 过滤），没有开放被拒绝的旧自建 API。
在该库对旧 119/121、新 7/9 四个错误次数 INSERT 均得到 23514，0 行持久化，
原 120/8 结果不变。它是数据库和既有技术 fixture 证据，不是用户新建认知权限证据。

## 失败、恢复与证据资格

原始失败日志、reporter、时间和退出状态均保留，不能把最终局部通过改写成最初整条通过。
体验 HTTP 分阶段恢复：显式测量发布先遇原 SCALE-only adapter 403，补薄适配后继续；
T2 审计先缺认知 projection，补共同 kind 后继续；8 次 FINAL 遇旧数据库 120 CHECK，
迁移后在回读 0 行的前提下使用原 submissionId 重试；父 FINAL fixture 最初缺 slot 占位，
只恢复原子结果后补正确父请求。最后一次 3-case reporter 的前两项仅回读既有阶段。

科研测试的两次失败发生在预览前后计数 fixture（不存在的 Prisma model、数组身份比较），
均未签发；修正后实跑完整科研链。浏览器第一轮与科研测试的全库计数并发发生冲突，
尚未 POST；后一次实际写入成功后，错误地期待页面自动发原请求 GET，断言失败。
此页面正常成功回执直接核对，不自动 GET；保留成功写入，之后只补原记录只读回读。
只读恢复先遇关闭 details / 未查询目录的 locator，修正后通过，无重复授权。

类型、构建和相关契约均按各自实际输入记录；新增卡片业务标签只使前端的相关输入
失效，单列后续构建、类型和 3 个页面契约，不重复后台作答或同输入计分。
所有本节点结果是本地未签名证据，不是正式 CI，也未建立通用 CI 证据接纳资格。

## 仍未完成

School / Teacher 的认知精确配置分发委托、消费绑定及页面尚待实施。此切片未验证
全部认知候选、媒体/参考表适配、全部并发／撤权角色矩阵或性能预算，不扩大测试为压测。
量表同 C/P 下两个可合法执行的非空 R 仍缺第二份注册来源；纯趣味 JSON 不补此缺口。
正式 PR/CI 激活仍等待最终控制路线独立复核；未修改 PR392 控制文件、保护或安全设置。
