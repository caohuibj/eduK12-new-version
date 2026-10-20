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

## 运行时与界面补充验证

首轮运行时检查点：`596520a9a9a5eb64a9d94e3030182d5eb06cae34`。此检查点后来被独立审查发现的认知历史出口遗漏和模板生命周期回归补充，不能作为全部出口已通过的结论；修复与关闭记录见下节。其中 `86d856671a80034417eca38020d063ddfc40be89` 是 C23 紧凑准入/单次认知 admission decode 优化的保留导入，原提交 `213c35ffd030f2a6e7230738381ee1ac663ebe57`；C22 未恢复无条件宽表投影。

全部命令使用 Node 24.21.0 和同一测量锁，Vitest 单 worker。表中不同执行存在重叠，不能相加成独立总数：

| 受影响检查 | 结果 | 原始日志 |
|---|---|---|
| 共享 FINAL 投影及父级报告边界 | 2 文件，35 通过；覆盖同步/异步、精确时间边界、旧/错误绑定、首次/重放收据、缓存开关及下载/包入口 | `c22-report-boundaries-01.log` |
| 原生 Cognitive 与 C23 准入源码契约 | 2 文件，17 通过 | `c22-native-admission-01.log` |
| 原生 Scale / SJT | 2 文件，7 通过；已有 parent 投影复用、错误密文不解密、时间边界、归属与终态收据 | `c22-native-scale-sjt-01.log` |
| 教师权限/导出和路由源码契约 | 2 文件，10 通过；教师历史投影仍去除受限元数据，其他教师仍拒绝 | `c22-teacher-wiring-01.log` |
| 原 getSession / C23 单次 decode 受影响分支 | 显式 `COGNITIVE_MODULE_ENABLED=true`，4 通过、21 未选 | `c22-native-cognitive-compat-02.log` |
| 首轮 Cognitive 失败定向复核 | 同一显式开关；覆盖原 9 个失败的选择模式实际命中 10 项，10 通过、15 未选；未修改原测试 | `c22-native-cognitive-failure-diagnosis-03.log` |
| backend no-emit TypeScript | `tsc --noEmit --incremental false`，exit 0；没有 emit build | `c22-backend-types-02.log` |
| 问卷编制界面 | 最终受影响文件 42 通过 | `c22-frontend-feedback-authoring-02.log` |
| 报告延迟开放界面 | 修正测试 fake-clock 微任务排空后定向 2 通过；UNAVAILABLE 的 READY/PROCESSING/FAILED 矩阵 3 通过 | `c22-frontend-feedback-report-02.log`、`c22-frontend-feedback-unavailable-03.log` |
| frontend no-emit TypeScript | 5 个变更 root 与现有声明的依赖闭包 432 源文件，0 诊断；保留 tsconfig.app 原编译选项 | `c22-frontend-feedback-types-01.log` |
| frontend 五文件 ESLint | 0 error；1 条在 UI 修改前已存在的 `epoch.current` cleanup warning | `c22-frontend-feedback-lint-01.log` |

首轮 backend 5 文件执行为 56 通过 / 9 失败（`c22-runtime-core-01.log`），未显式开启 Cognitive 准入开关；保留全部原失败。随后仅定向复核受影响 getSession/C23 分支以及原失败集合，不把原失败日志改成通过，也不宣称全套 Cognitive 回归已通过。

首轮 frontend 为 62 通过 / 2 失败（`c22-frontend-feedback-01.log`）。两条延迟开放断言把 React fake-clock 微任务当作轮询计时器，修正测试中的 0ms 排空后只复测这两条；未通过关闭产品计时逻辑或弱化断言来消除失败。未修改的已通过分支复用原证据；新增/变更分支分别记录，不宣称最终 25 条报告文件在单次执行中全部通过。

首轮仅复核已映射路径，未覆盖认知历史列表和保存模板后的再实例化；原“未发现已映射路径绕过”的范围不足以证明全部出口安全。报告生成状态与开放状态独立；整份 FINAL 已接收、生成中时保留 processing/重试语义；已生成但等待日期时没有自动轮询/定时器，仅手动刷新。现有 `/api` middleware 已统一关闭 ETag 并设置 no-store/no-cache，包含整份 FINAL 和恢复收据。更严格的关系测评披露与教师权限保留。

