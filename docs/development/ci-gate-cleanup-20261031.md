# 过期 CI 门禁清理：onboarding 第一批

最初观察基线 `92e398025fb6fbefe1b051520cf5507295173859`；经母 DOT 独立审阅后，Draft 候选已对齐包含 #448 的实际 main `7e4a5b90c9b9c0a186345a6025f0eb9ef78a3c61`。分支 `ci-gate-cleanup-20261031`。本文件是审查记录，不是新增门禁、审批层或发布规则。

范围 → 对应故障 → 验证位置 → 复用 → 预算：onboarding 控制路径及既有工具路线接纳，消除无关 main 控制更新导致的历史哈希失配和 CI-only 差异进入 platform；云端本地用少量现有 Node 控制用例验证；产品源码、原始业务结果、证据接纳函数与 workflow 未改，不重新构建/运行业务、DB 或浏览器。最初两片使用 Node v24.19.0，各约 0.15–0.17 秒；后续完整受影响路径使用项目支持的 v24.21.0，9 例一次通过，480.6ms。未安装依赖；这些是本地结果，不是正式 Actions 资格。

## 已完成的两个小提交

1. `7d9c0c604`：移除**本 PR 未修改的 controls**与旧 `controlCheckpoint` 的逐文件比较。精确 main base 已经给出这些文件；再次对旧候选 checkpoint 验证会把无关 PR 的更新变为阻断。保留本次变化 controls 的 before、模式及 reviewed checkpoint 比较。
2. `04977fde7`：`controlBefore` 不再必须包含全局 controls 列表的每一个名字；它不能扩展代码定义的允许路径，本次修改的 controls 仍须有正确 before。旧记录无需为了后来加入而本 PR 未修改的脚本补一轮历史哈希。

母 DOT 独立静态审阅后授权补齐工具路线，提交 `e50c04b40a828721ef54df12f4016cd33d8cf75f`：只将两个 onboarding 控制文件及本审查文档加入 `releaseToolFiles`；现有 `release-tools` recipe 在这两文件变化时追加六个定向控制用例。扩充现有路由断言和一个 recipe 选择用例，没有新增 workflow、任务状态、签名身份或候选绑定。原有工具检查保持原样。

没有修改 `onboarding-bindings.json`、`onboarding-evidence.json`、`onboarding-checks.mjs`、`content-scope.mjs`、`merge-gate.mjs` 或任何 workflow。A 的 #448、Long 的 #447、main、branch protection、required checks、凭据及应用/生产配置均未修改。前述审阅阶段没有 push、开 PR 或激活 CI；用户随后授权推送并开 Draft，实际公开状态以 PR 记录为准。没有合并或生产操作。

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

母 DOT 已独立静态审查两个清理提交及工具接纳增量，用户随后明确授权推送 GitHub、开 Draft；正式检查和合并顺序仍由母 DOT 协调，不自行更新 main、转 Ready 或 dispatch。没有操作生产或修改身份权限。

## 对齐 #448 后的 Draft 准备

本地 rebase 到 `7e4a5b90c9b9c0a186345a6025f0eb9ef78a3c61` 无冲突，range-diff 的五个提交全部为 `=`，即已审补丁逐片保持一致；完整保留 #448 新增的路由、445/449 分发及前端范围保护。对齐后控制代码 head `fa5a397c662e9ab54d201845bd346c938a18519c`，Node v24.21.0 仅补 5 个直接相关控制用例，5 PASS、0 FAIL、exit 0，167.5ms：前三个新增清理用例及 main 已有的 `PR448 exact qualifier preserves required component scope and rejects unknown paths`、`PR448 integration preserves existing 445 and 449 registry dispatch and frontend-only scope`。没有重复业务验证；原 Node24.21 9 PASS 与 Node24.19 初验按各自来源保留，不能冒称对齐后重跑了原九例。

公开内容仅源码、测试及本合成审查说明，不包含原环境材料、日志、凭据或生产配置。只读获取 Hui 的“CI 常见错误清单”返回 `NOT_FOUND`；这是工具访问缺项，不是代码 CI 失败或上传审批拒绝，未换账号/工具绕过。Draft 可能由仓库自动运行分类；本线不手动激活正式 Ready/dispatch。

