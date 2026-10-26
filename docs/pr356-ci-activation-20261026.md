# PR356 本轮修复的限定 CI 激活

用户此前在本对话明确授权“继续，收口，提交，激活 CI”；最新接管边界要求全部修复和精确候选先交 dot 独立 review。**未收到针对该精确候选的明确放行前，不 dispatch、不改 Ready、不 rerun，也不推送会触发 CI 的提交。** 以下为待审执行方案，尚未执行。保持 Draft；不合并、不部署、不接生产。验收目标仍为 `PR356-merge-qualification`，累计正式失败从 0 计；不能通过改称“限定验证”重置失败轮次。

**产品冻结锚点为 `9c43502680fe28c57c1edd64cc22a364beccb8e6`，最终控制提交及 dot 独立放行仍待完成。** 产品 tree `8aa9508a76bbe1649205cfda5cc1544145d23a3e`；backend tree `ec0e23bec3398992883f30125e380a845c0a9337`；frontend tree `87590586f2902baf14f0a94e8d444ac9e4b2e7e8`。完整 main→product NUL raw diff 为 340 个 source/文档＋11 个 control，共351路径，SHA-256 `aa192c9cf63db9a71cadf53b7cf0cec742d694114ca2e4391a8dd6b6b839d5b6`；mode/blob、两组件树及5个 schema/依赖保护输入仍严格校验。最终可审 head/tree 必须以 root 的控制提交和官方 PR/merge 元数据另行固定，不能用本产品 SHA 代替。

先前 a65 清单（333＋11）因 child/parent 与 lazy 问题作废，b5 清单（337＋11）又因 ordinary durable ACK 停用边界待修而作废；其实际执行记录原样保留。新 9c 明确覆盖这两个失效锚点，没有放宽 SHA/tree/unknown-path 或模式检查。旧锚点的控制检查不冒认9c的资格。

最初准备的历史产品锚点为 `48516ef5900cf9f711ea3cc852ac148cd221d7f8`；它已被后续业务修复取代，不能激活旧清单。main 为 `ff8471e529e7b3c56e1e20f17d1e2581040fc896`。最终激活 head 由官方 PR API 与实际 checkout 精确比对，不用占位 SHA。原清单的 317 个产品/文档路径是历史记录；最终完整路径数、mode/blob、两 application tree、schema/锁和控制路径必须从稳定产品提交重新生成并核验，base/main 或业务 tree 漂移即停止。之后仅允许本页及已列明 CI 控制改动，不改业务源码或普通复核文档。

## 本轮远端读取的权限边界

root 本轮重新读取 PR head `9c43502680fe28c57c1edd64cc22a364beccb8e6`、main `ff8471e529e7b3c56e1e20f17d1e2581040fc896`、Draft 和该分支 Actions=0 成功。重新读取 `branches/main/protection` 时，GitHub integration 返回 HTTP403 `Resource not accessible by integration`，状态为 **denied**。现有 required 名称/strict up-to-date 来源于先前成功实读记录和仓库实现，本次无法重新确认远端实时保护；交 dot 独审核对。没有绕过或重试同一受限目标、申请新凭据或修改安全设置。这是只读权限边界，不是 CI 失败，不写回虚假事故。

## 选择与复用边界