边界：上述服务/控制器测试使用 mock DB 或 mock API；源码断言不是实际 HTTP/数据库并发证明。除前述最小合成 PostgreSQL 外，未运行完整数据库迁移、真实应用 HTTP、浏览器、负载/CPU 对比、生产恢复或 CI/发布资格检查。


## 独立审查发现与修复（后续检查点）

独立审查确认以下两项真实缺口，已分别修复并按不可变提交关闭。早先 `596520a9` / `43453927` 的检查点和原始日志仍保留，不把原先遗漏改写成当时已覆盖。

1. **P1：认知历史列表提前披露。** 普通学员认证的 `GET /api/cognitive/history` 原来仅检查父测评完成，然后解密 v2 结果或返回旧版分数/质量状态，未检查冻结反馈策略和当前异步生成身份。修复提交 `a1a5cc1fc3012f11dfc61448a5dbeabf39eeb82c`：复用已加载父级紧凑字段与共享策略判断；仅对时间已满足且需要当前异步状态的父级，按 parent ID/epoch 去重后查询一次 job header 批次，再核对 epoch、slot、context、aggregate 身份。未来、错误或旧 epoch 不增加逐条查询。未开放行在结果解密之前返回完成元数据、空分数/质量及父级状态页地址；界面也抑制任何陈旧分数/质量。原归属与变式/流程筛选保留，无等待日期轮询。独立审查已对该不可变提交关闭 P1。
2. **P2：保存模板后无法再次实例化。** 新的默认反馈策略与既有 persistence/timing 设置保留在已移除课程绑定的模板定义上，普通 copy 的严格课程范围校验会拒绝实例化。修复提交 `8418252ec2cb458edeb3ae1f5d73fe3ff478fcbb`：只在现有锁定、未使用的私有 DRAFT 副本上，删除课程投放后清除 feedback/persistence 的策略与哈希，以及课程级 `BROWSER_ACTIVE_SCALE_V1` timing 策略（其哈希内嵌，未单设列）。不清除认知刺激时序、科学配置、题目/计分定义；原发布和普通有课程 copy 不变，严格编制校验未放宽。界面提交 `c5bb59d9d3f11841ed9577fee47c39c564c6b981` 在保存及实例化前说明：反馈时间、草稿保留和课程级作答计时需为新课程重新选择。独立审查已关闭后端 P2 和该界面补充。

| 新增受影响检查 | 实际结果 | 原始日志 |
|---|---|---|
| Cognitive 历史服务/旧兼容/API | 3 文件，22 通过（16 新用例、4 原服务、2 API）；覆盖时间前/边界、异步未就绪/旧 epoch、旧 NULL、归属、查询数量与未开放不解密 | `c22-history-release-01.log` |
| Cognitive 历史界面 | 9 通过；完成回执保留、陈旧结果抑制、父级状态入口、旧展示兼容 | `c22-frontend-history-tests-01.log` |
| 历史变更类型/lint | backend no-emit exit 0；frontend 294 文件依赖闭包 0 诊断、受影响 ESLint 0 诊断 | `c22-history-backend-types-01.log`、`c22-frontend-history-types-01.log`、`c22-frontend-history-lint-01.log` |
| 真实 service/workbench 模板生命周期（mock DB） | 11 新用例 + 27 原编制用例，共 38 通过；save→copy→instantiate→新课程绑定、三策略并存、源不变、幂等、普通复制保留、非法范围仍拒绝 | `c22-feedback-template-authoring-01.log` |
| 保存/实例化界面说明与原请求幂等契约 | 2 文件，3 通过、3 未选；不把未选用例计为通过 | `c22-template-ui-01.log` |
| 模板界面类型/lint | 420 文件依赖闭包 0 诊断、受影响 ESLint 0 诊断 | `c22-template-ui-types-01.log`、`c22-template-ui-lint-01.log` |
| 模板后端 scoped no-emit TypeScript | 补全既有全局 augmentation 根文件后，1168 文件依赖闭包 0 诊断 | `c22-template-backend-types-02.log` |

