# PR363 最小缺项验证与消费者依赖

配套 [20 行矩阵](coverage-acceptance.md)。此页全部新增执行建议为 **NOTRUN**，不是新 required gate；不修改 workflow，不激活 CI。基线与每份原件身份见 [inputs](coverage-inputs.json)、[official metadata](coverage-official-metadata.json)、[case pointers](coverage-evidence-index.json)。

## 现有测试的精确断言

下表路径除注明 frontend 外，均位于 `server-version/backend/src/__tests__/`。行号绑定核查快照。**存在测试文件不等于实际执行或正式合格**；没有原 report 的项只用于将缺项指向已有用例，不先重跑。

| ID | 文件 / 精确用例或位置 | 覆盖阶段与实际限制 |
| --- | --- | --- |
| T1 | `survey/research-final.contract.test.ts:60,72,82,138`；`survey/checkpoint-query.contract.test.ts:30,51,73`；frontend `src/survey/SurveyPublicApp.final.test.tsx`、`src/survey/checkpoint-recovery.test.ts` | 研究 frozen scorer、隐藏/缺失、拒错源、checkpoint 权限/revision、UI FINAL；合同/UI 有 mock，不能作真实 PG 证明 |
| T2 | `survey/standard-triplet.postgres.integration.test.ts`（E1 accepted history 10 个精确 case 指针）；`measurement-content/survey-participant-feedback.test.ts:36,68,74,153` | 精确来源治理及 Scale/SJT feedback allowlist、AFTER_COLLECTION、冻结文本图片；后者 mock，非浏览器或完整研究准入 |
| T3 | `survey/research-cognitive.postgres.integration.test.ts:115,147,157,177,192,202,244,253`；`survey/research-measurement-result.contract.test.ts` | 独立研究 Cognitive admission/recovery、精确 slot/epoch、并发 FINAL/改摘要、restart 竞争、parent 引用、withdrawal；结果合同另测反馈。默认没有专用 URL 会 skip，不准称通过 |
| T4 | `survey/situational-native-flow.postgres.integration.test.ts`；`survey/situational-cognitive-mixed.postgres.integration.test.ts:246,274`；`survey/governed-native.postgres.integration.test.ts:59,106,133` | staged SJT→Cognitive 及逆序、原 child/prefix/epoch；native 合成发布/撤回/并发/配置报告。每套原 fixture/环境不同，不能混成同一完整绿调用 |
| T5 | `integration/instrument-final-submit.postgres.integration.test.ts:838,892,927` | Form section bulk FINAL、匿名/认证、并发 section 与 parent terminal；不是教育产品当前人口/entitlement 证明 |
| T6 | frontend `src/components/__tests__/FinalCompositeAssessment.test.tsx`，E2 frontend ZIP `/raw/testResults/8` | 恢复草稿、存储失败、已接受 FINAL 后下一页失败不改称失败、Form 无 Scale provenance；mock transport，不能替代真实持久化 |
| T7 | `measurement-content/dot356-standard-vertical.postgres.integration.test.ts`；`scale/pr356-entry-boundaries.postgres.integration.test.ts:34,38`；`scale/pr356-entry-lifecycle.postgres.integration.test.ts:10` | E1 fresh vertical4 正式完成真实安装/试验/ONLINE/21B/发布/FINAL/P-R；三个 entry 历史 case 保留各自身份，不从旧 pending 文档推定未跑 |
| T8 | `integration/instrument-final-submit.postgres.integration.test.ts:641,672,733,754,786`；`cognitive/unknown-task-lifecycle.postgres.integration.test.ts`、`cognitive/report-reading.postgres.integration.test.ts` | raw trial bulk、provenance/replay、旧 hash、大小限制与报告；后两文件的实际原报告需另定位。Shared runtime 不等于 Teacher/School child 权限 |
| T9 | `composite/situational-bundle.postgres.integration.test.ts:501,630,669,698,758,847` | exact frozen slot、parent repair、PUBLISHED/RETIRED、并发一致/冲突、Scale+Cognitive+SJT mixed lifecycle、错用户/旧 slot；真实共享服务但 registry/fixture 有合成替身，不能代替教育发布者和产品 cookie |
| T10 | `situational/situational-standalone.postgres.integration.test.ts:135,235,258`；`situational/situational-final-submit.contract.test.ts:18,30` | start/resume/FINAL/replay/history、跨用户/陈旧版本、范围端点/并发；合同输入验证是 unit，和 PG 分开 |
| T11 | `composite/pr356-ordinary-receipt.postgres.integration.test.ts:37,75,99`；`integration/report-outbox.postgres.integration.test.ts` 的 accepted STANDARD actual worker case | E1 ordinary-harness4 和 exact-worker1 的精确 fullName、exit0、原 job/artifact 已索引；涵盖 ACK 后急停可完成、ACK 前拒绝、真实 lock-wait 后 wall clock/lease、过期 lease 恢复。不能扩大到任意 native/Form whole |
| T12 | `integration/educationPrivateFormPublication.postgres.integration.test.ts:130,144`；`integration/campusActivity.postgres.integration.test.ts:160,191,204,222,553` | 原精确来源/混合 track 发布、撤权原子回滚、Activity/班级审批/整个人口；不表示新的 education-assessment namespace 已接入 |
| T13 | `integration/educationPrivateFormExecution.postgres.integration.test.ts:91,128,186,207,225` | School 原私有 Form、Teacher 真 cookie/CSRF/list/START/parent/typed FINAL、停收续答、deny/关系撤回、无需后续 GET 完成 Run。源码有强用例；本次只查到 E2 对应浏览器，未认证此文件正式原报告 |
| T14 | `integration/educationLibraryCollectionStop.postgres.integration.test.ts:27`；`integration/educationPrivateScaleCollectionStop.postgres.integration.test.ts:39` | 两产品新 START 停收拒绝、已经入场 FINAL 按冻结规则完成；E2 backend JSON `/reports/3` 私有、`/reports/4` 公共库 |
| T15 | `integration/educationLibraryPersonalReport.postgres.integration.test.ts:44,116`；`integration/educationPrivateScaleReport.postgres.integration.test.ts:48,101`；`integration/educationLibraryObserver.postgres.integration.test.ts:36` | E3 正式 default=3文件9项、compact=private4项。真实数据库/START/scoring/FINAL/当前权限和冻结结果；报告 HTTP 的 auth middleware、媒体传输 mock，不能证明实际 cookie/素材系统。E2 私有报告原 reporter 在 `/reports/5`、`/reports/7` |
| T16 | `campus/cognitive-child.routes.test.ts:96` 起；数据库/auth/session/FINAL/media 皆明确 vi.mock | 真实 Express+CSRF 分派、SQL 结构、错 domain/角色/child 拒绝、completed 不泄指标；**不是当前 SQL 真正返回授权、真实 child FINAL 或 PG 并发通过** |
| T17 | frontend `src/school/SchoolCompositeRunner.test.tsx:34,71,146,197`；`src/school/SchoolStudentTasks.test.tsx` | E2 frontend `/raw/testResults/4` 和 `/6`：校园 Cognitive adapter 只用校园路径、缺 session 拒绝、observer 提示、receipt/current-unit、Form 不读报告；CognitiveRunner 本体被 mock，不证明浏览器执行认知 |
| T18 | `integration/huiteacherFormRuntime.postgres.integration.test.ts:46`；`integration/huiteacherStudentEvaluationRuntime.postgres.integration.test.ts:47`；`reporting/reporting-protected-feedback.test.ts:55,74` | 内置 Form canonical task/唯一 FINAL、冻结班级学生评教师、群体 distinct respondents/隐私下限。与私有 Form 是两个协议，不能用一份成功覆盖另一份 |
| T19 | frontend `src/huiteacher/HuiteacherMyScaleTasks.test.tsx:25,38,45,51,65,76`；`src/huiteacher/HuiteacherCompletedEntryGuards.test.tsx` | E2 frontend `/raw/testResults/1`：已绑定 CLOSED 恢复不 START、未绑定 CLOSED 拒绝、新 START、completed feedback、未知格式不暴露、receipt 请求；新自动完成读取生命周期须只补增量 |
| T20 | `assessment-run/teacher-personal-policy.test.ts`；`education-tools/assessment-resource.contract.test.ts:16,20,24,30,36`；`education-tools/private-tool.teacher-route.test.ts` | 本基线只有 SELF narrowing、DRAFT source/hash/explicit none、真实路由 mock 分派；没有真实新来源发布/运行/报告。已有本地结果在 contract-progress.md，不能复跑以充数或称功能完成 |