## 后续片：工程说明、局部页面和开发 CLI 的实际路由

基线为含 #450 的 main `ac3fe1f000a5b736f39eab886c023b33b5e175aa`。
首轮源码合成观察点 `0cb593d55cec67014012278a2213544e3085ac1c`；公开后再限定局部页面 CodeQL 为 frontend/src，避免扫描未变后台，并仅补验 workflow 一例。
不增加 workflow、candidate 清单、手工 enabled、签名用途或哈希链。

原问题及本片删减：

- `docs/performance`、`docs/evidence` 中的被动说明/结果文件使混合差异掉入 platform。
  现按通用工程材料规则随受影响组件；脚本、科学/发布输入、未知路径和非普通文件不借此放行。
- 局部学生/教师页面继承了后台浏览器构建、整套平台浏览器及宽泛 `student/**` 视觉清单。
  它们检查的后台/共享外壳本次未变。此类页面改用已有 frontend job 的依赖相关 Vitest、变化文件 lint、应用类型；
  Ready 保留 frontend-build、已有 frontend-only Docker 镜像构建/扫描和 CodeQL。
  应用 tsconfig 已包括 cognitive 子集，省去重复子集编译；独立媒体/Ops 命中、共享组件/API/引擎及混合后台变更仍保留原路线。
- 开发 CLI 已在既有工具登记中，但同批 API/catalog/CLI 测试没有被接纳。
  工具路线现执行实际变化的后端测试，并在 CLI 变化时保留 subprocess 用例和 backend 类型编译。
  `src/__tests__` 已被 backend tsconfig 排除且运行时源码无其导入，不作为生产 dist 变化触发全后台镜像；
  未登记开发工具、运行时模块、schema、依赖和未知控制文件不能进入工具路线。

只读分类实际公开差异（产品用例未重跑）：

| 来源 head | 文件数 | 结果 |
| --- | ---: | --- |
| #451 `e5c114121a9fe8ce8ba60dbb76d28b6cbf2e224d` | 3 | frontend / affected；仅 frontend 运行时组件变化 |
| #452 `63aba325ce1c7e9763b80a6a6d2194926af298c4` | 7 | frontend / affected；仅 frontend 运行时组件变化 |
| #459 `f570285a2160652bb93aeacd651d7e3f88fc6a6f` | 7 | release-tooling；无运行时组件变化；保留 assignment-api、onboarding-cli、product-eligibility 三份测试 |

支持 Node v24.21.0 的最终定向检查为 6 PASS、0 FAIL：工程记录分类、局部页面/反例、必要 job 的真实失败阻断、workflow 条件与汇总一致、CLI 命令选择、工具/运行时边界。
另在合成前运行 10 个既有分类/拒绝用例，10 PASS；相关实现未在合成中改变。
初验 4/6：一个测试误把既有 content+frontend 并集当作纯前端拒绝；一个真实 Docker OR 条件绕过范围。
前者修正为保留 content 并集，后者在最终产物核查中恢复既有 frontend-only Docker 路线及必需检查，最终六例通过。
三份变动 workflow 的 YAML 解析、diff 空白检查及本候选真实 scope CLI 均通过；本候选自身为 release-tooling，Draft 只选现有工具 job。

复用边界：本片不把已审阅的 #451/#452/#459 历史本地结果补签为 Actions 成功，也不扩张既有文档/工具签名接纳。
frontend-build 和 Docker 仍各自生成既有产物，未借本片重写为统一打包系统；重复前端编译是已知后续可独立收敛项。
本线未执行上述业务测试、应用构建、镜像、数据库、浏览器、生产操作；本地结果不能称正式 CI 资格。
Hui 错误清单读取仍为 `NOT_FOUND`（404），未改用其他账号或通道；正式激活和合并顺序交母 DOT。

## 后续小片：前端依赖升级不再执行未变后台

