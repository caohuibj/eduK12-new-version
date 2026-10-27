# PR363 最小 CI 接入方案（只读设计，未实现/未激活）

研究输入：main `7e6d7da4a01e4a42b410cf2dbdcfa76f11759fdc`，集成观察点 `385277be09228ace5d9ff8da1bbd8934d86cd471`，tree `bac6318936034741aa70b9427c240bb8e2f1b841`。标准 marker、真实延期配置仍在开发，**这不是最终候选冻结**。旧 `b91acec69` 六文件仍保持其 `6cf241d6` 历史快照，不改写成当前 PASS。本页不实施 CI、执行应用检查或更改 workflow。

建议：新 `pr363` 精确 route + 现有 `ci.yml` 内普通 jobs；复用现有执行步骤/报告检查原语与同 run 产物合同。不要新增 reusable workflow、建立新的签名/Q/admission 框架，或改 PR357/PR361 的精确身份来放行本 PR。

已读 AGENTS、release 统一规则、ci-runner-policy、实际 routing/workflow/executor 和 [Notion CI 常见错误清单](https://app.notion.com/p/404d27635a388186ac80de3593da05a5)。Notion fetch 返回页面快照 `as of 2026-10-27T07:37:30.221Z`；实际激活前 root 应重读当时清单，不能将这个历史读取当未来候选预检完成。没有修改 Notion。

## 已核实的可复用边界

| 现有实现 | 可直接利用 / 必须保留的限制 |
| --- | --- |
| `.github/scripts/content-scope.mjs` 的 `changedEntries`、`parseChangedEntries`、各精确 route 的 outputs 模式 | 完整 raw diff/mode/rename/delete 判定与互斥输出；未知差异停，不把新 scope 失败交给 platform fallback。当前代码没有 PR363 route；因此现在不能 Ready 来“看看会跑什么” |
| `.github/scripts/ci-artifact.mjs` 的 `treeDigest`、`verifyManifest`、`write/verify` CLI | 同 Actions run、同 checkout SHA、lockDigest、逐输出文件摘要的编译 dist；直接供新同 run browser 消费。CLI 明确要求 `HEAD===GITHUB_SHA`，不要把 source SHA 与 merge checkout 偷换。它不认证历史 job 成功、镜像 ID/ZIP 来源，也不支持跨 run/跨 head 接纳 |
| `.github/scripts/school-teacher-checks.mjs` 的 `verifyTestReport`、`verifyFreshManifest`、`snapshots`、`restoreStorageTables`、`auditComponents` | 可引用适用的导出纯函数（调用前核实际参数/副作用），或复用其已有步骤；`batches/freshBuild/migrate/restore` 是固定 scope/库名/manifest 的内部函数，不能原样 CLI 调用。`school-teacher-scope.mjs` 甚至把 fresh base 固定为 `ea887330...`，branch 固定为旧 PR338；其 fresh 模式不是可给 PR363 换 plan 的通用入口 |
| `.github/scripts/report-planning-checks.mjs::validatePgReport` | 精确文件集合/断言数/零 pending 的 reporter 校验适合全文件增量 batch；不能把 PR361 固定9/4项和旧 binding 当新资格。过滤 case 应用已有 `school-teacher-checks.mjs::verifyTestReport` 的 expectedPassed/expectedFiltered 严格集合 |
| `ci.yml::report-planning` 的 backend build → runtime cached package → Trivy；PR356 image jobs 的保存 builder/runtime/归档方法 | 复用真实生产 Dockerfile、官方源、一次编译、同缓存 runtime、镜像归档与安全扫描步骤。不要以 npm build 加第二次 Docker build 再编译。Docker cache hit 不是正式产物资格 |
| `ci.yml::pr357-connected`、`server-version/e2e/school-teacher-{fixture,browser,chrome,ui}.cjs` | 同产物真实 loopback API、restricted runtime、实际教育 cookie/MFA/CSRF、canonical HTTPS 静态文档映射、sandbox Chrome/CJK/keyboard/layout。旧 browser 默认只跑独立 Form/Scale，必须增加新家族目标；不能原样成功就称20行完整。Chrome/font 权限修整有旧特定授权，不能扩大信任路径或以关闭 sandbox 替代新环境准备 |
| `.github/scripts/pr356-artifacts.mjs` | 虽有 `officialMetadata/verifyArtifact`，其 artifactName、phase proof、环境变量和 plan 固定 PR356；**不能直接给 PR363 使用、伪造 PR356 名称或修改旧接纳身份**。`expectedFromOfficialOrigin` 也只返回只读原件证据，不授予 PR363 接纳 |
| `pr357-continuation.mjs`、`reviewed-candidate-*`、`survey-candidate-reuse.py` 等 | 均为固定原 source/run/job/artifact/精确变更的接纳，不是任意 PR cache。PR363 当前没有可直接调用的跨提交应用资格接纳器 |
| `server-version/scripts/release/qualify.py` | 消费正式 release-components 的固定工作流/组件/镜像/时效，供发布资格；本 PR 不凭旧 release 产物给新业务绿灯，不将其部署流程接进合并资格 |

只读遍历 `385277be` 的 `ci.yml` 及递归本仓库 `uses: ./.github/workflows/...`：**50 个不同 reusable 文件**，包含 if 不运行的静态调用。新增普通 job 不增加这个集合；新增第51个 `uses` 即使 if=false 也不可接受。最终控制变更应重算该静态图并语义 lint，不能只数本轮实际启动 job。

## 精确文件/函数接线清单

下列为待 root 批准后实施的最小修改位置；本节点未修改其中任何一个文件。三个新文件是当前 PR 的 scope/选择清单/执行胶水，沿用现有报告与 artifact 合同，不新增证据体系。

| 文件/调用点 | 具体接线 |
| --- | --- |
| 新 `.github/scripts/pr363-bindings.json` | 待标准 marker/延期配置完成再生成：base、真实 PR363/source branch、最终 source/tree/两组件 tree、完整 path/mode/before/after、schema/migrations/lock/config/flags/fixtures、选中 case fullName、主要执行位置、原结果/允许接纳坐标和未执行项。现在不写 enabled=true 或填最终 SHA。控制文件逐名限定，不能整个 `.github` 目录豁免 |
| 新 `.github/scripts/pr363-scope.mjs` 的 `pr363Plan/pr363Outputs` | 参考 report-planning/post356 的 route glue，用 `changedEntries` 核完整候选；保留 source/merge checkout 身份，源 tree 不符拒绝；同仓库/PR363/固定 base；draft 只观察，selected qualification 不运行；缺 marker/未知路径/base漂移/force-full/manual-probe 均明确拒绝已知 PR363，不回退全平台。main normal merge 仅核原父/tree与原正式结果，不复跑应用；其他 main/事件不得假定相同 |
| `content-scope.mjs` CLI（`refuseUnplannedPR356` 后、reportPlanningPlan 前） | 加 `pr363Plan`，增加 pr363 output；`ci.yml::scope.outputs` 暴露 `pr363_plan`。`ci.yml::scope` 增精确 source fetch，照既有 source/merge tree 读取，不 full-history 抓取当默认。所有 legacy 布尔输出明确 false、media groups空；`codeql` 只指当前 JS/TS作业 |
| `ci.yml` 顶层手动 full/probe、scope、merge-gate 与各独立自动入口的 job.if | 已知 `perf/four-entry-feedback-20261027` 的 workflow_dispatch 在 **job.if 层** 排除旧 full/probe producers，仅允许一条轻量拒绝；不能只靠scope内throw，因为probe可能不依赖scope已先启动。参照现有固定branch manual-refusal模式。逐个核独立 `situational-publication.yml` 等 PR/review自动入口是否会消费本差异；无关catalog字节完全一致时保留不适用事实，不伪造onboarding成功。普通PR选中route后与legacy jobs互斥 |
| 新 `.github/scripts/pr363-checks.mjs` | 只做 plan 重算、固定 phase → 精确命令调度、已有报告校验/产物校验、失败保真和最后严格汇总。借现有 `ci-artifact`、report validator/运行角色 scripts；**不另造通用下载缓存、签名、信任根、Q 或隐式 fallback**。尚无原成功 evidence 时填 NOTRUN；本地 passed 不在 fresh 集合重复选择 |
| `ci.yml` 普通 jobs `pr363-{backend-build,frontend-build,audit,pg,browser,backend-scan,frontend-scan}` 与 `pr363` aggregate | 与 scope 相连，PR非Draft且 route精确匹配才启动。全部 `runs-on: ubuntu-24.04`、contents/actions read、Node24.21.0、官方源。生产 build独立，scanner/browser失败不丢 producer。PG与browser相互不依赖，某个业务失败不遮住另一个消费者；aggregate检查所有所选结果严格 success |
| `ci.yml::codeql` | 增 PR363 route 的实际 source目录配置分支，不走 pr357 SAST-reuse 分支；保留 `security-extended`、JS/TS、30分钟及原 findings策略。当前产品/新控制都是 TS/JS/SQL；若新增 Python执行胶水，再加普通 Python analysis job/既有可用步骤，不能把 Python 漏掉，也不能只因仓库有不变 Python就再扫一遍 |
| `merge-gate.mjs::requiredChecks` 与末尾重算分支；`ci.yml::merge-gate.needs` | 新 route 要求 `['scope','pr363','codeql']`（若选 Python再包含实际 job）；重算完整 pr363 plan；缺/skip/fail/cancel/过期不成功。aggregate内部精确检全部selected子job，required context名字仍是 `merge gate / ready PR`，不改规则/protection。NEEDS用已有 `readNeeds` 文件/4MiB机制，不扩大 env 携带所有scope JSON |
| 现有 `content-scope.test.mjs`、`content-workflows.test.mjs`、`ci-topology.test.mjs` 及新增 route直接合同 | 仓库不存在独立 `merge-gate.test.mjs`；在新增 PR363合同中直接 import `requiredChecks/failedChecks`。最终只选新增/变化的控制 case：scope互斥、已知branch缺marker无fallback、manual拒绝、完整mode/blob/tree/base、错误source/报告/零测试/skip拒绝、required success、50 reusable静态图、producer artifact身份；不重跑应用旧绿项 |
| `server-version/e2e/school-teacher-browser.cjs`、`school-teacher-fixture.cjs` 或窄 `pr363-browser.cjs` 调度 | 推荐在旧 helper 保持默认场景不变的前提下增加显式 PR363选择；如旧文件固定 manifest 阻碍，窄调度引用 Chrome/UI helper，避免复制整套浏览器基础设施。新 fixture用实际来源注册/审批/分发/发布服务与正式 Run创建，不能 owner直接INSERT PUBLISHED来声称完整发布 |
| `docs/release/README.md` + `docs/ci-runner-policy.md` | 说明本次精确route、唯一执行位置、接纳实际能力/限制和预算，独审前不声称主干已支持。AGENTS只按需要更新指向，不引入新审批体系 |

不要把整个 `school-teacher-checks.mjs` 改造成新通用框架；可引用的纯函数不足时，在 PR363胶水写窄调用，保留旧执行器旧身份与断言。

## 构建/产物与失败恢复

1. **backend-build**：按 `report-planning`/PR356 image现步骤，同一 Dockerfile build stage编译一次；该 stage包含 `npm run build`/tsc，所以不额外运行相同 production tsc。导出 build测试镜像（含源码/Vitest/Prisma CLI）和 runtime镜像、实际 image inspect/ID、dist及 `ci-artifact write backend`；runtime由同缓存stage打包。先成功上传整个 producer产物再成功结束job，scan在另一job。
2. **frontend-build**：生产 Dockerfile build stage一次 `npm run build`，同缓存 runtime；提取同产物dist、`ci-artifact write frontend`。如前端类型/测试需要backend Prisma，只安装锁定类型依赖并generate，不启动DB、不编译backend。已有同输入类型/lint/test成功先按正式可接纳边界处理，不重复靠 Docker RUN 执行同一检查；若 build脚本内部重复，须提前核实际 script拆分，不能只改名掩盖重复。
3. **消费**：同 run `actions/download-artifact@v4` 按 producer `artifact-id`输出下载；dist用 `ci-artifact verify`；image tar核 SHA/inspect ID 后 load，PG测试跑 builder（无build），browser跑保存的backend runtime与frontend dist。不得消费未经验证的远端“最新成功”产物。
4. `ci-artifact` 本身不绑定 producer attempt/job成功。先采用同 run的 job `needs` 与 `upload-artifact@v4` id/digest输出，消费者比对固定 manifest/ID，保持 action内置digest警告不能被忽略。若需要不同attempt重新读取原producer，按当前原成功 job/attempt/artifact坐标通过现有固定续跑做窄独审接纳；当前没有PR363通用接纳器，不能承诺已经支持。首次job失败但build成功/upload失败时保留现场，停止自动重建，root决定窄续跑。
5. 不为本 PR开发跨commit镜像接纳框架。首次正式producer成功后：**rerun failed jobs**只重跑失败消费者，成功producer保持原 run/attempt身份；浏览器失败不重构建。shared ci.yml/fixture变化使哪些输入失效须逐项审，不让一次reporter修订把未变编译无故再跑一遍。

backend/前端完整组件已变化，不能接 PR361/357 旧 runtime或dist作新当前产物。缓存层可节省下载/编译工作，不代表旧run替当前run通过。镜像扫描始终针对本次保存的runtime，HIGH/CRITICAL、原ignore-unfixed政策不放松。

## 缺失真实 PG 与浏览器的唯一位置

先把最终传递闭包与现有本地原report作不相交映射：`四入口表`中的source-only格不能强制每格重跑；已通过且输入不变的原case不再执行。下面是执行器可接现有文件的真实约束，**不是此刻选中所有文件的请求**。

| 目标/位置 | 现有文件与环境要求 | 仍缺什么 |
| --- | --- | --- |
| 来源登记/治理 PG，`pr363-pg` 单处 | `education-tools/assessment-resource.publication.postgres.integration.test.ts` → `EDUCATION_ASSESSMENT_PUBLICATION_TEST_DATABASE_URL`，同 `DATABASE_URL`；实际C/P/R/原grant、review/publish、真cookie/MFA/CSRF、纯Form/材料权限等已有case | 最终standard marker、延期配置实际治理→正式Run→START链消费不能仅由原发布case替代。优先审 root已过原件，选最终变动/缺失case |
| Teacher runtime PG，同job独立库/进程 | `huiteacher/assessment-runtime.postgres.integration.test.ts` → **DB名字固定 `/pr363_runtime_test`**、restricted `TEACHER_RUNTIME_INTEGRATION_DATABASE_URL`、匹配同host/同库的 `TEACHER_RUNTIME_FIXTURE_OWNER_URL`。查询独立文件按其实际URL核。真实auth/CSRF/engines，无服务mock | 该fixture明确source production为owner合成数据，所以六条runtime成功不代表source/正式发布全链；不必复跑这六条来填治理缺口，用下面一条连通旅程补 |
| 报告/锁/元数据 PG，独立batch | `integration/educationAssessmentReport.postgres.integration.test.ts` → `PR363_FEEDBACK_DATABASE_URL`；`pr363-authority-locks...` → `PR363_AUTHORITY_LOCKS_DATABASE_URL`；`pr363-source-sql...` → `PR363_SOURCE_SQL_DATABASE_URL`。各指向自己disposable DB；不合并固定key/Redis状态 | 反馈fixture直接构造组织Run事实，不证明正式发布；最终延期配置必须由真实保存的冻结选择进入报告，不能用测试时手改JSON代替。原 PG17锁/撤权成功保留，不强制换PG16重验所有已过case |
| 新连通 PG/HTTP目标，`pr363-pg` | 用上述真发布fixture/服务导出**仅setup helper**，准备两个产品已授权合成工具。正式来源→Run track→preview/publish→consent/START→mixed Form/Scale/Cognitive/SJT子FINAL→parent完成→授权/延期报告→当前权限拒绝→原件唯一/重放持久化读回；每产品一条，family-specific负例复用已合格合同/PG。不要mock身份reader、授权SQL、worker或手置READY | 当前已有三个分段fixture不能拼成同一连通PASS，新的两条连通目标尚无实际最终path/fullName，冻结时必须补进batch；这是功能实现者唯一缺失接口，不由CI猜测 |
| 迁移/受限角色/非空restore，同PGjob的独立阶段 | 从main239 schema带旧FINAL/加密报告库→候选新迁移；root新增metadata/分发等实际表按最终SQL清单核权限、immutability、旧facts digest；dump/restore新delivery/原proof/旧FINAL后身份读回。沿用现有`runtime-role-defaults/contract`、`release-schema-contract`和原生pg_dump/pg_restore步骤 | `schema.prisma`未变不意味着无迁移（新表为SQL-owned）。最小schema8项成功不代替完整main升级。schema-only模板必须保留必要迁移种子行；fixture初始化不冒充旧schema升级成功 |
| 编译浏览器，`pr363-browser` 唯一位置 | 同候选backend/runtime+frontend产物；真实School和Teacher产品登录/来源配置/正式发布/START与恢复、native runner实际交互、mixed parent完成、获准反馈；至少一条真正保存的AFTER_COLLECTION配置，report未开→按真实开放条件READY。使用合成Training cookie只作拒绝负例、不能成功跨域。补task切换/迟到响应和mobile keyboard | 旧 PR357只Form/Scale，新的产品runner unit/mock不能替代。浏览器无需再次穷举所有PG竞争/库约束；新路径必须完整到页面与DB事实，不能拿receipt当报告，不能预置child完成跳过认知执行 |

PG16.15/Redis7.4.11为已有正式执行环境的沿用，不是要求所有已合格PG17断言换版本重跑。首选核原完整源码/fixture/schema/flags/工具/命令；适用并有受支持接纳的历史case只接纳，缺失连通目标在CI一次补。普通文档/工具 Ed25519入口不能签收应用历史；没有对应正式接纳实现时该case记pending，由root逐case独审确定窄接纳，不能默认重跑全部或伪装已接纳。现有固定历史接纳实现可以参考审阅方式，不能复制其已批准布尔值/身份。

## Security、CodeQL与证据复用

- 实际业务变更多在 backend authority/runtime/report/source 与 frontend两个产品/native host，JS/TS SAST应覆盖这些目录及全部直接共享callee（assessment-run/relational/policy、composite、cognitive、situational、measurement-content、reporting、middleware、API/shared components）。用**目录 roots + 显式控制脚本**，不要将单文件当Python extractor root。保留security-extended，30分钟，原findings与审查边界；具体最终scope按完整改动闭包生成，不泛扫无关媒体/Ops。
- frontend/backend dependency audit：若锁、npm工具、源配置、时效和已有正式scan输入一致且现有接纳确实支持，引用精确官方原run/job/artifact；否则只补audit一处，不重复业务测试。当前不能凭“锁未改”直接宣称PR357 audit仍有效；旧artifact时效要实际核。
- 两个当前runtime镜像各扫描一次，scan不在build job内，失败后只重跑这个消费者；builder不作为生产镜像额外扫描。部署/CodeQL/Trivy任何一个状态不能代替另一个。
- root已过的精确source/授权、runtime、report、UI局部测试，按原reporter+原FAILED/filtered+输入闭包逐case清单接纳，后续marker/延迟改动只失效命中的消费者。不能声称本页已认证新本地原report，或把b91历史表当当前合格矩阵。
- Survey/Training只因实际共享callee变化选中对应已有case，沿旧20行矩阵定位；不重开原vertical4/ordinary4全链来“更放心”。若新marker明确改变standard source消费，至少锁一条真正相交的exact标准路径与原撤权拒绝；对应旧case能否接纳由该新输入决定。

## 预算、Notion适用项和实施停止条件

建议 job上限/通常目标：scope+新控制8分钟/1–2；backend-build25/5–10；frontend-build20/3–7；audit10/1–3；pg20/4–8；browser20/4–8；每镜像scan15/2–5；CodeQL30/10–25；aggregate/gate5/1。冷下载/排队不计承诺收益。通常关键链约15–30分钟，上限按 `scope8 + max(build25 + max(pg20,browser20,scan15),codeql30,audit10) + aggregate5 + gate8 = 66分钟` 保守说明；不是“25分钟整个PR就结束”。五分钟报告实际等待阶段。

Notion适用：CI-001（每suite独立opt-in/guard）、002（job/step上下文与50静态reusable图，另保留root告知的PR357第51个历史事故）、003/004（frontend跨包type/Prisma及检查器范围）、005（固定注册/队列/Redis隔离）、006/011（真实角色/源发布/measurement复制指针）、007（路由生成器check，按最终新增路由核）、008/009/013（native宿主、current-unit/receipt、迟到报告）、014（完整CodeQL预算）、017（canonical HTTPS/真实证书不绕过）、018/019/020（新业务范围、下游不被首错掩盖、精确SHA/原件）。这些是待最终候选核查项，**不是全部本候选PASS或额外必跑全套**。CI-012导出背压、015/016 Firefox/WebKit仅在最终范围确有消费时选；本方案Chrome不声称覆盖其他引擎。

实施完成/激活前 root仍需补：最终marker+真实延期配置；最终source/merge/base/tree全量diff；上述两个连通消费者真实文件/fullName/环境/预期reporter集合；逐case旧证独审/真实支持的接纳方式；最终CodeQL roots；每job唯一产物与有效回退/失败续跑边界；当前Notion checklist记录。任一缺项停在计划/NOTRUN，不把Ready或手动platform/probe当首轮试错。

本次实际只读：fetch `385277be` exit0；Git源码/差异读取；递归workflow静态引用计数=50；Notion fetch成功。一次文件检索含不存在的 `.github/scripts/scope-paths.mjs` 返回2，后续改为读取真实 `content-scope.mjs`，没有执行检查器。没有运行应用、PG、browser、build、audit、scan、CodeQL或CI；没有修改任何workflow/源码/旧六文件。
