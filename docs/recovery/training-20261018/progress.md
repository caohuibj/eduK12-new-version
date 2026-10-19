# Training 重建进度与恢复入口

更新时间：2026-10-19 00:54 UTC。本文是当前进度索引，不替代各阶段原始证据，也不构成 CI 或生产部署资格。

## 恢复原则

- 恢复分支：`recovery/training-rebuild-20261018`。按 [恢复手册](restore-from-github.md) 获取远端最新 head，不用 main 代替尚未合并的开发成果。
- 本记录写入前最近已核验远端检查点为第 67 次：`9d6de6d9e5d95ba017e009da349201990ab78112`，tree `d02a430308f36616a1844fbe28e8ae5a9f13307c`。第 65 次 `aeb271830a450fb79d205092af63ca754a65a64c` 是 C20 限定功能检查点；第 67 次保留优化前实测及 CI 覆盖准备。随后优化结果的正式提交以实时远端为准。
- 每次备份均核对远端 SHA/tree；当前没有本分支 PR，没有触发 CI。不得将本地记录冒充 GitHub 正式门禁。
- 远端备份包含源码及脱敏证据，不包含私钥、连接凭据、私有数据库、node_modules 或未提交修改。旧丢失工作目录的未推送成果仍不视为已找回。
- 测试服务按隔离批次启动并清理；代码已备份不等于某个 API、数据库或浏览器服务仍在线。

## 已完成的阶段验收

“阶段验收”仅覆盖相应文档明确记录的源码审查、组件、API、数据库和必要并发正确性。它不等于完整浏览器验收、全平台回归或压力性能合格。不同阶段重复测试不累加为唯一测试数量；HTTP 请求数不当作测试用例数。

| 单元 | 已验证范围 | 可恢复检查点 | 证据入口 |
| --- | --- | --- | --- |
| C01 | 基线、恢复范围及合同 | `a9d61311` | [合同](acceptance.md) |
| C02 | 隔离环境、真实迁移、合成素材及最小 Form 链 | `ab0d4972` | [基线](c02-baseline.json) |
| C03 | typed Form 事实源、旧格式兼容及真实链 | `06856f1c` | [说明](c03-form-facts.md) |
| C04 | 基础高级题型编制、作答、恢复与边界 | `90170d82` | [说明](c04-basic-authoring.md) |
| C05 | 结构化题型及真实 API 组合 | `3755092c` | [说明](c05-structured-authoring.md) |
| C06 | Form V3 条件、拒答及任务资格消费 | `d3775439` | [说明](c06-form-policy.md)、[消费者](c06-consumer-satisfaction.md) |
| C07 | typed 报告、原队列 CSV/ZIP；不支持的 typed SAV 明确拒绝 | `8768fe80` | [说明](c07-typed-export.md) |
| C08 | 有界 Scale CSV 导入、签名预览、CAS 及审核记录 | `37a30f03` | [说明](c08-scale-import.md) |
| C09 | 显式 Scale 计时、独立披露权限、compact/shared 链及 Survey 回归 | `7eb26ead` | [说明](c09-scale-timing.md) |
| C10 | 认知新准入开关、历史恢复、暂停提示及 C09 整合 | `085fddd9` | [说明](c10-cognitive-switch.md) |
| C11 | 上传 SJT 独立审核、课程/匿名链、冻结恢复及摘要导出 | `8f4a5288` | [说明](c11-sjt-course.md) |
| C12 | 在线多情境/多选、人工数值 golden、版本化 FINAL 与任务资格 | `8a29c8a8` | [说明](c12-online-sjt.md) |
| C13 | 精确课程分发/改编授权、图片、共同保留/删除锁、升级与非空恢复 | `75fb1ef1` | [说明](c13-sjt-permissions.md) |

