# Training 隔离测试启动记录（2026-10-20）

最新状态：`SINGLE_COMPLETE_EXPORT_VERIFIED_300_NOT_STARTED`。同节点 native API＋现有容器 PG/Redis 已完成实际构建、迁移、单份四工具链路和标准 consumer 导出，正确性及必要权限负例通过；API/临时 consumer 已优雅停止，默认 heavy/idle/video 恢复 false，数据服务与证据保留。完整结果、SQL 范围和缺测见[单份基线报告](20261020-training-single-baseline.md)。下文保留各阶段历史，早期建议和“尚未执行”只表示当时状态；300 份仍未启动。

## 冻结基线和边界

- 远端 `caohuibj/eduK12-new-version` 的 `refs/heads/main` 在 02:04:42 UTC 实读为 `c3f9a7e77447c706f4a83a93c7429a7bcb164e94`；独立工作树以此为唯一业务源码基线。不回测旧版本。
- 工作树 `/workspace/training-load-followup-20261020`，分支 `perf/training-load-followup-20261020`。示例 `work/...` 因既有本地分支 `work` 的 Git 引用命名冲突无法创建，未改动该分支。
- 已读取当前 main 的根 `AGENTS.md`、`docs/release/README.md`；两文件与原工作树版本无差异。当前更改仅本启动记录，业务、权限、科学定义和版本体系未改动。
- 新建本任务独有的 PostgreSQL、Redis、数据库、合成账号、上传及导出目录；只发布 loopback 端口。不读取其他任务数据库、用户 Mac 或生产，不借用原恢复脚本的历史数据或凭据。
- 原始启动证据只保留一份：`/workspace/training-load-followup-state-20261020/startup.json`（私有目录）。后续原始结果同目录保存，汇总引用，不重复复制整份证据。
- 本分支备份不创建 PR、不启动正式 CI。已核当前工作流 push 只匹配 main 和另一个固定 foundation 分支，本分支不匹配；不以本节点测量冒充正式 CI 资格。

## 实测资源和配置差异

| 项目 | 本节点实读 |
| --- | --- |
| 可见逻辑 CPU | 5 |
| cgroup CPU 配额 | `400000 100000`，即 4 核时间预算 |
| cgroup 内存上限 | 17,179,869,184 B（16 GiB） |
| 记录时 cgroup 内存占用 | 225,816,576 B（约 215 MiB） |
| 工作盘可用 | 31,917,465,600 B（约 29.73 GiB） |
| Docker | 28.4.0，可调用，运行容器数 0 |
| 已缓存服务镜像 | PostgreSQL 16.15、Redis 7.4.11 |

新节点没有既有应用部署，**实际生效配置目前为空**。main 源码存在不同默认值，不能把近期口述值当成已运行值：

| 参数 | `backend/src/config/assessmentReports.ts` | `docker-compose.yml` 注入 |
| --- | --- | --- |
| 异步报告 | false | false |
| whole submit | false | false |
| max pending | 200 | 600 |
| worker concurrency | 1 | 2 |
| poll | 500 ms | 50 ms |

待父对话确认的显式覆盖建议：报告 `200 / 1 / 500ms`，单个长期 `node dist/workers/main.js`，真实 SQL outbox scheduler；异步报告仅白名单合成课程，whole submit 暂保持关闭，按四工具正常顺序保存、推进和 FINAL。不启动一次性报告处理器，不调用历史 `drainReports()` 替代真实部署，不提高 admission。

资源建议沿 main Compose 默认值冻结：API 1.25 CPU / 1024 MiB、报告 worker 0.75 CPU / 768 MiB、PostgreSQL 1 CPU / 1024 MiB、Redis 0.25 CPU / 256 MiB；共 3.25 CPU 上限，余下约 0.75 核时间供驱动和采样争用。API/worker Prisma 池为 20/4，URL 不另写覆盖该值的 `connection_limit`；启动后读取实际值。其他 admission 保持该 SHA 的 Compose 默认值并在最终 overlay 中列明。视频和其他重型消费者关闭；导出单独串行计时。