这些检查复用 Node 24.21.0、单 worker 和共享锁；未重放已完成的 PostgreSQL 检查或原有全部测试。最终模板后端 scoped TypeScript 首次根文件选择遗漏既有 Express `Request.user` augmentation，导致 `assetStorage.ts:691` 的 TS2339；保留 `c22-template-backend-types-01.log`，无产品源码修补。后续只把现有全局 augmentation 文件加入受影响根集合，1168 文件依赖闭包为 0 诊断；不把首轮失败计为通过，也不将两次相加。

邻近出口只读复核：Scale/SJT 历史明确排除 embedded 作答，SJT research export 拒绝 embedded，认知任务发现为 standalone，教师 workbench/export 仍按原权限，整份提交/恢复仅返回收据与任务元数据。未发现另一个结果数据绕过。保留的低优先级一致性问题是 `assessment-policy/inbox.ts` 把已提交课程测评标记为 `resultAvailability='REPORT'`，未单独区分等待开放；其链接指向受保护的状态页，不返回分数或质量，也未通过删除完成状态来规避。按范围决策留待 C24 处理标签/文案，不为此增加反馈查询；实际开放页继续作为权威状态。

最终边界仍是定向 mock 服务/UI、源码与有限 no-emit 检查，加上此前明确为部分 SQL 成功的最小合成迁移及单独 Node 补执行；没有真实应用 HTTP、完整迁移/恢复、并发 race、浏览器、性能、CI、合并或生产资格声明。

## 共享准入投影后续修正

C23 的实际 HTTP 检查后来发现共用准入路径请求了不存在的 `CompositeAssessment.deliveryMode` 列，Prisma 因非法 select 返回错误；C22 的反馈或持久化配置分支也包含该投影。`Db=any` 和先前返回完整对象的 mock 未捕获这一问题。因此 `33c4aa05` 的完成检查点仍需本节修正，不能把此前类型/服务检查当作该真实准入路径已验证。

修复提交 `19dad8b654125c64b5d8f810c17a67018f4b58bc` 只改配置启用分支的窄投影：移除该非法字段，以 `satisfies Prisma.CompositeAssessmentSelect` 和局部 typed delegate 同时约束查询与推断返回值。`LEGACY` 拒绝仍读取已有 `composite.deliveryMode` 运行时上下文；数据库行没有该属性时保持原 `FINAL_ONLY` 默认，不新增“必须显式等于 FINAL_ONLY”的要求。publication 锁、状态/公开开关/时间窗口、课程及教师权限、学生资格、token/round 身份和快照写入约束均保留；未更改 schema、migration 或生成客户端。

新增回归直接调用实际 `startUserAttempt`，mock 投影依据生成 Prisma DMMF 拒绝不存在的字段，正例不虚构 `deliveryMode`；测试在原子插入调用处截获数据，不冒充完整数据库准入或 HTTP 测试。覆盖反馈单独启用、持久化单独启用、二者同时启用、旧空配置的默认 FINAL_ONLY、显式 LEGACY 拒绝、锁内状态/窗口/课程变化及资格丢失。配置分支仍只读取一次窄 header 与一次配置课程投影，关闭分支不增加课程投影。

- 修复前最小复现：1 失败、12 未选，错误为 `Unknown CompositeAssessment select field: deliveryMode`；原始 `c22-admission-projection-repro-01.log` 保留。
- 修复后受影响 3 文件：26 通过（13 新服务回归、9 持久化/准入契约、4 C22 运行时源码契约）；`c22-admission-projection-fix-02.log`。
- 含变化源码/测试与既有全局 augmentation 的 no-emit 类型依赖闭包：1214 文件、0 诊断；`c22-admission-projection-types-01.log`。
- Node 24.21.0、共享锁与资源预检执行；锁已释放供 C23 检查接续。等待锁期间未启动的检查不计为失败。本 C22 补修未执行 PostgreSQL、真实 HTTP、完整构建或 CI，也不改变前述有限迁移/恢复资格。