保留的明确限制：C10 未单独验证 OFF worker 处理新 FINAL 的实验；C12 新匿名组合链尚待整体验证；C13 新受控发布仅支持单一真实 Training 课程，跨代图片许可不自动继承。详细限制以各阶段证据为准。

## C14/C15：限定阶段验收完成

- 已实现单一任务的分组配置、权重抽取、持久化分配、selected-only scope、稳定键复制、分层完成/状态摘要与 CSV/ZIP 溯源。没有另建可独立访问的私卷 CompositeAssessment 或第二套计分 runtime。
- 171 迁移的旧表投影、nullable 默认及受限角色已验证；非空分配与相关图片恢复亦已通过。
- 源码 review 已收敛全部候选实际冻结校验、抽前媒体/配额、旧匿名兼容、已接受 FINAL 禁 restart、批量报告重复读取及有界 full preview。
- 新报告定向验证已经使用目标 Node 24.21.0 补齐；原 24.19 日志明确降为诊断，不能混作同输入资格。
- HTTP03 接受四工具 FINAL 后曾暴露真实 `DEFINITION_MISMATCH`：finalizer 错误要求未分配的 union 表单事实。该缺陷已修复，原答卷在停机副本经原 worker 恢复完成；没有重交 FINAL，原事实和分配保持不变。
- 另发现六并发占满 pool6 时，事务内共享 slot 读写用全局客户端再借连接造成自等待。已改为传递同一事务客户端，保持 pool6 和原 5 秒期限；同条件六请求均返回同一 attempt。原失败与新成功观测分列，不将小样本诊断视为 C26 压力容量。
- FULL02 的准入/竞争/报告/CSV/ZIP、实际 compact/shared/whole 路径和非空恢复已有独立分项验收：361 次 HTTP、70 条检查记录；7 条四工具完成记录含 1 条原事实复用和 6 条新完成，两组均有真实 120 试次认知数据；205 表恢复、17 份分配及 2 份图片身份核验通过。
- 冷进程的六个新 null-policy Form 首次 FINAL 及六个原 worker 报告均通过；实际观察六事务同时受 PG gate 阻塞后释放，连接数与超时不变。FSP 首次读取位置仅据冻结源码路径推断，不冒称具体 SQL/hash 的动态证明。
- 真实 full preview 已验证 owner 200、非 owner 403、full/sampleSize 1/recordCount 7/分层元数据；接口不返回 rows，行值正确性引用既有 CSV/ZIP 证据。
- 两域独立 review 支持 C14/C15 本批功能、并发正确性及 PG 恢复的限定收口。selected-video/native 独立 HTTP 扩展、完整浏览器与容量性能仍在 C25/C26；清空配置后旧产物指纹拒绝目前仅源码/定向测试资格。全部失败 aggregate 原样保留，补验只覆盖失败或缺失项。

## C16/C17：限定阶段验收完成

- 公共有限数/Type7/配对核心、课程显式波次与来源选择、同事务授权冻结、独立质量 CAS/不可变审计、原队列长宽表/字典/ZIP 和最小课程界面已实现。组织旧 wrapper 保持输出与早期缺值短路兼容。
- HTTP03 两波次四工具 10/20/50 人手算数值通过，每规模冷/热均 25 SQL，历史离班成员保留。仅一次冷/热样本；没有吞吐、p95 或 C26 容量结论。
- HTTP05 原队列四工具逐列一致与下载权限通过；HTTP06 实际故障注入返回500且独立连接零持久化、两等待者 CAS 200/409、质量与权限在生成前/生成中/READY 后变化均拒旧产物，原 FINAL/完成状态保持。
- HTTP07 真实原 C14 owner 只读两分组来源、缺失/不可比空值、未选 poison SQL 排除、重复409及非空207表恢复通过。5条质量、7条审计与4组数据库 guard/function 定义恢复一致；全部原业务行含用户逐列原样，服务清理及源码输入不变。
- 生产源码资格截至 `3f0444a5`，HTTP07 harness 固定 `a2dd31ca`。历史失败分批保留，仅续验缺失或失效项；详见 [C16/C17](c16-analysis.md) 和 `c16-evidence/`。两域独立 review 已对固定 e0d2d5a6 证据链给出限定 GO，未扩大 C25/C26 资格。
- 无可信历史课程来源的独立测评不推断归属；不造历史未答总体。匿名研究治理、浏览器、native/media 与完整性能分别留 C18/C25/C26。Form 重复 snapshot 读取/解密仍是已记录的有界成本。

