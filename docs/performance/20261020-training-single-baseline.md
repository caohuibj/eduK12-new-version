# Training 单份隔离基线（2026-10-20）

状态：`SINGLE_COMPLETE_EXPORT_VERIFIED_300_NOT_STARTED`。一份 Form → Scale → Cognitive → SJT 正常保存、FINAL、推进、父完成、教师报告及标准 CSV 导出均通过。仅测试当前 main，未做产品优化、旧版本回测、生产部署、PR 或正式 CI。下一阶段 300 份负载等待父对话分析和具体指令。

## 版本、环境和有效配置

- 唯一业务源码基线：`c3f9a7e77447c706f4a83a93c7429a7bcb164e94`。启动及本次收尾均实读远端 main，SHA 一致。
- 独立分支：`perf/training-load-followup-20261020`；工作树 `/workspace/training-load-followup-20261020`。本分支只增加驱动和记录，未改应用源码、依赖锁、Dockerfile、权限策略或科学定义。
- 实际 profile：同节点 native Node 24.21.0 / npm 11.19.0 API，隔离容器 PostgreSQL 16.15 / Redis 7.4.11；Debian 13 / glibc 2.41。依赖复用本任务官方来源的成功安装缓存；没有在 host 重新 npm install 或引入新 CA 信任。
- 可见 5 个逻辑 CPU；根 cgroup `cpu.max=400000 100000`，总 CPU 时间配额 4 核、内存上限 16 GiB。PG 硬限制 1 CPU / 1 GiB，Redis 0.25 CPU / 256 MiB。
- native API/consumer 无法在当前只读 cgroup 下复现 Compose 的独立硬 CPU/内存限制。保留 main 的 API old-space 640 MiB、标准 consumer old-space 192 MiB / semi-space 16 MiB，以及过程 RSS 停止线。这是 native profile 的单份基线，不能称为成品 Compose 镜像容量。
- API/worker Prisma 池分别 20/4；异步报告 `false`、whole submit `false`、报告配置 `maxPending=600 / concurrency=2 / poll=50ms`，均沿实际 main Compose。代码 fallback 的 200/1/500ms 未作为部署覆盖。unit、completion、aggregate admission 保持 main 值，未提高预算。
- 真实链路为四工具原生顺序 FINAL；父完成与报告 GET 同步投影。没有新 outbox job/enrollment，因而本阶段没有可消费的异步报告任务；未启动一次性报告处理器。
- 独立数据库 `training_followup_20261020`，synthetic 账号及上传/导出目录。178 个迁移成功，受限 runtime 角色验证通过；无 superuser/createDB/createRole/bypassRLS。`fsync/synchronous_commit/full_page_writes` 均开启，`track_io_timing=off`。未访问其他任务数据库、Mac 或生产。

无秘密配置、镜像身份和角色验证在原始证据目录；配置在单份前冻结。下文专项开关核查是单份后的只读审计，使用这份既存配置，没有补开开关或重复交卷。

## 准备与业务时间分开

| 项目 | 实际结果与范围 |
| --- | --- |
| Docker 准备 | VFS 分层复制分别触发 8 GiB、16 GiB 准备预算停止；没有得到应用 runtime 镜像，不计业务性能 |
| 依赖选择导出 | 19.350 s，455,860,958 B、14,726 个条目；全部 RUN 为 CACHED，无重新安装/生成；未 prune 缓存 |
| native 原有构建 | 59.103 s；子进程 user+system CPU 92.497 s，最大单子进程 RSS 2,133,000 KiB；成功 |
| 迁移 | migrate deploy 3.256 s，178 项；runtime ACL reconcile/verify 成功 |
| 合成 fixture | seed 约 0.520 s，prepare 约 1.472 s，均为驱动进程起止时间；CPU 未独立测量 |
| 准备内容 | 5 个合成用户、1 门课程、已审核/授权来源及发布产品；prepare 23 个 HTTP（含 5 次登录），起点 parent=0、accepted result=0 |
| 准备后数据库 | 22,387,735 B，相对 before-fixture 增加 696,320 B；已有 2 个认知 source/运行 assignment，单份再新增 1 个 |
| 收尾资源 | 原始 workspace 起点 118,054,912 B 未重设；收尾增量约 16.87 GiB，空闲约 12.85 GiB，低于获准 18 GiB 准备总预算；失败层和证据均保留 |

Docker 失败历史及原临时 CA 的精确授权边界保留在[启动记录](20261020-training-load-startup.md)。它们是环境准备成本，不能归到单份交卷。业务采样、边界 census、正确性/权限核验、导出与安全收停也分别记录，不合并成业务计算。

