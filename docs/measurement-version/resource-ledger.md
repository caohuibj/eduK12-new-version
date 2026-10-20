# 版本升级资源与冗余台账

本表区分源码事实、实际测量和参数化估算。未执行的数据库迁移、容量和压测不能由纯测试代替；历史 A07 与当前 main 的默认配置不作混合对比。后续压力线结果须附固定 SHA、环境、有效配置、样本与原始结果，再引用本表。

| ID | 链路与对象 | 当前源码或实测证据 | 实际 effective flags | 已测 vs 估算 | 冗余或独立风险理由 | 改动单元 | 验收 | 结果 | 回归警戒 |
|---|---|---|---|---|---|---|---|---|---|
| R01 | 三层共享发布定义/资产 | measurement-content/repository.ts；release.ts 的资产身份清单 | 无专用开关；仅现有发布服务调用 | 源码已核，PG 字节未测 | 科学定义共享一次；引用资产而非复制媒体；不可把整包带进每答事实 | V02–V04/V08–V09 | 多答案引用同一 release；检查持久化列 | 待真实 PG | 不在每答复制范文、常模数组或完整发布包 |
| R02 | 每答 raw/facts/binding | V08 实施前仍有旧 frozen/runtime snapshot | 依各入口当前 admission 配置；未读取生产 effective flags | 源码盘点，不是容量实测 | 原始答案/原始分数是事实；binding 只存精确身份、必要人口匹配与选择证据 | V08–V09 | START 冻结、FINAL 一次计分、历史回读 | 待实施 | 不保留永久双轨；原始事实不因新报告重算 |
| R03 | 每份报告/显式新解释 | V07 待接独立解释身份 | 无新公开入口 | 参数化估算 | 每次显式解释独立存结果与引用；共享模板只存一次 | V07–V08 | 请求幂等、previous 关系、报告不可覆盖 | 待实施 | 不能每次读取重新产生报告；避免复制共享参考表 |
| R04 | norm 候选离线分析 | reference-candidate.ts 内部准备；无 HTTP 接口 | 未启用公开发布 | 未测 | 样本清单与方法证据有独立审计价值；分析不在施测 runtime 扫样本 | V06 | 授权事实清单、独立审核、候选哈希 | 准备中 | 样本充分性复核不替代可计算性/finite 检查 |
| R05 | 同请求验证上下文 | Cognitive release.service 与 adapter 当前重复 readiness | Training 开关保留；Survey 使用自身发布门禁 | 源码已核；未做性能对比 | 可复用同一精确版本/配置的已验证上下文，不能跨权限/事务盲复用 | V09 | 校验输入绑定、真实权限和 CAS 保留 | 待合并重复 | 不用缓存逃避当前授权与撤回状态 |
| R06 | export retention | V08 默认 raw/facts 与专门 interpretation 导出待接 | 依实际导出配置；未读取生产值 | 未测 | 导出文件与正文数据库各自占用；需记录保留期/清理政策 | V08–V10 | 导出边界与保留策略盘点 | 待实施 | 真实数据永久删除另行确认 |
| R07 | indexes/WAL/cache | 新 release 身份唯一索引、来源 FK、状态事件 | 数据库/缓存运行值未取证 | 未测 | 索引、WAL、临时空间与缓存不能当正文零开销 | V10 | 隔离 PG 迁移与代表性合成样本测量 | 待集中验证 | 不从 JSON 字符数推定真实物理字节 |
| R08 | 私有 Prisma client | 独立 dependency overlay；生成 client；定向 strict tsc 通过 | 无运行服务 flag 变更 | 本地工具约 8 MB client 包、生成物几十 MB；非应用数据容量 | 隔离生成避免污染其他任务；其余官方依赖只读软链 | V04 | 生成路径隔离、无共享 client 改写 | 已核 | 不重复复制大 node_modules |