## C18：限定阶段验收完成

- 固定研究 purpose/scope、版本化不可变接受事实、独立研究退出与审核、原研究 V2 manifest/队列及教育 V1 兼容已实现。历史未记录同意不伪造；新正文不追溯作废既有同意，退出不改教育 FINAL/分数/恢复能力，身份 revoke 仍独立收回能力。
- 按固定输入保留原失败及分项续验链：前八组、缺失锁序、末两组与 211 表非空恢复均获限定独立复核；新身份 FINAL 使用正式 service，治理/恢复/报告等为真实 HTTP，不宣称全新 HTTP FINAL 全链。
- 10/20/50 研究场景查询固定 26，计数包含实际治理 batch 与其成本；本期手算为 Form，其他科学计算复用 C16 冻结证据。普通匿名无 study 的补探针保留原 409 拒绝，三个治理节点未执行，仅证明该身份读取路径，无成功分析或零开销结论。
- 详见 [C18](c18-governance.md)。合格停止基线为 state05；原 fresh-all producer 保留失败历史，C25 需新增当前版本从新库执行的 happy-path 入口。C25/C26 仍未授资格。

## C19：限定阶段验收完成

- 复用公共条件 AST/compiler/evaluator，服务端依据已接受事实推进材料/工具/END，按需准入原四工具，未达不提前创建认知会话或占配额；旧 null 路线及必要鉴权保持。
- 原 producer 分项验证主链、三态/END/拒答任务满足、匿名恢复/copy、真实 PG 双 FINAL 幂等、报告/三 CSV 与分析；保留失败记录与不可合并的测试资格，不称 fresh-all 一次全过。
- 独立 ON/OFF 及撤权矩阵新增 14 个 FINAL，旧 FINAL 重交 0；科学身份与每 attempt 的完整封装绑定已核，未达撤权拒、已达历史恢复保持。211 表/174 迁移非空恢复、正式 role、旧行与 guards 保留通过，两域最终限定 GO。
- 见 [C19](c19-paths.md)。动态 cohort suppression 与 long CSV 已测数值单元格未在本轮直接断言，仅相应旧公共合同复用，C25 新 fresh 入口须补明确断言；C25 浏览器/selected-video 与 C26 容量、Form 重复读解密 P3 仍待。

## C20：限定功能收口与效率专项

