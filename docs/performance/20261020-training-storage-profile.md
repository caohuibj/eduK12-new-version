# Training 三存储开关单份诊断（2026-10-20）

状态：`SINGLE_AND_CSV_VERIFIED_ALL_PROCESSES_STOPPED`。固定产品候选 `aff44d0cc4c935342dfaf55fa29b8fdde69c298b`，本轮只有一份三 flag 测评及一次闲时标准导出。候选全 OFF 单份此前也已完成；所有未来 300 份计划已取消，没有新压测。旧 main 只引用冻结证据，不重跑。

## 已验证范围与配置

仅开启 `ASSESSMENT_COMPACT_FACTS_ENABLED=true`、`ASSESSMENT_SHARED_CONTROL_ENABLED=true`、`ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED=true`。其余可选 flag 未开，报告同步、whole=false、报告配置600/2/50ms、pool20/4、API heap640MiB及原admission/timeout不变。Node24.21.0；API无独立硬CPU配额，根cgroup4核/16GiB，节点12GiB停止线；PG1CPU/1GiB，Redis0.25CPU/256MiB。

现有178项迁移及受限runtime角色217表/1sequence检查通过；facts/artifacts/templates/bindings起点为空。旧inline parent与3份native canonical在新配置下只读读取，hash与原证据一致。新fixture用独立空数据库 `training_storage_20261020`、新身份/课程/来源。业务请求用受限runtime身份；owner只作合成准备与独立只读核验。

实际四FINAL、推进、父完成、同步报告通过；120条认知trial与实际发送输入逐项相等，Scale原始答案/计时相等，Scale=1、SJT=9，source/compiled/epoch/path身份通过。3项测评权限负例及跨教师下载负例通过，accepted facts不变。CSV1行542列、12,794B；与基线全部表头及11个科学指标列完全一致，身份、hash和时间列按新fixture改变。

## 整体指标与口径

| 指标 | main全OFF（c3f9a7e7） | 候选全OFF（aff44d0） | 候选三存储flag |
| --- | ---: | ---: | ---: |
| 至报告原始墙钟 ms | 1,218.942 | 1,273.287 | 1,336.252 |
| 扣除额外边界暂停的流水时间 ms | 1,218.942 | 1,273.287 | 1,266.258 |
| API进程CPU秒/整个观察窗 | 1.11 | 1.12 | 1.05 |
| API RSS采样峰值 B | 240,226,304 | 383,655,936 | 383,680,512 |
| API SQL总窗 | 559 | 556 | 609 |
| 所选记录净增 B | 318,661 | 318,661 | 102,831 |
| DB physical新增 B | 1,171,456 | 1,171,456 | 884,736 |
| 独立index新增 B | unknown | 524,288 | 598,016 |
| WAL LSN推进 B | 392,480 | 402,920 | 153,752 |

三flag的7次边界metrics/proc观测共161.275ms，其中业务流水内暂停69.993ms，观测窗口API CPU约0.06s、驱动CPU0.112947s；另有监督器CPU0.022148s。扣除这些API观测窗口后约0.99s，仍含背景和窗口误差，不是主线程profiling。15个业务HTTP与7个诊断metrics HTTP分列。原始业务总墙钟1,336.252ms；扣额外暂停1,266.258ms不等同于无观测时反事实耗时。

三flag API RSS边界371,150,848→383,680,512B，峰值365.91MiB；heap used142,673,808→139,793,088B，heap total254,431,232→258,633,728B。不同进程的起始RSS差异明显，不把相对最早main的RSS差归因到两处补丁。PG容器CPU0.190721s/内存峰261,148,672B，Redis0.055949s/17,944,576B，含健康及观察器；不是进程RSS或单SQL耗时。

## 阶段观察

| 阶段（含保存/FINAL/推进） | API CPU秒，剔除边界观测窗 | API SQL阶段总窗 | RSS观测下界峰值 B | heap used阶段末 B |
| --- | ---: | ---: | ---: | ---: |
| 准入/首次artifact创建 | 0.16 | 100 | 372,072,448 | 116,305,336 |
| Form | 0.21 | 123 | 374,824,960 | 136,754,016 |
| Scale | 0.23 | 136 | 378,241,024 | 108,160,672 |
| Cognitive | 0.17 | 105 | 379,420,672 | 139,390,696 |
| SJT/父终态 | 0.17 | 118 | 380,796,928 | 119,846,728 |
| 教师报告 | 0.04 | 25 | 382,369,792 | 133,142,016 |

