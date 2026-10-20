# Training 新 frozen-report writer 最终单份复验（2026-10-20）

状态：`ONE_SINGLE_AND_STANDARD_EXPORT_VERIFIED_ALL_OWN_SERVICES_STOPPED`。实际运行产品提交 `0efc283b6489f3e0a99a98788dd36fe2cf855636`，独审 GO 后只执行一份新测评和一次标准导出。main 基线仍为 `c3f9a7e77447c706f4a83a93c7429a7bcb164e94`；旧 main/旧 profile 只引用已保存证据，没有重跑。没有压力测试、额外优化、正式 CI 或生产部署。

本次使用独立空数据库 `training_final_20261020`、新合成用户/课程/来源、独立导出目录及本任务 Redis 的空逻辑库2；PG/Redis 服务与上一轮相同。现有178迁移和原受限角色217表/1序列检查通过，迁移 fingerprint 不变。业务用受限 runtime，owner 只用于初始化合成 fixture、部署原有 schema/ACL及限定本次数据的只读核验。未新建高权限角色或扩大原 table policy。

三个存储 flag 全 true，具体依赖和回退见[可选 profile](20261020-training-storage-optional-profile.md)。其它配置与上一轮三 flag 单份相同：报告 async=false、whole=false、报告预算600/并发2/poll50ms、pool20/4、API heap640MiB、worker heap192MiB/semi16、export并发1，admission/timeout不变。根 cgroup4核/16GiB；API无独立硬CPU/RAM限制；PG1CPU/1GiB、Redis0.25CPU/256MiB。新运行产物只构建一次；API为新进程，Redis逻辑库和数据起点不同，不能将单次时延差全部归因于 report writer。

## 新冻结入口与正确性

seed 实际调用当前编译产物的 `freezeAssignmentProfile`，不传 `sourceFreeze`。发测评前只读核实来源 report 为 `ekc1`，5,468B；解密完整定义15,269B，明文 hash 为 `c2e8dfc730dda51c7481c3638a9ab8f0faea6da46828577ca5da757c636bbe71`。config仍398B，解密144B，配置hash不变。此时 parent/canonical/shared runtime/public template 均为0，之后产品发布准备也没有创建 parent。实际 deferred wrapper 与持久化 assignment 的 report 密文一致，证实新 writer 覆盖了这次流程。

一份完整串行 Form → Scale → Cognitive → SJT，经正常 checkpoint 保存、4次FINAL、推进和parent完成，再由教师正常GET同步报告。15个业务HTTP全部200，未知/意外拒绝0；诊断metrics另7次。不重交不确定写请求；单份监督截止120秒，导出READY截止60秒。未触发资源停止线或超时。

120条trial与实际发送输入逐条相等，认知raw只存一个blob，CognitiveTrial新行0；Scale答案/计时相等，Scale=1、SJT=9。4个canonical的source/compiled/epoch/submission及CSV路径身份校验通过；报告含3种原生工具和1项Form背景。3项测评权限负例及跨教师下载负例通过，accepted facts保持不变。

一次闲时标准Redis consumer导出通过：1行、542列、12,794B。离线与两份既有结果分别比较，全部CSV表头及11个指标值一致；**完整 Cognitive singleTaskReport 与完整已核验 Cognitive canonical摘要也完全相等**。新fixture的其它身份/时间列按预期不同。没有为比较再访问旧数据库或补做测评。

## 业务时间、CPU、内存与SQL

| 指标 | 上一轮三 flag（aff44d0，已有证据） | 本次新 writer（0efc283） |
| --- | ---: | ---: |
| parent完成，ms | 1,287.588 | 1,118.244 |
| 至报告原始墙钟，ms | 1,336.252 | 1,169.872 |
| 扣流水内额外边界暂停，ms | 1,266.258 | 1,100.770 |
| API CPU秒，整个driver窗 | 1.05 | 0.95 |
| API CPU秒，扣观测窗口估计 | 0.99 | 0.85 |
| API RSS采样峰值，B | 383,680,512 | 380,076,032 |
| API SQL总窗 | 609 | 610 |

本次API RSS起点370,155,520B，采样峰值362.47MiB；heap used144,115,960→125,117,504B，heap total254,480,384→257,339,392B。PG容器CPU0.172521s、cgroup内存采样峰289,775,616B；Redis0.039814s、19,476,480B。容器指标覆盖本任务服务的所有逻辑数据库及背景工作，不是进程RSS或单份独占成本。单次CPU/时延较小只是观测；没有成对重复或稳定提速结论。

| 阶段 | 业务阶段墙钟ms | API CPU秒，剔除边界窗 | API SQL阶段窗 | RSS边界/采样下界峰值B |
| --- | ---: | ---: | ---: | ---: |
| admission/首次共享创建 | 165.898 | 0.15 | 100 | 370,782,208 |
| Form保存/FINAL/推进 | 251.437 | 0.13 | 123 | 372,092,928 |
| Scale保存/FINAL/推进 | 205.571 | 0.20 | 136 | 374,845,440 |
| Cognitive FINAL/推进 | 244.733 | 0.17 | 105 | 376,451,072 |
| SJT FINAL/parent终态 | 180.637 | 0.16 | 119 | 377,454,592 |
| 教师报告GET | 51.108 | 0.04 | 25 | 378,765,312 |

