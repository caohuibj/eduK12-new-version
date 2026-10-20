# Training 300 份短负载（2026-10-20）

状态：`PREPARATION_AUTHORIZED_INJECTION_NOT_STARTED`。父对话已 review [单份基线](20261020-training-single-baseline.md)，批准保持 `c3f9a7e77447c706f4a83a93c7429a7bcb164e94` 和当前有效配置，执行一次 30 份完整问卷/秒 × 10 秒。产品源码与所有可选优化开关保持不变；不重跑单份、不做导出、不启动另一个压测。

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

## 结果与后续

尚未执行注入；执行完成后在本节冻结实际速率、结果、资源、存储和缺测。父对话已指定静态候选重点：parent flow snapshot 121,248B、认知 assignment 31,581B 以及完整 runtime 的重复记录。它们目前只是待分析候选，未经具体指令不改产品，也不以首份物理增量乘 300 声称容量。
