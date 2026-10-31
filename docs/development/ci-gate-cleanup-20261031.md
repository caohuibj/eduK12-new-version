# 过期 CI 门禁清理：onboarding 第一批

基线 `92e398025fb6fbefe1b051520cf5507295173859`。独立 worktree `/workspace/eduk12-ci-gate-cleanup`，分支 `ci-gate-cleanup-20261031`。本文件是审查记录，不是新增门禁、审批层或发布规则。

范围 → 对应故障 → 验证位置 → 复用 → 预算：onboarding 控制路径及既有工具路线接纳，消除无关 main 控制更新导致的历史哈希失配和 CI-only 差异进入 platform；云端本地用少量现有 Node 控制用例验证；产品源码、原始业务结果、证据接纳函数与 workflow 未改，不重新构建/运行业务、DB 或浏览器。最初两片使用 Node v24.19.0，各约 0.15–0.17 秒；后续完整受影响路径使用项目支持的 v24.21.0，9 例一次通过，480.6ms。未安装依赖；这些是本地结果，不是正式 Actions 资格。

## 已完成的两个小提交

1. `7d9c0c604`：移除**本 PR 未修改的 controls**与旧 `controlCheckpoint` 的逐文件比较。精确 main base 已经给出这些文件；再次对旧候选 checkpoint 验证会把无关 PR 的更新变为阻断。保留本次变化 controls 的 before、模式及 reviewed checkpoint 比较。
2. `04977fde7`：`controlBefore` 不再必须包含全局 controls 列表的每一个名字；它不能扩展代码定义的允许路径，本次修改的 controls 仍须有正确 before。旧记录无需为了后来加入而本 PR 未修改的脚本补一轮历史哈希。

母 DOT 独立静态审阅后授权补齐工具路线，提交 `e50c04b40a828721ef54df12f4016cd33d8cf75f`：只将两个 onboarding 控制文件及本审查文档加入 `releaseToolFiles`；现有 `release-tools` recipe 在这两文件变化时追加六个定向控制用例。扩充现有路由断言和一个 recipe 选择用例，没有新增 workflow、任务状态、签名身份或候选绑定。原有工具检查保持原样。

没有修改 `onboarding-bindings.json`、`onboarding-evidence.json`、`onboarding-checks.mjs`、`content-scope.mjs`、`merge-gate.mjs` 或任何 workflow。A 的 #448、Long 的 #447、main、branch protection、required checks、凭据及应用/生产配置均未修改。没有 push、开 PR、激活 CI、合并或生产操作。

## 实际消费者与维护现状

- `content-scope.mjs` CLI 在普通路由分类前调用 `onboardingPlan`；marker 文件也可触发此历史候选路由。
- `onboarding-checks.mjs:plan()` 在 admission 中重算同一计划；`merge-gate.mjs` 还会重算，要求 head/base/完整输出匹配。
- 稳定门要求 `scope`、`onboarding-structure`、`codeql` 三项真实 success，拒绝 Draft、缺失、failed、cancelled、skipped。
- `ci.yml` 的 onboarding 作业按具体 PR 选择缺失编译/浏览器工作，再调用 `onboarding-checks.mjs admit`；这不是单纯“哈希对了就通过”。
- 基线的 `BRANCHES` 有 **42** 个名称，bindings 顶层加 candidates 共 **33** 份记录；bindings **436,427 bytes**，evidence **1,271,289 bytes**，每份 controlBefore 16–20 项。这里是文件大小/条目数观察，不是性能基准。
- 实际静态检查发现两份陈旧键集合：顶层 PR381 与候选 PR393 都缺 `.github/scripts/pr395-browser.mjs`。旧代码要求它们与当前全局 17 项列表完全相同。
- GitHub 只读 `gh pr list --state open --limit 100` 返回 29 个 open PR，没有与上述 42 个历史 branch 相同的 headRefName；这说明可以评估退役历史分支路由，**不能单凭 open 列表声称它们全部 merged**。A/Long 正处理的候选不在本批删除范围。