## 单份业务结果与阶段时间

本次仅一份、4 次 FINAL，各提交一次，无重交、拒绝或未知写结果。组合为一个合法单选 Form、一个可手算二值 Scale、标准 120-trial Go/No-Go 和在线 SJT；认知 trials 合成为合法 envelope，不代表真人作答或浏览器硬件时序。

| 阶段 | 客户端耗时 ms | 包含内容 |
| --- | ---: | --- |
| parent 准入 | 253.049 | 真实 admission，未提前写 parent |
| Form | 276.015 | checkpoint GET/PUT、FINAL、授权 state GET 推进 |
| Scale | 225.840 | checkpoint GET/PUT、FINAL、授权 state GET 推进 |
| Cognitive | 242.387 | 客户端 trial/module 准备、FINAL、state GET 推进 |
| SJT | 180.386 | delivery GET、FINAL、state GET 推进 |
| 父 COMPLETED | **1,177.709** | 从单份业务起点累计 |
| 教师报告 HTTP | 39.664 | 同步 report GET |
| 报告读取并保存结束 | **1,218.942** | 从相同业务起点累计 |

15 个串行 HTTP 合计 1,116.917 ms；业务驱动内非 HTTP 组织/import/本地记录约 102.025 ms，不能当作服务端计算。单份观察器窗口 2.434 s 包含驱动启动和采样尾部，不能替换上述业务墙钟时间。报告 JSON 对象 6,306 B，HTTP envelope 6,349 B；报告没有持久化 report job/layout/blob。

正确性核验通过：4 个单元 snapshot、epoch/source submission/source definition/compiled runtime 身份一致；Scale total=1，SJT cooperation=9；认知 raw blob 内完整 120 trials，报告有实际认知指标。报告含 3 个 native 工具单元及 1 个 Form background。`cognitive_trials=0` 是本路径将 120 trials 存入一个 raw blob 的表现，不是数据丢失。

3 项测评权限负例（另一教师读报告、外部学生读 state、外部学生准入）和 1 项跨教师下载负例均被拒绝；负例前后 accepted parent/children/snapshots 不变。未为权限核验再次交卷。

## CPU、RSS 与 heap

| 单份指标 | 观测值 | 覆盖范围 |
| --- | ---: | --- |
| API CPU | **1.11 s** | 单份驱动观察窗口内 API 进程，排除前后 metrics/DB census；可能含健康/后台工作 |
| API RSS 前 → 后/采样峰值 | 200,593,408 → **240,226,304 B** | 191.30 → 229.10 MiB；1 s 采样，峰值为下界 |
| API heap used 前 → 后 | 97,332,024 → 113,696,304 B | metrics 边界值，不能据此推导 GC 或泄漏 |
| API heap total 前 → 后 | 101,863,424 → 142,106,624 B | 同上 |
| PG CPU / cgroup 内存峰值 | 0.168046 s / 109,043,712 B | 容器范围，含健康/后台；内存不是进程 RSS |
| Redis CPU / cgroup 内存峰值 | 0.009173 s / 11,575,296 B | 同上 |
| 驱动 CPU / 最大 RSS | user 0.405366 + system 0.250362 s / 127,276 KiB | 独立驱动进程，不并入 API CPU |
| 采样器 CPU | 0.015605 s | 观察开销单列 |

没有异步 report worker CPU 值，因为当前同步 profile 未启动该进程；不填 0 冒充测得。

## SQL 窗口与缺测

**559 是整个单份窗口的 API 进程级 Prisma SQL event 增量，不是一次 FINAL 的 SQL 数。** 计数来自既有 API metrics；不支持把这个总数拆成权限、解密、某工具 FINAL 或报告内部 SQL。

| 窗口 | 已知 HTTP 数 | API SQL events | 内容和限制 |
| --- | ---: | ---: | --- |
| 登录/编制/准备及空闲 | 23 | 501 | 含登录、审核授权、编制发布以及窗口内 API 健康/后台；不含直接 owner fixture SQL |
| 单份至教师报告 | 15 | **559** | 准入 1、checkpoint 4、FINAL 4、progress 4、SJT delivery 1、report 1；可能叠加健康/后台 |
| 单份后至导出前 | 3 | 53 | 测评权限负例及空闲/健康，不能称每负例 SQL |
| 导出 enqueue/poll/download | 7 | 54 | enqueue 1、status poll 5、download 1；不覆盖 worker/child SQL |
| 导出后收尾 | 1 | 66 | 下载权限负例及空闲/健康；不含独立 DB 审计进程 |

