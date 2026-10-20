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