- 材料组、权重与配额、跨发布保持分组、普通匿名稳定主体与凭证轮换、显式材料组分析已完成限定功能验证。四工具主链、真实 PG 等待者竞争、回滚、撤权、导出与恢复均有原始分项证据，保留所有早期失败与精确续验来源。
- state09 的 13 个 producer 不是用例计数；19 项 guard、215 表非空恢复与原 211 表 4310 行保持已获两域独立限定 GO。原 4054 行是更早阶段子集。最终材料表为 136 claims、19 experiments、48 buckets、70 bindings。该资格不包含浏览器或容量验收。
- 按用户 2026-10-19 最新顺序，先保存第 65 次功能检查点，再进行云端 CPU、内存、数据库、存储、访问次数专项；不把代码复用或查询减少直接等同于全面资源下降。
- state10 以固定 51 主体、102 父测评、204 个既有 FINAL 为消费基线，另建四个隔离资源父测评，新增恰好 10 个 FINAL；63 个观察窗口包含单次、并发 2、四工具和 30/60 秒 drain 后观测，不是容量试验或独立统计样本。
- 实测定位 Scale 导出两个逐人事实读取。优化固定为 `f37d95b31aad69b8fde706b90f01705f3ccb0c50`：仅三个读侧业务文件，最多 64 条记录及 1 MiB 估计预算，请求内按授权 `(id, epoch)` 批读；旧 legacy、超大单行和失败回退保持原逐行语义。1 MiB 不是 JavaScript 堆上限，输出 rows 仍整体物化，不称流式，也不声称所有历史编码 N+1 归零。
- state11 从相同 state09 独立副本、相同消费者与仪表、相同顺序和精确 ID/选项执行 30 个消费窗口，新增 FINAL 为 0，原事实保持，六份 CSV 逐字一致。六窗口 SQL 为 20/21、21/21、20/20，对应 before 为 40/41、61/60、120/120；51 人计分 fact 密文读取字节减半，raw 字节不变。51 人两次 CPU/耗时观察下降，但 11 人耗时略增，RSS 有升有降；不作总体资源、统计或容量结论。
- 最终受影响 9 文件共 185 项测试与同源类型检查/产物生成通过；旧 184 项记录不混作新计数。七项未变科学前置仅在精确输入闭合后复用。两域源码及动态证据限定 review 已通过，原失败记录不改绿。详见 [C20 原始说明及证据](c20-materials.md)。

## 本轮截止与后续任务（C20 时点历史记录）

本轮 Training 以 C20 加上述效率专项为截止。优化提交后停止新增功能，执行必要正式 CI，全部所选门禁真实通过后合并；不部署生产。用户已明确允许对缺少正式执行来源的受影响应用检查在 CI 必要复验，历史云端 JSON 不伪装成官方门禁。

CI 准备已覆盖三项新增 PostgreSQL suite 的 opt-in 与非跳过/非空断言，以及当前版本的独立 C20 浏览器、受限角色 HTTP 和四新表非空恢复。恢复包括独立唯一索引结构，不能只查 pg_constraint。静态源审通过不代表这些新增动态检查已通过。仍沿用现有应用、安全、媒体、mini-program 兼容和恢复门禁，不调用绑定旧 PR 的 complete_training 路线。

C21 同 IP 短窗口、C22 延迟反馈、C23 checkpoint/本地草稿、C24 Training 全界面、原计划 C25/C26 完整验收与容量项目未完成，不由本次范围冒领。Form 重复 snapshot/解密以及旧格式逐行回退仍为已记录的潜在成本，未凭代码重复贸然重写。

用户另外明确授权 Survey S01–S07 在 Mac 的独立 Codex 任务并行推进。其目录、分支和合成数据与云端 Training 分开；共享组件在最终整合时协调。系统/入口管理员权限重构仍在后续，不混入本 PR。

## C23：独立于 C22 的 checkpoint 动态资格（2026-10-19 UTC）

状态：HTTP03 的完整 fresh-clone 本地合成资格真实通过；最终独立运行证据复核通过，无 P1/P2，限定 C23 本地合成资格 PASS。本节仅覆盖 C23 over accepted C21，不将整个 C23、本地认知浏览器或 C25/C26 标记为完成。

- 固定运行 HEAD `83621ccee3b3d552cfb7539781f603c7b8ef7011`。仅 harness 三文件变化，按已审查闭包复用 `83496451e8715c3d4aed74a446ad0e451b5f952a` 的单次 emitting build 和 current-client receipt；没有重编译或 Prisma regenerate。客户端证据是现有生成客户端一致性核验，不具备原始历史生成的前后溯源。
- 修改范围与故障：C23 加密 checkpoint 的授权、CAS、累计预算、清理及非空恢复；主要位置为当前云端一个持续 exec 命名空间内的真实 PG/HTTP。独占 measurement lock，官方 Node 24.21.0 / PG 16.15 / Redis 7.4.11；upgrade/functional/races/restore 上限分别 600/600/300/600 秒，各全表 audit 另有 300 秒总截止。未运行 CI、PR、合并或生产操作。