单份 HTTP 分组合计：admission 252.162 ms、checkpoint 123.966 ms、四 FINAL 390.335 ms、四 progress GET 289.872 ms、SJT delivery 20.918 ms、report 39.664 ms。**每组 SQL 均 unknown**。本轮未执行独立 analysis API，不用新增分析调用补数。

独立 PG 观察器：5 个边界 snapshot，每次 3 条 SELECT；收尾存储审计 44+4=48 个 Prisma SQL events；这些不在 API 的 559 内。直接 DB 正确性验证 CLI SQL 数没有计量。PG database stats 覆盖 API、健康、观察器和 consumer 等所有连接，不能归因单请求；连接/锁仅有边界观察，不是秒级峰值；IO timing 关闭，未测数据库 CPU 或每请求 IO 时长。所有缺测保留 unknown。

## 存储：行、密文字段、物理关系和 WAL

下表为一份 parent 的当前结果相关记录，`pg_column_size(whole record)` 合计；每工具含自己的结果/raw/snapshot，不含共享 parent 或独立认知 assignment。cipher 列是列出的加密 text 的 `octet_length`，Scale 另计 JSONB 中加密 string 的 2,692 B；不是解密正文大小，也不是磁盘占用。

| 范围 | 行数 | record bytes | named cipher text octets | 另存 cipher JSON string octets |
| --- | ---: | ---: | ---: | ---: |
| Form（section、answer、snapshot） | 3 | 4,853 | 3,940 | — |
| Scale（assessment、snapshot） | 2 | 15,548 | 11,828 | 2,692 |
| Cognitive（session、raw、snapshot） | 3 | 96,833 | 95,480 | — |
| SJT（attempt、raw、snapshot） | 3 | 36,267 | 34,904 | — |
| 共享 parent | 1 | 133,355 | 130,776 | — |
| FINAL 后清空的 checkpoint 元数据 | 1 | 224 | 0 | — |
| 合计 | 13 | **287,080** | **276,928** | **2,692** |

以上 named cipher 合计 **279,620 B**，不是数据库所有字段的完整总量。Form answer 的普通值另有 3 B。parent 主要加密字段分别为 flow snapshot 121,248 B、slot set 5,114 B、flow path 4,414 B；Cognitive raw payload 61,612 B。各字段明细仅在原始 audit 保存一份。

准入同时新增一条 `cognitive_assignments`：record 31,581 B、relation 增量 32,768 B；不混进上表“结果相关”合计，其密文字段未专项计量。把这条运行 assignment 计入后，本窗口所选新增行合计 **318,661 B**。

| 单份前后测量 | 新增 B | 说明 |
| --- | ---: | --- |
| 结果相关表 total relation | 1,138,688 | heap/TOAST/index 等物理分配，不等于 record bytes |
| 认知 assignment relation | 32,768 | 准入运行副本 |
| 整个 database physical size | **1,171,456** | 本次两项之和；边界 `pg_database_size` 差 |
| WAL LSN 差 | **392,480** | 逻辑 WAL 字节推进；不是 pg_wal 目录分配增量 |
| 单独 index 增量 | **unknown** | 原前置 snapshot 只有 total relation，没有独立 index 起点 |

收尾审计有各表当前 index 绝对大小，例如 parent 163,840 B、assessment 204,800 B、Cognitive session 196,608 B；不能倒推增量。首份空表的 page/index/TOAST 初始化包含在物理增长中，不直接乘 300，也不拿行大小与旧测试的物理大小比较。120 trials 已完整保存在一个 Cognitive raw blob，未按 trial 新建 120 行。

## 可选优化的实际状态

以下开关在已冻结的 Compose backend 和 native API 环境中均未设置，按当前代码实际为 false：

`ASSESSMENT_COMPACT_FACTS_ENABLED`、`ASSESSMENT_SHARED_CONTROL_ENABLED`、`ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED`、`ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED`、`ASSESSMENT_FROZEN_ARTIFACT_CACHE_ENABLED`、`ASSESSMENT_REPORT_COMPRESSION_ENABLED`、`ASSESSMENT_REPORT_CONTEXT_REUSE_ENABLED`、`ASSESSMENT_REPORT_COMMITTED_CONTEXT_ENABLED`、`ASSESSMENT_REPORT_NARROW_LOAD_ENABLED`、`ASSESSMENT_REPORT_COMPACT_READ_ENABLED`、`ASSESSMENT_REPORT_SNAPSHOT_BATCH_ENABLED`。