## 门禁逐项判断

| 门禁 / 位置 | 原来防止的具体失败 | 现有覆盖、历史属性与耦合 | 维护成本与处理 |
|---|---|---|---|
| 未改 controls 也必须等于旧 checkpoint / `onboarding-scope` | 原意是保护旧接纳工具没有漂移 | 完整 diff 已证明本 PR 未动它们；文件来自精确 main base。产品/证据消费输入另有绑定。本项属于临时候选全局冻结，会被无关浏览器/分类脚本更新触发 | **已删除**。17 项中 16 个非 marker 都未变时，源码推导减少 32 次 ls-tree 调用；未测端到端耗时 |
| `Object.keys(controlBefore) == CONTROLS` / 同上 | 防止 manifest 自行引入控制路径 | code-owned controls、完整差异和每个实际变化 entry 已约束允许路径。要求历史记录为未修改的新脚本补 before 属重复限制 | **已简化**为拒绝未知 key；修改项的 before/mode/checkpoint 保留。真实发现 PR381/393 的陈旧集合 |
| 实际变动 controls 的 before + checkpoint / 同上 | 防止候选更改证据 reader/汇总器，却继续用原来的接纳结论 | 不是产品权限层；属于一次性历史资格接纳约束。当前本 PR 改控制程序，保留必要审阅有意义。可进一步改用现有精确 head 的控制结果，但需先核具体候选消费者及正式结果，不直接把未验证改动视为已验证 | **本批保留**，不重新签名、不增加 checkpoint 层 |
| `enabled === true` / scope | 原意是历史本地证据审阅未完成时禁止启动 Ready 接纳 | 是历史 rollout 状态，不是业务身份/权限。目前 33 份记录全 true；不能仅把 flag 置 true 当真实验证。普通新 PR 不应为了“进入 CI”复制这套人工激活状态 | **后续简化目标**。已核一处过期控制断言：Task1 测试还硬编码 enabled=false，实际记录 true；不为迎合断言回改配置。此旧测试未在本批执行/修订，不能称整套控制测试通过 |
| 历史 `BRANCHES` + 候选 ID 多处名单 / scope、checks、workflow | 为某个已审查历史 PR 选择准确路径及必要检查 | 约束旧本地结果复用有用途；不是所有未来 PR 的永久准入条件。42 个名字、33 份记录和 workflow 的 PR 条件需同步；marker-only 触发还会将新维护 PR 送入旧候选 | **后续退役目标**。先从普通新 PR 入口分离已关闭的历史候选，档案留在 Git/文档；本批不与 A/Long 同改路由列表或 workflow，不复制另一套路由 |
| 精确 repository/PR/source/merge tree、完整 diff/mode / scope | 防止不同源码、缺项、未知文件或 fork 结果混入窄路线 | 与真假测试结果不是同一问题；目前只接纳有限历史结果，错误 tree 不能靠 CI job 名称替代 | **保留**。不把清理冗余哈希扩成放宽源码/模式/边界 |
| 产品组件 tree 与 product/source blobs / scope、type receipt | 防止产品输入变了仍声称旧编译或旧断言覆盖 | 有直接消费者和真实失效原因。比全局 control 链更贴近实际输入；将来可用已支持的精确输入证据，不声称未实现的细粒度复用已存在 | **保留**，未变产品不构建、不重跑应用检查 |
| `scope → admit → merge` 三次计划重算 | 防止调用者传入陈旧/篡改的计划或不相符输出 | 有重复工作，但三处各自绑定其消费的 head/output；当前尚未测得独立收益，也未证明删除其中一个不会破坏现有输出信任关系 | **本批保留**，先消除其中重复的历史控制链，而不是增加第四层认证 |
| 原报告 hash、完整 passed/failed/filtered 行、continuation / checks | 防止空选择、失败改 pass、遗漏失败、错输入旧结果复用 | 真正的原件与结论对应，不等于给原本 unsigned 的执行补造签名。现有 scope/SAST success 不能单独证明某个未重跑历史业务 case 成功 | **保留**，原失败不改写。整个 checks/evidence 字节未改 |
| 固定 `reviewer` 字符串、人工 decision 字段 / checks | 标明这份回溯审查由谁、按什么结论接纳 | 字符串相等本身不认证真人，也不提高测试真实性；与原件/来源/范围检查不同。维护人标签变化可能造成纯元数据阻断 | **后续简化目标**：保留原始 provenance，减少把名字拼写作为阻断；本批未动历史接纳接口 |
| 官方 run/job/attempt/artifact identity、digest、成功 step / checks | 防止消费错仓库/错来源/错包、将 cancelled/failed 整 job 冒称成功 | 真实历史产物复用需要这些输入；精确 head 已有 CI 记录时应消费该记录，不再加另一套执行认证 | **保留来源与实际结果**。不新增签名或批准体系 |
| 固定 24h age / `verifyTask1BuildMetadata`、`verifyPr395SastMetadata`、`verifyPr420OfficialMetadata` | 限制历史复用的新鲜度 | 这些分别接纳既有 build/SAST/静态 FE，并非全是随时间变化的漏洞审计。静态正确性/编译结果不会在第 24h 自动变错；artifact 实际 expired、源码/工具变动和漏洞审计新鲜度须分别判断 | **后续简化目标**，本批没有把过期资格改为成功。优先保留 artifact 可用性与输入匹配，将时间相关审计单独刷新，不全量重跑产品 |
| 稳定 gate 的真实 success 与 Draft 拒绝 / merge-gate | 防止所需任务缺失/失败/取消或 Draft 被当作合格 | 这是现有实际 CI 结果的汇总，不重复执行测试 | **保留**，本批定向验证真实 failure/skipped/cancelled/missing 仍拒绝 |
| CI-only 维护差异缺少已适配轻量路线 / `release/policy.mjs:releaseToolFiles` | 原意是阻止任意文件借工具变更免除业务检查 | 原来两个 onboarding 文件不在 release-tooling allowlist，只有控制变化却可能落到 platform，造成无关应用/DB/浏览器工作 | **已按母 DOT 审阅补齐**精确三个路径与现有 recipe，未知脚本、onboarding marker、混入应用、删除/模式变化仍拒绝。真实分类已选 release-tooling；未激活 CI |

