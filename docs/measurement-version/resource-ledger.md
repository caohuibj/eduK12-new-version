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
