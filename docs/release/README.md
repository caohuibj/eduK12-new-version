## Frontend startup / catalog paging scope (2026-10-21)

This bounded `frontend-performance` scenario admits only the named product-entry,
ScaleList paging, School image/reference files and the explicit control files in
`frontendPerformanceScope`. The full raw diff, normal modes and actual WebP
container are checked; unknown paths, deleted originals, dependency/config,
backend, database, scientific or authorization changes cannot enter this lane.
The stable merge gate recomputes this boundary and requires real success from
scope, the unchanged frontend lint/types/audit/full tests, frontend-build with
rendered multi-product/paging smoke, frontend-only production image/security
checks, and frontend plus changed-control JavaScript/TypeScript CodeQL. Draft,
skipped, missing, failed and cancelled required jobs cannot qualify. Browser
fixtures are synthetic UI contracts, not fresh backend authorization evidence.

The existing production artifact feeds the browser check in its producer job;
no browser/backend/DB/media/performance/Ops jobs are started. The existing Docker
security job retains its separate frontend compilation rather than adding a new
runtime packaging or evidence-admission system. Local exploratory results are
reported honestly and are not substituted for formal CI success. Main push
reclassifies the same complete diff without repeating PR application checks.
Five minutes is the progress-report threshold, not a promise that downloads or
CodeQL will finish within five minutes. This scope does not authorize deployment.

# 应用发布、CI 与验收统一规则

## 两个收尾候选的限定本地证据接纳（等待精确候选审查）

2026-10-20 用户仅批准 Measurement 与随后基于其合并结果集成的 Training
Mac 两个最终审查候选接纳已完成的本地应用检查。对应分支仅为
`work/measurement-version-final-20261020` 和
`work/training-mac-ui-final-20261020`。这不是通用签名执行系统，不增加密钥、
仓库变量、协作者要求或分支保护例外。原 `local-validation.mjs` 的文档/工具
签名用途不扩张，也不补造历史执行签名。

`exact-candidate` 以完整 Git tree/raw diff 的路径、模式、blob、固定 main
base、真实 PR source 与 checkout/merge tree 绑定产品。只有逐项列出的接纳
工具路径可区别于原产品快照，最终工具本身须独立 review；未知产品差异、
base 前移、未集成 Mac、缺失或未审查证明均停止，不退回全平台路线。
两个分支的手动 full/probe 在 job.if 层排除；原
`ci/measurement-browser-20261020` push-only 路线保持独立。

发布前已枚举全部 44 份 workflow：自动入口仅主 CI、Situational publication、
专用 measurement-browser 与 shared-assessment-foundation 两个固定分支 push。
新候选分支 push 不启动后两者。独立 Situational PR/review 入口对两个精确
分支重算相同候选边界，并核查 53 个 checker 输入及完整 instruments 目录
与固定 main 相同，才标记 `not-executed-unaffected-catalog`，不安装依赖或
重跑全目录 onboarding。此分类不声称 checker/scientific review 新通过；
本批三个变化服务不被该 checker 消费，其类型、发布权限/竞争和实际消费者
仍由主 CI 必需门禁负责。其他分支流程不变，未冻结 Mac 或任意输入漂移拒绝。

历史证据必须经过独立原始记录及传递依赖闭包审阅，接纳代码固定其确切
attestation SHA-256。总报告明确写 `reviewed-local-evidence`，历史组另标
`historicalKind=reviewed-historical-local`、
`ciExecuted=false`、`originalExecutionSigned=false`，不称这些应用检查在
Actions 重新执行或历史执行已有密码学认证。接纳的是经审查的历史断言，
而不是未经验证的自述。原执行结果、失败历史、执行/过滤项与输入保持原身份。
可从 failed 或 unknown invocation 中接纳有真实 reporter 证明的指定
passed case，但不能因此宣称整条命令、teardown 或 cleanup 成功。
没有退出状态的空类型日志不能证明通过；必需断言缺失仍阻塞。
仅允许 attestation 内独立审阅的逐 case 不相交增量：固定旧/新 blob、
文件模式及实际选中 case，并复核 imports、共享状态、validator、callee、
配置和 schema 的传递影响。不能仅凭函数正文未变或通用文件豁免接纳；
实际消费的源码或运行时文件影响不明时仍保留证据缺口。
每次原执行分别标明环境证据：原 lock blob、已记录的工具/生成物哈希、
留存依赖版本与原 lock 的相符情况。历史完整 node_modules 字节清单未记录
必须明确披露；该有限历史审阅不声称整个环境已有密码学绑定。
不适用项须写理由，缺失实际结果或已知输入漂移不能以此豁免。
唯一额外限制明确的 reporter 例外是固定 Cognitive wrapper JSON 的 35 个
实际通过断言：固定报告摘要和顺序名称摘要，保留 invocation UNKNOWN、
退出状态未知和 10 个过滤项。其工具及生成物原哈希未留存，源码/lock
是事后重建并审阅，不声称 contemporaneous run-bound；不借用其他执行
的哈希，不授予整条命令、teardown 或 cleanup 成功，也不扩展至类型检查。

当前新输入的前端 app types 单独执行一次直接 TypeScript 命令，不重复
pretypecheck 或其他已通过的合同。Cognitive 类型闭包未受本次局部 TSX/CSS
修改影响，旧凭据仍不冒称恢复。用户于 2026-10-20 单独允许补跑一次后，
13:24:57–13:25:05 UTC 的唯一 Cognitive tsc --noEmit 实际退出 0。
该新执行单列 `freshChecks` / `recorded-local-execution`，绑定官方第 7 轮
依赖归档、实际同步读取内容、工具、源码/config/lock、时间和原始退出/log；
不归入历史断言，不重跑其他应用检查，也不把它称为 CI 或已签名执行。

正式资格保留：历史本地断言接纳、固定官方成功编译/浏览器证据、原编译
输出的 runtime-only 装配与原生依赖兼容、实际 runtime HIGH/CRITICAL 扫描、
适用依赖 audit、变化文件 lint、当前 app types、隔离旧 schema 升级及
新 schema dump/restore/权限/不可变事实保护、JS/TS 与 Python SAST。
不运行无关媒体、性能、Ops 或全平台检查；不自动部署。扫描后的实际
backend/frontend 镜像归档及摘要必须作为官方 artifact 保留，不能在以后
重新构建并继承旧镜像的资格。

稳定 `merge gate / ready PR` 要求 `scope`、`exact-candidate` 和 `codeql`
真实 success，并从实际 checkout 重算完整计划。draft、失败、缺失、取消、
跳过均不授予资格。精确已合并 main push 只核对应 tree/diff 后停止消费，
不重跑 PR 的检查。product bindings 与精确 attestation review digest 仅在独立审查后开启；
这份实现、本地类型结果和控制测试本身不代表 runtime/security/SAST、合并
或发布资格已经通过。

本文件是新发布路线的统一入口，实现位于 `server-version/scripts/release/`。生产启用须有当次用户授权；文档本身不自动赋予部署权限。本轮用户已追加快速合并及部署授权，实际结果另行记录。

## 已审查候选的正式接纳（reviewed-candidate）

本路线保留 `.github/scripts/reviewed-candidate-source.json` 原始 49 文件、blob、前后端 tree、官方工作流/run/attempt/jobs/artifacts、镜像及报告摘要作为不可改写基线。原来源仍为 `1b388507c5eaaada29bbb3d6a0eb7bb7589ad46c` 的官方 push run `39051668787` attempt 1；成功的原候选工作流本身不代表可合并。新 manifest 须独立审查，不能自动发现成功 run 后扩大范围。

- 修改组件 → 原 49 文件及精确 12 个接纳工具/说明路径，加上 `frontendPatch` 明列的 ScaleEdit.tsx 和组件专用 ScaleEdit.css 产品覆盖层；另有 `testFix` 精确绑定 TrainingTaskDeepLinks.test.tsx 和 visual-interaction-states-browser-e2e.cjs 两个测试修复。完整 main→head 共 63 路径；后端、依赖、数据库和附件不变。每项 before/after blob、模式及前端树均绑定；未知路径、删除、重命名、执行位或链接拒绝本路线。
- 具体故障 → 原浏览器发现 ScaleEdit 未选中标签对比度 4.46095，低于既有 4.5 门槛。局部颜色修正已完成一次官方构建与装配。其后类型检查在前端-only 容器缺仓库兄弟 JSON fixture 而失败；另有异步 focus 测试过早断言和旧列表 mock 不适配已授权详情 API。保留失败历史，不放宽焦点、权限、可访问性或扫描要求。
- 复用证据 → 原 13 项官方来源及成功 PostgreSQL race job `117458745733` / artifact `12109046588` 保留原身份、24 小时有效期、113 断言、6 HTTP、5 竞争及清理证据。固定 run `39076589264` 的 frontend job `117525035914` 明确为失败；只接纳其实际成功的 build/package/lint 阶段，使用 artifact `12117506265` 的原镜像与原 source 标签，不能称类型、单测或扫描已通过。核验固定 SHA/tree、官方 run/job/attempt、ZIP 大小/摘要、3 份原始报告摘要及镜像 ID；不改变原证据时间，不自动发现或回退到其他 run。
- 主要位置 → GitHub PR scope 执行变化后的边界/拒绝/合并契约。固定 run `39077490826` 的 app types、两文件 41 单测、同 runtime 扫描和三浏览器各五状态×四宽度已经成功；按原 job、ZIP、报告摘要、完整组件 tree 与工具 blob 接纳，不重复安装或执行。该 run 的 browser job 保留 failure：仅接纳已成功的五个 390px 场景与原对比度基线；核对固定旧脚本的 fixture、启动参数、helper、场景正文，唯一行为修复是 Survey 题干改用准确 textbox 可访问名称定位。当前 browser 只执行剩余九个上下文，报告分列新执行九个与旧接纳五个，完整十四项全部通过才成功。后端 race 继续原直接来源接纳。CodeQL 覆盖变化工具/测试，不扩大至未修改后端。本机只静态审查，不运行应用检查或连接生产，不新增 secrets/self-hosted runner，不改信任及 ruleset。
- 正式门禁 → 稳定 `merge gate / ready PR` 要求 scope、reviewed-candidate（完整六作业）和 codeql 真实 success，并重算实际 checkout 的完整计划。当前 frontend 资格真实成功前不运行消费项。draft、缺失、跳过、取消或失败不得授予合并资格；仅明确绑定的旧成功阶段可接纳，旧失败作业不改写为成功。
- 时间预算 → 约 5 分钟报告当前等待阶段；frontend 证据接纳上限 5 分钟，各消费项上限 15 分钟。缺失来源证据直接阻断已知候选，不恢复无关全量验收；其他未知差异仍按通用保守规则处理。新 artifacts 仅保留当前 run/head/action/attempt 的 JSON 和截图，不上传私有数据、数据库或重复镜像。
- 合并后 → main push 对本次固定 before base 取三份固定源 SHA 并核 tree 后分类，不重跑此 PR 的契约、接纳或探针。上线仍单独受当次授权及版本/就绪/短流程/回退门禁约束；本轮 CI 不授予生产部署权限。

## Survey Mac 界面候选的精确路线（待独立工具 review 与真实 Actions 资格）

业务源码保持 `6a0393636aa9e833550ecd7e257d5957661d9fb0`；首轮 CI 的 3 个旧测试定位失败修复已固定为测试消费者提交 `71b7d9ed1e7a2981123518e73626f00d41016031`，作为当前 productHead。base 固定为 `6aeba71d6cad70725d5164598f8dc854d11c1c89`，含两份测试修复的完整前端 tree 为 `06fc1b70e5df37d8e5be3c80d459c99c459b30ec`。`survey-mac-ui-bindings.json` 逐一绑定全部 312 项产品/测试/证据差异，另只允许本路线的 8 个新增及 4 个修改工具/说明路径。未知路径、漏项、删除、重命名、执行位、链接、任意产品 blob 或受保护输入变化均拒绝。279 份文档/原始日志只核对 Git blob，不执行其中命令或 `.py.txt`，不把它们作为正式 CI 成功证明。

最终工具 HEAD 必须由父任务独立 review 后，由维护者配置仓库变量 `SURVEY_MAC_UI_REVIEWED_HEAD` 为该完整 SHA；当前实现不自动设置变量，不把 manifest 中的自述当作 review。PR source 必须等于独立批准 HEAD，实际 checkout/merge tree 必须等于该 source tree；整个 `.github`、release policy、完整 frontend 和两个仓库外层 JSON fixture 均重新绑定。manifest 不嵌入自己的最终 commit/hash 作为信任根。已知 `survey/mac-visual-s01-20261019` 分支缺审批或不匹配时 scope 明确失败，不回退 legacy/full。其他路线保持原路由。base 更新（包括 Training 合并）必须先协调并重新冻结受影响共享输入，不能静默接纳。

修改组件 → Survey 界面/导出恢复及 CI 工具；检查故障 → 错误计划、缺失/跳过单测、未编译类型、前端交互与可访问性、漏洞产物。主要位置 → 独立 review 后的 Actions：scope 拒绝/互斥/汇总契约、变化 TS lint、真实 app/cognitive types、固定 21 个前端直接消费者模块（13 个有差异的测试和 8 个未改动消费者，原 21 项不删减）及指定非空 P2 用例、依赖 audit、一次生产前端 compile 与同缓存 runtime、该 runtime 的 HIGH/CRITICAL 扫描、同产物 Chromium 布局/焦点/WCAG 和 WebKit 导出恢复、JS/TS/Python CodeQL。类型、测试、lint、audit、scan 和两个浏览器消费者可单独重试，消费当前 run 精确 digest/ID 的 builder/runtime；消费者不重新构建。约 5 分钟仍未完成时定位实际等待项，各作业有独立时间上限，不启动未修改后端/DB/附件/媒体/平台整验。

本路线未增加签名 purpose、密钥或本地应用资格接纳；没有对旧 Mac 日志补签。本机只运行受影响控制面和工具契约；实际应用资格在 review 后由 Actions 生成，不以静态检查冒充通过。浏览器严格合成 method/path/DTO，未知 API、JS 错误、溢出或 WCAG 违反失败；恢复覆盖数字及日期 Retry-After、非 JSON、过期票据、明确 MFA 后操作、原入站 cursor/filter、revision 拒绝、新水位确认、重复点击和卸载竞争。浏览器 DTO 用例不代表后端权限/计分重新验收；WebKit 不代表原生 Safari，Mac 原生证据与未测项单独 review。

正式 `merge gate / ready PR` 必需 `scope`、`survey-mac-ui`、`codeql`，并重新计算整个计划；内部所有选中作业必须实际 success。draft、缺项、失败、取消、跳过或空测试报告不能 ready。只有固定 before base 且 merge tree 精确匹配独立 review HEAD 的 main push 才只分类，不复跑 PR 资格，也不部署。新增路线本身不授权创建 PR、运行 CI、合并或生产操作；父任务 review 完成前保持待审。

本路线手动入口显式拒绝：精确 `refs/heads/survey/mac-visual-s01-20261019` 上的任何 workflow_dispatch（full 或 step_probe）只运行一分钟内的拒绝作业；15 个 probe、scope 和 merge-gate 的 job.if 直接排除这个事件/分支组合，重作业不启动。其他分支保留原手动条件。content-scope CLI 也在分类前拒绝该组合。正式 PR scope 包含 survey-mac-ui-scope、content-scope、content-workflows、ci-topology、maintenance-routing、dependency-routing 六份 Node 控制测试和 candidate Python 拒绝测试，不启动旧应用。

