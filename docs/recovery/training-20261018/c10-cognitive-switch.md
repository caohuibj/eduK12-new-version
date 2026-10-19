# C10：认知新准入开关与历史恢复

本次是基于 `37a30f033017b3ba5c8d7cd3189612e4cc9fadbb` 的重建，不是找回丢失的 `82f78f8`。仅助手当前云节点；无生产、Mac、push、PR、CI、浏览器或性能验收。

## 修改和检查范围

公共 cognitive eligibility、目录、Questionnaire type picker、HTTP 路由装配与新/旧准入区分 → 防止 OFF 仍新开、错误静默空目录、历史 404 与 shell 借恢复激活 → 当前云节点单元/类型与真实隔离 PostgreSQL/HTTP → 保留现有 runtime、scorer、report worker、epoch/owner/source/course 校验，未改 RT/whole/Scale 计时 → 源码 checkpoint 20–30 分钟，随后针对性 HTTP。

唯一开关仍为服务端 config 的 `COGNITIVE_MODULE_ENABLED`。前端仍消费既有 capabilities 和 build 开关。Host、作者域、客户端 resume/startIntent 参数均不能授予新准入。

## OFF 的精确边界

- 新编制/复制/发布/公开 token、新 parent attempt、新 cognitive session、restart 都拒绝。被拒绝操作不得留下 parent/session/report job，不消耗 public usedCount 或课程认知尝试次数。正常拒绝审计日志不在“零写”要求内。
- 已有真实 frozen admission 的 session 可按原 owner/recovery/epoch 读取、继续 FINAL、幂等重放；该已准入 FINAL 产生的报告任务允许继续，已接受的报告任务照常处理。这不是停止所有报告任务的总闸。
- 仅有 parent 或预建 cognitive session shell，不等于已准入。首次 frozen admission 写入前重新检查同一服务端开关；OFF 返回暂不可用，保留前序已接受 facts、原 session 和 frozen runtime。ON 可继续相同 shell，不重建前序事实。
- 当前普通 composite 在一个事务中预建 required children；合法的“尚未准入”状态是已有 session shell、没有 frozen admission。缺失 required child 的损坏历史仍走原完整性错误，不偷偷补建。
- 已完成历史读取不补写 admission。旧 ACTIVE 如果没有 stored admission，OFF 不以当前成员/配置倒推其旧准入：暂停首次交付/提交，ON 后继续原协议。非 Unified legacy ACTIVE 也不能借旧 FINAL 分支绕过 OFF。
- standalone 首次授权交付使用原 `ensureCognitiveAdmissionAtDelivery` 建一次 admission，传入已经加载的完整 session，避免重复 session SELECT。再次交付复用存储记录。没有第二套 flag、runtime、scoring 或 report worker。

## HTTP 写入口闭合表

| 入口 | OFF 行为及原权限 |
| --- | --- |
| Config access-policy / publish | teacher/admin 原鉴权后 new-authoring guard；底层 publish 仍检查 eligibility |
| Config retire | 保留原 admin 撤销权限 |
| Assignment create / update / publish | 原 teacher/owner + new-authoring guard，底层新创建/发布仍检查 eligibility |
| Assignment archive | 原 teacher/owner 撤销保持可用 |
| Cognitive / composite public token create | 原 owner、窗口/来源检查 + 新准入 guard |
| Token reveal / disable | 原 owner 管理权限保留；reveal 不授予新参与，start 服务仍核开关 |
| Standalone/public create / restart | 新建前公共 eligibility；现存精确恢复只返回其原 session，不增加尝试 |
| Session submit | 已存 admission 正常；新激活在 shared admission helper 被拒；legacy 无 admission ACTIVE 同样拒绝 |
| Session video capability | 原 owner/recovery、frozen presentation 权限；不创建 session/report job |
| Export | 历史数据原授权和原导出服务保持可用 |
| Legacy trials/batch/complete | 继续原 legacy-write-disabled |

目录 OFF 时明确不提供新 cognitive 资源；ON 时只对原有权限允许的已发布配置校验，配置错误返回不含原配置内容的可见错误，不再 catch-all 伪装空列表。历史 definition、注册表和 frozen 内容不删除。

## 当前证据状态

