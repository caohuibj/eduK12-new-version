# C19 真实 PostgreSQL / production-dist 动态计划

这是新增 harness 的范围和执行合同，不是动态验收通过记录。主要执行位置只有当前授权云节点；不访问 Mac、生产、CI、push 或 merge。旧 C18 fresh-all 失败保留，不重跑或改写其结果。本轮也不运行 C25 浏览器或 C26 容量测试。

## 修改范围与检查目的

新增 `server-version/scripts/recovery/c19-*` 只编排私有合成检查，不改业务逻辑。消费冻结后的业务 commit、已有一次生产 dist、fresh Prisma、Node 24.21.0、PostgreSQL 16.15、Redis 7.4.11。

- nullable 迁移、正式角色及新格式恢复：发现旧列/事实/guard 改写、隐式回填、ACL 漏洞、非空路径 proof 无法恢复。预算约 3–5 分钟。
- 主链与拒绝：发现提前 native/session/quota 准入、未达路径泄漏、typed 分支与真实 FINAL 不一致、重复 outbox。预算约 5–8 分钟。
- END/refusal/NOT/missing、恢复：发现筛出被当作任务完成或零分、未决被当作 missing、跳过来源被 NOT 反转、恢复重耗配额。预算约 3–5 分钟。
- 父锁竞争：实际两请求被 PostgreSQL 行锁阻塞，检验一次 FINAL/path/outbox。预算约 1–2 分钟。
- 教师 partial、报告、原队列 CSV、课程分析：发现 pending Form 被错误读取、缺事实被伪造、跳过工具变为零值、结果/权限/路径不一致。预算约 5 分钟。

检查失败先保留该阶段原状态、原结果和冻结生产者；不以重跑整套掩盖问题。阶段名、HTTP 请求数、断言数不互相冒充独立测试数。

## 唯一源与隔离约束

源是已停止的 C18 HTTP05，仅只读复制 `pgdata`、`uploads`、`exports` 及所需私有 fixture；原件不启动。固定来源：

- `c18-new-format-restore/c18-http-new-format.dump` SHA-256 `4cb0e419328dfb45ec72a9adc8e117a6afa5400ef89737361c5e6f47c18cb313`
- `c18-runtime-result.json` SHA-256 `25d32e2c432807808214ad131f790ebdb07347806269a23859cdc69b9d102460`

完整源文件相对路径、类型、权限、字节数及 SHA manifest 在启动前和停止后都保存并比较；拒绝 symlink、外置 tablespace 和仍监听的源端口。前后源码、实际可执行文件和消费产物一致。source、runtime、fixture、状态及数据库完整行只保存在仓库外 0700 私有 state，文件 0600，不打印或加入 Git。

launcher 是唯一 `.measurement.lock` 持有者，禁止嵌套 flock。所有服务和客户端由一次 persistent exec 管理；独立动态端口只监听 TCP 127.0.0.1，PG `-k ''`、UTC。复制前计算预计占用加 512 MiB 保留量，低于 8 GiB 停止；期间也检查 8 GiB/2 GiB 可用内存门槛。不自动删历史 state 或失败证据。finally 停止所有子进程，验证 PID、端口及 postmaster.pid 已清理。

## 阶段与生产者

入口为 `c19-flow-http.py`，必须显式传完整 `--expected-head`、工具目录、新 state 和只读 source。`--phase upgrade/main/branches/race/consumers/restore/all` 按依赖前缀运行；从已停 state 续跑用 `--from-state`。