### 保留的两次失败与最小修复

1. HTTP01，HEAD `8fa754ee`：升级通过，首个已认证 start 返回 500，非法 `CompositeAssessment.select.deliveryMode`；功能、竞态及恢复未通过。产品修复 `fd1a568e7c4a97d030935f8c8e8e035617b90e8d` 删除无效字段，用局部 Prisma typed delegate / `satisfies` 约束投影，保留显式 LEGACY 拒绝和缺省 FINAL_ONLY；未改 schema/migration/client。`83496451` 新增 13 个实际 service 的 schema-aware mock 回归及受影响 no-emit，通过后产物重新生成一次。
2. HTTP02，HEAD `83496451`：升级、198 请求功能和前五个 PG race 场景通过；第二子 FINAL 的 HTTP 200 返回 parent=null，harness 过早断言父完成。异步报告开启、后台消费者关闭时遗漏原 `drainReports`，随后 queue 旧行审计失败；overall=false、无合格 final snapshot、restore 未运行。失败现场没有完整 parent/job/queue 行，原诊断保留为代码与响应支持的推断。`83621cce` 仅修复 harness：对新 fixture 调用原 claim/process，其他 job 行锁隔离，完整记录并断言 drain 前后真实 DB 行；6 个新定向无服务测试通过。

两次失败 receipt 均保持 false。各 stopped pgdata 已分别完成完整内容/元数据归档及实际恢复核验，再经授权可恢复替换；原 receipt、日志、快照及归档不改写，第三轮未续跑失败 clone。

### HTTP03 已执行并通过的范围

- 从 accepted C21 stopped 数据和完整 manifest 创建全新 `eduk12_c23_http_03`。只增 C23 migration：1 张表、4 个 nullable 字段、5 个精确 guard，历史零回填；升级及恢复均应用并验证正式 restricted-role policy。
- 功能 198 次 HTTP、8 组检查；竞态 48 次 HTTP、6 组检查。请求数不等同测试用例数。覆盖 authenticated/anonymous ownership、真实异 attempt recovery token 的 GET/PUT/DELETE 拒绝且目标整行不变、stale epoch/hash、publication、null/bound round/closure、clear/expiry 后累计 100 次预算不重置、retention/immutable guard 原子拒绝。
- 真实 PG wait graph 验证 save/save、save/clear、expiry-read/save、maintenance SKIP LOCKED/save、child FINAL/checkpoint；已接受 child 从恢复投影移除而另一 draft 保留，父完成/abandonment 清 payload 仍保留身份和计数。
- 异步实际行事实：parent IN_PROGRESS→COMPLETED；job PENDING、attemptCount=0、budgetHeld=true → READY、1、false；两份已接受 unit snapshot 与其余 143 个 job 完整行不变；queue pending 0→1→0；checkpoint revision 4→5、successfulSaveCount 保持 2，payload/hash/expiry 全部置空。原始行仅保存在 0600 私有 journal，不入 Git。
- 非空 dump/restore 含 16 条 checkpoint：7 个加密 payload、9 个 tombstone、2 个 bound round、1 个累计 100 saves；完整表/逻辑快照/guard 比对及受限角色通过，精确沿用 C19 的 73-column ordinal / 3-parser whitelist。216 张旧表的 6,382 条已接受完整行保留，最终 audit 再次通过。
- 四阶段、final snapshot、源码/工具/依赖/client/dist 前后闭包、C21 原始字节、两轮失败证据保护和 cleanup 全 true；13 个服务/阶段/audit 进程 exit=0，源与 clone PG 均 shut down、无 postmaster.pid，服务 PID 已消失。C21 源清单 19,799 项前后相同，SHA-256 `fa35cccf331b59a0f62b90f5731268d2140031c8fdce26ecc1d4e1eccd017013`。
- 锁下启动 free=10,067,083,264 B；扣除 clone 741,623,858 B 和 512 MiB reserve 后 8,788,588,494 B。每秒资源样本含最终样本的最低 free=9,172,897,792 B、MemAvailable=7,143,993,344 B；不是连续极值。仅证明运行保护线未触发，未采集可比较 CPU/吞吐证据，不构成资源下降或容量提升结论。