## 最小新增目标（先补缺实现，再固定非空选择）

这不是 20 条一律重跑。用共享机制的等价分区证明，保留每个产品独有的身份/组织/observer/群体 Form/延迟规则。下列建议由 root 最终实现者落实，文件名是**建议，尚未创建**，不能将不存在文件传给 Vitest 得到空绿。原则上 N1–N3 承担新增能力；N4 承担新页面/实际 identity transport；N5–N6 仅被最终差异消费时选中。

| 目标 | 最小实际 fixture / 断言 | 唯一建议执行处 / 预算 | 关闭矩阵缺项 |
| --- | --- | --- | --- |
| N1 来源→正式任务 | `integration/educationAssessmentDelivery.postgres.integration.test.ts`：用真实已授权合成来源登记/独立 review/发布，School/Teacher × 单 Cognitive、单 SJT、mixed BUNDLE 参数化；真实组织权限/原授权证明、C/P/R hash、许可/年龄/受众、材料资格。错 product/org/version/hash、DRAFT/RETIRED 新用、替补管理员不能修复原授予者撤回；并发撤回须在组织/source 锁后复核。不直接 INSERT PUBLISHED/approval 来冒充治理旅程 | root 冻结后的隔离 PG16.15，约 3–5 分钟；root 新 source 纯函数/最小schema已过部分只接纳匹配断言，不再跑一次 | 13–15、18–20 P/A/S；T12/T14 的新命名空间消费者 |
| N2 正式 START→恢复→FINAL | `integration/educationAssessmentRuntime.postgres.integration.test.ts`：真实 Run publish/consent/START 后获得绑定；双产品单 native 各一条，混合 Form→Cognitive→Scale→SJT 代表链各一条，反序/相邻同家族/多 Form section 的单位顺序与绑定用轻量合同分区。刷新同 parent/child/epoch，保存后重进与中断 native 恢复；丢响应后重放、并发同键同摘要、改摘要/旧 epoch/替换 slot 拒绝；partial child 不提前完成 parent。完成后原件/结果/snapshot/Run 各唯一，读回 frozen C/P/R；旧源停收与当前紧急撤权按已有规则分开 | 同一隔离 PG16.15、真实产品 Express 路由；可复用 N1 产出的合成 fixture/setup，**不能重跑 N1 造同证**。约 3–5 分钟 | 13–15、18–20 S/R/F/I/D |
| N3 获准反馈与材料 | `integration/educationAssessmentFeedback.postgres.integration.test.ts`：消费 N2 已完成结果；Cognitive/SJT/mixed 的明确 summary 合成报告、report=null/NONE、PENDING、AFTER_COLLECTION、WITHHELD、READY；读报告不重新计分。前后当前权限核查：REPORT_READ deny/成员过期/entitlement/关系变化、等待期间撤权；错 report family/hash/受众、未选 metrics/原始 trial/私有字段不露。stimulus asset 与 report asset 互不继承，跨 org/session/slot/entry 下载拒绝，当前权限失效后图片也拒绝 | PG16.15 + 本地合成 storage adapter；mock 字节只能证明选取/拒绝，真实加密对象存取若受新路径影响须另用隔离存储，不称 mock 已验附件。约 2–4 分钟 | 13–15、18–20 V/D；12/17 若 shared report reader 改动则只选相交 T15 |
| N4 产品身份与编译浏览器 | 新 Teacher shared host 的 unit 覆盖每家族 transport、current-unit、parent 完成、晚响应/切换身份、失败可重试但不重新 FINAL；School 对应增量。用一次生产前端产物 + 同候选 backend 验 School/Teacher 各一条 mixed native+Form/Scale 完成/刷新恢复/反馈，至少一条有获准延迟反馈；真实教育 cookie、CSRF 与 canonical Origin。反例使用隔离生成的 Training cookie/相同 userId、其他 org/attempt/session，证明教育接口拒绝；**不能用 Training cookie 走成功正例**。真实浏览器执行 native runner，不 mock child 或给通用空 API | 经 root 独审后 CI 一个编译产物消费者，约 3–5 分钟；E2 输入未变的旧 Form/Scale UI 不重跑。窄屏/键盘只选新宿主界面 | 13–15、18–20 身份/参与/可见反馈；12/17 完成自动读取增量 |
| N5 共享直接消费者 | 仅当最终改动进入共享 freeze、startAuthority、collection、source identity、currentPopulation、report/storage 闭包：按下面依赖表定位 Survey/Training 相交的现有精确 case。默认优先 E1/E2/E3 原证，不能因“shared”二字重跑全部 family。新增错误 namespace/release 补窄合同；运行期才暴露的分派/读写缺口补单一实际 PG case | root 指定一个主要位置；先核证据接纳机制是否支持此跨提交/新分支，未支持时记录具体缺项，不冒称旧绿灯适用；约 1–3 分钟增量预算 | 01–12、16–17 的实际受影响断言 |
| N6 新 metadata 迁移/恢复 | 仅 root 新表/权限/不可变触发器实际差异：从 main schema 带一条旧 FINAL/报告的非空库升级；旧事实 digest 未变，新 delivery 精确行和 grant proof 可读；restricted runtime 权限；独立 dump/restore 新表后 identity 可读、immutability/constraint 保持。按真实差异决定，不要求无关媒体/全平台灾备 | CI 单处一次，约 2–4 分钟；新迁移不继承 E1/E2 旧 schema 成功；fixture schema 初始化与升级资格分账 | 新 metadata D 与旧数据兼容 |