上述为建议预算，尚未应用。父对话确认后记录 Compose 展开后的无秘密配置、实际容器限额、镜像 ID/源 SHA、数据库迁移状态和有效运行参数，再冻结测量起点。当前不硬启动负载。

## 最新负载和数据预算

最新委派覆盖原 20 份方案：**先单份全链，再 30 份/秒 × 10 秒 = 300 份**。不额外执行 20 份。

- 单份及并发使用同一可运行 Form、Scale、120-trial Go/No-Go、SJT 组合。每份独立账号/parent/提交身份。使用合成但完整合法的认知 trials，不宣称测量了真人作答时间或浏览器硬件时序。
- 300 份计划到达时间 `i × 1000/30 ms`，`i=0..299`，最后一份约 9966.67 ms；到 10000 ms 无条件停止新发。每份内部保存→FINAL→读取推进→下一工具，份与份并发。
- 可提前准备账号、课程和 parent，只允许真实 API 准入；不预写 child 结果、accepted snapshot、答案、outbox 或报告。准备成本及准备后存储单列。
- 每份最多一条工作流尝试；明确拒绝按拒绝记，写请求断线/超时记未知，先只读查状态，不自动重交或补发。每份未完后续步骤如实记未执行。
- 单份先取得耗时和实际数据库/结果/WAL增量，再评估 300 份；未测前这些值都是 unknown。300 份认知最多 36,000 trial；报告单个上限配置 2 MiB，只能推得 300 份报告预算上限约 600 MiB，不能代表数据库、索引、原始密文及 WAL 的总上限。
- 建议为构建和依赖预留 8 GiB（估算，实际另计）；本次 fixture、数据库新增/WAL、导出及日志合计新增软预算 2 GiB，磁盘剩余 4 GiB 停止线。单份测出合理外推超过该预算时，在 300 份前停报，不沿用旧节点 8 GiB 门槛。
- 报告预算 200 小于总到达 300，拒绝/积压取决于实际领取和完成速度，当前不可预测。不能预先填“拒绝 100”或“全部成功”，不能提高预算制造成功。

## 最简执行清单与停止条件（待父对话确认）

1. **准备**：仅本节点构建一次冻结 backend（API/worker同一镜像，ops复用build缓存），创建隔离PG/Redis、受限运行角色和合成fixture，启动单真实worker。只读就绪和实际配置核查；准备/构建/worker预加载单列。时间预算预计 10–20 分钟，5 分钟仍在下载/构建时报告具体阶段；不追加平台CI。
2. **单份**：真实保存、四工具按依赖顺序FINAL、父完成、真实报告READY、教师报告/CSV或ZIP导出。单份核四工具身份/结果完整性、原提交身份和导出值；受影响的非owner、跨课程、未来工具准入各取必要负例，放在独立功能阶段。业务阶段预计≤120秒；出错停报，不先实施优化。
3. **冻结起点**：单份成功且数据预算可行后准备300个独立身份和parent，保存一次选定表/DB/WAL/目录起点、队列状态及配置；准备不计业务计算。
4. **300份**：开放到达30/s，10秒停止新发；不因驱动迟发延长窗口，迟到超过下一计划间隔的请求计迟发，越过10秒的计未发。建议提交截止为 `t0+40秒`（10秒注入+30秒提交收尾）；到此不再发送后续保存/FINAL，请求超时取30秒与剩余提交预算的较小者。报告观察截止为 `t0+130秒`（注入结束后120秒），不延长。收到503/Retry-After仍计真实拒绝，不补流量。提交/报告/导出时间分别记录；导出在注入及报告观察完成后串行执行一次，避免把导出混入交卷CPU。
5. **观测/汇总**：API/worker、PG/Redis和驱动的目标进程/容器每秒CPU/RSS及cgroup节流采样；API metrics只在阶段边界取，复用现有timeline和Prisma指标。旧C19 HTTP harness每请求抓metrics/全表census的方式不进入负载。PG连接/锁/事务/IO采样注明覆盖，SQL事件计数仅其实际API进程覆盖，worker timeline为Prisma调用而非完整SQL，缺测为null/unknown。数据库、相关结果表、WAL LSN及导出目录仅阶段前后测量，不每请求全库扫描。
6. **安全停止**：到达窗口结束即停新发；OOM/服务退出、容器内存接近各自限额（≥90%）、cgroup可用内存<2GiB、工作盘<4GiB或新增数据>2GiB触发停止后续新步骤。CPU饱和只记录，不因高CPU篡改配置。主结果截止不超过注入结束后120秒，积压、运行中、未知、超时原样冻结。随后对本任务API/worker发SIGTERM，最多30秒优雅停止，必要时仅结束本任务持有进程；这段收停开销另计且不把收停期完成补成120秒内成功。PG/Redis和数据保留，原始证据保留，不删失败记录，不无限排空。