基线 `4e99fbc87ec5cf8679664b79ddf53635b2b67fb2`，源码观察点 `acaf2290baa8dd311a194d56bb280ec659e10364`。
既有 dependencyScope 的完整差异、普通文件、manifest/lock 一致及 scripts/engines 等拒绝规则不变。
仅当前端依赖文件和前端测试伴随项组成全部差异时，选择现有 frontend、frontend-build、frontend-only Docker 扫描和 CodeQL，取消无关 maintenance、backend、backend-regression；不启动数据库或完整 UI。
前端依赖仍可能影响整体前端，故现有安装、HIGH/CRITICAL 审计、类型、单测及构建继续保留，不为某个包设置跳过特例。
后端依赖、双端或控制文件伴随变化不进入此减项，继续保留原组合资格；本片不声称后端依赖已对称收窄。共享前后端声明的安装/Prisma 生成仍仅服务前端类型检查，不执行后台服务验收。

Node v24.21.0：依赖路由 12 PASS、工具接纳 2 PASS；随后只扩充原 lock-only 一例为前端/双端/后端三个真实 Git 差异对照，该例 1 PASS。必需 job 的 failure/skipped/cancelled/missing 仍拒绝，force-full、混合运行时及未知模式仍走原边界。
对公开 #464 `385a55119e5bfffe6c1f3d1017e4b1dbc1dbe266` 的真实一文件差异只读分类：dependencyScope=true、frontendOnly=true；Draft/Ready 均要求 scope、frontend-build、frontend、docker、codeql。本工具候选自身为 release-tooling。
本线未复跑 D 的 audit 或业务检查；未改其 lock 文件、未下载新 bundle、未改 GitHub 设置或操作生产。没有新 scenario、包白名单、签名接纳、候选台账或哈希链；两个路由文件使用既有工具 recipe 的有限控制测试。