对任意组合，最低证明不是把四个 runner 各跑一次：须覆盖统一有序 unit 集、重复家族、Form section 与 native 跨边界、跳过/拒答、提前/延后 child、最终 terminal predicate、部分失败恢复。剩余排列可以在同一个 frozen flow/slot selector 合同中证明等价；发现组合依赖时才加该边界的 PG/浏览器例，不预先强制 15/31 种集合全量执行。

## 消费者依赖与证据失效

| 变化输入 | 直接消费者与具体故障 | 优先证据 / 只补什么 |
| --- | --- | --- |
| `education-tools/assessment-resource.contract.ts`、新 repository/authority、exact key | `assessment-run/resourceAuthority.ts`、`registeredResources.ts`、`educationLibraryContext.ts`、`publish.ts`、`startExecution.ts`、`scientificProvenance.ts`；只注册没发布、错入口/组织通过、身份被当授权 | T20/root source 单元只证明本身；N1 真实调用者接线。为 education-assessment 单设来源分支，不能让 Training 来源选择器推断教育权限 |
| `composite/training-content-binding.ts`、C/P/R release reader | Composite 发布/START、Survey measurement source 与既有 Training exact freeze、native/scorer；“latest”替换 frozen P/R、null report被猜默认、原授权根被替补管理员取代 | E1 vertical/history 原根/冻结证先核输入；必要 T7 中一条真实 shared consumer + S/R null/family/组合合同，不重复 whole4 全链 |
| `assessment-run/currentPopulationAuthority.ts`、start/final consent | School Form/Scale/native、Teacher 内置/私有 Form/Scale/native、report-before/after 权限；组织/角色/consent 失效仍能操作，或错误阻断既有 FINAL | T12/T13/T14/T15/T18 分支逐项核；新 namespace 用 N2/N3，旧家族只有命中改动分支才补该反例 |
| 新 Teacher child 路由/共享 frontend host | Teacher list/START/current-unit、CognitiveRunner、SituationalRunner、Form/Scale、media API、回执恢复；sessionId 冒充权限、前端走 Training transport、重复 FINAL、partial parent提前反馈 | N2/N4；School 同 host 变化时只选相交 T17，Training client 若未消费新 adapter不追加浏览器 |
| 教育通用 report projector / feedback lifecycle | School student、Teacher self、report images、observer/群体 Form、两次 current authority read；完成错误解禁、原始 trial 泄露、迟到旧身份响应复活 | N3/N4；T15 default/compact 的实际相交用例 + T17/T19 对应增量，Form/observer 保持无个人量表读取 |
| runtime storage/facts/whole worker 实际变化 | Survey FINAL/cognitive result、Training同步/whole、教育共用 FINAL/report；重复原件、坏 compact读回、ACK无法恢复 | 若没改引擎就接纳原证而不跑 T5/T8/T9/T11；真改按 affected family/format 选一处实际 PG/worker。每次 preserve 原 failed run/attempt/reporter |
| schema/SQL migration/权限清单 | 新 delivery reader/authority 和原 canonical tables；升级/受限 role/restore失效 | N6。root 负责相关文件，不由本分支改 runtime-table-policy 或 CI |
| frontend/backend lock/config/flags/fixture/Prisma client/CI controls | 消费这些输入的全部资格，不仅产品源函数正文 | `coverage-inputs.json` 只绑定 Git 源字节，未覆盖生成环境；最终须补真实 lock/tool/生成物/flags/fixture/command 全闭包。不同 PG17/PG16、本地/Actions不混称同产物 |