结果必须分列份级计划/实际发出/迟发/未发/拒绝/未知/各阶段完成及READY数、HTTP数、峰值在途、阶段和端到端响应分位数、CPU/RSS峰值、SQL覆盖范围以及DB/WAL/结果/导出新增量。份级“完成”要求四工具与父FINAL，报告READY另列，不能把请求数当份数或两个P95相减当阶段成本。

本轮未获优化授权；只冻结当前main基线和事实。父对话分析后给出具体修复范围，才成批实施独立PR并按同一流程复测；不混入管理员权限或三层内容版本分支，不部署生产。

当前唯一待决：父对话确认上述显式报告配置、容器资源/数据预算和截止条件。尚无自动审批拒绝、未知写请求或报告工具审批事件。

## 父对话确认后的实际准备进展

- 父对话批准构建8GiB预算、数据/WAL/导出/日志2GiB预算、4GiB磁盘停止线。构建监督每秒检查，cgroup剩余内存低于2GiB停止；业务阶段各容器内存≥90%停止后续新发。未触发资源停止。
- 最新main再次实读仍为`c3f9a7e77447c706f4a83a93c7429a7bcb164e94`。配置以实际Compose默认600/2/50ms、异步false、whole=false为准，**不执行前文提出的200/1覆盖**。
- 静态证据：`whole-questionnaire.service.ts:98–109`拒绝条件流程和含Cognitive/SJT的whole；`report-outbox.service.ts:117–142`在新作答异步未启用时只维护流程proof，不登记报告任务；`composite.service.ts:4383–4413,4477–4483`由末次FINAL或授权state GET同步finalize；`5507–5515,5803–5813`报告GET同步投影。因新数据库无enrolled job，本阶段不启动无作用的报告worker。后续若测异步，确切所需开关是`ASSESSMENT_REPORT_ASYNC_ENABLED=true`及合成课程`ASSESSMENT_REPORT_ASYNC_COURSE_IDS`，不需要whole开关，须由父对话另行冻结profile。
- 私有Compose已展开；只有资源命名、synthetic secrets/DB/local目录、loopback端口和诊断覆盖。`evidence/config-planned.json`不含秘密。实际PG限额1CPU/1GiB，Redis0.25CPU/256MiB，无host端口，均healthy；镜像ID和实际限制在`evidence/actual-containers-pre-api.json`。API与worker尚未创建。
- 构建attempt1仅因`/home/agent/.docker/buildx`只读失败，已改用本任务DOCKER_CONFIG；attempt2官方Debian直连80端口拒绝，已传入节点既有代理；attempt3官方apt成功，在`npm ci`因`SELF_SIGNED_CERT_IN_CHAIN`失败，未关闭TLS。各attempt独立保留日志/summary，不覆盖失败。attempt3结束时累计构建磁盘增量约4.21GiB，当前值和临时层回收可有差异；没有业务CPU/存储数据。
- main push run `39351564444`无artifact；PR316 run `39350381656`仅找到backend-dist，没有可直接加载的runtime/builder/ops镜像。不把dist当作合格运行镜像，也未下载或执行旧版本。
- 构建待父对话确认的具体方案已生成：仅私有Dockerfile的npm RUN增加BuildKit secret mount，`NODE_EXTRA_CA_CERTS`指向**节点当前已用**的`/usr/local/share/ca-certificates/environment-proxy-ca.crt`。仍用官方registry、锁文件integrity及TLS验证；不改仓库Dockerfile、不改系统信任、不把CA写进runtime。精确diff为`evidence/build-proxy-ca-proposal.diff`，CA指纹和动作状态为`evidence/build-blocker.json`。该方案尚未执行。
- 单份驱动`server-version/scripts/load/training-followup.mjs`已准备并通过Node语法检查；仅脚手架，未动态验证。它新建合成来源、真实API编制/发布和四工具FINAL，不复制旧库、直接写accepted结果或调用内部report/export处理器；业务请求间不抓metrics或扫表。
- 导出另有明确profile待决：当前POST export实际enqueue Redis，默认`HEAVY_PROCESSING_ENABLED=false`会让任务保持PENDING。若父对话批准，可仅在单份测评/报告计时完成且隔离节点idle后，以`HEAVY_PROCESSING_ENABLED=true`及`HEAVY_MAINTENANCE_IDLE_CONFIRMED=true`启动标准worker处理单次真实导出；视频仍false。未获确认前不启动、不改走内部函数。
- 当前阻塞是环境TLS构建信任处理待父对话确认，导出消费者profile也待确认；没有自动审批拒绝、未知业务写入或报告工具审批事件。300份负载保持未启动。