数据符合该 profile：Scale 保存完整加密 result/runtime，parent 保存完整 slot set，Cognitive 包装解除后是完整 snapshot，SJT 保存完整 runtime/canonical；相关值未出现 SFF1/SFR1/SCF2/ref 表示。`assessment_result_facts / assessment_frozen_bindings / assessment_public_templates / assessment_runtime_artifacts` 均 0 行；`composite_report_jobs / composite_analysis_snapshots` 也均 0 行。shared-control request-context 路径依赖关闭的 shared-control writes，未进入。本轮同步报告不落 report blob，报告压缩/layout 持久化不适用。

这些事实只说明可选路径本轮未启用。main 仍有无条件 batching/load-once 等实现；没有动态 cache/decrypt hit 计量，不能声称所有优化都失效或被删除。没有相同 fixture、profile、开关和指标口径的旧版运行结果，**本轮不能证明相对历史优化测试退化或提速**。未为比较自行启用任何开关。

## 标准导出（与交卷/报告串行）

单份及报告测量完成、节点 idle 后，按授权临时启用 `HEAVY_PROCESSING_ENABLED=true` 与 `HEAVY_MAINTENANCE_IDLE_CONFIRMED=true`，视频保持 false，启动标准 `dist/workers/main.js`。真实 POST → Redis → 标准 consumer/child → READY → 下载；没有直接调用导出内部函数。

| 导出指标 | 实测 |
| --- | ---: |
| enqueue ack | 122.309 ms |
| 起点至 READY | 2,199.848 ms |
| 下载 HTTP | 18.597 ms |
| 起点至下载保存 | **2,219.181 ms** |
| CSV | **12,794 B，1 行、542 列** |
| API CPU / SQL | 0.11 s / 54（完整 7 HTTP 窗口） |
| consumer 主进程 CPU / RSS 采样峰值 | 0.07 s / 178,749,440 B（170.47 MiB） |
| consumer family CPU、child RSS 峰值 | **unknown** |
| database physical / WAL LSN 增量 | 106,496 / 6,928 B |
| export batch/artifact record | 488 / 659 B，CSV 为数据库外文件 |
| 驱动 CPU / 采样器 CPU | 0.230448+0.221097 s / 0.013636 s |

CSV SHA-256：`d2613426dd5e7ae5b1e8c418ecf6610372381fa55901b67a353a16109011b7eb`。校验 attempt/path 身份、Scale=1、SJT=9、Form/Cognitive 列及跨教师下载拒绝均通过。

当前平台 `/proc/<pid>/task/<pid>/children` 不可读（ENOENT），因此导出 child 观测缺失。初版 helper 把不可读后代暂填 0 的值已在原汇总更正为 null，原 samples 保留 `available=false`，没有重跑导出。worker 的 waited-child CPU 2.16 s 是**自启动累计**，不是准确导出窗口差，不能当作导出 CPU。完整 worker/child SQL 同样 unknown。

## 收停、证据与下一步

标准 consumer SIGTERM 优雅退出约 0.601 s，API 约 0.200 s，退出码均 0；收停不计业务时间。二者 PID 均已不存在。default consumer 配置恢复 heavy/idle/video 全 false，临时导出配置保留供审计。PG/Redis 健康运行，accepted 数据、CSV、失败构建层和日志均保留，无不确定写请求待重交。

所有原始结果只存一份于 `/workspace/training-load-followup-state-20261020`（私有目录，不上传账号秘密或数据库）。核心引用：

- `evidence/baseline-summary.json`：简要索引与指标。
- `evidence/single-result.json`、`single-measurement.json`、`verify-result.json`：业务、采样、完整性与权限。
- `evidence/export-result.json`、`export-measurement.json`、`verify-export-result.json`：真实导出和缺测更正。
- `evidence/resource-closeout-summary.json`：SQL 分窗、heap、各工具归属；`storage-representation-audit.json`、`storage-extra-audit.json`：字段与表示审计。
- 各 `before/after-*-snapshot.json`、边界 `*-metrics.txt`：数据库/关系/WAL/进程原始起止值。
- `build/native-export-summary.json`、`native-build-summary.json`、迁移及角色验证 summary/log：准备证据。
- `evidence/native-api-stop.json`、`export-consumer-stop.json`：持有进程的实际安全收停。

本阶段没有应用功能阻塞；child 资源、逐请求 SQL、独立 index 增量等缺测限制如上。300 份未创建或发出。父对话 review 后决定是否按最新方案 30 份/秒 × 10 秒、10 秒停新发、40 秒提交截止及 130 秒结果截止执行；继续保留 admission 和当前同步 profile。若需优化，先由父对话冻结具体范围，再集中实施与同流程复测。