## 建议最终 CI 选择

1. root 完成本地汇总与独审后固定 base/head/tree、完整 diff、消费者、fixture/schema/lock/config/flags、原证据坐标、selected cases 和唯一主要执行位置。先读规则要求的 Notion checklist，再决定实际激活；本任务不读写 Notion、不激活任何 run。
2. 精确 source/完整性校验 + 新控制的必要合同；只运行 N1–N6 中实际缺项。JSON reporter 必须出现指定 fullName/参数化实例，不能 numTests=0、pending/skipped、filtered 必需项。failed invocation 的已通过 case 仅按受支持且独审的具体规则接纳，不能把失败整 job 变成功。
3. 变化前/后端各构建一次；backend 生产 build 若已包含同输入类型编译，不另跑一次相同 tsc；frontend 按生产构建实际范围选择类型/lint。依赖 audit、镜像原阈值 scan、SAST按实际变更/时效与现有规则选中；没有省略所选检查或安全阈值的建议。
4. 一个被核验的前端/runtime 产物供 N4 消费；报告保留实际 producer/consumer 不同身份。原 PR361 exact route 只支持其固定36路径，不能把 PR363 混合前后端/DB 差异放入旧 route。PR356 的同 head/same-tree admission 和 PR357 的固定 continuation 也不是任意跨提交复用 API。
5. root 冻结后依据真实拓扑给总预算；上述估时是单目标增量，不承诺相加即最终关键链。五分钟报告等待阶段。失败先留 run/job/attempt/SHA/首错/未执行下游，按规则写回后只补失效项。不得全平台重跑、dispatch/probe 试错、改 required gate/protection 或部署。