## 临时CA获准执行后的预算停止

- 用户明确允许原精确临时CA提案；父对话也批准仅在提交/报告计时结束且idle后，临时启用标准consumer的两个HEAVY开关处理单次导出，视频false，成本单列后恢复。未扩大CA范围，尚未启动consumer。
- CA来源为节点现有`NODE_EXTRA_CA_CERTS`使用的环境代理根证书（公开证书文件，不是私钥）。仅在`deps`阶段npm安装这一条RUN中以BuildKit secret挂到`/run/secrets/environment_proxy_ca`，shell设置`NODE_EXTRA_CA_CERTS`供npm及其安装子进程使用。没有设置npm的`cafile`配置，没有写Dockerfile `ENV`，没有修改系统、Mac或runtime信任。
- 原精确diff不变，构建命令通过`--secret id=environment_proxy_ca,src=/usr/local/share/ca-certificates/environment-proxy-ca.crt`引用原证书，没有复制临时CA文件。secret在该RUN完成时由BuildKit解除挂载；保留原节点证书及不含证书字节的diff/指纹/失败日志。最终runtime镜像尚不存在，不能声称已做成品镜像检查；后续构建完成再核环境与产物边界。
- attempt4日志显示npm安装和`prisma generate`已成功，随后停止于build的COPY阶段，尚未运行应用编译。监督器记录`BUILD_GROWTH_EXCEEDS_8GIB`，进程退出130，准备增量为8,844,341,248B（约8.24GiB）。这是从首次构建起点量得的workspace已用空间变化，包含本任务PG/Redis初始化和工具文件，不是纯业务数据增量。一秒检查存在小量超出，原值保留，不重设起点继续构建。停止后工作盘仍余约21.49GiB。
- 没有进行cache prune、改预算、改下载路径、删除失败证据或继续构建。新的待决项是父对话调整构建准备预算或给出明确清理范围；2GiB数据预算与4GiB磁盘停止线未变。
- 离线VM替换fetch，无网络/服务负载地检查6种运输情形：首轮5通过，HTTP200非JSON未明确归类unknown的1项失败；驱动已修正并仅复验该项通过。最初结果与单项复验分开留存，未重跑已通过项。这只证明驱动错误记账，无应用、权限或性能资格。
- 驱动修复已备份`b32fdec15a527337797d4757d51f8cc2dc1a216d`。原始预算停止及CA范围记录统一引用`evidence/build-blocker.json`和`build/attempt-004-authorized-ca/summary.json`，不复制整份证据。

## 16GiB预算的实际VFS停止

