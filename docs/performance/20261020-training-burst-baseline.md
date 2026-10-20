# Training 300 份短负载（2026-10-20）

状态：`ONE_BURST_FINISHED_API_STOPPED_DATA_VERIFIED`。仅执行一次 30 份完整问卷/秒 × 10 秒。300 份均发出；客户端确认完成并读到报告 10 份、拒绝 61 份、未知 229 份、确定失败 0 份。只读核对数据库完成 41 份、部分完成 259 份；不能把额外 31 份回填成客户端确认成功。产品源码与所有可选优化开关保持不变；未重跑单份、未做导出、未启动另一个压测。

## 冻结执行范围

- 同节点 native API＋现有独立 PG/Redis；真实 main admission、同步报告、600/2/50ms 配置不变，无异步 outbox enrollment，不启动无任务的报告 worker。独立硬 API 配额无法复现的限制沿单份报告。
- 300 个独立合成学生；准备阶段 4 个有界通道进行真实登录及 API parent 准入。账号、parent、冻结 flow/runtime、认知 assignment 的准备时间、SQL 和存储单列；不预写答案、accepted snapshot 或报告。
- 业务计划到达 `i×1000/30 ms`（i=0..299），每份依次执行四工具保存/FINAL/推进和教师报告 GET，最多一条工作流尝试。有限 300 个计划槽位，无补发队列；4 个 FINAL 不计作 4 份。
- `t0+10s` 停止新发；`t0+40s` 停止发送后续 workflow 请求，单请求 timeout 为 30s 与剩余提交预算的较小者；报告读取最迟 `t0+130s`。存在部分/未知结果时观察到固定 130s，不延长。已知拒绝、失败、未知分别记账；不自动重交未知写。
- API RSS 沿更严格既有线：≥90%×1GiB；节点 cgroup 内存≥12GiB、磁盘空闲<4GiB、测试 workspace 新增≥2GiB 停止后续请求。保留原起点 118,054,912B 和总增长 18GiB 的更严格限制；PG/Redis 也保留各自硬限制 90% 停止线。停止后有界收尾并优雅停止本任务 API，保留数据服务和原始证据。
- API 进程与 PG/Redis cgroup 每秒 CPU/内存采样，PG 每秒一条 scoped activity/lock 观察；API metrics、所选表 row/total relation/**独立 index**、全 DB、WAL 仅在阶段边界读取。SQL 是 API 总窗口，PG 统计含观察器；不虚构 per-FINAL SQL 或 IO 时长。
- 驱动进程 CPU/RSS 用其独立 `wait4` usage，观察器 self/child CPU 单列；不把采样或准备计入业务计算。实际发出以客户端 fetch 调用时刻计，不能等同于 socket 抓包时刻。

## 调度预检与已知限制

首次冷启动无网络调度完成 300 槽位，P95 迟发 0.676ms、最大 51.247ms，超过单个到达间隔；只预热 trial 生成后仍有开头两个槽位迟发（最大 71.735ms）。两轮失败记录完整保留，未发业务请求。加入确定性的 500ms 初始化等待后，仅复验该失败项：300 槽位、最大迟发 2.601ms、P95 0.565ms，通过。正式驱动采用相同初始化等待与 trial 预热，成本另列。

此预检只验证 timer 调度和 120-trial envelope 生成，不证明实际 HTTP 客户端在服务端拥塞时仍能按速率发送；实际迟发、未发和驱动 CPU/RSS 必须据真实运行报告，不能把客户端瓶颈称为系统上限。修改过的公共 transport 已通过离线无网络错误分类检查；未重跑单份业务。

原始证据统一保留于 `/workspace/training-load-followup-state-20261020`。`private/burst-actors.jsonl` 含合成账号 cookie/parent，仅本节点保存；不推送数据库、账号秘密或原始导出。工程备份只到本任务分支，不触发 CI。

## 实际准备成本与业务起点

准备 300 个独立学生，4 个有界通道，全部通过真实登录和 API parent 准入；900 个 HTTP，无错误、无未知、无资源越线。准备驱动起止为 03:29:59.428–03:30:49.014 UTC，观察窗口 50.139s；API CPU 58.05s、RSS 采样峰值 396,136,448B，驱动 CPU 2.973s。API SQL 总窗 26,716，DB physical +22,822,912B、WAL LSN +23,890,200B，全部与业务窗口分开。

注入前只读确认：API 1s CPU 增量约 0.02s，PG 其他 active=0、lock waiters=0、outbox=0；305 个用户、301 个 parent（含保留的原单份）。300 份没有预写答案或 accepted snapshot。API consumer/heavy/video 关闭；PG/Redis 独立健康。正式驱动初始化/预热 535.210ms，在业务 t0 前。

## 份级和 HTTP 结果

| 指标 | 实际结果 |
| --- | ---: |
| 计划 / 实际发出 | 300 / **300** |
| 准时 / 迟发（≥一个间隔） / 未发 | **299 / 1 / 0** |
| 首 / 末 fetch 调用 | t0+2.605 / 9,966.599ms |
| 10s 注入实际速率 | **30 份/s** |
| 最大 / P95 迟发 | 37.292 / 4.542ms |
| 客户端确认四 FINAL、父完成并报告可读 | **10** |
| 明确拒绝 / 确定失败 / 未知 | **61 / 0 / 229** |
| 未知写 / 未知读请求 | **147 / 82**，均未重交 |
| 峰值在途工作流 / HTTP | 300 / 300，工作流含报告阶段 |
| HTTP 总数 | 2,679：200=2,389、503=61、UNKNOWN=229 |
| 最后一次新请求 / 新写 fetch 调用 | **t0+39,397.842ms**，均早于 40s |
| 驱动观察结束 | t0+130,008.401ms，没有延长截止补成功 |

10 个确认完成样本的父完成响应耗时（各自实际发出至父完成）：P50 32.173s、P95/max 37.062s。它们是成功子集，不能代表全体 300 份 P95。报告 HTTP 的成功样本 n=10，P50 2.964s、P95/max 3.841s；各份至报告的总延迟约 31.149–40.085s。不能用两个 P95 相减推导阶段耗时。

原 `load-result.json` 的 `passed=true` 表示驱动按预算执行完并保存结果，**不是 300 份业务全部通过**；业务成功数以份级 summary 和本表为准。

| HTTP 分组 | 发出 | 503 | 未知 | 全部样本耗时 P95 ms |
| --- | ---: | ---: | ---: | ---: |
| checkpoint GET/PUT | 1,144 | 0 | 0 | 1,686.024 |
| Form FINAL | 300 | 28 | 0 | 8,917.393 |
| Scale FINAL | 272 | 11 | 0 | 9,448.498 |
| Cognitive FINAL | 224 | 18 | 121 | 10,040.568 |
| SJT delivery GET | 51 | 0 | 6 | 2,353.299 |
| SJT FINAL | 45 | 4 | 26 | 9,962.592 |
| progress GET | 633 | 0 | 76 | 5,036.889 |
| teacher report GET | 10 | 0 | 0 | 3,840.721 |

这些耗时包含拒绝和 timeout 的截断样本，未知值不是实际服务端完成耗时。每份遇拒绝或未知即停止后续依赖步骤，没有补发或无限客户端排队。实际注入基本达到计划速率，本轮仍不能据此宣称测出系统最大可持续吞吐。

## 持久化核对与积压

API 停止后只读验证所有本轮 parent：

| 客户端分类 | DB COMPLETED | DB IN_PROGRESS |
| --- | ---: | ---: |
| SUCCESS | 10 | 0 |
| REJECTED | 0 | 61 |
| UNKNOWN | 31 | 198 |
| 合计 | **41** | **259** |

780 个 canonical snapshot 按 source submission、epoch、definition/compiled runtime 身份检查通过：Form 272、Scale 261、Cognitive 206、SJT 41。Scale total=1、SJT cooperation=9；206 个认知 raw blob 均有完整 120 trials，合计 24,720 trials。完成的 41 个 parent 均有四个 snapshot，无 outbox/enrollment。

对本轮 FINAL submission ID 另做一次 scoped 只读核对：ACK 的 633 笔全部有 snapshot；未知 Cognitive 121 笔与未知 SJT 26 笔也全部已有 snapshot；61 笔明确 503 均无 snapshot。**147 笔未知 FINAL 写实际均已落库**，超时事实保持未知传输结果，不自动重交。未知读包括 76 个 progress GET 和 6 个 SJT delivery GET。

259 个部分流程需要后续正常用户动作才能推进，不能称为等待 worker 自动排空的报告队列；报告 outbox=0。报告只实际读取并确认 10 份，其余已完成 parent 的报告没有补读。

40s 是停止客户端新写的截止，已受理服务端写可继续完成。snapshot 最后 `createdAt=03:32:11.337Z`，约位于 t0 后 45s；这是事务内时间，不是精确 commit 时间。数据库核对在观察截止后、API 停止后进行，未回填截止内成功数。130s 边界与收停后所选表的行数、record bytes、relation/index bytes 完全一致，DB physical 差为 0；未发现该收尾间隔新增结果。

## 资源、SQL 和数据库增长

| 业务观察窗口指标 | 实测值 |
| --- | ---: |
| API CPU | **93.22s**，整个 131.088s 驱动采样窗，含初始化/采样尾和 API 空闲后台 |
| API RSS 起点 / 采样峰值 / 终点 | 396,271,616 / **515,235,840** / 510,783,488B（峰值 491.37MiB） |
| API heap used 前 / 后 | 138,005,376 / 180,604,800B |
| API heap total 前 / 后 | 270,512,128 / 311,324,672B |
| 节点 cgroup 内存采样峰值 | **4,128,866,304B**（3.85GiB） |
| PG cgroup CPU / 内存峰值 | 33.601723s / 494,653,440B |
| Redis cgroup CPU / 内存峰值 | 1.288147s / 14,274,560B |
| PG throttled periods / time 增量 | 51 / 3.08467s |
| 驱动 CPU / 最大 RSS | **6.335812s / 283,352KiB** |
| 观察器 self / child CPU | 0.533600 / 3.729172s，child 含 docker/psql 等观察命令 |
| API SQL event 总窗 | **80,926**；覆盖全部 2,679 HTTP 及重叠 API 后台，不能归为某次 FINAL |
| PG 每秒 activity observer | 131 条额外 SELECT，不在 API SQL counter 内 |
| PG 采样峰值 session / active / idle-in-transaction | 21 / 4 / **20** |
| PG lock waiter / ungranted lock 采样峰值 | 0 / 0；不是高频追踪或无锁等待的完整证明 |
| 全数据库 physical 新增 | **37,093,376B** |
| 所选表 total relation 新增 | **36,200,448B** |
| 其中独立 index 新增 | **1,294,336B**；本轮确有独立起点 |
| 所选表 table+TOAST 等新增 | 34,906,112B |
| 所选表 record bytes 净增 | **29,037,056B**，含新行及既有 parent/section 更新 |
| WAL LSN 新增 | **43,242,720B**，逻辑推进 |
| PG data directory 新增 | 87,539,712B，含 WAL 分配等；未单测 pg_wal 目录增量，不能把差额全当 WAL |
| 准备+业务 workspace 采样最大新增 | 112,373,760B，低于测试 2GiB 预算 |

所有 RSS/内存峰值均为 1s 采样下界。PG/Redis 内存是 cgroup usage，不能称进程 RSS。API CPU 不等于主线程 CPU；没有线程/GC/decrypt/canonical 的动态归因。PG database stats 含健康、API 与观察器；`track_io_timing=off`，没有 per-request SQL、DB query 耗时或 IO 时长。监测和边界 census 自身成本未归入业务计算。

所选表主要 relation 增长：Cognitive raw 13,533,184B、session 7,970,816B、Scale assessment 4,177,920B、parent 3,391,488B、snapshot 2,973,696B、SJT attempt 2,809,856B。完整表差仅在原始 measurement 中保存。`cognitive_assignments` 在本轮准备及业务窗口未新增记录；前一单份的 wrapper 已可供后续路径复用，不能按首份 31,581B×300 推断 assignment 增长。

## 收停、证据与静态候选

API 在 03:34:16.447 UTC 收到 SIGTERM，约 0.200s 优雅退出，退出码 0；收停晚于观察截止，期间没有新客户端请求，未把收停期结果记为截止内成功。PG/Redis 与原数据保留；heavy/video 保持 false，没有启动 consumer 或重型导出。无资源停止事件、审批拒绝或未明执行状态。

完整汇总 `evidence/burst-summary.json` 引用唯一原始文件：`load-result.json`、`load-measurement.json`、`prepare-load-result.json`、`prepare-load-measurement.json`、`verify-load-result.json`、`burst-write-reconciliation.json`、阶段边界 snapshot/metrics、`native-api-burst-stop.json`。原始文件位于 `/workspace/training-load-followup-state-20261020`，不上传账号秘密、cookies 或数据库。总业务源码仍为 c3f9a7e7；本分支仅工程驱动和文档，无产品修改、PR 或 CI。

供父对话决策的静态候选，均尚未实施、没有实测收益承诺：

1. **parent flow snapshot 与完整 runtime 重复读取/解密/摘要。** `composite.service.ts:2556–2612` 在 parent lock 内读取 composite/flow，再解密 candidate 并校验 hash；`2909` 存储候选快照。单份 flow cipher 121,248B，是值得进一步归因的输入。考虑同一请求内的不可变对象复用或收窄载荷，必须保留 ownership、epoch、source/compiled hash、当前权限/授权与冻结身份核对，不能直接删校验。
2. **认知 assignment 的可复用范围。** `composite.service.ts:2357–2383` 和 `training-flow-assignment-snapshot.ts` 已支持 existing id 与 deferred create DTO。本轮 assignment 无新增，说明首份 31,581B 不是每份必有成本；后续应区分首次创建、复用和 session runtime 的确切重复字段，再决定优化。
3. **已有可选共享存储/cache/compact 路径。** `runtime-snapshot.ts:341–356` 明确按 `ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED` 写入共享引用并兼容读取；本轮这些开关均关闭。可由父对话选择单独冻结开关 profile 后验证，无需先大规模重构；不能把当前结果称为已启用优化的性能退化。
4. **事务驻留和 API 计算归因。** 采样约 t15–45s 多次出现 18–20 个 idle-in-transaction、0 个 lock waiter；API 大部分 CPU 消耗也集中于前约 50s。它支持检查应用在事务中持有连接时的计算/等待，尚不能判定具体函数或数据库慢查询。checkpoint 的 parent/policy/slot 读取和 progress 的 child/proof 处理可纳入一次集中静态 review，不逐处修改后逐处压测。

本轮只证明当前 native profile 在该固定短负载及截止下出现大量拒绝/超时，未测得可持续系统上限。后续是否改产品、启用可选路径或复测，由父对话给出具体范围。