## 可执行命令映射（均为示例，未执行）

所有业务命令在 `server-version/backend` 运行，使用锁定依赖和当前生成 Prisma。`DATABASE_URL` 与所选 integration URL 必须指向同一已审批的 disposable loopback 库，测试会写数据库；不得默认落到开发/生产库。CI-only fixture 按其原 guard 仅在真实 Actions 运行，不能在本地设置假的 `GITHUB_ACTIONS/CI_POSTGRES_SERVICE_ID` 绕过。

```sh
# 仅当 T15 某个原成功断言确因当前消费输入变化而缺失时选它；否则复用原证。
node node_modules/vitest/vitest.mjs run \
  src/__tests__/integration/educationPrivateScaleReport.postgres.integration.test.ts \
  --testNamePattern '^Private fixed-version education actual FINAL and report privacy TEACHER preserves actual FINAL feedback and version-pinned image after author edits/revocation, never broadens report rights$' \
  --maxWorkers=1 --reporter=default --reporter=json --outputFile="$COVERAGE_EVIDENCE_DIR/teacher-private-report.json"

# Survey Cognitive 如果最终改动触及此恢复/重放边界，使用现有精确用例；不是默认重跑。
node node_modules/vitest/vitest.mjs run \
  src/__tests__/survey/research-cognitive.postgres.integration.test.ts \
  --testNamePattern '^Survey cognitive PostgreSQL authority, immutability and serialized lifecycle commits same sealed FINAL once under concurrent retry, rejects changed payload, preserves raw once$' \
  --maxWorkers=1 --reporter=default --reporter=json --outputFile="$COVERAGE_EVIDENCE_DIR/survey-cognitive-final.json"
```