| R09 | 候选 entry 身份摘要 | reference-candidate.ts 在 entry map 中计算一次，样本过滤只比较缓存 key | 内部候选助手，无公开路由 | 纯合同验证调用数等于 entry 数；未做性能对比 | 相同 entry 的 canonical/SHA 不应随样本数重复 | V06 准备修正 | spy 合同计数及人口组语义 | 已通过 | 不缓存当前授权；sample membership 仍逐成员核对 |
| R10 | 既有运行时共享/一次计分 | Training shared-scale-runtime/shared-control-records、whole-questionnaire reference preload；Survey final.service 幂等先于 compute | 生产 effective flags 未取证 | 源码盘点 | 复用现有共享记录和父子认知事实引用，避免重新复制大包或计分 | V08–V09 | 接入后核调用次数与持久化引用 | 待接入验收 | 旧 main 行为不等于新版本链路已完成 |

| R11 | 集中真实 PG SQL 边界 | evidence/20261020-validation.md；182 migration SQL、16拒绝及2合法审核 | single-user；无网络/socket服务，无应用flags启用 | 实测隔离目录69MiB、空闲8.5GiB；不是per-answer容量 | 复用现有16.15二进制，独立目录不复制旧实例；不用重型构建 | V02–V07已有数据库部分 | SQL约束；Prisma deploy/并发仍待验 | SQL已通过 | 目录预算≤2GiB且空闲≥4GiB；禁止借此宣称应用权限/并发已验收 |

## 参数化存储模型

令 D 为不同共享发布定义数，A 为去重资产数，N 为答案数，R 为初始报告数，I 为显式新解释数，E(t) 为保留期 t 内导出数。

逻辑正文占用：

`S = sum(definitionBytes[D]) + sum(assetBytes[A]) + sum(rawBytes[N] + factBytes[N] + bindingBytes[N]) + sum(reportBytes[R]) + sum(interpretationBytes[I]) + sum(exportBytes[E(t)]) + auditBytes`

物理容量规划再分别加入 `indexBytes + WALRetentionBytes + temporaryPeakBytes + cacheBytes + backupRetentionBytes`。备份和缓存不能与主数据库重复声称“每答新增正文”。共享资产若存对象库，应分列数据库与对象库容量。

当前不填虚构每份 bytes。V10 或独立压力线提供代表性合成测量后，应记录每变量的测量口径（逻辑/物理、压缩前后、样本尺寸、报告类型、索引与保留期限）、均值/分位/峰值及来源。每答开销不得用共享定义完整尺寸乘 N；显式新解释可增加独立结果，但不复制原始答案或共享定义。

| R12 | 内容权限祖先验证 | content-authority.repository.ts 单次有界 ancestry 查询，根＋一层委派；取得共享锁后读时钟 | 无系统授权 HTTP；没有新生产 flag | 8 项早期纯/mock 合同，SQL约束证据另录；非并发实测 | 不逐层递归 N+1；父撤销不批量复制子行；不以缓存绕当前撤权 | V05 | 同 User、scope/期限/委派上限、当前祖先撤权 | 接入中 | 长任务须执行前后授权/source fence；不得用 entry ADMIN 代科学权 |
| R13 | 私有报告编制/合成预览 | survey/report-drafts.service.ts；report-renderer.ts | authenticateSurvey＋现有 owner/grant/MFA enabled；无默认flag变更 | 定向服务/渲染测试；非真实答卷容量 | 草稿与共享 REPORT release 有独立编制/发布语义；预览不读取样本，不每答复制模板/资产 | V07 | CAS、不可变发布、精确测量/资产、合成标识 | 服务已接，UI/实际解释待接 | MFA enabled 不是 recent strong-auth；原始事实不能被新解释覆盖 |

