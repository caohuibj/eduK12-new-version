# Training C22 反馈开放：兼容性与定向证据（2026-10-19）

统一发布规则仍以 [README](README.md) 为准。本说明记录 C22 的兼容性约束和本地定向证据，不授予 CI、合并、部署或生产启用权限，也不表示完整候选已经合格。

## 范围与执行位置

- 修改组件 → Training 课程普通问卷的编制策略、发布冻结、作答绑定及学员报告读取；数据库只增加四个可空字段和独立保护触发器，保留 C21/C23 既有触发器。
- 具体故障 → 未完成或未生成报告时提前披露、定时开放被原生报告/缓存/下载绕过、冻结身份替换、旧程序插入无策略快照，以及无时区 JSON 导致错误开放判断。
- 主要位置 → 本次只在隔离本地环境执行新策略契约与最小合成 PostgreSQL 检查。未运行 CI、生产操作、完整应用迁移/恢复、并发竞争或性能资格验证。
- 证据复用 → 只保留输入一致的已成功阶段；首轮 CLI 失败原样保留。随后只补 Node 读取与完整性检查，不重放 PostgreSQL。源文件、命令、夹具或消费身份变化时重新判定受影响证据，不能修改旧回执。
- 预算 → 窄单元测试单 worker；合成 PostgreSQL 16.15 使用独立临时目录、loopback 和密码认证、禁用 Unix socket，集群预算 200 MiB。后续入口要求可用内存至少 2 GiB，空闲空间扣除集群预算和 512 MiB 预留后至少 8 GiB；共享测量锁下执行。

## 语义与不可变身份

- 新建的合格 Training 课程问卷默认 `IMMEDIATE`：整份测评完成且报告生成后可看。`SCHEDULED` 额外要求服务器时间达到教师预设 `releaseAt`；到时不能替代完成或生成成功。
- 发布保存 `trainingFeedbackPolicy` / `trainingFeedbackPolicyHash`。新作答快照绑定 attempt ID、epoch、publication、course、access token ID 和可空 round ID，并保存独立哈希。C21 原 publication identity 不增加新字段，历史轮次摘要保持兼容。
- 已发布策略不可修改；已发布且配置策略的记录不可清除/改写 `published_at` 或回到 `DRAFT`。仍可归档。作答的快照及历史 NULL 均不可改写；配置作答的身份字段不能原地迁移到新 epoch/用户/课程/令牌。
- 历史未配置发布与作答保持 NULL，不回填或推断新策略。配置存在但快照缺失、结构错误、摘要或身份不匹配时，兼容读取器失败关闭。
- SQL 负责成对哈希、核心插入绑定和不可变约束；完整 JSON 结构、规范摘要和发布身份校验由应用读取器负责。最小 SQL 检查不是完整 JSON 验证器证明。
- 开放是每次授权读取时的判断，不新增周期开放任务、重复计分或等待未来开放时间的高频生成轮询。报告生成状态与学员开放状态分开；教师原有权限内的读取、分析及导出保持原规则。
- 招募结束、公开链接停用、课程期限和草稿过期不自动开放反馈，也不成为既有报告凭证的替代条件。原有身份归属、内容披露和更严格的关系权限继续有效。

## 安装顺序与回退边界

1. 先部署增量 schema，再切换匹配的读取器、准入及相关消费者。新程序会读取新增列，不能先于迁移运行。启用配置前，所有可承接学员请求的 API、原生报告和下载读取路径必须具有 C22 保护，避免混合版本绕过。
2. 旧程序省略新列，在旧 NULL 发布上仍可写入；在已配置发布上创建缺少快照的作答会被数据库拒绝。保留新增列、触发器、已接收答案、作答身份和报告任务。
3. **插入保护不等于旧读取器安全。** 未实现 C22 的旧 API 可能忽略开放时间并读取已生成报告。因此一旦存在配置发布/作答，不能仅靠保留 schema 就把学员报告读取器回退到旧二进制。回退应保留兼容的 C22 读取器，并按已授权方案暂停新准入；如必须替换读取器，须先隔离受影响学员报告入口并独立验证替代路径。
4. 不通过清空策略/快照、重置发布时间、修改冻结身份、删除保护触发器或恢复旧数据库绕过回退限制。已接收答案和报告积压需由兼容消费者继续处理；本说明不证明任意旧 worker 的格式兼容性。

## 锁与并发边界的只读复核

当前 `publishCompositeInTransaction` 与 `createAttempt` 都先持有同一 publication 行的 `FOR UPDATE`。准入锁内重新读取当前配置；配置启用时再读取课程投放，并对实际课程及编制者持 `FOR SHARE`，随后验证公开 token/round，并在同一事务插入快照。C22 的插入触发器读取同一 publication 行，在已复核的准入/发布路径中未发现新增的反向跨对象锁顺序。

公开准入现有事务先锁 publication，再原子占用 token；C21 已禁止 token 改绑 round。C22 将 access token ID 冻结进快照，读取时比较作答自身的 token ID，不为反馈判断再查询可变 token 关系。完整发布/轮次身份仍在准入校验，恢复和报告读取不重做招募窗口校验。

这是相关源码的只读复核，未执行并发 race 测试；不将静态锁顺序检查或最小合成表验证称为生产并发资格。

## 已执行证据与限制

基础提交 `3b7693780667c38af619beb7bb6d978cc45cbeef`；冻结 token 绑定提交 `9e3fecb446d16b7eea1562a110a999d863af761b`。本节只覆盖这些基础契约及其最小迁移检查，后续端到端读取、HTTP、UI、编译和最终候选资格须单独记录。