- backend 独立 Prisma Client 重新生成后类型检查通过。第一轮直接拷贝的生成客户端落后于 schema，类型检查失败；失败日志保留，不认作代码错误或通过。
- eligibility + 原 session service：33 tests 通过；新 admission switch：3 tests 通过。
- Questionnaire UI 原 25 tests 通过；新增历史内容断言首轮定位失败，改为已有 button 的完整 accessible name 后该 1 test 通过；前端 app TypeScript 通过。
- 真实 ON/OFF/REENABLE：10 组通过，所有拒绝新准入的 parent/session/report-job、public usedCount、课程认知次数前后相等。OFF 已准入 FINAL/重放及报告读取通过；OFF shell 保留前序 Form facts；ON 恢复同一 shell。
- 历史补验：在同一已停止合格合成 PG 上启动独立 OFF API/worker，未重做迁移/seed。2 组通过：课程/教师/学生历史 feed、深链接读取；旧 ACTIVE 无 admission 的暂停投影与拒绝激活。全部自身 PID 停止。
- 首轮 HTTP harness 错把 `{list: []}` 当数组而失败；第二轮抓到 composite token guard 的 shallow load 未包含 items，确实误放行。改用完整 load 后第三轮 10 组通过；失败日志未覆盖。
- 历史 feed 新增有界关系投影：standalone assignments 每个任务取当前 owner 最新 session 的 id/status/admission hash；composite 已有批量 attempts 查询带认知 session 的 status/admission hash。没有逐行 N+1；不把 snapshot hash 返回客户端，只给 continueHref/admissionPaused 等提示，服务端仍核权限。
- 前端移除历史 runner/result/assignment 的整组 capability 拦截；教师已发布课程行保留；学生 OFF 仅显示已准入恢复、历史报告或无链接的暂停提示。新建/发布/编辑/生成链接和 cognitive type/resource 仍隐藏。
- 更新回归：assignment service 44 tests；历史/Questionnaire UI 53 tests，管理历史编辑 UI 6 tests；backend 与 frontend 类型检查通过。旧 assignment mocks 缺完整 config 触发预期新校验，补成真实 schema fixture；随后一轮漏设 ON 的测试运行失败，显式配置 ON 后 44 通过。
- 脱敏 HTTP 摘要：`evidence/c10-cognitive-switch-http.json`。核心与历史补验各自绑定 dist/hash；不是把核心初版验证冒充最终全部源码重复验证。
- 不以这些结果替代 C25 全部受影响回归或 C26 真实性能。

## 详情恢复提示与证据绑定补充

- 既有 readCognitiveQuota 的同一次 session SELECT 加 admission hash，OFF 未准入壳返回 admissionPaused、continueHref=null，次数仍原口径。详情页只使用服务端既有 continueHref；本地 ledger 不能在 OFF 激活继续按钮。已准入和报告访问仍可用。
- 定向 backend 46 tests（含 quota 2）、entry UI 2 tests 和双端类型通过；在同一合格合成 PG 补查详情与列表暂停，13 个真实 HTTP 请求、2 组计数通过，清理全部自身 PID。
- 首次历史补验实际脚本以 evidence/c10-history-tested-01.mjs.txt 保留，SHA 48efdd24684f814c0a8690802b59898ee4b0545c8512443e0c97a2a7f3b19953。随后 fixture 从只清空 hash 改为同时清空 encrypted+hash，当前脚本并不冒充该次已测输入。quotaHistorySupplement 另绑定改后脚本及新 dist，并增加详情暂停断言。
- core 的已准入 FINAL→report 由 ON worker 处理；两次 OFF API+worker 补验仅历史读取，未覆盖 OFF worker 新 FINAL 执行。共享 worker 没有新增总 flag gate，但不把静态检查写成该真实实验已完成。

## C09+C10 集成定向验证

保留原 C10 worktree/证据，从父 b0436772 开独立集成 worktree，追加详情小补形成 5ee474e9a05bdde2700d4a3d2a6fc3f0d51e0c1b；源码树 4e0a059f2a47a6e59c5b103b79a6d1224b3e1ea5。未 rebase 原证据。

- 三个自动合并文件语义审查：composite 新准入检查仍在 createAttempt 首部，C09 timing 冻结/恢复/report投影保留；questionnaire-product resources 新认知 gate 与 timing policy 编制独立；QuestionnaireProducts 的 OFF 认知 type 隐藏与可选 timing 配置并存。
- 独立 Prisma Client 按集成 schema 生成；Node24.21、UTC、原 measurement 锁。backend/frontend app TypeScript 通过。
- backend 6 文件 26 tests：c10 admission/quota/product eligibility 与 scale training timing freeze/projection/report 契约。frontend 3 文件 29 tests：QuestionnaireProducts、TrainingTimingBoundary、C10AssignmentEntry。仅报告本轮结果，不与先前重叠用例累加。
- 输入源码 hash、原日志及结果见 evidence/c10-integrated/result.json。未重跑不相关核心 HTTP、迁移或性能，未补充 OFF worker 新 FINAL 实验或浏览器验收。