- 限定 source、与原门禁同口径的锁定依赖 audit（含开发依赖）、main 230→237 的真实旧 FINAL/组合报告升级及独立 dump/restore、当前源的 Training 四用例和真实 worker 一用例、两生产组件各一次编译、保留镜像上的 HIGH/CRITICAL 扫描、同一 frontend dist 的 Chromium 状态页、JS/TS 和 Python 的 security-extended CodeQL。
- Training 四用例的旧成功早于指导语/冻结/授权改动；worker 旧记录是失败及分段 continuation。不能把两组当作当前完整 invocation 通过，所以这两组在 Actions 作为缺失项执行。正常开关不允许 continuation，报告必须精确 4+1、零失败、零 skip。
- 已有指导语、实际年龄、UTC、批准 scope、状态 SQL/HTTP、前端竞态等开发证据保留原报告，含失败与过滤项；CI 只核原 reporter digest，不重复这些检查。它们标为 `retained-development-observation`、`ciExecuted=false`、`originalExecutionSigned=false`、`qualificationClaim=false`。没有补签执行，也不把类型空日志当成功证明。未建立本地→正式合并门禁通用接纳。
- 后端 Dockerfile 的真实 build 包含 Prisma、生成一致性和 TypeScript 编译；前端 production build 不冒充 typecheck。本地 app types/lint 仅保留开发身份；输入未变不重复，后续 UI 修复导致的必要复验保留其实际退出记录。若正式合并独审要求更强接纳，须单独解决，不能靠本限定 route 冒认。
- 两组件只各构建一次；worker 使用同一 backend 镜像。镜像 tar/inspect/log 与 frontend 文件 SHA-256 清单保留，扫描/浏览器是独立消费者，不编译。**仅在整个 images producer job 成功时**，下游失败才有现已实现的同 run 原产物下载路径；新 run 不支持自动继承。producer 或 database job 内部部分阶段成功后的合法续跑未实现，禁止整 job/整 run 重跑已成功工作。
- 浏览器只覆盖真实构建的接入状态：生命周期分离、退回动作、下一页/上一页、检索、昼夜/窄屏、无写请求与无横向溢出。HTTPS 由 Playwright 严格合成路由提供，验证 secureContext/crypto；不访问生产、不忽略证书。仅 Chromium，不声称 Firefox/WebKit 通过。

## 事件、范围与预算

使用已注册的 `CI` / `ci.yml`，单次 `workflow_dispatch`，ref 为原 PR 分支，`step_probe=none`、`full_acceptance=false`、`complete_training=false`。不同时改 Ready 或推无 skip 的触发提交。已阻止此分支手动转入 legacy/full/probe。其他分支既有路线不变；自动 PR 事件会拒绝当前分支未经规划的全量路线。

Source 5 分钟、audit 8 分钟、隔离 DB 20 分钟、两镜像 25 分钟、runtime scan 15 分钟、浏览器 12 分钟、各语言 CodeQL 30 分钟、汇总 3 分钟。作业并行；5 分钟后报告真实等待阶段。预算是上限，不是要求跑满；不追加全媒体、全 Ops、整站浏览器或压测。没有改变 reusable 50-reference 拓扑或 main required rules。

汇总名为 `PR356 / affected qualification (no merge eligibility)`，只在全部选中作业真实 success 时成功。现有 `merge gate / ready PR` 在本限定 dispatch 中 skipped，不出具虚假成功，main 的 strict required 保持。PR 保持 Draft；NFC10 内容验收、PHQ 家族 HOLD、原 Training 纵向及 356-01 基线、其余 opt-in suite 的正式资格保持未完成身份。该 CI 结果不能直接宣布整个 PR 可合并。

## 下轮 checking list