六阶段SQL共607，整体窗609，剩余2次未归因；阶段内健康/后台SQL数量unknown，不能填0或说是单次FINAL查询数。metrics handler本身无显式业务SQL，但不据此排除同期后台。阶段小于1s，未命中内部秒级RSS样本，表中峰值取阶段边界，仍是下界；CPU按/proc计数约10ms分辨率。PG锁/连接仅整体边界，峰值unknown；IO timing关闭，无DB逐SQL耗时。

## 字段级存储与真正原始作答

下表cipher/引用octets是字段字节，不能和row/index/物理分配混为一谈。

| 字段 | 原main OFF B | 三flag B | 内容类别 |
| --- | ---: | ---: | --- |
| parent flow candidate | 121,248 | 29,564 | 冻结定义/引用、assignment DTO、SJT候选、身份 |
| parent slot set / path | 5,114 / 4,414 | 101 / 1,427 | 冻结计划引用、个人执行证据 |
| Scale runtime | 7,044 | 105 | 共享不可变科学版本引用 |
| Cognitive config runtime | 8,298 | 105 | 共享不可变科学版本引用 |
| Cognitive result snapshot | 19,556 | 4,615 | 个人派生指标与完整显示结果；解码JSON仍9,723B |
| Cognitive raw | 61,612 | 2,188 | 原始120 trials；解码JSON仍30,745B，逐项无损 |
| assignment frozen report | 30,648 | 30,648 | 展示、metric/quality/report定义，不是被试报告 |
| assignment frozen config | 398 | 398 | 144B配置，不是原始作答 |
| SJT runtime | 25,790 | 5,048 | 定义/runner/compiled版本＋授权收据 |
| SJT result / canonical | 2,010 / 2,856 | 790 / 1,191 | 个人派生结果及不可变权威事实 |

Form原始答案值3B保留。Scale answers现在是18B SFR1引用，实际原始答案在facts行的342B密文中；旧小样本为220B，不能声称每个原始答案字段都变小。SJT原始responses保留。canonical snapshot是终态事实及身份边界，不能作为“重复定义”随意删除。

首份所选记录318,661→102,831B（本场景约-67.73%）：新profile的个人core记录56,786B，facts1,680B、个人binding560B；首次共享runtime2行5,080B、模板8行7,144B另列；首次课程wrapper31,581B另列。total relation884,736B，其中index598,016B、table/TOAST等286,720B。首份空表/index/TOAST分配很大，不能将其乘人数。共享版本跨后续被试复用的增量成本**未测**，没有额外第二份。

### candidate为什么仍大

原main candidate解码JSON60,563B：references15,427B、assignment31,875B、SJT12,875B；内嵌Scale/Cognitive完整密文与child字段逐字相同，之后整个candidate又加密。

三flag candidate解码JSON45,431B：references仅295B，其中Scale/Cognitive各105B，均实测为SHARED_*_RUNTIME引用；child保存同一小引用，没有把共享正文展开后再写入candidate。剩余assignment仍31,875B，SJT仍12,875B，外层已用ekc1压缩。

assignment DTO中的resolvedReport密文30,648B，占主要空间；解码15,269B，含participantPresentation6,705B、v2MetricDefinitions3,260B、legacy metricDefinitions2,614B及报告/quality定义。该密文在首次candidate和wrapper中相同，不是原始答案。已冻结的旧burst代表parent使用existing wrapper id，assignment段仅99B、flow密文57,696B；所以首份31,581B wrapper及121,248B flow都不是每份必有的固定成本。三flag后的暖复用未额外测量。

SJT candidate内12,834B对象与child runtime解码后完全相同：definition4,927B、runner2,085B、compiled1,999B、online1,886B、scientificContext632B、authorizationReceipt682B等。当前没有SJT共享artifact writer，但已受到外层/child通用compact codec覆盖。不能把包含授权收据的整个对象直接作为公开共享模板。

## PR302与现有路径的对应