| 执行 | 实际结果 | 原始记录 |
|---|---|---|
| 初始绑定/编制两个测试文件 | 67 通过；其中旧绑定协议 40 项后来因 token 身份变更失效 | `c22-feedback-binding-01.log` |
| 冻结 token 后的绑定文件 | 40 通过，274 ms；编制代码未受该变更影响，未复测其 27 项 | `c22-feedback-binding-token-01.log` |
| 迁移源码保护断言 | 4 通过；追加 anti-reset 后只执行新增 1 项，原 4 项跳过 | `c22-feedback-migration-source-01.log`、`c22-feedback-migration-anti-reset-01.log` |
| 首轮最小 PostgreSQL harness | **整体 FAILED**；迁移和 43 项 SQL 检查通过，最终 Node CLI 在断言前失败 | `c22-feedback-pg-01.log`、`result-01.json` |
| Node-only 补执行 | **PASSED_NODE_AND_INTEGRITY**；7 项读取断言通过，0.27 s；原 43 项 SQL 仅核验原始证据，未重跑 | `c22-feedback-node-integrity-02.log`、`result-node-02.json` |

首轮最终错误为 `listen EPERM ... /tmp/tsx-1000/42.pipe`，来自 tsx CLI 的 IPC 建立；不是应用断言通过。补执行改用 Node 24.21.0 的 `--import` loader，不建立该 socket。首轮 FAILED 回执、失败日志及其时间不改写，也不能把补执行的成功改称首次整体验证成功。

43 项 SQL 检查使用最小合成表，覆盖旧 NULL 兼容、`user_id IS NULL` 的匿名/token 绑定、缺失/错误核心绑定拒绝、不可变快照、发布反重置、允许归档、旧程序缺省列拒绝、事务回滚保留已接收行，以及非 UTC 会话 JSON。数据库使用认证 `SELECT 1` 就绪和错误密码拒绝对照；最大已记录集群大小样本为 28,166,658 bytes，不能称作连续峰值测量。服务已停止，专属集群目录已清理，未读取或克隆既有 C21 数据库。

7 项 Node 检查消费原始 PostgreSQL joined JSON，验证 Asia/Tokyo 下的带时区发布时间、冻结身份、开放前/边界状态、缺失时区负对照及完整快照缺字段失败关闭。补执行前后核对 migration、消费源码、原夹具/日志/回执及 JSON 摘要，并复核清理；未启动数据库。**这些结果不是全平台迁移、备份恢复、真实 HTTP 或部署资格。**

### 固定输入与历史命令引用

外部证据目录名为 `c22-feedback-pg-20261019-0532`，夹具/harness、原始日志和结果保存在仓库外；不提交凭证、数据库目录或转储。以下 SHA-256 对应本次消费字节：

- migration `20261019060000_training_feedback_release/migration.sql`：`c14fbc1105a2e21f8479fb632547d13af30f3e507ef38470e5379f7908c899e6`
- `training-feedback-binding.ts`：`43698e90505e73c003b57efce0e0a390aff24ec811695a7d3e7cbf81f8d99ebd`
- `training-feedback-policy.ts`：`e2eef914d088deee2d98bea840d3142de02e9e60f4a9e185d894e752f822bbb1`
- `training-public-round.ts`：`b34ab31cdf84bd24aefa6717f6b4e66b99876f6ee2bd895bb27b47f4016cceb9`
- `canonical.ts`：`e469eb794eadd6596cb0c4531dd6b6b256c8c176eac657ee20d5982f8e217066`
- 首轮 `run.py`：`26b9268200f30027bff272c488f2642e232ab1e1f64eb0e7edaca45dd0eb5fdc`
- `run-node-integrity.py`：`dd8c16c9ca65a0dcc89501adb164fe1cf0515bc708ab24af328bbcfba874167b`
- 原 `joined-context.json`：`e2f541e0ab6bd33f7bc20add17c94522715e226821c4755617a488a549e18fd2`
- 原 FAILED `result-01.json`：`43e8df7e001d16afa8b32f06b2e7fb24786ea3cac8cc6e04d4c362a9952ea18b`
- 补执行 `result-node-02.json`：`9b979df1cd0a53c0c58f25f494d9d220154eead5356f8a0610d830a6525dcd86`

命令引用中的 `TOOLS` 是本次官方 Node/PostgreSQL 工具目录，`EVIDENCE` 是上述外部证据目录；执行时均绑定实际绝对路径，并通过 `set -o pipefail` 保存独立日志：

```sh
# backend 工作目录，Node 24.21.0；仅记录已执行的受影响绑定文件检查。
flock "$TOOLS/.measurement.lock" node node_modules/vitest/vitest.mjs run --maxWorkers=1 \
  src/__tests__/composite/training-feedback-binding.test.ts

# 首轮已执行，保留 FAILED；不得为补 Node 步骤重放数据库。
flock "$TOOLS/.measurement.lock" python3 "$EVIDENCE/run.py"

# 单独获准的 Node-only 补执行；脚本核对固定源、JSON 和原回执，数据库不重跑。
flock "$TOOLS/.measurement.lock" python3 "$EVIDENCE/run-node-integrity.py"
# 其中唯一应用断言命令使用：
"$TOOLS/node_modules/node/bin/node" --import "$BACKEND/node_modules/tsx/dist/loader.mjs" \
  "$EVIDENCE/check-loaded-binding.ts" "$EVIDENCE/joined-context.json"
```