激活前重读 [Notion CI 常见错误清单](https://app.notion.com/p/404d27635a388186ac80de3593da05a5)，适用项为 CI-001/002/003/005/006/008/009/014/015/016/017/018/019/020 及 LOCAL-001/002。要点：完整隔离变量和源、schema-only DB、真实 ONLINE 生命周期、不空跑/skip、同产物、原断言、实际引擎与语言、不覆盖原失败。

若 Actions 真失败：先保留 run/job/attempt/head、首错及下游 NOTRUN；定向修复和验证，再在同一 Notion 页写回错误事实、原 ID/复发计数、精确修复、证据 digest 与下一轮清单，核实写成功后再激活。连续两轮不收敛暂停全量，换 SHA 不归零。本次没有发生 CI 失败时不虚构 Notion 条目。

这是开发修复与 CI 资格准备，不是功能内容验收、合并或上线。

## 激活前实际预检

候选拒绝契约 4/4；受修改分类器的直接消费者 29/29；固定官方 actionlint 1.7.7 在修正 job 上下文后无错误；新增 Node 文件与 Python AST 可解析。主 CI reusable 引用集合未增加。原始开发 reporter 25 份 digest 读回一致，其中 10 份含原失败，均原样保留。

main 旧数据夹具在现有独立本地 PG 的新库中准备。提前发现并保留：旧 fixture 缺 allowedProducts、重复写入已获批准的入口策略、两个 Survey 开关未完整接线；已按实际 main 源合同修正。仅继续未完成的公开准入→FINAL，真实生成了一份旧格式加密组合报告，并恢复当前 Prisma client。此为 setup 预检，不宣称 CI/230→237 升级还原已经通过；升级还原留到 Actions 唯一执行。失败库及各轮日志均保留，未删除或重写生命周期状态。没有把这些本地准备问题伪称 Actions 失败，因此没有创建 Notion CI 事故。

## 2026-10-26 独立复核后的产物 attempt 修正

成立：仅重跑失败的扫描/浏览器时，consumer 的 run_attempt 会变化；原先由 consumer 拼接 attempt 名称会找不到首次成功构建的产物。现由成功的 images producer 输出两个不可变 artifact ID、唯一名称和其实际 producer_attempt；consumer 只按 needs 中的 producer 原名称下载同 run 的不可变产物，核对原 head/run/producer attempt、镜像 tar SHA 或 frontend 文件清单。producer 第 1 次成功、consumer 第 2 次重跑仍指向第 1 次产物；不重编译。失败 producer 的输出不能使消费者或汇总成功。没有为了演示重跑而故意启动失败 CI，也不宣称已做过真实 retry。


## 下载前拒绝与历史身份（控制复核补充）

两个 consumer 在 download-artifact 之前核对成功 producer 的非空 artifact 名称/ID、同 run、同 source head、实际 producer attempt；名称必须精确等于该 run/producer attempt 的固定名称。producer 第 1 次成功而 consumer 第 2 次重跑仍用第 1 次输出；输出缺失或错误明确失败，不触发 download-all，也不暗自整 run 重建。ID 仅保留原产物身份，下载不接受用户任意指定 ID。GitHub 真正 retry 尚未执行，不宣称已完成远端重跑验证。

原 25 个 reporter 及其路径、SHA、统计和顺序作为固定集合保真，含原先 10 个带失败的 invocation；集合历史锚点仍是 48516ef 及原组件 tree。当前候选另外记录，不能改写这组历史身份。新增 followup reporter 另列 working-tree observation，明确没有当时完整源码 manifest、原执行没有密码学签名、无正式资格声明；其原始字节与失败/过滤项同样保留。汇总不把分段 PASS 相加冒认一次完整命令成功。

早前新增下载拒绝与历史保真契约2/2通过；本次9c绑定/收集输入变化后，完整8项source相关控制契约8/8，官方actionlint 1.7.7实际退出0。原29项未受影响分类器和业务检查没有重跑。


CodeQL 保留原 main 的 `upload: never`、`upload-database: false` 和 3500 MiB/2 threads；仓库既有流程注明 code scanning 上传端点未启用，不能将分析成功变成上传配置试错，也不为此修改仓库安全设置。JS/TS 与 Python 的 security-extended 分析仍实际执行，各自非空 SARIF 作为 artifact 留存；不把 job 成功说成零告警。followup 退出 receipt/log 用独立附件留原字节，不混入 Vitest reporter 或计入通过数。

source CLI 与 legacy 路由入口已去除顶层 await 的反向 import，保持相同固定分支拒绝。受影响的 source 4 项与实际 legacy CLI 拒绝 1 项为 5/5；日志保留。两镜像加载校验成功后，frontend 扫描即使 backend 扫描报错也继续收集各自结果，原 HIGH/CRITICAL 门槛和失败汇总不变，减少只获得第一份错误的无效往返。

## 合法合并资格链与原范围仍未完成

本限定 route 尚未接入 required `merge gate / ready PR`：该 job 明确排除本分支 manual dispatch，needs 不包含 PR356 jobs，`merge-gate.mjs` 也没有 PR356 的精确重算与证据接纳分支。现有 `qualificationOnly=true`、`mergeEligible=false` 是实际边界，不能将限定全绿或单个 skipped required check 作为合并资格。GitHub 可能接受 skipped/neutral 状态，故不能依赖 skipped 本身替代独立审查。main 的 strict up-to-date 保持；main/base 或候选改变后须重新判断精确合并 tree 和受影响证据，不能携旧基线资格合并。后续合法接纳链须另经独立判断，不在本轮放宽 required 或自动转广范围路线。

原范围来源及状态保留：

- [指导语内容契约](scale-import/instruction-content-contract.md) 明确 NFC10/OPT10 的内容采用和导入→预览→双入口发布→首答/刷新正反验收；平台路径修复不能代替具体内容验收。
- [原统一路线图](https://app.notion.com/p/403d27635a388157aa34c83821491347)，实读 last-edited `2026-10-26T04:05:04.134Z`：356-01 要求 355 完成后的准确新基线；UD-03 要求完整 Training 纵向及冻结 P/R 披露；UD-08 要求相同输入的资源与 SQL 归因，cold/warm 分账。旧 d01/main31d9 仍为历史，不是本候选新测量。
- [PR356 剩余开发与验收](https://app.notion.com/p/405d27635a388174b2d3c82e2968dfd4)，实读 last-edited `2026-10-26T05:39:05.547Z` 第 2 节：NFC10 内容依赖、PHQ9/PCL5/PC-PTSD-5 继续 HOLD、完整纵向与获准 P/R 覆盖及 356-01 未闭环。该页观察 head 为 48516ef，既有状态与职责来源可核，不能当作当前 head 的验收结论。

上述范围并非本轮新增必跑集合。最终哪些是本 PR 必需合并项、哪些保持后续依赖，需独立审查明确；本限定 CI 不静默关闭、删改或预写其 PASS。

## 独审补充：部分阶段失败须先停止

当前 `pr356-qualification.py` 是顺序 job driver，没有通用阶段续跑或部分产物资格接纳：

| 实际失败位置 | 现有能力与必须保留 | 下一步与禁止项 |
|---|---|---|
| backend 镜像成功、frontend 构建失败 | `images` job 失败；always artifact 尽量保留 backend tar、inspect、digest、命令/退出与 frontend 首错，dist producer 不算成功 | **停止整 images job rerun**。dot 先审核原 run/head/attempt 与部分原件，制定不重建 backend 的精确后续方案；当前脚本没有这种适配，不承诺通用复用 |
| 旧数据升级/restore 成功，随后 vertical 或 receipt 失败 | database 原始各阶段日志、退出、迁移/事实摘要及 reporter 留存；原失败仍失败，下游 NOTRUN | **停止整 database job rerun**，不重复已成功升级/restore 或另一旅程；由 dot 按实际错误制定隔离且只补缺项的续跑。既有 continuation/verify-only 不是一次正常完整 invocation 通过 |
| 整个 images producer 成功，仅扫描/浏览器失败 | 同 run needs 的原 artifact 名称/ID/head/producer attempt 与 tar/dist digest 是支持边界 | 精确候选和重试方案放行后，才可定向消费原成功产物；缺输出、过期、错身份均停止，无自动重建或跨 run fallback |

这些是已识别的设计限制，不是已发生的 Actions 失败；不为证明 retry 故意触发失败。实际失败再按 Notion 原页写回并核实，放行只适用于明确的候选和方案。

## 真实页面消费者与正式缺项位置

现有 `pr356-browser` 只消费同一 frontend dist 的系统接入状态页 Chromium 旅程。它不能证明教师选择/提交 C/P/R 或 Survey 默认逐题作答。相应本地原报告分别包括 `training-picker-fixed`（1 PASS/81 filtered）、`training-picker-legacy-ready`（3/79）、`training-axes-scope`（2/82）、`training-axes-saved-summary`（1/83）、`survey-instruction-green`（1/52）及精确组合指导语重查（1/2）；这些是不同 invocation 的 unit/contract 开发观察，不能相加成一次全旅程通过。

| 合并准备项/来源 | 可用开发证据与兼容性判断 | 唯一正式缺项位置/当前状态 |
|---|---|---|
| 教师 C/P/R 选择、COURSE/GENERAL 边界、添加/保存后冻结标签 | 上述 UI unit、teacher DTO summary/axisVersions 原报告与实际源 hash receipts；当前 child/parent 窄修仍需重新判断受影响输入，不自动废弃全部旧证据 | 已产 frontend dist 上的定向教师浏览器消费者，**尚未设计接线/执行，BLOCKED**；不把状态页绿当覆盖，不重复相同输入 unit |
| Survey 默认逐题指导语与精确组合路径 | 默认页面和精确来源读取原 unit/PG 观察分列，来源文本/显式 null/快照 hash 不跨域比较 | 同 dist 的定向 Survey 逐题浏览器旅程仍缺，**BLOCKED**；现有状态页 route 不提供该资格，独审须先确定所需 HTTP/冻结 fixture |
| backend/frontend types、变化 lint | 实际 command/exit/input hashes 与空日志同时保留；后端 changed-files diagnostics 不等于 whole-program 类型检查，Vite build 不代替 types | **正式接纳链 BLOCKED**；先审实际输入闭包和已有 receipts，未获准前不再运行同输入合格项；必要的缺项只选择一个主要环境 |
| 两完整 Training/worker 旅程、230→237 旧 FINAL 升级/restore | 局部与 continuation 原件不冒认整次通过 | 待精确候选放行后的既定 `pr356-database`，NOTRUN；发生部分成功后按上节停止而非整 job 反复跑 |
| required 汇总与证据接纳 | 上节已定位无 PR356 路由/重算/接纳，`mergeEligible=false` 保持 | **BLOCKED**，须由 dot 独审确定合法接纳方案；不改 required、不将 skipped 或限定汇总当 merge-ready |

## 原 11 个 opt-in 的其余 9 项

来源为 `docs/evidence/pr356-ci-preparation-20261026.json` 的 `suiteOptinWiring` 和各实际测试；旧表是当时接线快照，现已选中 vertical/receipt 两项，不能沿用“11项全未接线”，也不能说其余9项已获正式资格。各自既有开发报告保留、先按最终 import/callee/schema/fixture/工具输入审查可复用性，不把未接纳等同已测试失败。

| suite（backend/src/__tests__ 下） | 本候选正式状态与唯一补缺位置 |
|---|---|
| measurement-content/content-grant-time.postgres.integration.test.ts | BLOCKED：UTC/东京/洛杉矶原定向观察尚未正式接纳；先审原报告，不默认再次跑。若缺项，仅其专用隔离 PG 时间场景一次 |
| measurement-content/training-standard-connected.postgres.integration.test.ts | BLOCKED：原局部 P/R/撤权证据不代替当前完整覆盖；先核正式接纳，缺项仅该隔离 PG suite |
| scale/bibliography-axis.postgres.integration.test.ts | BLOCKED：文献轴开发记录不自动带来本候选资格；缺项仅该独立 PG suite |
| survey/catalog-discovery.postgres.integration.test.ts | BLOCKED：八轴/目录过滤开发证据先审输入；缺项仅其专用 PG 目录场景 |
| survey/catalog-instruction.postgres.integration.test.ts | BLOCKED：保留真实目录导入→冻结/公开指导语原件；未建立正式接纳，缺项仅该独立 PG/HTTP 场景 |
| survey/library-management.http.integration.test.ts | BLOCKED：公库管理原报告与权限边界先审，不由状态页浏览器替代；缺项仅该隔离 HTTP/PG suite |
| survey/onboarding-pagination.postgres.integration.test.ts | BLOCKED：分页 SQL/HTTP 原失败与定向修复分别保留；缺项仅该隔离 PG suite |
| survey/standard-approval-scope.postgres.integration.test.ts | BLOCKED：入口 scope 幂等/审计原证据先审；缺项仅该独立 PG suite |
| survey/standard-triplet.postgres.integration.test.ts | BLOCKED：Survey 真实链与 Training 证据分开，当前未接纳；缺项仅该独立 PG suite |

上表不是要求把九项全部再跑一遍，也没有给它们新增本轮执行授权。当前限定 workflow 未实现这些正式接纳/补缺路线，所以即使全部已选 jobs 绿，合并准备仍有这些明示缺口。Notion 22 项仍为适用性清单，不是新增22个必跑项。

main push 仍由现有 scope 按完整 main 事件差异选择，legacy 应用变化可能进入 `main / post-merge compile smoke`：安装/生成、Bundle 不可变内容检查、backend compile、frontend types/build smoke，既有预算35分钟。这会重新编译，并非已经实现本 PR 同产物、不重复资格检查的轻量复用；**目前没有 PR356 精确候选的 main 复用适配，按本次合并准备目标保持 BLOCKED 待独审**。此处没有新增自动路线或检查。post-merge 不能补合并前资格，也不能作为再次执行已合格同输入工作的后备借口。

## 可移交原件

Git相对文件 `.github/scripts/pr356-local-evidence.json` 已携原25 reporter、本轮57 reporter及131份独立附件，文件1,875,441 bytes，SHA-256 `b8f44aab9ea61b04e946d3ec7a781866ed9a055e8901b06343c4e939f563d5e1`。本轮reporter原字节714,930、附件原字节507,791；原25集合保持同字节且不重复嵌入。`portableRawIndex` 共213项逐一给出 `pointer`、`rawBase64Pointer`、`sha256`、原字节数及观察路径；全部pointer/原digest已读回核对。原绝对path只保留观察身份，另一节点只需Git文件，无需访问本节点目录。不存在的当时完整source manifest明确缺失，不补签。

本轮控制检查原件已打包，不只存在scratch。8项契约实际使用的证据输入SHA为 `8736a2f1982f4e458d8d1a5adda1252b460ffb48ebfa48eb4f950a7def83fe0e`；随后只补入这次控制输出和原NUL diff等附件，形成上述最终Git文件，完整字节回验通过，没有重新运行功能检查或把打包后的文件伪称当时已执行输入。receipt保留真实前后输入身份。

## Notion 22 项的当前适用状态

来源：[同一 CI 常见错误清单](https://app.notion.com/p/404d27635a388186ac80de3593da05a5)，实读 last-edited `2026-10-25T11:23:36.298Z`。这是本候选的适用性账本；`DEV_ONLY` 仅表明保留的本地观察，不是正式接纳；`N_A` 仅针对当前限定 lane，不改变整个 PR 的 required/原范围。共22项，不能解释为22个新增必跑测试。所有 Actions 实际执行仍为0。

| ID | 状态 | 来源、适用证据及唯一缺项位置 |
|---|---|---|
| CI-001 opt-in | BLOCKED | 原11项中只接线vertical/receipt；其余9项见上表。新增 entry/child/ordinary 隔离用例为开发观察，同样没有正式接纳。先审输入兼容性，缺项仅在获准的各自隔离PG/HTTP位置补 |
| CI-002 workflow表达式 | DEV_ONLY | 官方actionlint和8项控制契约有本地原件；真实官方source/所选jobs仍NOTRUN，唯一执行位置为获准的Actions |
| CI-003 前端类型闭包 | BLOCKED | 保留frontend实际types/lint command/exit以及backend范围诊断；正常backend依赖/Prisma准备已接线，正式证据接纳尚未实现，不用Vite或空日志代替types |
| CI-004 检查器过宽 | N_A | 本次未扩大安装检查器、扫描式检查器或输入范围；不借本条要求全仓新增诊断 |
| CI-005 FIFO/Redis串扰 | NOTRUN | planned DB使用独立服务、fresh schema与限定Redis namespace；真实隔离执行仍待Actions，不能共享有状态seed DB或清全局Redis |
| CI-006 身份/发布fixture | BLOCKED | 实际School/Teacher、21B原委托、entry政策、child/ordinary ACK原红绿观察分列；没有正式整链接纳，完整vertical/worker唯一位置仍为所选隔离DB job |
| CI-007 生成路由 | DEV_ONLY | 原FINAL22条/前端158条生成入口观察保留；当前没有新增路径注册，旧结果只覆盖其原输入，不充当权限或全CI证据 |
| CI-008 DOM/异步消费者 | BLOCKED | 教师C/P/R、Survey逐题的本地unit与状态页Chromium分离；正式定向浏览器消费者尚未接线，先独审fixture与同dist执行计划 |
| CI-009 真实路由/恢复 | BLOCKED | root真实PG/worker及ordinary single/batch/prestop、锁等待到lease失效的原件保留；不是一次完整当前正常invocation的CI结果，缺失整链仅在既定DB位置执行 |
| CI-010 Zod4草稿数组 | N_A | 无Zod升级或旧私有草稿空数组合同改动 |
| CI-011 整包认知测量指针 | N_A | 本限定修复未修改认知副本发布合同，不自动扩张认知验收；原required/认知内容依赖仍独立保留 |
| CI-012 ZIP背压 | N_A | 未改ZIP/Archiver/导出流，不追加无关吞吐或内存测试 |
| CI-013 旧响应回挂 | DEV_ONLY | 状态页竞态与分页原本地契约保留，其页面输入未因教师选择器修改而改变；正式接纳尚无，不重复原School回归 |
| CI-014 CodeQL超时 | NOTRUN | 当前JS/TS、Python security-extended仅接线，未执行；30分钟预算不提供超时放行，唯一位置为两个既定CodeQL job |
| CI-015 Firefox受限 | N_A | 本限定浏览器只选择Chromium，不伪称Firefox已通过；最终合并所需引擎范围仍待独审 |
| CI-016 WebKit依赖 | N_A | 同上，没有WebKit运行或安装动作，不预判故障或绕过环境限制 |
| CI-017 TLS/代理 | NOTRUN | Chromium方案使用严格合成HTTPS路由，不访问生产/忽略证书；真实浏览器验证尚未执行，唯一位置为同dist消费者 |
| CI-018 新范围/旧证据 | BLOCKED | 完整351路径已重新绑定，NFC10、HOLD、完整Training/P/R与356-01仍未自动闭环；最终范围由独审决定 |
| CI-019 首错遮后续 | DEV_ONLY | 原25与本轮57reporter的失败/过滤、receipt/log均保真；两扫描可分别收集，但job内部部分成功没有续跑适配，失败后必须停下由dot定向设计 |
| CI-020 精确SHA/交接 | BLOCKED | 9c产品与严格binding已准备；最终控制head/tree、官方merge元数据与dot明确放行仍缺。远端main/protection fresh读取HTTP403 denied，当前实时规则待dot核对，未绕过/重试；禁止dispatch/Ready/rerun |
| LOCAL-001 compact落表 | BLOCKED | 编码感知reader保留INLINE_ENCRYPTED/compact区别，不以facts为空判丢失；本候选完整正常worker正式执行仍NOTRUN |
| LOCAL-002 hash域混比 | DEV_ONLY | sourceDefinition/measurement/legacy hash按各自冻结payload核对，原报告与fixture修正轨迹保留，不将局部合同当全链资格 |

main exact复用适配、9项opt-in和types/lint正式接纳、required合并汇总均仍BLOCKED；本地控制全绿不改变此结论。真实失败才回写Notion；当前没有创建虚假CI事故，也没有放行任何再次激活动作。

## 本轮原件的精确索引

以下JSON pointer均在上述Git证据文件内，读取所指对象的 `rawBase64` 解码，并核对对象 `sha256` 即得原件；`portableRawIndex` 提供全部213项，不能用索引摘要代替原字节。EOF修订只去源文件尾空行，原receipt明确记录before/after SHA且未重跑，不重写当时测试输入。

| 原件 | JSON pointer | 原SHA-256 |
|---|---|---|
| 8项控制契约原输出 | `/followupAttachments/125` | `3e008bfb44a76381f51ae3bb9655d1f02cf63b2aca29a4543611d9f936e1b4bd` |
| 控制契约真实command/exit/input receipt | `/followupAttachments/126` | `b7b04712ebf941f14dbe6ea2b41996cd969eaf399187314ffe4ce09d3d64c180` |
| actionlint真实退出receipt（log本身为空） | `/followupAttachments/128` | `cf01e48e6587ca428e32e3e4a93aa5454feb1be6c1bde93ce85b2f1432d9c016` |
| main→9c产品完整NUL raw diff | `/followupAttachments/129` | `aa192c9cf63db9a71cadf53b7cf0cec742d694114ca2e4391a8dd6b6b839d5b6` |
| 实际Git路径/mode/blob/tree/5保护输入核对receipt | `/followupAttachments/130` | `0bb5d6620ea69b77bd51d0f82c4601083478d4aabc3f1be8d51f5d9cd4fd7324` |
| EOF格式兼容说明 | `/followupAttachments/47` | `416f6ccf5537e1b962d5876e3b96dd1defe092939721bb6dcfc518b475fc0bc7` |
| 不按标准后缀命名的真实frontend退出记录 | `/followupAttachments/57` | `c310f074dafb207886395094fba8eec2a332e936f171368fcecd388bcb6c39c9` |
| 真实锁等待到lease失效execution receipt | `/followupAttachments/70` | `83b6cfd53c1a755b863fece1946b1ad24a11ad651f94c48ce9918c9bfe3c1ee3` |

bindings文件SHA-256为 `ba133c4037698ce52668427418fafd099bc10510dfd4678e5f3002546a43f4f8`。已核实际产品diff含157个M、194个A，无删除、rename、symlink或可执行mode；本地验证不是官方Actions source job、不是最终控制commit验证。root仍须提交控制面并固定其真实head/tree，交dot基于精确候选独审。未获放行前继续Draft、CI=0，不dispatch、Ready、rerun或合并。