保留项的退出条件：实际变动 control 的 checkpoint 只保护历史接纳 reader 的变化，产品 tree/绿色 job 本身不能证明 reader 改动正确；具备现有 CI 对精确控制输入的成功记录、且不再消费该历史接纳方式后即可退役，不能要求未来所有新 PR 复制 checkpoint。产品/source 绑定保护旧结果对应的输入，直到改用同输入正式结果或取消历史复用才可替换。原报告失败/continuation 保护真实结果，源码摘要不能代替结果，只有实际成功 continuation 或新的正式对应结果才能关闭失败。稳定 gate 保护选中任务确实成功；某任务不再受影响时从实际路由移除，而非多加另一套汇总。以上不是新增退出审批或机器状态。

障碍层次：本批没有发现或修复业务代码缺陷；必要验证是来源/实际结果/本次变化控制，陈旧规则是已移除的两项全局耦合及表内后续候选。外部工具审批器独立于仓库 CI 代码，本线未遇到审批拒绝，也不通过删代码、改工具或环境来绕过外部拒绝。

## 已执行的少量验证

反例及负例为纯合成 Git 元数据，不运行 subject 业务代码、不联网、不伪造实际 CI 结果。

- 第一片修改前：只执行 2 个新用例，旧 checkpoint 耦合反例 FAIL，变化 control hash 拒绝例 PASS；真实 exit 1 保留在任务工具原输出。
- 第一片修改后：以下 4 个用例 PASS，exit 0，166.2ms。包括未改 controls 不读旧 checkpoint、变动 controls 仍拒绝 drift、原 scope 的身份/完整差异/模式/源 tree 负例、stable gate 的真实 success/Draft/失败拒绝。

