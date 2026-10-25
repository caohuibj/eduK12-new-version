# PR355 首片日常生命周期 HTTP/SQL 探针

这是一个有界合成探针，不是容量测试或 CI 接纳通道。原执行在同一云端、同一 PG16/Redis 实例上进行，固定基线 `149441f9` 和候选 `db225657`。两者使用同一数据库模板的克隆，冻结发布、参与者身份和答案相同，按 baseline / candidate / candidate / baseline 顺序执行。

每个进程依次执行三名参与者：首次请求单列 `process-first`，其余两名为 `process-reused`。PG/OS 缓存未清空，不能称为数据库冷缓存。共84个真实 HTTP 请求全部成功；FINAL 还检查 COMPLETED、精确重放和落库结果。没有浏览器/UI 通过声明。

## 进程复用组，每个阶段各4个观察值

| POST阶段 | 基线SQL | 候选SQL | 基线/候选时延中位数(ms) |
| --- | ---: | ---: | ---: |
| START | 25 | 24 | 64.66 / 39.92 |
| task | 16 | 10 | 21.17 / 15.43 |
| checkpoint/save | 27 | 23 | 35.17 / 33.77 |
| checkpoint/read | 25 | 21 | 30.40 / 30.45 |
| final：生成、持久化、父完成 | 32 | 28 | 47.04 / 38.44 |
| final：精确重放 | 22 | 22 | 26.78 / 27.33 |
| general：本人通用回执 | 11 | 11 | 14.49 / 13.02 |
| **完整序列** | **158** | **139** | 不以阶段中位数之和冒充完整序列时延 |

该序列读取SQL 109→92，写入9→9，事务控制40→38。去掉人工增加的重放请求则为136→117。PostgreSQL协议下行每份66,499→65,408字节，上行22,773→20,723字节；不等同于JSON业务有效载荷。事务数、SQL事件数也不等同于网络往返数。

被移出的四个新入场查询是源草稿锁、依赖祖先图、release身份锁和停用表检查；task 原来另包一层事务，因此少6条，暂存和FINAL在既有事务中因此各少4条。START另外少发布者资格SQL一条。每个HTTP请求仍执行的集体IP预算查询只去掉发布者资格JOIN，并未消失。查询指纹与源SQL映射见 `docs/evidence/survey-governance-followup-20261025/daily-lifecycle-sql-map.json`。

发布成本保留：目标波次 prepare + getWave + open 共27条SQL（15读、6写、6事务），本次服务级设置约50.35ms。它不含HTTP认证，发布阶段的PG协议字节未测量，不能用0填充。第一次波次还创建项目开放信息，29条，不与第二次同工作量比较。

## 资源与结论边界

每份 attempt/final 的 `pg_column_size` 分别为1,645/3,736字节，两版本相同；不包含index/WAL/TOAST的逐份物理归因。进程复用阶段RSS范围基线393.6–499.4MiB，候选394.7–481.7MiB。每阶段CPU、堆内存、PG双向字节和首次/复用原始观察值均保留在 `daily-lifecycle-http.json`。

小样本并不处处更快：首次FINAL时延中位数85.40→93.48ms，首次暂存保存CPU中位数33,794.5→42,565.5μs。两个版本同样开启额外回环代理与SQL事件指纹采集，这些本身影响CPU/时延。当前结论仅为此流程少了19条SQL；不是普遍提速、生产容量或内存上限证明。

本例没有公库使用授权和第三方版权来源，相关查询标签均为0，不能证明这两条链已经优化。没有native/认知/整包或个人叙述报告；Survey普通FINAL的父完成与生成在同一请求中，未造第二个推进请求。School/Teacher和数据导出未测量。

## 复用与输入保护

四个CJS文件保留原探针的处理逻辑；入库时增加路径参数和精确backend tree防线。原执行四文件hash、原始结果hash、fixture hash、锁文件hash及两个backend tree均在结果JSON中，不能把整理后的源码说成原执行已完全相同的工具字节。

`DAILY_PROBE_BASELINE_ROOT` / `DAILY_PROBE_CANDIDATE_ROOT` 可指定本环境独立worktree；`DAILY_PROBE_EVIDENCE_DIR` / `DAILY_PROBE_FIXTURE` 指定私有目录与合成fixture。固定backend tree不符或源码有未提交改动时停止，不能把后来的许可/三轴改动标成原候选。不要reset当前分支来复现。

只允许本任务回环PG55433、代理55434和专用 `eduk12_admin_permissions_ci355_probe_*` 数据库；原HTTP源应用用3000，Redis56380的8–11库。脚本只新建克隆，不清空、删除数据库或覆盖既有数据，不关闭限流，不使用PERF限流跳过模式。源应用、代理在探针结束后关闭；合成库、原日志与含秘密凭据的fixture留在本任务私有目录，不提交。

原命令：先在指定template数据库运行 `node daily-probe-fixture.cjs`，再 `node daily-probe-http.cjs`。需要已有相同锁依赖、源码和本任务隔离配置；不把原环境路径或dot路径当作其他环境已存在的文件。更换输入或协议应建立新的独立报告，保留本报告和旧d01/31d9原件。