### 可核验证据索引（原始文件保持私有）

下列路径相对于此次云端工作根 `/workspace/scratch/5a77e8bdc1ae`；Git 只记录路径/哈希/结论，不收录 private journal、SQL 行、连接配置或数据库。复核索引绑定 79 份本轮原始材料，并记录旧失败证据前后相等。

| 证据 | 路径 | SHA-256 |
| --- | --- | --- |
| HTTP01 原失败 | `eduk12_c23_http_01/c23-runtime-result.json` | `2d216a51eda7ffeed48114b6181a280800ea72b253736ce7c240ff2ecb6c39b2` |
| HTTP02 原失败 | `eduk12_c23_http_02/c23-runtime-result.json` | `faa589380c09d3d670b8a93f31d1f5e2d7d20fa2a1eaf2a641c62c7b0dc5084d` |
| HTTP03 完整通过 | `eduk12_c23_http_03/c23-runtime-result.json` | `c81cd9219d12abc1f591c84f877ec21155076546ac0027b9536f1231e67e3c1e` |
| HTTP03 最终快照 | `eduk12_c23_http_03/c23-final-db-snapshot.json` | `4dd59702b756e0d16cf9fe1c2b821118ba1aa5587f0408a9ccb8527d3d8a01e5` |
| HTTP03 复核索引 | `c23-build-evidence/frozen-83496451-01/runtime-attempt-03/review-index.json` | `5f3f9d873f86373f5bfa78e61d0dc3754efc47be5d57495ca02b311e52c6734a` |
| HTTP03 异步真实行（私有） | `eduk12_c23_http_03/c23-races-terminal-private.jsonl` | `0465eea892d7f19521720cbff2ae4a25288f75de886a3b99472ac87de05cb67a` |
| 复用 build | `c23-build-evidence/frozen-83496451-01/build.receipt.json` | `90182d841660c8ef241755a7489b9365d52c4a33c2eed1e4a2e5c781e19b1c3a` |
| 复用 current-client | `c23-build-evidence/frozen-83496451-01/current-client.receipt.json` | `4640bd88542aa785d0bcd9e8ba62eb77bacd560533dc2b3a8a3f03fc256b7eda` |

### 未完成边界

- native IndexedDB 的真实浏览器 TTL、跨标签 lease/tombstone、防复活和 sealed/retry 历史保护仍待；组件/source/mock 证据不替代 native IDB。
- C22 延迟反馈仍在独立分支，尚未与 C23 整合；整合会改变源及 migration 输入，须另做受影响的 migration/restore 证据，不能复用本次为整合资格。
- 本次不是 C26 CPU/内存优化、持续负载或容量验收，也不包含正式 CI、C25 浏览器全链或生产发布。

## 已知测试环境约束

- 固定 Node 24.21.0；不要以全局 Node 24.19 或未固定 npx 的记录代替目标资格。
- 既有数据库禁止修改 course_type/organization_id。新测试课程应直接创建正确类型，不修改旧 LEGACY 课程或禁用触发器。
- 需要 UUID 的 HTTP 接口必须使用合法合成 UUID 账号；管理员使用正式管理认证路径。
- `pg_blocking_pids` 的绑定 PID 显式转换为 `int`。观察脚本失败不能改写为业务并发通过。
- 相同输入已成功阶段复用，修复只重验失败或受影响项；原失败 aggregate 保留，分项成功与补验清晰分列。