[PR #302](https://github.com/caohuibj/eduK12-new-version/pull/302)已合并为46734420d8e68242c374b6beecd18ca947a3bdee，核心f92abdc5，二者均为本次main基线祖先。[历史官方CI](https://github.com/caohuibj/eduK12-new-version/actions/runs/38946545404)对ef3a11fc成功；不是PR318的新CI资格。历史-30.17%为纯Scale、-66.35%为特定mixed/异步等配对场景，不能套为当前Training FLOW承诺。

| 既有路径 | 最小启用依赖/实际覆盖 |
| --- | --- |
| 通用compact codec | COMPACT_FACTS；security.ts:12–14覆盖整个FLOW envelope、认知raw、SJT runtime及canonical等，不是FLOW全绕过 |
| Scale共享runtime | SHARED_RUNTIME_STORAGE；runtime-snapshot.ts:341。compact＋shared-control进一步采用小控制引用 |
| Cognitive共享runtime/压缩result | COMPACT_FACTS＋SHARED_CONTROL；shared-cognitive-runtime.ts:40、unified-final-submit.service.ts:431 |
| shared slot/admission/binding | COMPACT_FACTS＋SHARED_CONTROL；保留个人parent/epoch/context binding，当前授权仍检查 |
| Scale facts/raw/canonical引用 | COMPACT_FACTS；SFF1/SFR1/SCF2兼容reader，完整raw与scorer结果重建校验保留 |
| report compression | 独立REPORT_COMPRESSION，仅持久化collection-report缓存；本轮同步GET没有report job/blob，不能解决candidate或raw膨胀 |
| compiled/frozen cache等 | 本轮OFF，不把CPU缓存当存储去重开关；未默认启用其他report优化 |

## 最小方案、阻塞与可延后

本次验证支持优先复用现有三flag的新写路径，无需再造压缩器或立即重构共享系统。只对新写生效；旧inline数据未迁移。继续保留dual reader、全部原始trials/答案/计时、科学hash和个人绑定，以及与引用同一数据库点的artifacts/templates/facts/bindings。已有迁移/角色与本轮报告/CSV/权限检查通过。

没有新证实的单份功能或权限必须修项。部署仍按父对话既有review/CI/授权流程，PR318未跑正式CI、未部署生产；这不是以单份授予上线或容量资格。SQL从候选OFF556升至609，包含首次artifact/template/fact工作；单份不足以要求扩大CPU/事务重构或断言持续成本。

最小后续代码候选（尚未实施）：先审首次assignment frozen report能否复用现成Cognitive compact codec，保留相同domain envelope与全部定义，减少30,648B内层密文及candidate中的嵌套副本；不造新codec、不改科学版本。SJT静态artifact拆分可延后，须把definition/runner/compiled版本与个人授权收据/冻结身份分开；当前5,048B压缩runtime已经可用。是否继续由父对话决定。

## 原始证据、准备与收停

唯一原始证据根：`/workspace/training-storage-profile-state-20261020`。主要索引为 `evidence/diagnostic-summary.json`、`field-storage-audit.json`、`storage-representation-audit.json`、`single-result.json`、`single-measurement.json`、`verify-result.json`、`export-result.json`、`verify-export-result.json`、`csv-baseline-comparison.json`；各阶段snapshot/metrics及私有原始输入另存，不上传账号秘密/数据库。原baseline与候选OFF根分别为 `/workspace/training-load-followup-state-20261020`、`/workspace/training-load-candidate-state-20261020`。

候选OFF编译53.681s，单份至报告1,273.287ms并通过3项负例，CSV尚未enqueue时被新的存储优先级暂停；300从未启动。VFS新数据服务根层准备触及原18GiB线，已停止并保留卷/记录，释放该空PG容器可重建根层；复用本任务PG新独立库，Redis独立。三flag最初混合库fixture触发config唯一键，0业务HTTP；保留部分合成准备数据和失败记录，改新空库，未改科学版本、未重交测评。准备开销不计业务。

三flag CSV经标准Redis consumer，至下载2,231.122ms；API CPU0.08s、consumer主进程0.07s。平台不可读后代列表，完整child/family CPU与RSS unknown，不能把主进程值当总导出CPU。未启动一次性处理器。API与consumer均已SIGTERM优雅退出，heavy恢复false、video=false；新三flag私有冻结配置保留作证据，未改生产/仓库默认配置。

这些是每profile一份、非随机配对、不同进程起始RSS/PG缓存和首次artifact成本的观察。候选补丁与开关变化同时存在于相对main的比较，额外阶段观测也不同；减少操作不自动等于提速，不能单份证明承载能力。