| R14 | 独立存储诊断供 V08 复用 | 父协调提供固定 fa34852c8692b12b237b6e2556bee175eadb602a，docs/performance/20261020-training-storage-profile.md | COMPACT_FACTS/SHARED_CONTROL/SHARED_RUNTIME=true；仅该隔离场景 | 独立线实测，本主线未重复压测：selected records 318661→102831 B；个人 core56786＋facts1680＋binding560 B；首次 shared artifact5080/template7144/assignment31581 B 独立列 | 复用 PR302 artifact/codec/事实读写，首次共享成本不能按每答重复计算 | V08–V09 | 四工具、120trial逐项、report/CSV/权限为独立线证据 | 待版本绑定接入验证 | 不据此宣称默认生产flags或所有场景收益；约5KiB SJT暂不拆；保留原始trials |

| R15 | 真实 Survey 候选分析 | reference-candidates.service.ts；loadSurveySource/describeWave；sample-quality/withdrawal项目锁+revision协议 | 无新公开HTTP；必须当前owner范围∩reference.analyze | 38 pure/mock/reader合同；非PG并发实测 | 两个短事务夹既有reader，避免长外事务嵌套占第二连接；最多250 FINAL无runtime扫描；统计与manifest复用同一合格集合 | V06 | 有界真实reader、前后scope/source fence、排除计数、无自报事实 | 内部创建已接 | 不删独立前后fence；count不是未提交FINAL全库快照；分析与施测runtime分离 |

| R16 | 私有描述性复核/发布 | reference-candidates.service.ts 共用 eligibleScores/currentFacts/sourceFence；数据库 review repository | 无公开HTTP；当前owner∩review/publish独立能力 | 51目标合同；非真实PG并发 | 复用同一质量与fact投影；重读在短事务之间，不长时间占有外层连接；发布不重新计分 | V06 | 精确cutoff/revision/count、当前权限、数据库批准记录 | 内部复核/发布已接 | 不用候选自报审批；来源变化拒绝，不静默换样本 |
| R17 | 独立存储线最终单份结果 | 父协调提供产品0efc283、文档38a75df66ac91b5f1e3161305d9310edf6e60ead，docs/performance/20261020-training-final-single.md | 同独立线三共享flags场景；未改本分支默认 | 独立实测record60715 B，core39850/facts1680/binding560 B；首次wrapper6401/runtime5080/templates7144 B另列 | 既有Cog report writer与共享codec；不新造压缩器 | V08–V09，待PR318吸收 | trial/完整report/canonical/CSV科学一致为独立证据 | 本主线待合并接入 | 不能据CPU .95s/SQL610宣称稳态提速；首次成本不重复计入每份 |

| R18 | Survey prepare 三层选择 | content-selection.ts、publication.service.ts | 现有 authenticateSurvey/owner/MFA + SURVEY_PUBLICATION_ENABLED；仅自身项目PRIVATE | 20目标合同、strict tsc；无容量/并发实测 | publication只存release/entry指针、策略版本和优先级，不复制共享模板/常模；同request release锁验证cache | V08 | 精确测量/范围/状态、缺省不选latest、锁后expiry | freeze已接，START/FINAL待接 | 请求cache不得跨请求；历史回读不可重跑选择器 |

| R19 | START per-attempt binding | content-binding.service.ts、admission.service.ts；新增双列单次迁移 | 现有真实START范围；空populationContext，无新采集字段 | 18定向合同；单用户PG六拒绝+合法更新，目录69MiB/空闲8.4GiB | 只存选中指针/理由，不复制候选集合或模板；同request验证cache；无flow也绑定 | V08 | 新写一次、恢复不重选、双null旧不回填、层级撤回语义 | START已接，FINAL另单元 | 完整release加载/最大内存未实测；不能把single-user当并发验收 |

| R20 | FINAL固定数值解释 | final-interpretation.service.ts、submitResearchFinal；Reference Core | 已有FINAL入口与权限；binding存在才解释；无新flag | 60目标合同/strict tsc，非容量/并发 | scorer只原路径一次；每答只存个人数值+状态和bindingHash，模板/来源/常模包共享；幂等重放不解释 | V08 | 原选择成员/身份、层级撤回、finite/质量、receipt白名单 | FINAL解释已接；报告读取/显式新解释另接 | 历史读取不可重新select/resolve；READY不等于被试披露权 |