```sh
node --test --test-name-pattern='^onboarding accepts unchanged main controls|^onboarding still rejects changed control bytes|^onboarding scope binds exact source|^stable gate still requires admission' .github/scripts/onboarding-controls.test.mjs
```

- 第二片修改前：新“未改 controls 不必具备全局 before”反例 FAIL，exit 1；报错是空 map 与全局 17 项列表不等。
- 第二片修改后：以下 3 个用例 PASS，exit 0，160.5ms。包含缺少本次 M 控制项 before 仍拒绝、manifest 未知 key 仍拒绝、变化 checkpoint drift 仍拒绝，以及 Task1 原完整差异/未知路径/模式/base/source-tree 负例。

```sh
node --test --test-name-pattern='^onboarding needs before snapshots|^onboarding still rejects changed control bytes|^Task1 scope refuses incomplete inventories' .github/scripts/onboarding-controls.test.mjs .github/scripts/task1-onboarding-controls.test.mjs
```

两阶段共 6 个不同控制用例；其中 checkpoint 负例在第二次代码变更后针对性复核。没有运行整份测试文件、旧业务套件、类型、构建、浏览器、DB、workflow 或部署。`git diff --check` 通过。没有测试“未运行”转为 pass，也没有续签/篡改旧资格。

## 已支持 Node 的最终定向结果

在控制代码提交 `e50c04b40a828721ef54df12f4016cd33d8cf75f`，使用环境中已有 Node **v24.21.0**，没有安装或更新工具。最终一次定向命令如下，9 passed、0 failed、exit 0、480.6ms；此前 Node24.19 的初验与预期失败记录保留，不改写为正式 Node24.21 原件。

```sh
node --test --test-name-pattern='^(onboarding (accepts unchanged main controls|still rejects changed control bytes|needs before snapshots|scope binds exact source|tooling changes select affected controls)|stable gate still requires admission|Task1 scope refuses incomplete inventories|tooling-only C never implies application builds|consumed code or configuration change fails)' .github/scripts/onboarding-controls.test.mjs .github/scripts/task1-onboarding-controls.test.mjs .github/scripts/local-validation.test.mjs server-version/scripts/release/policy.test.mjs
```

其中原六例重新以项目支持的 Node 核对；新增 recipe 选择例、扩充的既有 tooling-only 路由例，以及既有“消费输入变化拒绝自动复测”例。未执行整套历史控制或业务测试。

随后仅只读模拟 content-scope CLI 的 PR 分类并读取 recipe plan，使用本分支完整 base/head，不写 `GITHUB_OUTPUT`、不触发 workflow。实际结果：`scenario=release-tooling`、`application_route=legacy`、`codeql=true`、`frontend_build=false`、`ui_required=false`、`visual_hosted=false`。这里 legacy 是既有路由字段，稳定 gate 按 release-tooling scenario 选择工具作业，不是 platform 整验。recipe 保留原三份工具测试，并追加一个只选择六例的 onboarding 命令；没有业务构建、DB、浏览器或新的资格签发。

本轮确实消除的维护工作：无需为继承 main 的无关控制文件刷新旧 checkpoint；无需向旧候选补齐后来新增但本 PR 未改的 controlBefore；此类两个控制文件的维护不再借 platform 整验取得资格。新增的有限用例检查对应这次实际拆除，使用已有工具作业，不创建新的常驻门禁层。

## 交接

先由母 DOT 审查两个代码提交和本记录，再协调 Draft 的既有轻量检查路线、与 A/Long 合并的时间及必要一次证据补缺；不自行更新 main。当前没有任何上传被拒绝、未明结果或绕过行为。没有操作生产或修改身份权限。