- 父对话批准准备总增量16GiB，原起点118,054,912B、数据2GiB预算、磁盘4GiB停止线保持；attempt005明确关联attempt004，未清缓存或重置计数。日志确认npm安装和Prisma generate均CACHED，未重新执行依赖安装。
- attempt005运行35.41秒后在第9/18个build步骤`COPY scripts/runtime-table-policy.json`停止，未运行应用编译或runtime阶段。监督器记录`PREPARATION_GROWTH_EXCEEDS_16GIB`，退出130。实际workspace准备增量17,563,488,256B（约16.36GiB，含一秒采样超出），剩余14,353,764,352B（约13.37GiB）；观察到的cgroup内存峰值13,877,190,656B（约12.92GiB），未触发2GiB可用内存停止条件。
- `docker info`实际返回`vfs`。本次六份COPY源文件合计24,702B，却伴随约8.12GiB的额外workspace占用；逻辑BuildKit cache统计约972MB不能代表节点物理准备开销。[Docker官方说明](https://docs.docker.com/engine/storage/drivers/vfs-driver/)确认VFS没有COW，每创建一层会深复制前层，因而多层Dockerfile放大磁盘使用。此前16GiB建议遗漏该环境特性，属于准备预算误估，不能归为业务性能问题。
- 原始引用：`evidence/preparation-budget16-stop.json`、`build/attempt-005-budget16/summary.json`及该目录ops.log。停止后未清缓存、删除失败记录、改Dockerfile COPY组合、变更storage driver、切换构建路径或继续发起构建；没有产品优化任务。
- 需父对话决定可承受当前Dockerfile的构建资源或具体获准环境适配范围。当前成品镜像/实际应用配置/单份CPU、RSS、SQL、业务存储增量均未测，保持unknown或未开始，不填0或冒称通过。原CA及单次临时导出consumer授权仍有效。

## 同节点原生方案静态核查

- 已装Node24.19.0/npm11.9.0，Node不满足backend要求`>=24.21.0 <25`；其他标准安装路径未找到合格Node。当前宿主为Debian13/glibc2.41，ldconfig可见canvas需要的cairo/pango/jpeg/gif/rsvg等共享库；原生addon实际load/ldd仍待导出后验证。
- 可复用本任务官方Node24.21.0基础层（原digest已保留）及成功npm ci缓存。最短路径是原Dockerfile的`deps` target仅作CACHED文件导出，stream tar选择Node、配套npm及node_modules，不生成/运行Docker应用镜像，不重跑npm install，不建立新构建体系。出现cache miss/RUN应停报。随后对同main backend运行已有本地Prisma generate（仅必要时）与`npm run build`。
- 已列8条本任务COPY中间层，全部private/reclaimable、创建于本任务构建时间，可用精确cache id逐条、叶子优先回收；保留成功npm、Prisma及其父层。日志/summary/原起点/峰值/PG和Redis卷/其他任务对象均不回收。精确ID、保留ID和时序在`evidence/native-plan.json`。当前没有执行任何prune或导出，回收物理字节仍unknown，不能拿逻辑cache大小冒充可释放空间。
- 静态估算：选择导出的Node/npm/依赖与dist约0.6–1.0GiB，暂给2GiB新增准备上限（含临时余量）；构建工作内存估计1–3GiB。均需实际测量。先回收后量原起点增量，只有仍满足总准备16GiB、数据2GiB及磁盘4GiB停止线才继续，不重设起点。
- 业务开关/admission/pool/Node heap沿main Compose：async/whole false、配置600/2/50ms、API池20/heap640MiB、单次导出consumer池4/old192MiB/semi16MiB。仅PG/Redis地址改为本任务当前bridge IP，上传/导出/交接目录改为本任务native目录；不新增系统信任，host不跑npm install，构建子进程不继承临时BuildKit CA变量。
- 重要限制：宿主cgroup不可写、用户systemd offline，native API/consumer无法在现有权限下复现Compose的独立硬CPU/内存限额；只能沿既有Node heap参数、过程RSS停止线和宿主4核/16GiB总限额。PG1CPU/1GiB、Redis0.25CPU/256MiB仍真实受限。必须将其称作native API＋容器数据服务profile，候选比较用同profile，不能声称是成品Compose镜像容量。原生准备和业务测量尚未开始。
