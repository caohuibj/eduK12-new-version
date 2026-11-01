# 原20项精确前端 readiness 修复交接

基础为冻结 #478 `fc935e3877fef2ab98232b3a19b4aee034f82c5e`（包含 #477
`605a3a5f5a03e23da442f0e17a6fb9486870e8dd`）。本补丁不更新上述分支或 #481。

## 问题与最小改动

原20个 runner 已登记 engine `1.0.1`，但 readiness 只有旧25个 `1.0.0`
精确身份。实际 `pages/CognitiveRunner.tsx` 的 READY 分支同时要求 runner 与
readiness，因而旧 onboarding 后端检查通过仍不能从真实宿主开始。

仅在下列20个 `frontend/src/modules/cognitive/tasks/<key>/<key>.registry.ts`
增加 `readiness` 对象。共用 `registry.ts` 的可选类型及 `core/readiness.ts`
对现有 generated runner entries 的精确投影，与 #481 的同名两文件逐字相同。
不增加第二份准入名单、安装资格体系或版本回退；旧25个契约不变。

报告组可独立修改 presentation/definitions；本补丁完全不改这些文件，也不改
registry 中的 reportDefinition、metricDefinitions、engine/scoringVersion、
completionMode，或任何题库、scorer、生成清单。

## 逐项输入核对

K/P/T = keyboard/pointer/touch。K 包括局部键盘 handler 或稳定的原生按钮
Tab/Enter 激活；全局监听单独声明。下列为源码输入路径审计，不是设备施测验收。
行号对应冻结基础的 Task 文件，目录为 `frontend/src/modules/cognitive/tasks/<key>/`。

| key | category | inputs | 全局键盘 | Task 输入证据 |
| --- | --- | --- | --- | --- |
| numberline | fixed-trial | K/P/T | false | NumberlineTask:46–76 局部滑块键盘与 pointerdown |
| arithverify | timed-response | K/P/T | true | ArithverifyTask:92–99 全局1/2；121正式按钮 |
| sizecongruity | timed-response | K/P/T | true | SizecongruityTask:112–119 全局键；133按钮 |
| delaydiscount | adaptive | K/P/T | true | DelaydiscountTask:106–122 调节金额选择键/按钮 |
| gamblingdeck | decision | K/P/T | false | GamblingdeckTask:85 正式牌堆按钮与 detail=0 激活 |
| symbolmatch | timed-response | K/P/T | true | SymbolmatchTask:89–96 全局1–5；123按钮 |
| runningspan | staged | K/P/T | false | RunningspanTask:118–122 正式字母/提交原生按钮 |
| sentencecheck | timed-response | K/P/T | true | SentencecheckTask:103–110 全局1/2；124按钮 |
| seqlearn | learning | K/P/T | true | SeqlearnTask:92–99 全局1–4；116位置按钮 |
| timecopy | timed-response | K/P/T | false | TimecopyTask:122 开始/结束复制原生按钮 |
| letternumseries | staged | K/P/T | false | LetternumseriesTask:129,134,149,154 两阶段选择/提交按钮 |
| semanticfluency | timed-response | K | false | SemanticfluencyTask:115 文本输入与Enter录词 |
| cancellation | timed-response | P/T | false | CancellationTask:98–106,121–122,141 选格 |
| trustgame | decision | K/P/T | true | TrustgameTask:87–105 全局1/2及选择按钮 |
| ufov | visuospatial | K/P/T | true | UfovTask:107–115 中心1/2；129外围原生按钮 |
| pursuitrotor | visuospatial | P | false | PursuitrotorTask:127–134,152 pointermove追踪 |
| visualwm | staged | K/P/T | true | VisualwmTask:102–111 全局1/2；140–154按钮 |
| maze | planning | K/P/T | true | MazeTask:138–149 方向键；195方向按钮 |
| auditoryrt | timed-response | K/P/T | true | AuditoryrtTask:116–125 Space；156反应按钮 |
| auditorynback | timed-response | K/P/T | true | AuditorynbackTask:138–147 Space；181匹配按钮 |

12项实际全局键盘捕获为 true，其余8项为 false。全部 `restart-required`，
原因逐项记录在 registry：阶段、学习/调节状态或题内输入并未以 durable task
checkpoint 保存，不能仅靠已记录 trialIndex 重挂。媒体 slot 为现有冻结协议
instruction/example/stimulus，不代表已验证外部媒体或音频硬件。

收窄边界：semanticfluency 不把提前结束按钮误算作录词能力；软键盘未实机验证。
pursuitrotor 未解决触摸滚动/取消处理，故不声明 T。
cancellation 题内定义的 CellGrid 随计时重挂会丢失焦点，故不声明 K。
后续扩大这两项输入支持需先修相应交互，不能仅改声明。

## 本次定向证据

使用官方 Node **24.21.0** linux-x64；发行归档与官方 SHASUMS256 一致。
复用既有依赖目录；未重新安装依赖或修改 lock。不将本地结果称为正式 CI。

- 20个精确身份契约断言通过：类别、实际输入、全局键盘、恢复边界、未知版本
  不回退，原 completionMode 不变。
- 真实 CognitiveRunner 页面6个断言通过：numberline、arithverify、semanticfluency、
  pursuitrotor、auditoryrt 的代码准备和 READY → RUNNING → 实际任务说明；另1个
  本地未完成草稿仍阻止重挂。仅 session transport/controller 为合成替身，使用真实
  reducer、宿主、deferred imports 与 Task。没有进入练习/正式施测、录音或真实 FINAL。
- 原25项共用 readiness 回归3个断言通过。合计 **29个不同断言通过**。
- 受影响 TypeScript program：25 roots、489 source closure、0 diagnostics。
  首轮合成 session 缺 assignmentId 已补齐；修复后仅重跑受影响宿主6项，未重复其余23项。
- 24个变动 TS/TSX 文件定向 ESLint 通过；修正 fixture 后该文件单独复验通过。
  `git diff --check` 通过。20份 registry 去掉新增 readiness 对象后与基础逐字相同。

原始本地 reporter 与工具输出由执行环境保留供集成方核对；不附加原始环境材料。
未运行全平台、后端、数据库、构建、正式 CI、安全扫描、浏览器实机施测或生产安装。
既有题库/计分/报告证据不因本次元数据接线而重做，也不扩大为端到端验收。

## 独立的既有缺口

原20项仍采用 task completion。抽查前10项发现：末题 onTaskComplete 失败时，
宿主 COMPLETING 卸载后恢复 RUNNING 的 task 状态不足以重建原终态；部分 trial
保存 throw 仅 finally、或返回 false 后重新开放当前刺激。这些是既有完成/保存失败
恢复问题，不由本次 READY 修复解决；未改 completionMode 或声称 FINAL 可靠性通过。
需由主集成方另定最小恢复范围，不能把本补丁视为20项全部发布资格。

此分支仅供 D 取用并与报告组/#481统一集成；不合并、不 Ready、不部署、不写生产。