1. `upgrade`：先将固定非空 C18 dump 恢复到另一新库，核对克隆的 211 表、173 条迁移、全逻辑行、全部可见列属性/顺序、约束和所有 public 自定义 trigger/function。历史 dropped slot ordinal 的恢复差异单列；仅接受既有精确 PostgreSQL CHECK 重解析证明。部署 C19 后必须仍是 211 表、174 migrations，仅新增白名单 3 定义列、4 attempt 列，均 nullable、无 default/回填。正式 apply + verify-current runtime-role 后重核数据/guard。
2. `main`：创建合成 UUID ADMIN/教师/学员、真实 TRAINING_COURSE、独立 SJT review/grant/image；不修改既有 courseType/organization_id。只播种资源，不播种 parent/native/session/accepted facts/job。HTTP 编制包含 SINGLE/MULTIPLE/LIKERT，publish 后首段仅 Form；所有候选提前冻结，但每个 native 直到服务器路径到达才创建。执行 Form→原 Scale→120-trial Cognitive→SJT FINAL/replay、selected image、state/list/whole/未来 media 拒绝，逐段记录 child、quota、candidate/slotset bytes/hash、API SQL 窗口。
3. `branches`：SCREEN_OUT 永远 NOT_SATISFIED；合法 COMPLETE_EARLY 可 SATISFIED；全部 required refusal 的 COMPLETE_EARLY 是 NOT_SATISFIED。只保留真实 Form collection fact，不制造 skipped canonical result、零分或计时。真实 student list、public recovery/token count、官方 copy remap、待定条件和已跳过 Form 的 NOT/IS_MISSING 全条件抑制。
4. `race`：独立 Prisma 连接持 parent 行锁，必须观察两个真实 `pg_blocking_pids(pid)::int[]` 等待者；同 payload 的两个 FINAL 仅一次接受、一次 replay、一个 snapshot、一个 outbox revision。state GET 推动父完成，不手造 job。
5. `consumers`：真实 Scale 已完成而当前 Form 未 FINAL 时，教师 `partial=1` 读取成功但不制造 Form fact；随后真实 FINAL 完成。参与者/教师报告校验 config/path/termination/taskSatisfaction，跨身份拒绝。原 Redis export job + 原 worker 产生 CSV，未执行的 metric/raw/time 空值且 NOT_SHOWN；真实两 publication 的课程分析和 long CSV 必须把未执行标为 null/NOT_ASSIGNED，保留最小样本规则。
6. `restore`：所有七新增列必须已有非空真实证据；新格式 dump/restore 全 211 表、约束、所有 guard、path/candidate proof 精确一致，恢复库正式 runtime-role contract 成功；原 C18 dump 与原事实不变。

每一阶段保存独立 result 和完整 post-state。复用仅接受前阶段 `passed=true`、隔离/cleanup 成功、相同 phase producer hash，并比对实际克隆完整数据库快照。一个失败阶段若已有完成 checks，则拒绝自动重跑，须另写精确 continuation、独立记录失败 producer 和实际未完成范围。

upgrade 的 producer 闭包不消费业务测试文件、HTTP fixture 或生产 dist；因此后续新增 HTTP 脚本不会使已通过迁移失效。HTTP 阶段消费业务 runtime 源码、生成客户端、生产 dist、固定配置、共享 client/fixture 和该阶段脚本。新阶段新增文件不改旧阶段 hash；修改共同 fixture/helper 会改变相关 HTTP 阶段 hash，不能冒充复用。

## 原历史与队列预算

迁移阶段原表全列 hash 必须精确不变。HTTP 阶段对原表全部旧逻辑行作保留子集检查，禁止修改旧 FINAL、原 parent、科学 hash、报告和 guard。

新 FINAL 合法占用现有 outbox 的单行 pending budget。每阶段结束前使用未改动的 `claimCompositeReportJob` 和 `processCompositeReportJob` 处理本 fixture 的可认领终态任务，让 pending 恢复原值。用独立短事务只锁住非本 fixture job，生产 `SKIP LOCKED` 自然跳过它们；不改旧行，不手造 job/lease，不强制 WAITING 非终态 READY。记录实际 claim job IDs 与 attemptCount，finally 释放锁。无法正常排空就失败并保留，不修改预算来凑一致。

C14/C18 已接受的未受影响历史证据可继续引用其原 producer，不重跑其十组场景。C19 当前runtime的动态新增范围只以上述实际成功 result 为准。尚未执行的真实 browser、完整 capacity、selected video capability、隐蔽 child 的独立 native 冒用组合均不能写成通过。