独审 pin 是父任务实际审阅后由获授权维护者设置的外部记录，不是代码能证明的独审结果。父任务须先审阅最终完整工具 SHA 并单独授权启动，维护者才在 Settings → Secrets and variables → Actions → Variables 设置 `SURVEY_MAC_UI_REVIEWED_HEAD` 为该 SHA。不得由 workflow、PR input 或 manifest 自动把自身 SHA 写入。GitHub 文档要求个人仓库 collaborator／组织仓库 write access；细粒度 API 凭据须有该仓库 Variables(write)，本工作流未请求该权限，也不配置变量。变量自身不证明审阅人或报告，维护者更改它仍属信任边界；任何后续源码变化都需新的精确独审。参见 [GitHub 变量设置](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository) 和 [变量 API 权限](https://docs.github.com/en/rest/actions/variables#create-a-repository-variable)。

## 规则位置与每次开工方式

仓库本文件是完整规则的唯一维护来源，根 `AGENTS.md` 是开发/代理入口，`.github/PULL_REQUEST_TEMPLATE.md` 只记录本次适用项。本机 `~/.codex/AGENTS.md` 的 Huisurvey 专用段落和服务器 `/opt/eduk12-new/deploy/AGENTS.md` 仅作指引，指向同一仓库规则，不独立维护另一套发布标准。源码和文档均按实际 Git 版本读取；服务器安装版本不可静默改写为另一版本。

每次开发/发布先给短执行清单：**修改范围 → 检查发现的具体故障 → 主要执行位置 → 输入一致的复用证据 → 时间预算**。不引入额外审批轮次或新验收机制。

| 阶段 | 最小执行范围与主要位置 | 预算/停止规则 |
|---|---|---|
| 开发 | 只检查改动及直接影响契约；提前处理连接/权限/工具/定位器，保留代码、依赖、配置、参数和工具绑定证据 | 冻结前说明预算；额外优化不纳入当前发布 |
| GitHub | 只运行实际差异对应门禁；选择该检查唯一主要位置，正式支持的同输入合格证据可复用 | 轻量路线约 5 分钟仍未结束时指出具体等待项；定位，不追加完整检查 |
| 服务器 | 使用同一产物；核对版本、就绪、一条受影响短流程和回退；不重新构建或重跑 CI | 约一分钟就绪截止及短观察；持续错误回退 |
| 完成 | 上述通过即完成；完整回归、灾备和性能独立报告 | 不等待无关恢复任务才能宣布应用完成 |

用户已批准本地 Ed25519 接纳；文档/工具工作流在 PR #257 接入，main 合并前不声称主干生效；当前正式机制核验官方 CI artifact 并供部署及适用的 artifact 复用。不得假称本地证明已经被 GitHub 接纳，或伪造必需成功状态。对此缺口先明确执行位置，不默认本地与 GitHub各跑完整一轮；后续正式实现另限范围，当前不扩展自动化。

5 分钟是等待项报告/定位阈值，并非当前自动作业终止值；工具接纳作业上限为 5 分钟，分类/汇总仍为 8 分钟。完整 A/B 时间目标仍待实际需要时实测。

普通可回退界面的非关键缺陷可上线后修订。阻塞项集中于产物/版本错误、相关门禁真实失败、越权登录、不可逆数据缺少保护、服务持续不可用及无法回退。每个必需检查必须对应具体故障，不能因“以前执行过”或“更放心”追加。

## 一次验证的执行规则与接纳方式（用户已批准）

铁律：本机已通过且消费输入一致的检查，CI 只接纳结果，不复测；本机/CI 已完成的检查，服务器不重复。不因文档或已证明的 UI/CSS 调整构建或验收无关后端。

已批准的具体信任链：仓库维护者的本地固定检查入口实际执行命令，非零退出不签发成功；Ed25519 私钥仅存在本机 `~/.codex/huisurvey-local-validation/key.pem`（0600），公钥存储于仓库 Actions 变量 `HUI_LOCAL_VALIDATION_PUBLIC_KEY`，签名结果发布至 `HUI_LOCAL_VALIDATION_EVIDENCE`。CI 验签并重算所消费的 Git 对象/模式、依赖/配置、检查程序和命令指纹，不执行已通过测试；不匹配时明确拒绝，不静默重跑。文档改字不使无关工具证明失效。已有真实镜像来源、扫描、权限、恢复保护和回退条件不因本原型取消。

本轮隔离验证记录：新建的 7 项原型用例首轮执行 1.552 秒，6 通过、1 失败；定位为关联提交的输入变化被错误视为缺失证据并触发重跑。修复后只执行该一项，0.512 秒通过；其余 6 项未重跑。未执行既有业务测试、CI、构建或部署。这不是已接入 GitHub 的门禁成功证明。

当前 `.github/scripts/local-validation.mjs` 支持文档/发布工具检查。文档作业和 `ci-release-tools.yml` 已调用该入口：签名和输入通过时输出 `REUSED local check`，不运行测试，工具作业也不安装测试依赖。用户批准后配置对应仓库变量；实际运行/接纳记录另行提供。应用产物工作流、生产部署程序没有改动。

使用：先提交冻结输入，再初始化本机身份；通过 `run CHECK OUTPUT` 实际执行并保存签名结果，`publish OUTPUT` 发布证据；CI 消费同一结果，服务器保持既有同产物安装程序。输出放在仓库外，不提交日志或私钥。支持范围限定文档/发布工具；应用产物的完整本地接纳尚未实现，当前不跳过应用门禁。自动审批先前拒绝已由用户明确批准信任链解决。

精确接入改动只执行新 `local-validation.integration.test.mjs`，不重复此前的签名原型、路由、Python 演练；仅对完整元数据允许的确切文件，且既有权限分类程序除新增文件名/已审阅文档规则外字节一致时适用。其他发布工具变化执行实际相关原契约；删除、模式变化、混入应用或未知文件不能使用这个缩减检查集合。

## 本机、GitHub、服务器的明确分工

正式自动检查的默认主要位置是 GitHub；本机用于设计确认、复现/定位和提前处理环境问题，服务器用于安装同一合格产物并确认运行状态。不是三个地方各跑一轮。文档/工具检查有签名接纳通道；通过核对的实际结果正式完成对应 CI 作业。应用检查暂未接入，仍明确唯一执行位置，不默认两边各跑一轮。

| 内容 | 本机 | GitHub CI（主要自动验证位置） | 服务器安装 |
|---|---|---|---|
| 完整差异与路线 | 冻结修改范围，说明受影响项 | 根据完整差异正式分类；所选项汇总到稳定合并门禁 | 核对获准计划、实际旧版本和同一产物，拒绝范围不符 |
| 普通 CSS / 布局 | 确认修改效果；提前发现布局、定位器和浏览器工具问题 | 构建变化的前端一次；检查实际产物与受影响页面；不启动后端、登录权限、科学回归、DB / 附件恢复 | 只安装前端；版本、就绪、一条受影响短流程和回退 |
| 前端交互 | 复现改动交互，定位失败项 | 仅相应页面/契约；正式响应式与无障碍验收绑定实际候选产物 | 不重复响应式、无障碍或完整页面验收 |
| 登录身份修复 | 复现身份错误；只为定位运行相关失败用例 | 相关既有登录契约；正确/错误密码、错误身份拒绝且不建会话及受影响旧入口；真实隔离 API 权限边界 | 版本、就绪、短认证边界和回退；不重跑账号生命周期 |
| 编译与镜像 | 不要求正式 CI 前再完整构建；开发预览不算可部署产物 | 只构建变化组件一次，扫描实际镜像，保存摘要与来源证据 | 取用同一产物；禁止重新构建 |
| 发布工具修改 | 阅读/定位修改；不启动应用验证 | 分类、门禁、证据、就绪重试、失败/回退和安全重复执行的隔离验证 | 安装版本、入口兼容、回退文件；不重跑工具单元测试 |
| 文档修改 | 内容审阅 | 文档精确范围与格式、合并汇总；无业务依赖安装/构建/验收 | 不需要安装或业务检查 |
| 数据 / 评分 / 恢复程序修改 | 明确影响与保护需求 | 只做实际相关迁移、科学契约或恢复验证；无法证明范围时保守处理 | 执行该变更必需的数据保护、版本和运行确认；普通发布不借此追加完整灾备 |
| 完整灾备 / 定期性能 | 不作为普通发布额外验收 | 独立任务，仅实际相关程序变化时进入发布阻塞链 | 独立状态；不阻塞普通 A/B 的应用完成 |

失败先看该阶段的日志，只复验受影响项。相同输入已有正式合格证据时按已实现的规则复用；没有支持的证据不能自行跳过门禁。轻量 CI 约 5 分钟未结束时说明具体排队/下载/执行项；不能用超时作理由追加整套测试。

### 已实现与仍需落实的边界

- 已实现：A/B 与旧平台整套消费者互斥、变化组件构建、官方产物供服务器复用、服务器不构建/不重跑 CI、有限就绪等待及明确回退；只有工具变化时使用工具门禁。完整应用路线耗时仍未实测。
- 文档快路线在 PR #256：精确指导文档不再误入工具路线，文档分类与合并汇总不安装工具依赖；尚未合并，不能声称已在 main 生效。
- 尚未落实：A/B 的候选作业仍将构建、扫描、页面验收和 Compose 演练串在一起；作业重试没有完整的阶段独立复用。前端变化目前仍统一跑 lint、应用/认知类型检查及依赖审计，CSS-only 尚未细化到只消费其相关输入。
- 下一步限于上述已有执行器：按每个检查消费的组件/依赖/配置/工具输入拆分和失效；CSS-only 不启动无关类型或科学检查，依赖审计只在其输入变化或无适用正式证据时执行。Compose 回退演练保留；将其正式复用条件落实前，不宣称已经免除当前候选要求。不得为拆分而再次引入另一套全量检查。

“尚未落实”项不能用文档代替程序改动，也不能据此伪造必需成功状态。只启动所需的轻量接纳 CI；不启动业务构建或生产验收。

## 历史固定 22 项到底是什么

原始记录：2026-10-09 的 [手动完整 CI 运行 37888127045](https://github.com/caohuibj/eduK12-new-version/actions/runs/37888127045)。该次共有下列 22 个成功作业；其余跳过项不计入此表。服务器历史 `release-20261009-5f2c67a5/complete-release.py` 实际写死 `len(ci['selectedJobs']) == 22`，并另外强制数据库/附件联合恢复。**22 是该历史发布的作业数量，不是 GitHub main 的 22 个必需状态，也不是所有改动必须做的 22 种检查。** 2026-10-09 只读核对的 active ruleset `23665026 / PR` 仅要求 `merge gate / ready PR`，并要求分支跟上 main；该汇总门按差异要求所选检查成功。

| 编号 | 历史成功作业（GitHub 原名） | 今后适用范围 / 具体目的 |
|---|---|---|
| 1 | `classify changed content` | 所有 PR：完整差异路由，防止错误进入轻量路线 |
| 2 | `mini program / foundation contract and page smoke` | 小程序及其直接共享契约变化，普通培训站 CSS 不适用 |
| 3 | `codeql (javascript/typescript SAST)` | 所选路线相关可执行代码；纯 CSS/文档不因历史数量追加 |
| 4 | `maintenance / attachment deduplication, indexes and protected cleanup` | 备份/去重/保护清理相关程序变化，不适用于普通 UI |
| 5 | `frontend (lint + types + full tests + build) / frontend checks` | 按前端受影响契约拆分；不因 CSS 修改跑全部测试 |
| 6 | `docker (compose config + production builds) / production image build and scan` | 变化组件一次构建/实际镜像扫描；部署配置检查只在相关变化时选取 |
| 7 | `backend regression (isolated job database) / backend regression (isolated job database)` | 实际受影响后端契约；窄登录修复取相关契约，不追加完整生命周期 |
| 8 | `backend (migrate + build + performance gate) / backend (migrate + build + performance gate)` | 拆成后端构建、迁移、性能；只选相关项，CSS 不适用 |
| 9 | `frontend artifacts / release consumers early / build` | 与正式前端构建合并，同一产物供消费者使用，不重复编译 |
| 10 | `frontend artifacts / release consumers early / UI-lab artifact` | UI-lab 消费者实际相关时；普通应用发布不默认额外生成 |
| 11 | `accept-perf / Scale + Cognitive + SJT fresh accounting` | 相关评分/科学/性能变化或独立周期任务 |
| 12 | `accept-ops / runtime-recovery` | 恢复/运行基础设施变化；普通 UI 不跑恢复演练 |
| 13 | `accept-ui (chromium) / chromium frontend acceptance` | 相应页面/交互变化；与第 16 项相同断言合并，避免重复 |
| 14 | `accept-visual (webkit) / webkit frontend acceptance` | WebKit 特有行为、相关兼容风险；不默认全部页面矩阵 |
| 15 | `accept-visual (firefox) / firefox frontend acceptance` | Firefox 特有行为、相关兼容风险；不默认全部页面矩阵 |
| 16 | `accept-visual (chromium) / chromium frontend acceptance` | 相应视觉页面；同一 Chromium 消费同一候选产物，避免重复第 13 项断言 |
| 17 | `browser (seeded Situational Bundle + static visual acceptance) / products / seeded browser acceptance` | 相关测评产品流程变化 |
| 18 | `browser (seeded Situational Bundle + static visual acceptance) / security / seeded browser acceptance` | 相关认证/权限边界变化 |
| 19 | `browser (seeded Situational Bundle + static visual acceptance) / foundation / seeded browser acceptance` | 相关基础业务流程变化 |
| 20 | `accept-media / images-video` | 图片/视频上传、播放或媒体契约变化 |
| 21 | `accept-media / cognitive-situational` | 认知/情境测评媒体流程变化 |
| 22 | `merge gate / ready PR` | 所有 PR：汇总所选必需项；不重复测试，不按成功数量判断 |

构建合并不取消实际产物扫描；跨浏览器和断言消重需基于具体影响与输入。上表是拆分适用性，不代表旧完整工作流已全部完成细化。混合改动取所需项并集，未知项保守处理，不用标题/标签/行数降低风险。

## 最小验证与路线对照

**同一产物在 CI 验收一次。部署只确认产物、就绪、短关键路径和回退；不再重跑 CI。未改变的组件不构建、不切换、不进行业务回归。** 成功证据在输入不变且仍适用时复用；故障先定位，只复验失败项。用户暂停全量验证时不得自行恢复。

| 路线 | 原发布问题 | CI / 候选阶段必需项目 | 部署阶段 |
|---|---|---|---|
| A：已证明的普通样式/纯本地入口交互 | CSS 原 CI 已轻量，但现场另要求完整 22 项、迁移/恢复及再次构建 | 前端同一 build stage 编译、lint/types/audit；只有入口 TSX 变化才运行对应 TrainingScreens 契约；实际前端镜像扫描；精确受影响页面的 390/768/1440 交互、截图/WCAG | 加载同一镜像 ID；只切前端；核对 HTML/CSP、一个静态资源、短就绪观察及旧镜像回退；不停止后端写入 |
| B：已证明的窄登录 admission 修复 | 原来进入 platform 与全生命周期 | 新后端镜像；6 个既有登录/权限/CSRF/限流/cookie 契约；SAST；隔离真实 API 的正确、错误密码、错误身份不建会话及旧入口登录；实际镜像扫描；前端变化时取 A 并集 | 兼容性/旧镜像验证后切 backend 与同镜像 worker；服务就绪、匿名认证边界、短观察及明确回退；不再次执行账号生命周期 |
| C：数据/科学/广泛权限/依赖/配置/未知 | 未区分影响，现场固定作业数量 | 采用既有实际受影响门禁；未知应用范围保守全量；涉及数据/恢复程序时保留相应恢复阻塞条件 | 不进入 A/B 执行器；保留适用的数据、配置和回退保护 |
| C 中已证明仅发布工具/CI/规则变化 | 未修改业务也触发应用编译、科学回归和恢复 | `release-tooling` 精确文件/完整元数据范围、组件 tree 未变化；工具/路由契约与合成 HTTP 演练；ready PR 保留 SAST | 这是工具变更，不是新应用发布；需另行授权适配实际生产入口 |

分类使用完整 raw NUL Git diff，禁用重命名折叠，检查删除、两端路径、模式和类型。只接受明确文件及内容边界；不使用标题/标签/代码行数降级。混合 A+B 取并集，混入未知项升级 C。入口 TSX 不允许新接口、权限、存储或副作用；B 初始只覆盖 authController 的窄 entrance schema/admission 区段，哈希、账户、限流、令牌、cookie、其他处理器必须字节一致。其他“小接口”没有自动获得 B 资格。

CSS 精确映射页面：入口样式只检查首页，登录样式只检查登录/注册，工作区样式检查培训师/学员工作区，管理员样式只检查相应管理员页面；共享品牌样式才取跨页面并集。数据桩明确是 UI-only，不作为权限证明。

`scoped-release` 与旧平台消费者互斥。稳定 `merge gate / ready PR` 重算 Git 计划，逐项要求选中检查成功；没有固定成功作业数。失败、缺失、取消、异常跳过不得通过。工具专用路线要求完整差异只含确切工具/规则文件、两组件内容未变；混合应用、未知文件、删除/重命名/模式改变仍走保守路线。draft 成功不代表生产已获授权。

## 首页纯文案 CI 路线（homepage-copy v1）

此路线只接纳 `TrainingPortal.tsx` 既有三个 hero 元素的字面文本、`school-features.ts` 中 `/features/positive-campus` 的字面标题，以及由同一 h1 文案推导的既有标题断言。AST 定位后，其余源码必须字节一致；属性、链接、结构、换行、表达式、接口、权限、依赖、样式及未知文件变化均不能进入此路线。完整 raw diff 验证模式、删除及类型，后端 tree 必须相同。可同时修改本路线确切的 CI 工具/工作流与本文；这些工具变化保留专用路由契约与定向 CodeQL，不适用于其他业务变更。

GitHub 是此路线正式验收的唯一执行位置：scope 验证内容边界及受影响路由；ready PR 构建前端一次，使用同一冻结 build stage 进行改动文件 lint/类型及前端依赖审计，runtime 复用缓存阶段；以原 HIGH/CRITICAL 阈值扫描实际前端镜像；同一镜像仅验收有文案改动的首页在 390/1440 宽度下的文字、换行、溢出及截图。匿名 API 桩仅用于首页 UI，不构成账号/权限证据。不构建后端，不运行数据库、账号、测评、媒体及恢复流程。Draft 不构建候选，成功不等于 ready 合格。

稳定 merge gate 要求所选候选及工具 SAST 精确成功，并从实际 checkout 重算完整计划；失败、取消、缺失、跳过或提交不符阻止合并。开发时已有本地页面截图仅作预览；尚未接入本路线的本地签名证据接纳，不能冒充官方 CI 资格。候选 artifact 保存实际 runtime 镜像 tar 及 SHA256，绑定源码提交、前端 tree、冻结基础镜像 digest、实际镜像 ID、检查及浏览器截图。生产构建通过隔离浏览器的正式域名→127.0.0.1 映射验收，禁止外网请求；main 合并后只分类，不重复 PR 路由契约或应用构建/验收。尚未接入跨提交候选自动复用，不声称缺失镜像或失败浏览器证据合格。本路线当前仅支持 PR 合并验收，不声称已接入 A/B 生产执行器；部署需另行授权与适配。

## 一次构建与证据复用

- 发生变化的组件在其原 Dockerfile 的 build stage 安装/编译一次，相关检查使用该 build image；最终 runtime 使用相同冻结基础镜像与 BuildKit 阶段缓存。不在 CI 另运行完整组件编译，不在生产再构建。后端 ops 仅用于隔离合成 DB，不更新生产 ops。
- 先扫描/验收实际 runtime image，再保存镜像 tar 与 SHA256。记录源提交、完整组件 tree（含依赖/配置/模式）、构建参数、镜像 ID、验证工具与锁文件指纹。镜像 ID 变化不能沿用旧镜像的扫描/页面证明。
- `qualify.py` 通过官方 Actions API 验证同仓库正式工作流、选中 aggregate 成功、artifact digest、merge-parent 来源、tar 哈希、组件检查、实际镜像扫描、独立前端/登录浏览器证据和 Compose 回退证明。不能自行编写绿色 JSON。
- 复用只适用于消费的组件、依赖、配置、参数和工具不变；输入变化只使消费它的证据失效。工具规则先正式修改，不静默绕过旧 exact-run-only 要求。当前保留 24 小时有效期和显式撤销机制；过期是已知限制，不以此自动启动全量 CI。
- 保留 Compose 切换/回退演练。候选阶段完成浏览器工具、定位器与合成契约预检；部署阶段不用浏览器重做响应式/WCAG/登录契约。代码或工具变化后只复验受影响项。

## 应用完成与灾备独立

普通完成条件：实际组件与产物正确、受影响短流程通过、服务就绪/短观察通过、旧镜像/配置回退路径有效，记录 `APPLICATION_COMPLETE`。

完整 DB 恢复、附件联合恢复和定期性能为独立任务/状态。普通 A/B 不创建重复 DB 备份，不执行迁移、令牌回填、全测评/报告/账号生命周期，不等待附件联合恢复。完成记录 `INDEPENDENT_NOT_CLAIMED`，不冒充新备份已可恢复。

既有备份策略、轮换、附件引用保护和清理授权保持有效。新 DB 版本必须有自己的实际恢复证明；不得复用旧 DB 恢复结果。涉及迁移或备份/恢复程序的 C 发布，相关恢复证明仍可阻塞发布。

## 执行器与安全重试

- UTC 时间 + UUID 的唯一尝试目录，独占检查点、不覆盖历史备份。互斥锁防止并发发布。相同已完成镜像重复调用只确认状态，不再次切换；失败后新尝试保留原证据与历史结果。
- 实际 Compose entry 是唯一入口。只用 image overlay 与 `up -d --no-build --no-deps` 更新选中服务；保留其他组件 overlay。普通后续重启必须使用持久 overlay，避免悄悄回到旧标签。
- 绑定实际项目、入口哈希、当前 base 提交/镜像和配置指纹。先证明旧镜像存在；B 要求完整差异无 DB/schema、依赖、配置变化与既有契约通过。现有固定端口架构下 B 不能声称零停机。
- 就绪采用约一分钟截止、2 秒间隔、单请求 8 秒上限；默认 3 次、间隔 2 秒短观察。短暂 503 等待恢复，持续失败/产物错误/关键路径失败明确回退。回退失败记 `NEEDS_INTERVENTION`。
- 公共生产探测保持 TLS 校验，不缩短科学测评参数，不修改业务测试断言。默认只打印计划；生产 `--apply` 仍需要另外授权、可验证官方产物及实际入口适配。

## 启用方式（另需生产授权）

1. 审查候选代码。当前分支未生成正式合格 runtime artifact；不得把本地工具测试或旧生产镜像冒充它。
2. 按最新项目 Instructions 只读核对生产版本、实际 Compose entry、镜像和配置。PR #254 工具已于 2026-10-09 安装，入口现支持持久 overlay；仍需当次核对实际入口哈希和部署记录，不能按历史状态假定。
3. 保留原 entry 字节和回退记录；参照 `compose-overlay.example.sh` 在授权后适配持久 image overlay。不得修改卷、数据库、TLS、备份或清理配置。记录新的 entry SHA256。
4. 配置需要 `environment/project/entry/entrySha256/state/overlayProtocol/baseHead/baseImages/url/oldReady/configurationFingerprint`；B 另需 `backendReadyUrl/authProbeUrl`。配置指纹使用 `executor.configuration_fingerprint(actual_compose_config, plan.changed)`；baseImages 至少绑定 frontend/backend/worker 实际 IDs。需要能读取 exact base/head 的 Git checkout，不能把服务器的非 Git source export 直接当 checkout。
5. 取得正式 scoped Actions ZIP。用 `qualify.py --plan ... --config ... --archive ... --artifact-id ... --run-id ... --output ...` 核对来源，提取并加载已核验 tar，核对镜像 ID。先运行 `executor.py --config ... --plan ... --receipt ...` 查看计划；批准后使用 `--apply --archive ...`。
6. 分别报告应用与灾备状态。现场旧 `complete-release.py` 的固定 22 与强制联合恢复不得继续用于 A/B 新入口；本 PR 未在生产修改该历史脚本。

## 时间记录与已知限制

目标 A 15–25 分钟、B 20–40 分钟、已有合格产物紧急修复 10–20 分钟，均从开发/本地验收完成后计时，**尚未实测整路线，不作承诺**。排队、下载、执行、并行和返工分别记录，不累加重叠时间。`release-checks.json` 保存编译/相关检查/runtime 阶段状态与秒数；`events.json` 保存切换、就绪、完成和回退原因。

按照本轮用户的最小验证要求，不跑新的全量/业务 CI、不做整应用路线计时；追加部署仅安装工具/适配入口，不切换未修改的业务组件；验证结果与未完成限制见 [validation-20261009.md](validation-20261009.md)，历史根因见 [audit-20261009.md](audit-20261009.md)。冷构建、artifact 下载、证据时效和连接稳定性仍是可能的预算阻塞项，不以无关验证弥补。

旧 `release-verify-local.sh`、`release-candidate-checklist-v1.md` 和 `docs/ci-runner-policy.md` 的 exact-run-only 应用发布要求，以本规则正式生效后的 A/B 路线为入口；其数据、安全、科学和恢复约束仍有效。`training-completion.py` 为固定 PR248 的历史特例，不作为新产物复用入口。

## 校园专用合并验证

已授权的校园页面、导航与只读注册码解析使用[校园 CI 版本 1](campus-ci.md)的精确文件/模式路线。它保留注册、权限、账号域、MFA、实际候选页面、镜像安全及 CodeQL 和失败关闭的合并汇总；不冒充 A/B 部署资格。仅可核验、输入一致的本 PR 官方 artifact 可接纳已成功的构建/契约/镜像扫描；浏览器失败只能复验浏览器，异常证据停止。应用完整本地签名接纳仍未实现。


## Survey 首页专用合并验证（survey-home v1）

此路线仅接纳 2026-10-13 已审阅的 14 个 Survey 前端文件：公开首页、独立主视觉、W2 矢量描摹、四个介绍入口及 Builder 更新后同步波次工具列表。`survey-home-scope.mjs` 固定目标 Git blob 和三个既有源文件的旧 blob，核对完整 raw diff 模式/类型、完整目标集合及后端 tree 不变；同名后续修改、未知/删除/模式变化、后端、依赖、配置、权限或科学算法变化均不能进入此路线。同时允许本路线确切的 CI 执行器、分类、汇总及本文变动，保留路由契约与定向 CodeQL。

GitHub 为正式合并验收唯一位置：Node 24.21.0 冻结 build stage 构建前端一次；仅检查改动源文件 lint/types、依赖审计和 10 个入口/MFA 转换契约；runtime 复用同一缓存阶段，保持 HIGH/CRITICAL 镜像扫描；在实际 Nginx 镜像验证 1440/768/390 的固定文案、SVG、主视觉、半透明框、布局、焦点、四个介绍入口、登录返回及公開页面 WCAG。匿名 API 桩仅证明 UI，真实本地账号/研究/权限记录仅作审查证据，不重复完整账户研究流程。应用本地签名接纳仍未实现；本机 Node 24.19.0/dist 与 Linux Node 24.21.0/Docker 的运行及产物输入不同，不能冒充同一正式门禁。

稳定 `merge gate / ready PR` 要求 scope、候选和 CodeQL 均精确成功，并从 checkout 重算计划；draft、缺失、失败、取消、跳过及 head 不符均不合格。artifact 保留计划、实际镜像 tar/摘要、基础镜像、契约和截图。合并后 main 仅分类，不重新构建/验收。此路线仅支持 PR 合并，生产部署另需授权；未实现跨提交阶段复用，不能伪称失败或缺失证据合格。失败先定位，只修相关失败项，不追加全平台检查。

## Teacher 首页与专家注册顺序的精确合并验证

teacher-home v1 仅接纳已经审阅的 10 个应用文件的确切 Git blob，以及该路线的确切 CI 工具文件。专家注册修复还要求 index.ts 只移动一处挂载位置，其余字节相同；依赖、schema、其他路由及业务逻辑不能借此进入轻量路线。删除、模式/类型变化、未审阅内容或未知文件返回原保守分类。

正式自动验证只在 GitHub 执行：变化的前端和后端各编译一次，runtime 使用相同冻结基础镜像和 build 缓存；保留实际镜像 HIGH/CRITICAL 扫描、既有六个认证/权限/CSRF/限流/cookie 契约与 CodeQL。同一 runtime 验收 Teacher 390/768/1440 的布局、功能介绍、登录和邀请入口、WCAG，以及隔离真实 API 的专家邀请码注册、错误密码/错误账号域无会话、邀请签发权限及跨产品会话拒绝。数据库仅创建隔离测试 schema，不运行测评/媒体/恢复/性能整套验收。

稳定 merge gate 重算完整计划，并要求分类、候选和 SAST 实际成功；失败、取消、缺失、跳过及提交不符阻止合并。本地图片与代表性业务流程只作为审阅证据，应用完整本地签名接纳尚未实现。此路线仅授予 PR 合并资格，不部署生产，也不声称可直接用于 A/B 生产执行器。

Teacher 候选现保存前后端 runtime、必要的迁移 builder 与 SHA-256。复验仅接纳同仓库/同 PR、24 小时内、官方 artifact 摘要正确、组件树与检查命令一致且对应实际步骤成功的前置证据；失败浏览器结果不得接纳。镜像缺失时只接纳已有检查，明确重新生成必要候选；镜像存在时校验镜像 ID 和压缩包哈希后仅复验浏览器。输入或证据异常停止，不静默重跑整套平台。

## 安全与效率修复的冻结后端 C 范围

`backend-security-efficiency` 仅接纳本次审查后的资产产品域隔离、延期目标权限、视频容量及直接关联的查询/请求内认证优化。它不属于 A/B 部署资格，也不赋予生产部署权限。

完整 raw Git 差异必须全部匹配确切源文件、测试和路由文件名单；生产源码的修改前/修改后 Git blob 固定于 `.github/scripts/backend-security-efficiency-bindings.json`，两端内容必须一致。前端 tree 必须不变；依赖、Prisma、Dockerfile、Compose、配置、未知文件、删除、重命名、模式和类型变化不能进入此路线。源码继续变化时原证明失效，未重新审查及绑定的内容回到原 C 分类。

正式验收唯一位置为 GitHub：路由拒绝/汇总契约、冻结基础镜像下同一后端 build stage 的一次类型编译、定向权限/媒体/Huiteacher/Survey 查询契约（真实隔离 PostgreSQL 与 Redis，选中测试不得跳过）、同一实际 backend/worker runtime 的 HIGH/CRITICAL 镜像扫描及后端/路由 CodeQL。未改变的前端、小程序、UI、全平台生命周期、灾备和定期性能不进入本次门禁。稳定 `merge gate / ready PR` 重算完整计划并要求所有选中作业真实成功；draft 分类成功不等于 ready 合格，不伪造跳过成功，不使用未实现的应用本地签名接纳。

构建/依赖安装/测试/扫描在同一候选作业内留存阶段证据；约 5 分钟仍未结束时报告具体阶段，失败先定位受影响项。服务器不参与本次 PR 验证；后续部署仍须另有授权。

## 后续访问效率优化的精确 C 合并路线（access-efficiency v1）

仅接纳 2026-10-13 审阅的有界列表及其 Web/两代小程序适配、视频签发/探测/DNS、共享公开限流/PoW 发行预算、磁盘 staging、首次报告分段计算和重新核验，以及 Compose 显式限额注入。完整 raw diff 必须匹配 access-efficiency-bindings.json 的前后 Git blob 与确切测试/工具名单；依赖、Prisma、未获下方下载铁律精确绑定的 Dockerfile、未知文件、删除或模式变化仍返回原 C 分类。Survey/Teacher 首页目录、App 和后端 index.ts 必须与 base 字节相同。

GitHub 是唯一正式验证位置：前后端各编译一次，定向真实隔离 PostgreSQL/Redis 契约、报告撤权/来源/披露保护、对应小程序适配与 Compose 有效参数、同一 runtime 的 HIGH/CRITICAL 扫描、受影响分页页面的 390/768/1440 浏览器与 WCAG，以及 CodeQL。固定合成数据记录分页响应、SQL 调用和并发延迟，不冒充生产性能认证或生产池调优。未受影响的登录、首页、测评生命周期、灾备和全平台验收不重复；共享路由修改只执行路由拒绝/汇总契约。

正式复用只限同 PR、24 小时内的官方候选 artifact；校验 Actions 来源、ZIP digest、工具/命令、各检查所消费的 Git 对象/模式、冻结基础镜像和实际镜像 tar/ID。编译不消费测试文件；只改测试时挂载最新测试，复用确切生产输入的 builder/runtime，不伪称旧测试已验证新文件。成功测试文件仅在其完整文件和共享夹具/配置及生产输入一致时复用；失败、跳过或缺失结果必须重验，来源/哈希异常停止。合并门禁重算冻结完整计划，所选候选与 SAST 全部真实成功才合并。此路线不授权部署，不删除历史 token/图片队列兼容；生产证据仅只读核查。

## 下载来源铁律（2026-10-13）

用户确认：**只有生产服务器使用清华或可信大陆镜像；GitHub Actions 一律使用官方源。** 这覆盖 GitHub 托管/自托管 runner、所有工作流和执行脚本、Docker build stage、浏览器、工具及基础镜像；不因构建的是生产产物而使用大陆源。本机开发也使用官方源。生产服务器继续按当次授权优先可信大陆镜像，不可用时记录原因再使用官方源；不改变同一产物只构建一次、生产不复验/不构建的要求。

GitHub Debian 使用签名官方源，npm 固定 `https://registry.npmjs.org` 且 `replace-registry-host=always`，覆盖锁文件保留的历史镜像 URL；Docker npm 安装按显式 `NPM_REGISTRY` 替换历史 host。版本与 integrity 不变，保留 TLS、签名及镜像扫描阈值。前后端 Dockerfile 本次只增加该 npm host 选择设置，其他新增下载策略文件绑定完整前后 blob；未知 Dockerfile/依赖或 CI 编辑不能借此缩减门禁。

本 PR 的 access-efficiency 路线同时验证这条新增铁律：所有工作流官方 npm 环境、实际 npm 对历史 host 的替换及 integrity 失败拒绝、CI 镜像计划/发布脚本官方参数、完整冻结 blob 和对应拒绝/汇总契约。该下载策略改变了构建输入，需要生成对应新产物；以后正式同输入阶段继续复用。诊断报告与大型镜像传输分开保存，报告不充当镜像资格或编译成功。

产物复用按官方 artifact 的实际 created_at 降序选择，不按 ID/接口返回顺序猜测新旧。该校验器过渡的前后 blob 明确绑定，仅允许排序语句和显式证据指纹版本选择两处差异；反向还原后必须等于完整旧 blob，否则拒绝。资格校验、来源、ZIP/tar/镜像哈希、源码/参数、24 小时和真实成功状态条件字节不变，编译/测试执行器未改，不重复相同输入的已合格产物。

本次 CI 失败定位：首次 fixture 缺少 Compose 必需变量、残留 React setter、报告返回类型与视频模拟接口先后阻断；随后浏览器夹具缺少 tags，以及错误对象形态与真实客户端不一致，掩盖了页面错误。证据接口返回顺序还导致挑选旧的部分结果。对应修复保留真实权限/披露、视频进程生命周期及扫描断言，当前证据按 created_at 选择并已核验复用。最终同学列表按钮存在真实对比度不足，直接修正该私有页面文字颜色。浏览器明确列出读取接口与 DTO，不接受通用空响应；未知接口/渲染错误及时失败，报告保留视图、宽度、阶段、调用和已完成场景，首屏/错误/重试状态均检查受影响表面的 WCAG。页面与浏览器输入改变仅使对应前端证据失效，后端成功证明继续正式接纳；这些诊断修正不授权生产操作。


## Teacher / Survey 后续交互修订精确门禁（PR #295）

用户批准按此次 10 个前端源文件的确切前后 Git blob 接入 `teacher-survey` 路线。仅允许绑定名单及本路线工具；后端、依赖、配置、未知文件、删除、重命名或模式变化拒绝。merge gate 在真实 checkout 重算计划；正式 ready 必须候选和定向 CodeQL 均成功，草稿不代替资格。

正式位置为 GitHub：核验同 PR 官方草稿作业的源码 tree、原检查命令/工作流、Node 24.21.0、Linux runner、精确成功步骤和 24 小时时效，输入完全一致才接纳 lint/types；否则停止，不暗中复测。后端 tree 与已成功官方候选相同，核对来源和摘要后保留后端资格，不重构建。前端 build stage 构建一次，新增交互契约在该阶段运行，runtime 复用同一阶段缓存，实际镜像保留 HIGH/CRITICAL 扫描与受影响 Teacher/Survey 390/768/1440 页面和 WCAG。页面 DTO 桩明确只证明前端交互，不伪称后端账号授权证明；既有真实本地 MFA、参与及权限记录仍仅作审查证据。生产部署另需授权。


## HTTPS 入口防遗漏（2026-10-14）

仓库 `server-version/ops/nginx/nginx.production.conf`、`eduk12-products.conf`、`eduk12-school.conf` 对应已上线的主站/www、API、training、teacher、survey、school。总模板与所有明确 include 文件是一个配置包，不能只覆盖总模板。独立 Certbot lineage 保持现状：school 使用 `school.eduk12.top`，teacher/survey 使用 `eduk12-products`，training 使用 `training.eduk12.top`，主站/www 使用 `eduk12.top`，API 使用 `api.eduk12.top`。私钥和生产证书不提交仓库。

部署准备时保存当前完整 `nginx -T` 输出并运行 `python3 server-version/scripts/release/ingress.py --existing <当前完整配置快照>`，校验候选包必须包含所有已知及现行额外 HTTPS 域名、保留证书绑定和原 Host 转发、保留 school 的 ACME 路由。未知现行入口不能静默删除；应先将其正式纳入候选。该程序只读，不写线上配置、申请证书或 reload。独立候选解析完成、回退文件及下载/证书路径就绪后，按当次部署授权提交配置；nginx 原生检查通过后只做平滑 reload，并最多等待 20 秒让新 TLS 工作进程就绪。

school 续期使用 `/var/www/eduk12-school-acme`，仓库 `renew-school.sh` 安装到 `/opt/eduk12-new/deploy/tls-school/renew-school.sh`（root 持有、0755），绑定 school 的 Certbot deploy hook。续期先检查配置再 reload；不重启应用或数据库。用户已验收的线上结果保存在 `/opt/eduk12-new/deploy/tls-school/20261013T235636Z/result.json`：school 及现有四站 HTTPS 首页 200，school 静态资源 200、匿名校园 API 401；应用版本仍为 `47893b10`。这些是现场验收，不冒充 GitHub 门禁。

本次配置同步使用现有 release-tooling 路线的精确文件名单，新增契约、完整候选包的原生 nginx 语法检查及既有路由/证据契约在 GitHub 执行一次，保留 CodeQL 和稳定 merge gate。GitHub 测试工具仅使用 Ubuntu 官方源，模拟证书只用于隔离语法检查，不发往生产。两业务组件 tree 必须相同；未知文件、删除、模式变化或混入业务改动仍按原规则升级。合并不会再次部署或切换应用；各站首页及现行兼容入口不变。

## 视频维护与日间资源（2026-10-15）

用户确认视频上传和压缩仅在夜间、无压测与无被试作答时实施。日间关闭视频处理消费者，资源优先用于访问、作答、交卷和报告；报告 worker 与视频开关独立，既有视频播放保持可用。夜间维护需要实际确认无人作答，不能仅用队列为空推断；默认不自动启动夜间任务。维护后恢复日间配置，保留待处理任务与原文件。CPU 与内存配额以本次实际测量为依据，总预算、数据库持久化、权限和回退约束保持有效。

图片、文档上传与编辑及后台压缩、预览、导出同样给访问、作答和报告反馈让路。重型消费者默认关闭，需要空闲维护窗口和明确确认才启用，保留待处理任务与原文件。报告的 24 小时延迟反馈仅记录为后续备选，本轮不实现该策略。

## 候选产物传输顺序（2026-10-15 用户确认）

- 本条为用户后续确认的候选产物传输优先级：先复用服务器已核验的不可变镜像/文件缓存，仅准备缺失内容；需要远端产物时先走 GitHub → 生产服务器，连接失败或实测过慢再走 GitHub → K2 → 生产服务器。优先级高于旧的“生产下载优先 COS”一般说明；备份桶、数据保护和校验要求保持有效。
- 产物字节不得经过当前电脑中转：不先把镜像、Actions 产物 ZIP 或大型发布包下载到本机再上传。当前电脑只发送控制指令、必要的短期授权元数据并读取状态；压测流量仍可从当前电脑发起。
- K2 中转仅使用独立、限额、可清理的临时目录，保留既有 VPN、nginx、SSH、防火墙、加密备份和轮换。先核对固定主机指纹、空间及工具；不在 K2 解密数据库备份，不传递生产长期凭据或备份解密密钥。中转结束只清理本轮创建的产物。
- 始终绑定精确源码、官方产物来源、文件 SHA-256、原始镜像 config/manifest/层摘要及回退版本。缓存或传输包重打包不能改变镜像内容、延长证据有效期或签发 CI 资格；传输失败先核对断点，仅补缺失内容。
- GitHub 自动投递 COS 尚未接入，不得声称已有。实际需要使用既有私有北京 COS 传递时仍核对精确 VersionId、完整性和临时链接有效期，不默认开启全球加速。


## 218 题问卷的实测配置与回退（2026-10-15）

本轮冻结范围为 QUESTIONNAIRE / UNIFIED_V1 / FINAL_ONLY 的整卷接收、保存、报告处理、网页本机草稿及必要观测；排除 assignment、报告包与 analysis protocol。保持冻结身份、epoch、slot/context、科学定义、幂等和处理租约校验。旧的分量表提交兼容路径不代替整卷容量结果。

每名被试使用一个 HTTP 请求发送完整 218 题，覆盖八个量表和 27 项分数。登录、交付和答案准备放在测量前，普通基线不额外插入幂等重放；重放、断线与重启恢复单独验证。网页将整卷答案存入本机草稿，封存后以同一 submissionId 重试；仅在取得匹配的持久交卷回执后删除草稿。

原始答案密文、唯一交卷标识/哈希与持久报告任务在同一事务中提交，数据库提交确认后才返回交卷成功。后台按原身份生成权威单元快照、评分和完整报告；报告失败只重试报告，不能要求重新交卷。预算不足使整次事务回滚并返回 503 / Retry-After。共享预算在准备好本次答案后最后取得，缩短全局持锁区间。

后台先减少同一任务内重复加载、解密、解析、索引、冻结引用和父上下文查询，再验证独立报告进程。每个单元仍实时校验父 epoch、slot/context、状态和任务租约；不合成长时间持锁的大事务。模块预加载发生在 worker 启动阶段，启动成本与首份报告耗时分别记录。任务完成立即续领，空闲领取有界；数据库任务是恢复依据。

API 的单元提交/问卷完成槽位各 50、报告汇总 20、Prisma 池 20，单元等待队列 128、等待 5000 ms。候选报告进程并发 2、配置领取间隔 50 ms、空闲轮询最短 100 ms，持久积压预算 600。槽位、队列长度、同时交卷人数与在线人数分别报告。API/单报告进程的 CPU 上限为 2.5/1.5；独立进程和资源比例按同硬件试验选择，不把上限相加称作增加物理核心。worker 的数据库池单独设置并核对 URL 的 connection_limit 优先级。

报告 worker 显式使用旧生代 192 MiB、semi-space 16 MiB，避免容器内存缩分时 V8 自动缩小年轻代引起过多 GC；年轻代及原生内存都计入容器总额。两路报告进程的测量候选各 384 MiB、各 1.25 CPU 上限、每路任务并发 2 和数据库池 4。总配额不等于预留核心，仍以实际 CPU、节流、GC、内存和四入口可用性验收，保留单进程和较低 CPU 档回退。

报告反馈使用有界策略：新进入空闲持久队列的少量任务获得短期 FAST_START 提示，前四个等待为 400/400/800/1600 ms 并带抖动；其余采用 2.5 至 4 秒等待，最多 24 次自动状态查询，尊重服务器 Retry-After，隐藏页暂停且请求不重叠。提示只保留有限技术标识，失效或丢失退回普通节奏，不承担答案或任务可靠性。旧的非异步路径保持既有节奏。

先分别记录进程冷态和至少 30 份独立热态单人样本，再测 10/25/50/100 及更高批次；纯交卷与四入口合计 50 请求/秒分别测量。到达窗口采用 API 请求体收齐事件，不能使用客户端统一发令替代。服务端使用单调时钟，跨主机比较保留时钟误差；数据库/容器采样不能冒充精确事件时间，不通过两个 P95 相减计算阶段耗时。源码 TSX 与正式编译运行的冷态区别必须说明。

时间线诊断仅在 PERF_ISOLATED_TEST_MODE=1 且 ASSESSMENT_TIMELINE_ENABLED=true 时开启，记录技术标识、计时、数量与状态；不记录答案、Cookie、密钥或敏感请求。生产日常关闭诊断。CPU、配额节流、GC、匿名/共享/文件缓存内存、回收/OOM、数据库连接/锁/IO、入口可用性和发压端资源同步保留。

功能开关经明确 overlay 启用；白名单为空覆盖上述整个合格问卷家族，不能声称只作用于一个测试课程。回退可暂停新整卷 ACK 和新异步登记，但保留兼容的 API/消费者排空已 ACK 的原始答案。未获 ACK 的本机封存草稿保留原身份，恢复入口后继续确认；不要改走不同的分量表协议。退回不兼容旧二进制前必须确认新格式任务已排空，并保留兼容客户端和草稿恢复路径。新增列和最小角色权限保留，不以恢复旧数据库覆盖已接收答案。

正式恢复资格同时验证旧单元回执，以及尚无权威单元快照的整卷密文；真实隔离备份恢复后使用受限运行角色继续评分、核对原提交身份和哈希，并验证幂等确认。服务器源代码试验不冒充正式 CI 资格。只有相关输入变化的阶段重验，同一候选产物只构建一次；传输继续遵循 GitHub→服务器，必要时 GitHub→K2→服务器，产物字节不经本机。


## Shared asset storage — exact C candidate (2026-10-17)

`shared-asset-storage` binds the full approved source diff to exact before/after Git blobs. It changes only nullable COS physical references, media reads/deletion protection and recovery alias resolution. Logical IDs, ownership, product/course scopes, frozen identities and old application URLs remain unchanged. The initial 2026-10-17 candidate kept new writes unique. The subsequently user-approved upload increment is bounded below; this route never admits arbitrary upload changes.

GitHub is the sole formal validation location: one backend build, actual isolated PostgreSQL migration and shared media/authorization/concurrent deletion contracts, a new-format PostgreSQL dump/restore, recovery reference contracts, the same runtime HIGH/CRITICAL scan and affected SAST. Frontend/scoring and load tests are excluded. The scanned runtime is archived for three days; production installs that exact artifact. Missing/failed/skipped candidate or SAST results block merge. Old native signed URLs must expire before retiring duplicate bodies. Before an old binary rollback after retirement, restore original bodies, verify hashes and clear physical pointers; never restore an old database over newly accepted business data.

## New upload deduplication — bounded shared storage increment (2026-10-17)

The user authorized automatic deduplication at the two unified COS store entry points, preserving distinct logical IDs, ownership, product/course scope, references and signed application URLs. After receiving full content, server-computed SHA-256, exact byte size and MIME identify existing content before a second COS upload. Retained deleted bytes may be reused without reviving their logical records. First uploads use owned unique keys outside database transactions. Duplicate file input is read once; a first-upload file is also checked while streaming to reject mutation before registration. A bounded content lock, the existing physical-object deletion lock and canonical row lock protect registration; a short remote metadata check precedes reuse. No client accepts a physical pointer or a hash-only existence query. Uncertain checks fail safely; a missing old body does not invalidate a newly uploaded good body.

A committed shared upload records its original unique key and a pending cleanup flag in the same transaction. Failed duplicate deletion keeps this intent and does not fail the accepted upload. Immediate cleanup and a root-owned five-minute oneshot retry select at most four intents; the ephemeral container is limited to 0.1 CPU/128 MiB and one database connection. It uses the current matching two API images and pauses safely on an older compatible image without this CLI. No heavy media consumer is enabled, and API/report quotas, pools and counts stay unchanged. Compensation reads actual physical references and keeps frozen or other-owner references protected.

The exact before/after bindings cover the upload service, COS streaming helper, compensation, additive pending flag/lookup indexes, cleanup CLI and host wrapper/units. GitHub is the sole formal place for one backend build, affected permission/media tests, real PostgreSQL concurrent upload/deletion and failure retries, pending intent/index dump-restore, bounded host cleanup tests, actual runtime HIGH/CRITICAL scan and affected JS/TS/Python SAST. Unchanged frontend/scoring/load tests and unchanged recovery-reference module tests are not selected. Existing authenticated shared-layout recovery proof is retained; no new source is substituted into old evidence. The new additive database state is restored in the candidate check.

Rollback to the preceding shared-storage-aware image preserves accepted records and physical pointers; the cleanup task pauses if that image lacks its CLI. Retain the extra columns/indexes and pending intents. The older AE binary still requires restoring old bodies and clearing all shared references first; never restore an old database over new business data. Installation uses the same scanned artifact and one affected upload/read/delete smoke path.

The SAST-only follow-up supports exact same-PR official candidate reuse through a reviewed workflow transition. It verifies the successful original candidate job, repository/run/event/PR, 24-hour official ZIP digest, every backend/host consumer Git object, unchanged test selection and non-skipped results, pending/index restore proof and scanned image archive. Missing, failed or changed inputs stop. The new head reruns directory-scoped JS/TS and Python SAST; the artifact retains the original runtime identity plus a current-head reuse receipt. Compilation, passing tests and scanning are not repeated.


## Survey integrated exact candidate (2026-10-17)

`survey-candidate` is a one-candidate C route, frozen to the complete approved Survey before/after Git blobs and current main base. It includes the additive Survey schema, four native tool types, administrator source grants and invitations, researcher ordinary/A-B publication and analysis, participant consent/checkpoint/FINAL/feedback, group-IP bounded collection windows, and the separately approved seven-day unsealed local cognition retention. Unknown paths, dependency/Dockerfile changes, unsafe modes, missing/changed source bindings or a moved main base fail closed. Existing shared-asset-storage and other routes remain intact. A new input requires a new reviewed binding, not a broad Survey directory exemption.

GitHub is the sole formal qualification location. The ready-PR gate requires scope, the real candidate job and affected JS/TS/Python CodeQL. The PR merge tree must equal the exact reviewed, up-to-date source head. Node 24.21.0, PostgreSQL 16.15 and Redis 7.4.11 are explicit; official registry base images resolve to recorded immutable digests. Each changed component compiles once, then types/lint, selected missing or changed-input contracts, dependency audit, runtime HIGH/CRITICAL scans, actual production Redis behavior, restricted-role checks, legacy additive upgrade and new-format dump/restore execute on the same built inputs. The current test-selection JSON states the reason for every selected group. Unchanged scoring, optimization benchmarks and unrelated platform suites are not repeated.

Retained original local HTTP/PG/runner evidence remains review evidence, never fabricated as Actions execution. Historical summary-only counts and SJT ledgers without persisted stdout cannot establish formal passing coverage. Previously passing tests with superseded consumers need the final-input selection. Both builder and runtime images plus phase status, commands/environment fingerprints, immutable image identities, raw selected-test reports, scan results and sanitized browser evidence are retained for three days. A failed attempt is preserved. Do not click a monolithic unchanged-job rerun: first review exact-input, same-PR official evidence reuse and rerun only invalidated or missing checks. Reuse cannot turn a failed/skipped case green or change its source/command/environment silently.

The real Chromium smoke uses only synthetic disposable accounts/data and the exact built artifacts: administrator invitation/Form grant/import, four-type composition/preflight/freeze/open, participant consent/Form/Scale/SJT, 120 unaccelerated Go/No-Go trials with browser keyboard events, child/parent FINAL, feedback and researcher TOTP/export. Real IndexedDB cases check expiration, conservative legacy migration, active-tab protection and successful-write clocks. Four non-timed role surfaces retain the repository WCAG/axe gate alongside the 390/768/1440 overflow checks. UI authoring editor completeness, invitation claim/password/MFA enrollment, linked-wave/A-B browser matrices, hardware timing calibration and production ingress are not claimed by this browser smoke; their contract/HTTP design evidence is distinguished in review.

The user explicitly approved only this run's ephemeral loopback HTTPS CA in an independent disposable browser profile. No system trust, ignored certificate errors, production certificate, production account or deployment is used. Cleanup removes this run's containers and private browser/fixture material; private credentials, cookies, HAR and database dumps are not uploaded. Merge does not invoke a repository production deployment workflow. Production deployment/configuration requires its own authorization, and rollback must preserve accepted Survey FINAL data and additive schema rather than restore an older database over it.


The Survey CI follow-up corrects mixed-language CodeQL paths to directories and adds two missing, immutable, read-only monorepo JSON fixture mounts for frontend type checking. Both original compiles, backend audit/runtime and their three image archives remain qualified by their exact successful phase prefix; the failed type phase and unexecuted checks are not accepted. The adapter admits only the reviewed transition and verifies the original same-PR official failed job, source/merge trees, exact seven-success/one-failure phase shape, 24-hour artifact digest, unchanged product/execution inputs and original image IDs/revision labels. Raw failed evidence is retained separately. It restores the three images without recompiling and packages the missing frontend runtime from the original builder's /app/dist plus the recorded nginx digest. The current head executes corrected types/lint, missing frontend audit/runtime, both runtime scans, fresh isolated services, selected contracts, migration/restore and browser checks, alongside SAST and changed gate contracts. No failed/skipped work is promoted to passing and no fallback rebuild occurs. A separate small reports artifact permits evidence review without transferring image archives.

### Measurement schema 比较故障的限定诊断与恢复

官方 run 39442752356 的 runtime job 已完成失败：prepare、audit、变化 lint、
app types、runtime 装配及扫描通过，schema 最后定义比较失败。完整官方
artifact 清单仅保留 JSON，没有已扫描镜像归档，不能将镜像 ID 当作仍持有
原镜像字节。诊断候选仅运行隔离 schema 比较诊断；真实 runtime job 暂停，
原 aggregate 因该必需 job 未成功而继续阻止合并，诊断成功不授予资格。

之后恢复仅接纳固定官方记录中 audit/lint/app-types 三项原成功，保留原
失败 job 身份并核对原始 ZIP、记录、输入及完整消费工具闭包。不得重跑
这些已通过应用检查。丢失镜像字节需要从原已核验编译输出重新装配 runtime
并扫描新的实际镜像，不重新编译，旧镜像扫描不能继承给新镜像。包装和
扫描已成功时，即使后续 schema 失败，也核对镜像与扫描身份、归档摘要后
保存实际镜像 artifact，同时保留整体失败状态；不保存半成品为合格镜像。

实际诊断 run 39446973848 已保留原始 schema diff：仅四条固定 CHECK 的
AND 子表达式冗余括号输出不同。恢复候选关闭临时诊断路线，重新要求真实
runtime 全部选中阶段成功；仅针对该四条完整原/恢复 SQL 行的已审阅等价
写法处理，不泛化去括号或忽略其他 DDL、权限和结构差异。三项既有成功
由固定原记录接纳，重新装配及扫描仅恢复丢失的镜像字节，schema 必须真实
完成；诊断本身仍保持 qualified=false，不能充当恢复或合并资格。

### 集成 Training Mac 的第二个限定候选

Mac 分支必须基于已合并 Measurement main `9e1b302e`，冻结完整产品 tree、
原始历史记录和明确的新检查清单后才能启用；仍由原 `merge gate / ready PR`
及实际 CodeQL 阻止缺失/失败/skipped。Measurement slot 与原官方证据不改变。

原 Mac 六次测试调用保留真实聚合结果、两次原失败及选中重试；后补收集的
case 名字不冒充原始通过 reporter。空类型日志和事后观察不升格为原进程
退出证明。早期组件浏览器摘要不当作集成候选的实际编译浏览器结果。

本次三个 catalog 修复仅规范 API offset 日期为 UTC、兼容合法历史 NULL
Scale tags、保持原子 ownership/expectedTags 比较。新增窄单元检查已有原始
结果，CI 不复跑；实际隔离 PG 检查 UTC 等价边界、NULL tags、CAS 和课程
导出隔离/撤权。临时表 SQL 检查与真实 Prisma/队列/下载夹具分开标明。

后端源码已变化，只执行一次当前直接编译并生成匹配 schema 的 Prisma。
前端私有本地产物无法通过现有安全通道注入官方 Actions artifact，因此仅
执行一次官方 Linux Vite 交付构建，不公开私人验收包、不投放 Library 凭据、
不创建永久公开二进制载体分支。两组件成功编译输出即使后续阶段失败也独立
保留，之后只能接纳同一字节/输入，不盲目重编译。

必要前端 app 类型检查包含 Cognitive 的同语义子集根，不重复运行同义
Cognitive 命令，也不声称它单独执行过。仅七个集成重叠/最后新增文件运行
lint，历史 lint 的缺失 argv 继续披露。依赖锁与审计命令未变则核验原官方
审计；新实际镜像仍必须 HIGH/CRITICAL 扫描并保留相同镜像字节。新增迁移
必须完成真实旧 schema 升级、数据/索引/权限及 dump/restore，不借用旧版本
恢复结果。编译 UI 仅检查当前 shell、分析/参考集成及发布中编辑状态的
桌面/手机合成场景，不冒充真实后端或生产 TLS 端到端。无部署操作。

Mac 首次正式 run `39510605714` 的后端/前端编译、app types、七文件 lint
已真实成功，随后浏览器合成 API 缺少必需 message 字段而失败。原 job 和
浏览器失败保持不变；修复只改变该 fixture，并为中文布局提供官方签名源的
CJK 字体。后续固定原 run/job、ZIP/receipt/TAR 摘要及成功阶段完整消费输入，
接纳这四项原成功并恢复原编译字节，不重新执行编译、类型或 lint。只继续
失败浏览器与尚未执行的隔离 PG、镜像装配/扫描和新 schema 恢复；缺失或
输入漂移直接停止，不回退为重新运行全部阶段。

第二轮 run `39512542094` 的桌面 course-shell 已通过，随后 analysis-reference
因合成 governance grants 为空而失败。仅补齐该分析场景需要的只读审核 grant。
桌面 course-shell 由固定官方 ZIP/report 和相同 compiled dist 接纳，保留原截图、
原报告 FAIL 与失败 analysis 记录；当前只做进入分析页所需导航，不重跑其断言。
手机 course-shell 及其他未通过场景仍须真实执行，缺失 proof 不跳过任何 case。

第三轮 run `39514166141` 浏览器全部通过（五项新执行、一项原通过接纳），
但 backend 镜像扫描真实发现 follow-redirects 1.16.0 的两项 HIGH 漏洞。
仅将 backend override 与前后端两个锁记录更新到官方 1.16.1，核对 npm
完整性及七个包文件；不改扫描级别、不隐藏原失败。补丁只改变 Node 重定向
实现，不含类型/编译器依赖；Axios 浏览器映射排除该实现，后端唯一直接
消费者已设置 maxRedirects:0。原编译/类型/lint/UI 证据按该精确源码影响
审阅保留原身份，不声称旧锁仍相同。两个当前锁审计、实际新镜像扫描及
未执行 PG/新 schema 恢复必须成功。已装配但扫描未通过的镜像可独立保留
为 qualified=false 诊断产物；该产物不能授予扫描、恢复或合并资格。

第四轮 fresh npm audit 拒绝 Vite 的 HIGH 开发服务器漏洞。仅升级 backend
7.3.6→7.3.7、frontend 6.4.3→6.4.4 与对应声明/锁记录，保持原扫描门槛。
后端 tsc 与类型/lint 未消费变化的 Vite 实现，保留原证据；前端共享 build
代码变化，执行一次新 build。仅完整 dist 文件集合和每个文件字节均相同才
接纳原浏览器，否则执行现有六项窄场景。新旧 TAR 身份分别记录，不伪装相同。
审计失败保存脱敏包名、版本和官方 advisory，继续两个当前锁审计与未过阶段。

用户随后明确将定稿 Training logo 的八个前端/测试文件纳入同一候选。仅
应用核验过的精确补丁，不混入其他 Mac 后续修改。logo 改变前端源码输入，
因此同一次必要 build 同时包含 logo 与 Vite 修复，实际检查当前 app 类型
和四个改动 TSX 的 lint，并用现有编译浏览器场景确认新 UI；后端编译不复跑。
Mac 的 8 pass/45 filtered 与桌面/手机观察保留为原本地报告，不冒充 CI 结果。

最终窄审修复课程结果链接范围、旧类型不具备课程来源时的入口提示、SJT
未确认换页的刷新恢复，以及成功恢复服务器草稿后的旧自动前进取消。六个
定向 case 通过，恢复竞态的原失败保留。新前端输入执行必要验证；原后端
应用未变。run 39526376171 的双锁 audit 和真实扫描 backend 镜像按原身份
接纳。其 PG 四项有三项通过、唯一失败名已记录；三项名称由固定四项源码
与原计数/失败名推导，非伪造原逐项 reporter。仅修并重试导出 fixture 的
queued/READY nonce 契约错误，其他三项不重跑，实际恢复门禁仍须完成。

### Scale authoring: fixed official evidence PR admission (2026-10-21)

The same-repository `work/scale-authoring-feedback-20261021` PR has a third, exact `scale-authoring` candidate in the existing exact-candidate route. It retains the real `scope`, `exact-candidate`, and `codeql` requirements of `merge gate / ready PR`; draft, unknown paths/modes, changed main base, differing source/merge trees, missing/expired artifacts, or unsuccessful required jobs stop admission, never select platform fallback. The original measurement and Training Mac candidates retain their own required checks and workflows. PR322 is not modified.

Application evidence is read from fixed official Actions identities and complete artifact SHA256 values. Run 39560427570 supplies backend build, 174 regression assertions, audit/image scan and the unique PostgreSQL persistence case. Runs 39565491980 and 39568118300 supply the unchanged frontend compilation, 70 affected assertions/audit, repaired types/lint and runtime-only image scan. Successful run 39574936019 supplies the completed browser/SAST/ready evidence: Training's six checkpoints and six screenshots are explicitly inherited from run 39571934879 (whose overall FAIL remains visible); Survey is newly executed with explicit measurement publication, both FINAL answer sets, actual rendered PNG hash, authorization refusal, and three real RAW_WAVE downloads. The report, twelve PNGs, four axe results and cleanup are checked, not replaced by a synthetic success status.

Only the new routing/admission controls are tested or analyzed for this PR. Python reuse/admission helpers receive their first applicable Python CodeQL analysis; prior JS/TS application analysis completion is reused without claiming that the original full scan had zero findings. No application build, tests, PostgreSQL case, browser journey or image scan is repeated. The scanned frontend runtime image was not retained as an image archive: this admission permits PR merge only, not deployment or image delivery. Current screenshot inspection is representative human review plus automated layout/accessibility checks, not a claim of every-pixel manual review.

The scale candidate does not borrow the older Situational checker-input invariance proof because its shared scale definition changed. Instead, the unmodified standalone publication workflow uses its ordinary relevant-path detector; this change contains no Situational catalog/package/workflow trigger paths. Manual full/probe dispatch is refused for this exact branch; an exact post-merge main tree is classified without replaying already accepted application evidence.

## Private Survey Wave content selection (2026-10-21)

The bounded `survey-wave-selection` scenario admits only the named Wave picker,
read-only options/projection, direct tests and existing CI control files. Unknown
paths, dependency/schema/permission/public-feedback changes, deletion, renaming
and nonregular modes are rejected. The known feature branch fails closed on
scope drift or full/manual fallback; it does not launch platform acceptance.

Existing jobs are reused: backend-regression runs locked dependency installation,
backend types/audit, three direct contracts and a small real PostgreSQL fixture
for exact filtering, read-only discovery, stale-choice rejection and authoritative
prepare/frozen identities; frontend runs lint/types/audit and six direct test
modules. Selected suites must be present, nonempty and unskipped. Production
images are built once by ci-images and retain HIGH/CRITICAL scanning. Its Chromium
smoke reads the exact frontend runtime assets and checks selection/freeze/frozen
read plus stale-error UI with synthetic APIs, not backend authorization. CodeQL
covers the changed business and control surfaces. No full lifecycle, capacity,
media, Mac, migration upgrade/dump-restore or production work is selected.

Local exploratory dependency-drift results are not represented as formal CI
receipts. The stable gate recomputes the complete diff and requires actual scope,
backend-regression, frontend, docker and CodeQL success; skipped/missing/failed,
cancelled and draft candidates cannot qualify. Main push reclassifies only,
without rerunning these PR checks. Five minutes is a progress/diagnosis threshold,
not a guarantee for first downloads or scanning. This change does not deploy.

## Frozen Composite CSV memory batch (2026-10-21)

`work/composite-csv-memory-20261021` admits only its fixed main base, five exact
backend source/test blobs and named CI controls. Unknown input, dependency,
permission, database, frontend, mode or base changes fail closed, never fall back
to platform CI. The original merge gate requires scope, this backend candidate,
and changed JavaScript/TypeScript CodeQL to actually succeed.

GitHub is the sole application-check location: one full backend TypeScript build,
precise CSV safety/default/typed/ZIP contracts, runtime assembly from the same
cached build with byte comparison, and the actual runtime HIGH/CRITICAL scan.
Both built images are saved in a separate compressed image artifact; small
reports retain their archive digest, so a later failure does not lose build bytes.
Unchanged generated-instrument checks follow the existing campus build policy.
No database, browser, frontend, worker process, deployment or load test runs.
The unchanged locked audit is read from its original official successful job,
with package/lock equality; missing or changed evidence stops rather than reruns.
The diagnostic extracts exact baseline/candidate function AST declarations plus
csvValue and protectCsvCell dependencies. It proves equal full CSV bytes on one
1,000-by-100 synthetic table and reports retained preparation/output heap and
replacement-row/property counts. It is an isolated function microbenchmark, not
full-service execution, production peak memory or proven end-to-end speedup.
Main push only classifies the merged diff; it does not replay application checks.
Five minutes triggers a progress update, not a promise of scan/download duration.

## Scale library governance bounded candidate (2026-10-21)

The fixed governance branch admits only its frozen complete product/blob inventory
and reviewed control paths against base `aabbe049`. Unknown paths, source/base
drift, unusual modes and manual full/probe requests fail closed, never platform
fallback. The stable gate requires scope, governance acceptance and actual
JavaScript/TypeScript plus Python CodeQL success. Existing candidate routes and
branch protection are unchanged.

GitHub is the sole application-check execution location: one backend and one
frontend compilation, affected contract inventories, app types/changed-file lint,
actual runtime scans, four real PostgreSQL suites, old-schema synthetic upgrade,
and a nonempty synthetic database dump/independent restore of this feature's
dependency closure. This is not production disaster-recovery or attachment-backup
qualification. Identical package/lock audits retain their fixed official prior
run/job source and explicitly do not claim a new vulnerability lookup.

Two actual production-UI journeys exercise opposite entrypoints, exact approval,
readonly use, original scoring/typed quality answers, ordinary revoke versus
emergency stop/replay, unified catalog and image/video delivery. The synthetic
video uses the same compiled backend with isolated DB/Redis and a bounded worker;
no accepted media/release/session is faked. Synthetic admin uses real WebAuthn
with a virtual authenticator, not physical-key acceptance. This round's explicit
approval covers only disposable browser-profile CA trust and loopback HTTPS;
no host system trust, production routing or certificate-error bypass is used.

Builder/runtime image bytes are archived immediately and separately from small
reports/screenshots, including when later checks fail. Private credentials, DB
dumps, raw server logs and capability URLs are excluded from public artifacts;
owned services and private files are removed on every outcome. Plan roughly
10–15 minutes for the new connected scope, reporting the actual waiting step
after five minutes; failures invalidate only their consumed inputs and do not
authorize full-platform retries. No deployment is included.

Governance round-1 continuation retains run `39605768918` as failed. Its frontend
compile step succeeded and the complete builder/runtime archive is accepted only
with fixed official artifact digests, original image IDs/revision and unchanged
frontend production/config/lock inputs. Exactly two repaired test files are
mounted read-only into that original builder for the previously failed types and
unexecuted lint/contracts; the original runtime receives its first scan. No Vite
compile, image relabeling or successful-test replay is involved. Backend never
produced a successful image and therefore must compile the repaired source before
its missing checks. Original CodeQL completion remains attributable to its old
source; only actual changed JS/TS/Python inputs receive new analysis. No failed
job or old report is rewritten as successful.

Governance PR326 second-run continuation preserves the failed run 39610102026.
Its unchanged 16 backend suites (161 assertions) and 18 frontend suites (159
assertions) are accepted only from the pinned official report archives, with
reviewed component-input and mock boundaries. The repaired readonly frontend
suite runs again, together with application types, its targeted lint, and the
first runtime scan; original frontend image bytes are restored without a new
compile. The real backend wrapper fix requires a new backend build, nine failed
suites, five existing direct binding/FINAL/report/reinterpretation suites, and
the new wrapper-binding suite. PostgreSQL, restoration, connected browser and
runtime scans have not passed previously and remain required. Only changed
SAST inputs are analyzed after verifying the second run's official completion.

The next fixed continuation accepts run 39614240900's complete frontend
qualification and its original image bytes without compiling, testing, scanning
or re-uploading the frontend archive again. Backend copy-lock SQL and governance
trigger repairs invalidate backend compilation and image scan, but not the
mocked/pure unit paths already passed. Those reports remain explicitly sourced
from their original runs. The ordinary instrument FINAL PostgreSQL suite's 13
passing assertions do not execute either changed SQL path; only the three failed
PG suites run again. Migration upgrade/legacy-byte validation uses the new SQL;
nonempty recovery and the two browser journeys still require actual execution.

Run 39616852296 passed the repaired 29 PostgreSQL assertions, exact legacy
upgrade checks and nonempty synthetic restore; its failed account-fixture step
is not relabeled successful. A diagnostic-only continuation restores both
original scanned images and runs only fresh browser-database preparation and
previously unexecuted fixture/browser work. The checkout fixture's current SHA
and the old backend image revision are recorded separately. Error reporting
retains safe class/code/phase and basename/line frames, never raw messages,
Prisma metadata, bootstrap output, credentials or private stderr. The fixture's
business statements are compared unchanged after removing phase markers and its
error-handler-only diagnostic tail. Image labels are never rewritten.

### Survey experience exact candidate, 2026-10-22

Only `work/survey-experience-20261022` against base `c0519207` may use the
`survey-experience` route. Its full frontend tree, 24 changed source blobs and
external fixture/tool-lock inputs are pinned. Unknown paths, modes, branch,
base or source-tree drift fail closed, never fall back to platform CI.

For this candidate only, the user explicitly approved acceptance of the
reviewed **unsigned local** reports. `survey-experience-local.json` retains
compressed original reports and hashes, including the initial environment
failure and the failed first aggregate; neither is rewritten as a success.
The accepted evidence is 162 second-batch assertions and 19 applicable earlier
assertions, local application types and changed-file lint. Catalog's last
case renders Builder's unchanged read-only catalog snapshot branch; App tests
mock changed children, and FormPagination consumes unchanged FORM rendering.
The reports are not CI executions or cryptographically authenticated results.
Existing cached package versions matched the lock, but cached package bytes
were not reverified against tarball integrity; the three downloaded packages
were verified. The temporary Vitest configuration only preserved symlink
identity. Hook dependency warnings remain disclosed. No local browser, build,
audit or scan result is claimed.

The required `survey-experience` job independently verifies the exact inputs
and report bytes, compiles Vite once, assembles the runtime from that cached
build, archives both real images separately, performs fresh dependency audit
and runtime vulnerability scan, and runs real Chromium desktop/mobile,
keyboard and axe checks over the extracted production dist. All API responses
are synthetic fixtures: this proves UI behavior, not server authorization,
real publication, database correctness, or media processing. No TLS exception,
backend, PostgreSQL, restore or platform suite is involved. Original merge
gate, scope and CodeQL requirements remain mandatory. This is not a general
unsigned-local-result trust mechanism and changes no older candidate route.

The first official run `39704148772` retained a successful production build,
audit and runtime scan but failed during the synthetic browser journey. Its
overall and frontend-job failures remain failures. A continuation pins that
run/head/attempt, official ZIP digests, inner archive digest, original image
IDs/tags/labels and successful step identities; it restores those exact bytes
and reruns only the browser. The full frontend/backend fixture/tool inputs
must remain byte-identical. No earlier CodeQL execution is claimed: the first
run omitted the new route from the existing job condition, now corrected, and
actual relevant SAST success remains mandatory before merge.

Survey PR continuation: run 39705178007 remains failed at the media-only text assertion. Its exact five successful UI scenes, six screenshots/axe layouts and four keyboard observations are separately accepted from the official immutable artifact; the next run executes only `participant-media`. The acceptance document identifies both runs and explicitly sets `sameRunFullJourneyClaim=false`. The original successful JavaScript/TypeScript analysis is pinned to its actual job; only the three changed JS control/browser files receive new SAST. Original build, audit and image scan are not repeated.


## Training follow-up #332: exact affected checks (2026-10-22)

- Frozen product source: `a0d7ef7d9496b685be159dcc10aacd2b23cb97c2`, main base `abade96de544593d0fe67453e4c48a0b478cbe67`. The new `training-followup-bindings.json` binds all 50 product paths and both complete component trees. Only the explicitly enumerated control paths may accompany them; unknown paths, source/base drift, deletions, renames and mode changes fail closed. The known source branch rejects generic/full fallback. Earlier Training routes remain unchanged.
- Main verification location is GitHub Actions. Preserve the Mac evidence branch `99d9cd2f5bf7cba9b56374c4ca52579cd33a26dc` as historical review evidence, including failed and filtered cases, not a retroactively signed official success. Unchanged course export, task workflows, scoring paste and media unit checks are not repeated. The ScaleEdit merge and questionnaire integration consume changed current-main inputs; run only their four direct frontend contract files plus integrated application types and changed-file lint.
- Private form-template changes require backend types and the seven-case PostgreSQL suite, including the new exact-grant copy/revocation barrier and atomic no-partial-write checks. Apply migrations only to the disposable loopback Actions PostgreSQL service. No Mac, Survey or production database is used, and no production restore/deployment qualification is claimed.
- Build the frontend once for the missing rendered acceptance: Chromium at 1440, 834 and 390 pixels verifies assessment toolbar/filter non-overlap, media rename/preview dialogs and independent form entry. Strict synthetic API fixtures reject unknown requests and page errors. These checks do not replace real learner manual acceptance.
- Stable `merge gate / ready PR` still requires actual success for scope, the complete nested Training workflow and CodeQL. Draft, skipped, cancelled, missing or failed selected jobs remain blocking. No images, pressure tests, unrelated platform regression, dependency audit repetition or production deployment is selected. Report the actual waiting stage after about five minutes; do not append broad fallback checks.

The first integrated run `39714107823` passed frontend lint/types, all 118 selected assertions, one build, all seven form PostgreSQL cases and CodeQL. Its browser job failed at the independent-form entry because the fixture used an HTTP production hostname; the screenshot shows the page error boundary and no unexpected API requests. Use HTTPS for the same intercepted synthetic hostname, with no certificate or crypto bypass. Preserve the failed browser artifact `12398228523`; do not call the original overall run successful.

Only official successful component jobs `119612363208` and `119612363279` are admitted by `training-followup-reuse.mjs`. It binds the source SHA/merge, complete component tree, unchanged check program, fixed Actions run/job identities, exact completed successful stages, a 24-hour lifetime, complete non-skipped assertion reports, original command receipts and artifact ZIP digests. The frontend consumer extracts the original compiled bytes; it does not rebuild. There is no fallback to re-executing application checks on missing or mismatched evidence. The new browser fixture and admission controls still require real current scope tests and CodeQL. No database service starts for evidence admission. The current exact Training merge gate uses only Node and skips the unrelated classification package install; gate assertions remain unchanged.

## 管理员 Authenticator 的精确定向合并门禁（2026-10-22）

用户批准 PR #333 仅为本次管理员手机 TOTP 修订补齐定向检查并合并。
`work/admin-authenticator-main-20261022` 固定 main 基线
`c77db302ae6ad60366618fb57bf845f17acaf24d`，产品提交
`83234f5cfc914e8c4d70d60020a57cea286a9e20`。完整 raw diff、33 个产品 blob、
前后端完整 tree、历史直接消费者及配置输入均精确绑定；仅允许绑定列出的 CI 控制和
五份原始本地报告。未知路径、删除、模式变化、源码或 base 漂移均拒绝；此分支的
manual/full/probe 入口明确拒绝，不回退平台全量。main push 只分类，不重复应用检查。

原 40 后端、40 前端和 3 个追加边界断言按原报告摘要、唯一 case 和当前源码审阅接纳，
追加报告中 12 个过滤项不计为新通过。报告明确为 reviewed-historical-local，未签署原执行、
未在 CI 重跑；原生 Mac 使用 Node 24.21.0、PostgreSQL 16.15、Redis 8.4.0。
保留原前端 lint 与 14 份合成 TOTP 密文/重放状态的定向恢复证据，不声称全平台恢复资格。
不复用新 main 输入已变化的全组件类型结果：Actions 只执行集成后的 Prisma 生成/校验、
干净隔离库迁移、后端编译一次、前端应用类型与编译一次、生产依赖 HIGH/CRITICAL 审计、
同一前端编译的绑定/登录两页面在 390/1440 宽度的键盘/溢出/WCAG 检查，及受影响代码和
控制工具的 CodeQL。UI 桩不冒充实际认证协议；协议证明来自已审阅的本地真实 API 测试及
用户亲自完成的绑定、登录和授权流程。无生产访问或部署，无重复完整测试或重型镜像构建。
此路线仅授予 PR 合并资格，不生成生产镜像，不授予生产 runtime/OS 镜像扫描或部署资格；
部署仍须另行准备并扫描实际候选镜像。`merge gate / ready PR` 重新计算完整计划，要求
scope、admin-authenticator（含全部内部作业）、codeql 实际成功；draft、缺失、跳过、失败
或与实际 checkout 不符均不能合并。

本路线继续保留 run `39718477428` 的原失败：前端首次审计为 npm 官方接口 503，
仅重试该失败作业；之后前后端编译/类型/迁移/审计与应用 CodeQL 均实际成功。
浏览器原失败为下拉框可访问名称的精确定位问题，未接纳为成功。后续只修改定位器，
固定原 run/head/merge、成功 job 身份、24 小时有效期、两个 artifact ID/ZIP SHA256、
完整组件 tree 以及解包后的实际编译文件摘要，复用原编译与审计，不重复运行。
原应用 SAST 经官方元数据核验接纳；只对变化的 CI 控制脚本执行新的 JS/TS CodeQL。
任何缺失/失效/漂移证据直接阻断，不回退重新构建或全平台检查。

## Training 学员与编制页面的小范围后续（2026-10-22）

用户批准 review、push、合并，并明确要求本批轻量 CI，复用有效本地结果。
`work/training-student-20261022` 仅接纳 `training-student-bindings.json` 列出的
25 个产品路径及明列控制/证据文件，以当前官方 main 为固定 base；整个前后端
component tree、依赖、schema、配置和原始证据摘要绑定。未知路径、模式、base、
组件或证据变化直接失败，不回退全平台。PR checkout 必须与实际 PR source tree
一致；main 合并后只分类，不重复资格检查。手动 full/probe 对本分支拒绝。

复用证据为经本次对话审阅的本地摘要及保留的原始日志，标为
`reviewed-local-evidence`、`originalExecutionSigned=false`、`ciExecuted=false`。
旧视频调用的失败清理 hook 和筛选重试保留原身份，只接纳实际通过部分；不同
检查的数量可能重叠，不伪造总断言数。不上传用户作答、账号凭据或生产数据。
本次明确接纳这些已审阅的有限历史断言，不扩大原 Ed25519 用途，也不称这些
测试重新在 Actions 执行。浏览器替身数据不代表新后端权限端到端验收。

缺失项在 Actions 一处补齐：新控制的范围/拒绝/证据篡改/严格汇总契约、合并后
frontend app types、一次 frontend production build、backend types（仅生成
Prisma client，不连接数据库）和变化源码/控制的 JS/TS CodeQL。锁文件和数据库
schema 未由本批修改，不重新审计依赖、创建 DB、跑迁移或重建镜像，不运行全量
单测/浏览器/媒体/性能/Ops。约五分钟报告实际等待阶段；admission 五分钟、编译
每组件八分钟，CodeQL 保留既有时限。这里的编译产物不授予生产部署资格。
稳定 `merge gate / ready PR` 仍要求 scope、完整 training-workspace 和 codeql
真实 success，并重算实际 checkout 的计划；draft、缺失、跳过或失败均拒绝。


## Survey 云端全链路视觉与操作修订（2026-10-22）

用户已要求推送并合并当前获批实施、真实 Form 验收及本地最终 review 的修订。
本次仅 `survey-cloud-flow-visual-20261022` 的 `survey-cloud` 精确路线：
基线 `61bb4cc1534fcb02869b27973794001021826de0`，集成产品提交
`ae7e6551684a82b7357ebea9ed61107f547c301a`，32 个前端文件与完整前后端
component tree、依赖/配置及明列控制/证据文件绑定。未知路径、模式、base、
源码或证据漂移直接失败，缺标记不回退全平台；手动 full/probe 拒绝。

本次有限接纳当前对话已审阅的 unsigned local 原报告：明确
`reviewed-local-evidence`、`originalExecutionSigned=false`、`ciExecuted=false`；
原失败 2 项、过滤、修订后运行和重叠计数全部保留，不编造总通过数或补签。
实际临时身份只在本隔离节点使用，24 个真实桌面/窄屏状态及 1 份 Form 的
2 个 FINAL 不构成完整科学测评验证；临时账号/入口和招募已按批准方案停用。
受限凭据、真实用户数据和私有浏览器会话不上传。历史报告的原始压缩字节及
摘要逐项核对；本地类型结果不冒充新 main 集成后的结果。

主要执行位置为 Actions：因 PR #334 改变 AppShell 输入，仅该外壳契约文件、
该文件及其测试 lint、集成前端 app types、缺失的一次前端生产编译，以及
本批前端/控制的 JS/TS CodeQL 新执行。其余未受影响的本地契约不重复。
本批没有改变 backend、schema 或依赖锁；不创建数据库、不跑迁移/媒体/压力/
全量回归，也不重建或扫描生产镜像。本路线只授予本次 PR 合并资格，不提供
生产镜像或部署资格。scope 与 admission 五分钟，前端缺失项八分钟，CodeQL
使用既有时限；约五分钟报告实际等待阶段，不追加无关验证。

稳定 `merge gate / ready PR` 重算完整 checkout 与实际 PR source tree，要求
scope、全部 survey-cloud 内部作业和 codeql 实际 success；draft、缺失、跳过、
取消和失败均拒绝。精确 main 合并 push 仅分类，不重复应用检查或自动部署。
旧候选的路线、签名用途和其他门禁不变。


## Training 月夜外观的精确合并范围（2026-10-23）

用户要求推送并合并当前外观修订。本路线固定官方 main
`9e019c98568d9250a31346cc89d3ae272e9414dd` 与产品提交
`80f02f4f` 的 13 个产品路径，仅允许绑定明列的 10 个 CI/证据/文档控制路径。
绑定完整前后端 tree、源 blob、依赖/配置及原报告压缩字节和摘要；未知路径、
模式、base、source/merge tree 或证据漂移均失败，不回退全平台。
手动 full/probe 拒绝，main 合并 push 仅分类，不重复应用检查或部署。

本地报告接纳明确标为 reviewed-local-evidence，originalExecutionSigned=false、
ciExecuted=false。最新默认外观 13 项，较早共享壳 67 项及被替代的外观 11 项
不能相加；原定位失败和两次低对比失败保留身份。共享壳结构与导入未受默认值
后续影响，不声称该 67 项在默认值改动后重跑。浏览器原报告只接纳对应完成项；
可选 generic localhost 登录探针未完成，临时 DOM 状态探针不冒充真实测评。
不提交凭据、业务数据或用户截图，不补签历史执行。

Actions 一处运行新增控制范围/拒绝/证据/严格汇总契约、当前前端 app types、
一次 production build 与变化源码/控制的 JS/TS CodeQL。已有本地断言和 lint
不重复；后端、DB、迁移、媒体、依赖锁未变化，不启动这些检查、审计或镜像重建。
本地只核对范围和语法，CI 验收预算约五分钟预警，接纳五分钟、前端八分钟，
CodeQL 保留既有时限；超时报告实际等待项，不追加检查。
稳定 merge gate / ready PR 重算实际差异，必须 scope、完整 training-appearance
及 codeql 全部实际 success；draft、missing、skipped、cancelled、failed 均阻断。
此范围只授予本次合并资格，不提供服务器部署资格。

本路线保留首次 CI run `39805784823` 的失败：70 个控制断言通过，3 个通用
CLI 用例继承真实 PR 环境而失败；仅隔离测试子进程的分支变量后复验，正式
接纳和禁止回退仍使用真实环境。前端编译当时尚未执行，不能称原 run 成功。
同一 run 的 CodeQL job `119918625032` 已真实成功；当前前端与全部控制脚本
树、CodeQL initialize/analyze 的版本、语言、路径、查询与资源设置均逐字相同。
Actions 重新核官方 run/job/source/branch/步骤、24 小时有效期及两个完整 Git tree，
核原配置后接纳此成功扫描并保存 receipt，不重复扫描。元数据不可用、过期或
输入不同直接失败，不回退重扫、不把原父 run 的失败改为成功。


## Survey 独立工具与昼夜外观限定合并（2026-10-23）

`work/survey-visual-20261022` 基于已合并 Training #337 的官方 main
`468040dcfcab3a70a6030c177775fd4e04b05a83`，仅使用 `survey-workspace`
精确候选路线。完整产品 blob、组件 tree、依赖/配置和逐项控制文件绑定；
未知路径、模式、base、source tree 或证据漂移拒绝，不回退全平台。原有
Training 和云端 School/Teacher 路线保持独立，不更改权限或分支保护。

接纳当前对话逐批审查的 unsigned local 原报告，固定原始 gzip 字节和摘要，
标记 reviewed-local-evidence / originalExecutionSigned=false / ciExecuted=false。
按唯一 file/case 选择真实 passed 断言，保留原始失败与过滤，不相加历次总数。
主题外壳改变影响的工作台消费者已补验；旧“研究数据”名称断言只修复后重验
该失败项。编制页九个当前深色状态另有可见文字对比度、白底和溢出记录。
这些不是本轮 Actions 执行，也不代表所有页面或真实用户人工验收。

本机 73 项范围/拒绝/证据篡改/严格汇总合同已通过，原始记录接纳后不在 CI 重复。
GitHub 为缺失资格的主要执行位置：实际 checkout 的完整范围与证据重算，
集成 frontend app types，一次 frontend production build；浏览器独立消费
同一 dist，检查入口、三个独立编制器、共用库申请及发布/报告/数据在
390/1440 宽度的深色、溢出和 WCAG。请求严格使用合成 DTO，未知接口失败，
不声称这些页面桩证明后端授权。后端仅生成/校验修正后的 Prisma 模型与类型，
将官方 main 的干净隔离 schema 升级到本候选，并在同一临时 Postgres service
用无登录合成行校验完成状态约束、默认未完成、基线保留及原生 dump/restore。
已有真实本地 PG 权限、固定修订、撤权/附件同意和原子回滚报告不重复执行。
变化应用与 CI 控制仍执行 JS/TS CodeQL。依赖锁、科学计分与生产配置未变，
不运行平台全套、媒体/压力检查或重型镜像构建；本路线不授予生产部署资格。

范围/接纳五分钟，编译/页面/迁移分别设置有限时限。稳定 ready gate 必须
scope、完整 survey-workspace 嵌套工作流和 CodeQL 实际 success；草稿、缺失、
跳过、取消和失败均拒绝，实际 checkout 重算计划。main 合并仅分类，不能
把原始失败改写为成功，也不自动部署或合并其他产品。


Survey 当前候选续验保留 run `39811690734` 的整体失败：正式浏览器在
1440 的数据表头发现 `bg-slate-100` 对比度 1.53:1。仅为该深色 utility
加入原有 surface 映射；其余应用 JS/TS、后端、fixture、迁移执行器及依赖
配置保持完全一致。绑定只允许反向移除这一精确 CSS 片段后等于原始完整
文件，其他应用差异拒绝复用。前端新 CSS 编译一次，旧类型证明继续接纳。

续验核对同一官方 run/head/attempt、固定 job、确切成功阶段和 24 小时有效期。
后端 job `119939669541` 的类型及隔离升级/恢复成功，artifact `12440287737`
ZIP SHA256 `58145d0c0f73c83516d3b21ba14020834c18c7f87d0bddf244c353cbc31f1d8a`
及内部真实结果再核对后复用，不启动数据库或重复编译。前端类型来自成功
job `119939669432`。应用 SAST 来自成功 job `119939517555`，仅变化的 JS
控制执行新 CodeQL；新接纳边界的七个拒绝/过期合同及一个变化 wiring 合同
在 CI 首次执行，不重复已核验的原通用合同。

官方失败浏览器 artifact `12440726926` 的 ZIP SHA256
`b76aa6bc7e4d1b3609018ff96d04bc8ec916b577054199c775eea65ee9d8cfd7`，
内部 browser.json SHA256
`4c8bda31b276e1f241419066055b2eca030e479939738bb66a8923e8b8961d07`。
只接纳完整通过的七个 1440 场景；失败 data 与八个未执行 390 场景重新验收。
报告显式为 sameRunFullJourneyClaim=false。未匹配、失效或篡改的证据停止，
不暗中复跑整批或把原失败、缺失、跳过项目改成通过；不授予生产部署资格。

续验 run `39814196927` 的浏览器尚未运行：官方原日志在下载九个额外字体包
时于 `16:37:38 UTC` 取消，汇总列表曾滞后显示运行中；1316-byte browser
artifact 只有继承的接纳记录，不是新的浏览器通过证明。保留该取消及旧失败。
新续验不重复 apt `--with-deps`，仅安装相同锁定 Playwright 的官方 Chromium；
先核 runner 的中文字体覆盖，缺失时仅从 Ubuntu 官方 HTTPS 源补固定版本
WenQuanYi 字体包，以可信 runner apt 元数据摘要核验后解包至用户字体目录。
中文字库缺失或摘要不符直接失败；记录实际字体路径，不改 runner 安全配置。

该 run 的 frontend job `119948529906` 已成功完成修复后 CSS 的唯一编译。
固定 source `340a952b77646c72eec2b437795d9b71f022b2c9`、完整 frontend tree、
确切 compile 阶段、24 小时年龄与 artifact `12442170332` 的 ZIP SHA256
`87ca934ed91875e59d31d8de723d4e3293a79e3c80023a61dbebc0a2d87ff7fd`，
核验后仅恢复并记录同一 dist 的逐文件摘要，不重新编译或重验应用类型。
原控制合同阶段的官方完整日志 SHA256
`cafaf4c5fea9c5fb0bd5316ec502e5a15841f6c1086f8251406c9c9935552bc3`
与固定 job/成功步骤核验后接纳未变化的六项；两项 wiring 已变化故重新执行，
另首次运行两个编译产物身份/失败拒绝合同。已成功的 CodeQL job
`119948366459` 覆盖未变的 scope/browser 控制文件，逐 blob 核验后复用；
变化的 reuse、reuse.test、workspace.test 及消费新 helper 的 checks 控制接受新的 CodeQL。
取消父 run 的状态原样记录，接纳成功步骤不授予其整条运行成功身份。

## PR #339 shared authoring candidate (2026-10-23 approval)

Only `work/shared-assessment-authoring-20261023`, fixed main
`4dd9f1340fef2bc3df2d066b9bf7712bc2eb3c66` and product
`693fd489e626eec6b34869657b2b23c5faeae69a` may use `shared-authoring`.
The full raw diff, modes, before/after blobs, component trees, protected
lock/config inputs and actual PR source/merge tree are rechecked. The only
deleted path is an identical-blob move to the shared scale directory. Unknown
paths, base drift, missing markers and manual/full/probe requests fail closed.

Approved unsigned local evidence is explicitly `reviewed-local-evidence`,
`ciExecuted=false`, `originalExecutionSigned=false`. Original failures and
filtered rechecks remain recorded. No retrospective execution signature or
historical full node_modules byte identity is asserted. Current type checks,
focused assertions and synthetic pages are admitted only as the listed case
identities after source/config/callee review. They do not establish manual
real-account acceptance. The missing current production compilations, actual
frozen/participant/report material chain, built-frontend short flow, missing
lock audits and new CodeQL execute in Actions.

The stable `merge gate / ready PR` recomputes the complete checkout and requires
scope, all nested shared-authoring jobs and CodeQL to actually succeed. Draft,
missing, failed, cancelled and skipped required work cannot qualify. No unrelated
platform regression, performance/load/media/Ops work, heavy image build,
production access, deployment or branch-protection change is authorized.
An exact post-merge main event classifies without repeating accepted work.
Other branches retain their existing routes.


### PR #339 audit repair and exact successful-component reuse

The candidate now includes only the necessary DOMPurify lock patch (3.4.14 to
3.4.17, official registry and integrity) and sanitizer regression tests after
product baseline 693fd489. Exact repaired product is
0814c74f49b5bd47ccec27966f9ff55e1b112011; the historical unsigned local reports
remain bound to 693fd489 and are never relabeled as new-dependency verification.
The new lock requires fresh frontend audit, app types, seven sanitizer boundary
cases, production compilation and the first built-candidate browser short flow.
The cases establish the application's sanitizer contract, not an old-failing /
new-passing exploit reproduction of every upstream advisory.

Official run 39903131297 failed at the frontend dependency audit. Its successful
backend job 120249077938 and CodeQL job 120249022752 remain component successes,
not a successful parent run. Reuse is limited to 24 hours, the exact repository,
branch, source 62949663112b0e19518b019f29fa691fdcd61d4d, actual successful stages,
unchanged backend tree and frozen consumer. Artifact 12479427511 is pinned by
name, size, owner, run, expiry and ZIP SHA256
`d97c94e132cba937d73a9860a6cf8246fd733ee9ad494fd0e5f2aad933193fe8`.
Only Actions reads the ZIP and its seven-check frozen-chain receipt; no compiled
artifact is relayed through the local computer. No database is launched again.
Application SAST reuse requires the only changed app source to be the new
sanitizer test; changed CI controls and the sanitizer directory receive fresh
CodeQL. Missing, stale, altered or unsuccessful evidence stops qualification.


The first repaired browser job 120256492847 failed before page assertions because
its fixture read Request.url as a property instead of calling Request.url().
The browser consumer is corrected; this does not change either application tree.
Official run 39905348476 frontend job 120256060844 succeeded with DOMPurify 3.4.17,
seven sanitizer cases, new-lock app types, unchanged HIGH audit threshold and
current Vite compilation. Its artifact 12481080458 (20,916,288 bytes) is pinned
by exact name/source/run/owner and SHA256
`8d104080ce0e553a5d399f7b2c21b1b3d5b5caed375313d452bbd67a583b517f`.
Only Actions restores safe regular paths from that verified ZIP and records each
file digest; compilation, sanitizer tests and audits are not repeated. The parent
failure remains failure. CodeQL job 120255988282 also succeeded: its exact prior
source range is checked, and only the five changed control scripts receive fresh
analysis. The original application scan remains independently bound as above.


Run 39906061284 browser job 120258397428 then reached the compiled document but
waited for the wrong product: `survey.localhost` is deliberately DEV-only and is
not a Survey host in Vite production. This is a consumer contract failure, not a
new application or sanitizer failure. The consumer now uses the canonical
presentation host and fulfills EVERY request from exact local dist bytes or
strict synthetic API responses, following the existing workspace-browser route
pattern. It cannot make network or production requests. Anonymous landing and
signed-in authoring states are distinct; the capabilities response and material
`name` field match the actual adapters. Actual pseudo-element day/night art,
mobile overflow, CSRF-bearing revision-bound save and exact material identity
remain required. Previous successful application qualifications are unchanged.


### School/Teacher one-shot affected qualification (2026-10-22)

`work/school-teacher-review-20261022` uses its own `school-teacher` route, not
an extension of A/B, reviewed-candidate, Training or Survey approval. The route
requires the frozen Survey-integrated base, retrievable product anchor and exact
complete raw diff. Unknown paths, modes, source trees, draft PRs, manual/full/probe
fallback, missing evidence and skipped jobs are rejected. Bindings remain disabled
until independent final review is complete. Actual PR source comes from the event;
a local-only merge SHA is never an Actions product anchor.

The four required groups are admission, frontend, connected and security. The
connected group generates Prisma once, compiles the affected backend once, proves
nonempty exact-base migration preservation using synthetic rows, runs only frozen
affected assertions, consumes same-SHA/same-run verified frontend/backend manifests,
executes the real restricted-principal School/Teacher browser journey with the
Chrome sandbox retained, and proves nonempty restore plus the existing runtime-role
and release-schema contracts. Existing business screenshot/session/keyboard matrices
are not replaced by the separately reported brand/theme/layout observations.

No historical local assertions are admitted after the frontend dependency patch.
The four direct brand/SVG assertions run against the final dependency inputs in CI.
Original unsigned local reports remain local and are not relabeled as CI results.
Reports expose allowlisted cases/statuses, diagnostic source locations and hashes,
not DSNs, credentials or private fixture output. Raw logs exist only temporarily
on the isolated runner and are not a persistent archive. The stable merge gate
also requires actual CodeQL success over the affected application and controls.
No public deployment, TLS/DNS, production media delivery or universal platform
regression coverage is claimed by this bounded route.

The School/Teacher qualification above is historical and does not qualify the later integration of PR #339. New source or changed frozen inputs must be rejected by the existing exact bindings; this merge does not alter their anchors, evidence identities, or reuse exceptions.
## Survey 手工验收前端修订的精确合并范围（2026-10-23）

用户确认 Survey PR #340 先合并，再由 Training #341 基于新 main 集成；本路线
固定 base `69497181d569d4a5f7d61cdab108b977894cf9b3` 与产品提交
`3f6d028e73da799aba4994e311240eaa9d4d1aff` 的 36 个前端路径，另仅允许
绑定明列的 CI/证据/本文档控制。完整 diff、模式、前后端 tree、依赖/配置、
原报告压缩字节/哈希与控制程序哈希逐项核对。未知输入、base 漂移或 source /
merge tree 不符直接拒绝；已知分支缺 marker 不回退 platform/manual/full。

已完成的本地 UI、导航、类型、构建与六组浏览器短流程保留原身份，明确标为
`reviewed-local-evidence`、`ciExecuted=false`、`originalExecutionSigned=false`。
历史部分通过、过滤、失败清理回调、后续修复及两次说明层遮挡失败均按原报告
保留，重叠断言不相加为同一轮。类型输入在 be73b6c6 → 3f6d028e 仅 CSS 变化；
较早断言仅在人工核对具体消费者未受后续修订影响的范围接纳。环境与源码哈希
是事后重建，未留存原执行完整 node_modules 字节清单，不补签或声称密码学运行
绑定。本地产物构建只作为本次合并证据，不提供官方镜像、生产扫描或部署资格。
浏览器使用隔离合成 API，不等同后端权限或真实数据库验收。

缺失项的唯一执行位置为 Actions：精确范围/拒绝/证据篡改/严格汇总契约、
变化 TS/TSX lint 与 bootstrap 语法、受影响前端及控制的 JS/TS CodeQL。
不重跑已通过本地应用检查，不启动 backend、DB、迁移、全单测、媒体、性能、
镜像构建/扫描或部署。依赖声明与锁文件未变，不以本路线扩大审计或产品权限。
本地仅核控制语法、绑定与工作流结构，CI admission/lint 各五分钟，SAST 保留
既有上限；约五分钟报告具体等待阶段。稳定 `merge gate / ready PR` 要求 scope、
完整 survey-manual-ui 与 CodeQL 实际 success，重算完整 checkout；draft、缺失、
跳过、取消、失败或输入漂移均阻断。精确 main push 只分类，不重复检查。

保留首次 CI run `39938370582` 的 scope 失败：浅 checkout 未包含精确 PR source
对象，尚未执行应用/接纳/lint/SAST。仅补精确只读 source fetch 和本路线 SAST
选择条件，后续仍核 source/merge tree 一致，不回退重型检查或省略断言。

第二轮 `39938691131` 保留 24 个通过控制及 1 个 main 场景夹具失败。修正仅
修改该测试的环境赋值；接纳其中 21 个输入未变的官方通过断言，重新核 run/job/
source、原日志 SHA256、逐 case 通过行及依赖源码相同；原 job 仍标 failure。
CI 只执行失败项和证据哈希输入变化涉及的 3 项，共 4 项；不以原失败 job 授予
整作业资格。新作业仍要求当前证据接纳、官方部分接纳、四项复验及 lint 真成功。


## Training manual entry PR #341, after Survey #340

The user authorizes frontend-only CI and merge after Survey. This exact candidate
is based on dd41e47cfea797fa03a31062a268e2357ea5f70e and product
3bcb634f0a0ba62ecfbe0972039e2dd8f87a3d18. Complete raw diff, modes, blobs,
source/merge trees, backend and protected dependency/config inputs are pinned.
Unknown paths, base drift and missing evidence stop; no full-platform fallback.

Eleven unchanged feature/AuthShell cases are admitted from the retained 78-case
Mac reporter, with the entire actual relative-import closure checked against the
old product. The 67 old shell cases are invalidated by Survey integration and
are not admitted as current. Original unsigned records remain reviewed-local-
evidence, ciExecuted=false and originalExecutionSigned=false; no retrospective
signing or complete historical node_modules byte identity is claimed.

Actions executes the new scope/rejection/evidence/gate controls, changed-product
lint, integrated app types, five direct login/enrollment/origin/shell test files,
one new integrated frontend compile and frontend/changed-control JS/TS CodeQL.
No backend, DB/Redis, migration, recovery, whole frontend suite, media/load, image
build or deployment. Actual browser or real-account MFA acceptance is not claimed.
The stable ready gate requires scope, the complete nested training-manual-ui
workflow and CodeQL success on the exact current source; missing, skipped, failed
and cancelled selected stages block. Exact main push only classifies. At five
minutes report the actual waiting stage; retry only affected or missing inputs.


## Participant access exact merge qualification (2026-10-23)

Only `work/participant-access-20261023`, main base
`3c8b0ad97f664b10fb0abcb5884606c18f9ac4be` and application product
`93009c77695de55107cde22f11421b114daa50d0` use `participant-access`.
Complete raw paths, modes, before/after blobs, both component trees, dependency
inputs, actual PR source and checkout tree must match. Unknown changes, missing
markers, manual/full/probe requests and base drift fail without platform fallback.

Reviewed local assertions retain original reports, failed invocations and filtered
rechecks. They remain `reviewed-local-evidence`, `ciExecuted=false`,
`originalExecutionSigned=false`; Git anchors and import closures were reconstructed
during review, not signed at execution. The initial authoring reporter precedes
five test-only asynchronous locator repairs: only those failed cases use the
filtered recheck; successful case bodies and fixtures were unchanged. Historical
complete node_modules byte identity was not recorded. Empty compiler logs alone
are not execution evidence; the final frontend type result includes the actual
observed execution-tool exit receipt, explicitly saved retrospectively.

CI verifies those exact receipts and their current imported inputs. Cases whose
imported modules changed after their earlier local result execute once in Actions;
current accepted cases do not rerun. Current HIGH/CRITICAL production lock audits
reuse the exact successful official School/Teacher security job and authenticated
artifact, unchanged package/lock/audit program inputs, original stage results,
ZIP SHA-256 and a 24-hour lifetime. Missing or altered evidence stops admission.
New scope/evidence/refusal contracts and changed application/control JS/TS SAST
execute in Actions. Backend production compilation emits the first merge-candidate
backend artifact; earlier local non-emitting type checks are not relabeled as it.
No full regression, DB/migration/restore, load/media tests or production images
are selected. Local browser measurements remain bounded synthetic observations.

The existing stable `merge gate / ready PR` recomputes the full plan and requires
actual scope, participant qualification and CodeQL success. Draft, missing,
skipped, failed or cancelled selected results cannot qualify. Main merge only
classifies the same frozen diff without repeating application work. This route
authorizes merge qualification only: no production deployment or production
artifact/security certification is claimed. Report the actual waiting phase at
about five minutes; do not append unrelated checks.

## Training assessment performance exact qualification (2026-10-23)

`work/training-assessment-performance-20261023` is based on main
`54ed73fdbef60b3b8d4998984c624c98c6bc99cb`. Its new exact binding freezes
all application/test/report blobs, both component trees, unchanged dependency and
schema inputs, the actual PR source and checkout tree. Only the enumerated
qualification controls can accompany that product. Unknown paths, modes, base or
source drift, manual/full/probe requests fail without a platform fallback.

Affected runner/media/persistence/selector tests, frontend types/lint and backend
compilation execute once in Actions. The local default and cognitive-enabled
Vite builds, real synthetic browser journeys and bounded CPU/query observations
are retained as `reviewed-local-build-and-browser-observation`, `ciExecuted=false`,
`originalExecutionSigned=false`. Input Git objects are reconstructed and reviewed
at candidate freeze; complete historical node_modules bytes were not captured.
Test-only preparation adjustments after compilation do not change compiled inputs;
the manifest binds the non-test frontend inputs separately from the qualified full
tree. This is not a generic signed execution framework or production image.

The unchanged official HIGH/CRITICAL lock audits reuse the existing authenticated
participant-access verifier, exact Actions run/job/artifact identities, matching
package/lock/audit-program inputs, ZIP SHA-256 and 24-hour lifetime. New scope and
refusal contracts and current application/control CodeQL remain required. The
stable merge gate recomputes the complete plan and requires actual scope,
Training assessment qualification and CodeQL success. Draft, missing, skipped,
failed and cancelled selected results cannot qualify. Main merge only classifies
the same diff. No full platform suite, image build, DB/migration/restore, media
worker test, heavy load repetition or production deployment is selected. Report
concrete waiting items at the five-minute threshold; do not add unrelated checks.

The first Training assessment run (`39975935257`, source `4144a1d3`) retains its
failed history: an overly broad workflow condition also selected the previous
participant route, and frontend types lacked backend Zod/Prisma declarations used
by the existing cross-tree examples. No frontend tests ran in that failed stage.
The exact backend job completed compilation and all three selector assertions;
the affected frontend lint stage also actually passed.

The follow-up fixes only qualification wiring and supplies those missing type
dependencies. It admits the exact successful backend job/artifact (ZIP digest,
original report, complete same component, command program, PR/source identities
and 24-hour lifetime) and the successful lint stage separately, retaining the
parent and type failure. It does not recompile or rerun those successful inputs.
The completed full application CodeQL job is verified by exact official metadata,
source trees, original configuration and successful init/analyze steps; only the
three new/changed qualification-control JavaScript files are then scanned anew.
Types and the previously unexecuted affected assertions must still actually pass.
No missing, failed or expired evidence triggers a full-check fallback.

Run `39977819707` retains 230 actually passed frontend Node assertions, three
failed assertions and three native-IDB-only jsdom skips. Successful assertions
are reused only when the complete relative import closure, source blobs, locked
tools, shared setup and configuration still match; affected/failed assertions run
once in the follow-up. A native Chromium check ports the three abort/quota/commit
assertions and adds two new answer/timing/seal assertions, all actually passed.
The unsigned local record binds the store, original tests and retained harness;
it is not relabeled as CI execution and does not turn the original skips green.
Current qualification requires the complete 233 Node-assertion union plus those
explicit native checks. Only the two affected application files and changed
qualification controls receive fresh CodeQL; other inputs retain the original
actual application scan. The failed history is preserved without a full rerun.