阶段SQL合计608，总窗610，另2次在阶段括号外；阶段内背景SQL无法独立归属，保持unknown。SQL为API进程Prisma事件，并非每个FINAL的查询数或PG全语句数。CPU来自10ms分辨率`/proc`计数。RSS一秒采样并结合边界；Cognitive阶段只有1个内部样本，其余阶段0个，均不是可靠阶段峰值。PG锁/会话只在边界观察到0，不作为峰值0；IO timing关闭，PG完整语句统计未知。

7次观测共194.539ms，其中流水内暂停69.102ms；观测窗口API CPU约0.10s、驱动CPU0.148088s。监督器另用0.014085s，单份驱动总CPU0.678459s（已含驱动观测CPU，不重复加总）。扣暂停的1,100.770ms及扣CPU窗口的0.85s只是描述性估计，仍有背景、调度及计数误差。既有边界DB census未独立计时/计CPU，标unknown；未为补指标再跑。准备、采样和收尾不算业务计算。

## 最终存储与首次成本

| 层次/字段，B | main全OFF已有证据 | 上一轮三 flag已有证据 | 本次 |
| --- | ---: | ---: | ---: |
| assignment frozen report密文 | 30,648 | 30,648 | 5,468 |
| parent flow密文 | 121,248 | 29,564 | 12,640 |
| 首次course wrapper整行 | 31,581 | 31,581 | 6,401 |
| 所选新增记录合计 | 318,661 | 102,831 | 60,715 |
| DB physical新增 | 1,171,456 | 884,736 | 843,776 |
| 其中index新增 | unknown | 598,016 | 598,016 |
| table/TOAST新增 | unknown | 286,720 | 245,760 |
| WAL LSN推进 | 392,480 | 153,752 | 108,568 |

本次26条相关新记录60,715B可拆为：业务core39,850B、result facts1,680B、private binding560B、首次course wrapper6,401B、首次2个shared runtime5,080B、首次8个public template7,144B。即core/facts/binding共42,090B；wrapper及共享版本成本另外列示，共享首次成本仍为12,224B。这里采用现有`pg_column_size(record)`口径，与字段octet和物理页分配区分，不把冷启动全部成本称为每人常数。

新 report 密文相对旧格式缩减82.159%；实际parent flow相对上一轮三flag缩减57.245%，全部所选记录缩减40.957%。parent flow解密JSON45,431→20,251B，恰好减少25,180B旧report密文字符串成本；其引用仍是小shared引用，SJT完整定义仍保留。Cognitive result仍4,615B，raw为2,172B/120trials（随机序列使压缩长度有小差异）；未删除定义、必要事实或原始答案。

物理新增843,776B中index598,016B、table/TOAST245,760B；首次建页/TOAST/索引分配不等同于稳态每份占用，也不证明旧文件会收缩。WAL为本任务PG集群LSN推进，可能含本任务其它库/背景活动；不冒充逐请求WAL。未再测第二人/暖course共享摊销，未线性外推容量。

## 准备、导出与收尾

构建57.769s，编译子进程CPU93.773s、峰值单进程RSS约2.03GiB；迁移4.795s、seed0.753s、新freeze只读预检1.545s、HTTP发布准备1.758s、受限角色验证0.252s，均在业务计时外。fixture前后DB新增647,168B、WAL75,120B。API业务窗前已累计5.22s CPU，包含启动/就绪/fixture HTTP/闲置，细分unknown。初始化脚本曾因空legacy URL白名单检查退出，当时尚未构建/写DB/发HTTP；保留空legacy URL后继续，未多做一次fixture或测评。

报告async=false，outbox行0，因此报告由真实同步GET生成；没有开启异步worker、直接drain outbox或使用一次性worker。闲时只启动一个原`dist/workers/main.js` consumer，heavy/idle确认仅此时true、video始终false。标准导出至下载2,225.777ms，API CPU0.11s、consumer主进程0.08s，主进程RSS采样峰185,081,856B；完整子进程家族CPU/RSS因既有`/proc`children入口不可用而unknown，不能把主进程指标当完整导出成本。API SQL55，worker完整SQL未知；导出另增DB106,496B（index90,112B）、WAL5,696B和CSV文件12,794B。导出驱动CPU0.467805s、监督器0.015740s另列。

API PID104816、consumer PID105931均SIGTERM优雅退出且exit0；默认heavy恢复false、video保持false。只读审计结束后，核对精确容器ID及本任务标签，再正常停止本任务PG和两个Redis，三者均exit0、无OOM；不移除容器或数据卷，所有既有数据/证据保留。结束磁盘可用约12.33GiB，原18GiB准备预算仍余约618MiB，未触发资源线。停止API/consumer后的只读审计限定本次parent及其相关行；旧比较全部离线复用。

原始结果仅一份，保留在 `/workspace/training-final-single-state-20261020`，未上传秘密、原始DB、账号或CSV。入口汇总为 `evidence/final-summary.json`，引用 single/result/measurement、verify、export、field/storage audit、offline CSV/report comparison、new-freeze preflight及stop记录；各构建/准备/审计开销在`build/*-summary.json`。源码验证复用0efc283的34/34及类型检查；本次仅补必要运行产物与唯一业务流程，没有再跑整套测试。PR318保持draft、CI暂停；管理员main合并后由父对话协调一次对齐和必要功能门。