首次公开 head `9fe7f4856ea24aded91945ec51056b72d568fa8b` 的 workflow run `41230728348` 在工作流解析阶段 failure，未产生可读 run log/check-run，应用与工具 jobs 未执行；Situational 独立 run `41230787114` 成功，不能替代主 CI。
源码定位：新增 CodeQL 分支使原配置表达式由 20,913 字符增至 21,015；[Actions runner 的原生限制为 21,000](https://github.com/actions/runner/blob/main/src/Sdk/DTExpressions2/Expressions2/ExpressionConstants.cs)。这是本轮解析失败的直接原因判断，未伪造服务端 annotation 原文。
修复将本片路径选择移到既有 CodeQL job 的一个配置 step，使用原输出优先序，表达式变为 20,949 字符；旧分支及扫描断言不删改。只补验现有 workflow 选择用例 1 PASS、YAML 和 diff 检查，不重复业务验证，也不新增长度门禁。
下轮只核工具候选 scope/release-tools 与稳定 gate；Ready 后按原要求 CodeQL，#464 的 audit/types/build/image 仍由其自己的正常前端路线承担。
同一 Hui 错误清单 `404d2763-5a38-8186-ac80-de3593da05a5` 再读仍为 NOT_FOUND，回写尚未完成；以上为可复制的脱敏回写条目，未声称已写入、未换账号/通道。原失败与后续运行各保留原 head/run 身份。

## 后端模块后续片：先解除外层前端误分类

观察基线 `5e9562ca970a77393805af4f50a83fa1b1b0fd1e`，源码观察点 `564d1589653fdf68f2de1d0720dc6a3afe99f9e6`。现有分类缺少纯后端产品模块类别，导致它们默认 platform 并开启所有 acceptance。本片增加 backend 类别，复用现有任务，不加新 workflow、包/PR 白名单、签名或手工开关。
精确条件：完整 raw diff 均为普通 A/M 100644，至少一个后端产品模块 TS/JSON，其余只能是该后端测试或非生产证据。共享 API/DTO、schema、依赖、CI/Compose、身份、公共测评运行时及评分/编译契约不适用；工程证据中的 Python/SQL 历史复现材料只作非生产伴随文件，不执行、不视为 PG 成功。content-only 差异优先保留原内容路线。

Draft 仅保留原 pr-light-backend；Ready 仍要求原 backend、backend-regression、Docker、CodeQL。独立 FE、frontend-build、browser、backend-browser-build、miniprogram、maintenance、media、UI、Ops/perf acceptance 不再选中，CodeQL 选择 backend/src。force-full/混合/未知范围和所有选中 job 的真实失败仍沿用原规则。
本片不是后端定向验收的终态：backend 内部科学/200 并发、regression 的全套回归/跨树前端依赖、Docker 的前端镜像构建仍保留。避免为了本轮分类改写三个执行器；后续可逐个拆除，不冒称本片只执行相关测试或已消除所有 FE/性能工作。
实际检查发现 #456 的 as-run-probe.py 依赖固定 /tmp 输入和原 Docker 容器名，不能原样移入 CI；没有把历史原件转成新 PG 成功。本片没有移除原后端验证，#456 的特定游标 PG 合格证据仍须独立核实，不能因新类别自动取得。

只读完整差异：#456 `024ffa4a87540769e9d384238a8d48feffafd010`（13 文件）与 #462 `2b04c98b49375cc684a587412ff234bd02639111`（71 文件）符合 backend；#453 `4c7563cb37cd348cb47396e8a9955e3cca62689e`（31 文件、跨 FE/BE）及 #457 `320e88a15c425d1335383004d0016790a562f4f7`（47 文件、schema/admin）不符合，不硬缩范围。PR 号只出现在观察记录，不参与执行分类。
Node v24.21.0：三个新增分类/汇总/调度用例 PASS，补一个真实 Git CLI 用例 PASS；六个受影响既有 FE/依赖/拒绝用例 PASS。YAML、diff 检查通过，CodeQL 表达式仍 20,949 字符，未增长。未执行四条业务分支的 audit、业务/PG 测试、应用构建或生产操作。本片独立 Draft，暂不合并，不干扰依赖与问卷修复收口。

## Docker 后端单端小片

观察基线 `28b8cbe4be407cce063e5584b905cadbaecb9498`，源码观察点 `2fd06a06f8ee2ce995866b3773954c0239305014`。
原 `frontend_only=false` 将 backend、worker、frontend 捆绑；现复用既有 backend 类别选择 backend_only，由同一工作流/构建脚本处理三类：frontend；backend+worker；全部。原调用默认 backend_only=false，完整模式行为保留；不接受两个 only 同时为 true。
后端单端保留 API/worker 两个目标、官方源参数、runtime 刷新、pull、原 tag/上下文/本地 exporter 限制及真实后端 HIGH/CRITICAL 扫描；仅省去 frontend 构建、Nginx 静态检查和 frontend 扫描。200 用例、固定回归、科学验证和数据库执行器完全未改，不创建工作流、资格或包白名单。
既有 `.github/scripts/build-ci-images.sh` 原模式为 100755，本片原样保留。工具路线只接纳该既有脚本 M 100755→100755，以及实际控制文件；chmod、新可执行脚本、未知路径继续拒绝。使用现有 release-tools recipe 的 image-plan 控制用例，不以模式伪装取得范围。
Node24.21.0：6 个 image-plan 控制用例 PASS，覆盖前端/后端/完整三类的真实 shell 选择、workflow 输入及扫描条件；另 2 个既有工具路线/recipe 定向用例 PASS。bash -n、两份 YAML 和 diff 检查通过。没有启动 Docker 构建、业务/audit/PG/压测或生产操作，没有取消或修改任何正在运行的 CI。
尚未公开的 Mac 部署源参数补丁 `967ecf0f` 未读取、未整合；本片只基于 main，后续由母线协调重放其参数透传。

### 前端整合基线：只读协调结论

公开 #467 `14c73aaeaa853ebebe3fcc99cebac982812b4d8a` 是 11 个前端源码/测试文件，单独可进入 frontend；#464 的 FE lock 加入后，frontendFile 不接 lock，而 dependencyFile 不接 SchoolStudentTasks.tsx，组合会回退 platform。这是路径准入结论，不是组合分支或 CI 资格。
三个独立提交整合后正常 CI 一次可以解除循环等待，但不会自动获得前端窄路线。A 组完整差异未定，不能预先声称全部可按前端处理。若全部符合已有前端边界，后续可只组合现有前端准入与版本型 manifest/lock 检查，仍走完整前端安装/audit/types/tests/build/scan/SAST；不新建认证、场景例外或绕过 required checks。
本线未组合提交、未修改/关闭 #464/#467，也未在本 Docker 小片放宽前端分类。