第一例的原 `it.each` 实例 fullName 可从 E2 backend ZIP `/reports/5/report/testResults/0/assertionResults/1` 读取；第二例由现有源码 `describe`+`it` 确定，正式执行后仍须验证实际 reporter 为1选中PASS，不能用正则没匹配推断成功。N1–N4 建议文件未存在，因此此处不给会空跑的命令；实现者提交后把真实 path/fullName 加入精确执行表。

## root 来源切片接口补充（只读，不变更矩阵快照）

已 fetch 并只读 `f46336cc45abaa21d4b946029cda2a0dfadec654`，tree `0631d6f2677336206a77a5bb63eaf3c3413a36ea`。新 `readEducationAssessmentDeliveryIdentity(tx,{resourceKey,version,purpose:'NEW_USE'|'HISTORY'})` 返回 `{origin,entry,releases,runtime,authority,identityOnly:true}`。`assertEducationAssessmentRunUse(tx,{actorUserId,organizationId,runId,resource})` 重读当前真实 workflow，组织锁后校验 manager、精确产品/组织/家族，并逐个校验原 create/review/publish actor proof；这解决了“只查任意当前管理员”的错误假设，**尚不证明最终发布/START消费者已接通**。

- `authority` 当前数组按 create/review/publish 顺序返回。消费者如需保存/展示具体角色，应保留这个顺序语义或改为具名字段；不能自行排序后丢掉角色。仅作三 proof 现行校验可依 actorId 排序取得确定锁序，不改变原证明身份。
- `runtimeDefinitionHash=hash(buildTrainingFlowUnits(runtime))` 已加入并由 reader 校验，Form/FORM_SECTION 因而有完整 flow 绑定的入口。仍需 N1/N2 明确纯 Form BUNDLE（origin.units.min1 当前不表示纯 Form）、多 section 与 mixed Form 的源/快照/顺序语义。可复用已有 Form-only 产品路径，但需要可发现且可发布，不能在“任意组合”承诺中无声删除。
- `purpose:HISTORY` 是冻结身份读取，不是继续收集、跳过 consent、report 权限或当前 emergency deny 的许可。publish/新 START、已入场 child FINAL、report history 分别选择已有政策。N2/N3 必须覆盖退休/原授予者撤回后这三个动作的区别。
- identity reader 接受真实 tx；调用者应在相同 tx 内冻结授权/源/assignment，禁止在 tx 外先读 identity 后把结果当持久授权。root 负责来源登记/发布、C/P/R与START接线，本分支不假设其后续模块已完成。
- root 告知的18单元/8个真实PG17最小schema/类型结果保持 root 原执行身份。本节点未运行这些用例或认证其原 reporter，不把它们写成本节点 PASS、PG16 正式业务资格。

root 后续已明确告知 `runtime-table-policy.json` 公开授权与上传阻碍解除；本分支从未代传、重试或修改该文件。
