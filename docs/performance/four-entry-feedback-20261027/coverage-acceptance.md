# PR363 四入口 × 五家族验收映射

核查快照：`6cf241d65b4bc44878ef9d9fe21c81fdd02561cd`，tree `d74a1d96567f0d2c0850440b2efbc205dc6c5007`；main `7e6d7da4a01e4a42b410cf2dbdcfa76f11759fdc`。独立云端分支 `test/pr363-four-entry-coverage`，开始时工作区干净。此文是源码、现有用例和历史证据之间的映射，**20 行均不是 PR363 运行 PASS**。root 后续来源元数据/授权提交 `f46336cc` 不计入此快照，其实际接口单列在验证方案末尾。

执行范围：只增验收文档/证据索引 → 发现漏接线、错误复用、缺失断言 → 本云端只读源码与官方历史证据，文档链接/输入检查 → 只提取旧合格断言，不重复应用测试 → 约 30 分钟。没有业务代码、workflow、required gate、数据库、工具内容或生产变更；没有激活 CI。

`matrix.md` 前半的“未接入／本批不开发”是旧排期；其末尾的用户追加已要求补齐系统能力。本表遵循追加要求。没有已批准真实工具不能写 N/A；使用隔离合成、按真实治理流程获准的工具证明系统机制，实际工具继续由管理员/获授权心理老师决定。

## 阶段与证据口径

- P/A：精确内容发布、来源许可、组织任务授权和当前发布者权限；四者不可互相代替。
- S/R：正式任务 START；刷新/重进恢复原 parent、slot、epoch 和冻结内容。
- F/I：一次性 FINAL；丢响应/并发同键同摘要重放相同回执，改摘要拒绝；child 完成不等于 parent 完成。
- V：反馈由当前本人/observer 身份和冻结报告开放合同决定；完成、待生成、延迟开放、不可披露、可读分开。
- D：原始回答/事件、canonical 结果、parent 引用与报告持久化；读取不可重计分，旧格式仍可读。
- **接线**表示读到源码；**旧证**表示原候选已有所列断言；**缺实现**与**缺证**均未关闭。原候选的正式成功不自动成为 PR363 资格。

## 20 行矩阵

源码 S、现有测试 T、历史证据 E 的精确映射在下节和 [最小验证方案](coverage-validation-plan.md)。D 列写实际存储机制，不表示已验证备份恢复或总成本。

| ID / 入口家族 | P/A | S/R | F/I | V | D | 现有断言 / 尚缺项 |
| --- | --- | --- | --- | --- | --- | --- |
| 01 Survey Form | S1 研究发布、研究者/参与凭据 | 波次 START；checkpoint 可选，不能承诺全部浏览器自动恢复 | S1 parent FINAL、submissionId/hash 重放 | GENERAL_ONLY 首交内联 generalReceipt；描述反馈另查权 | SurveyWaveFinal.resultsCipher；不制造心理分数 | T1，E4 ordinary；缺：最终候选若修改该传递闭包，仅补相交断言；没有新增端到端 PASS |
| 02 Survey Scale | S1/S2 独立研究准入、冻结 C/P/R | 波次/冻结任务、checkpoint | 研究 FINAL 使用冻结 scorer | general / 内容获准描述，不拿 Training 报告替代 | 研究 FINAL 密文及冻结解释/报告产物 | T1/T2，E1 Survey 指导语/standard-triplet；缺：精确描述反馈浏览器与当前来源漂移审查 |
| 03 Survey Cognitive | S2 研究精确 config/measurement 与研究凭据 | S3 slot start/read；interrupt/restart 有独立 epoch | 子 FINAL 唯一原件，parent 验精确子引用 | 安全恢复不回原始 trial/分数；S3 独立 cognitiveParticipantFeedback 消费冻结反馈/AFTER_COLLECTION，不受 Scale/SJT-only raw feedback selector 推断 | SurveyCognitiveSession/Result.rawCipher/resultCipher + parent FINAL | T3；当前未取得对应正式原件，**缺证**，不能借 E1 Training vertical 补此格；PR360 COS 候选不在本基线 |
| 04 Survey SJT | S2 native 发布/准入与研究凭据；旧内联 SJT 单独保留 | S4 start/read + staged/prefix 绑定 | native child FINAL 回执进入 parent FINAL | general / 授权 package，不能由 child receipt 解禁报告 | native SituationalRawSubmission/冻结结果 + SurveyWaveFinal | T4；E4 Form+native/whole 有真实合成 HTTP 局部证据；缺：当前改动相交的正式 case、真实浏览器/材料链 |
| 05 Survey Composite | S1/S2 task/package 冻结与许可 | 研究 flow/variant、各 child 准确恢复 | whole 研究 package FINAL 验全部引用及序列 | general 与单独获准 package 报告 | SurveyWaveFinal + package 报告密文；不是 Training outbox | T3/T4；E4 whole；缺：任意组合的机制分区证明，不能用单个 Form+SJT 样本外推认知/换序 |
| 06 Training Form | S5 原 Composite 发布、组织/课程/素材准入 | current-unit、sealed draft/checkpoint | FORM_SECTION FINAL；parent terminal predicate 决定完成 | parent 完成后合同允许的完成/报告；Form 不造量表分数 | CompositeFormAnswer/SectionAttempt + parent facts | T5/T6；E2 共享 Form 前端；缺：若修改 Form 混合顺序，补对应消费者；whole ACK 不能泛化到全部 Form |
| 07 Training Scale | S5/S6 原来源、原授权根、冻结 C/P/R | 正式 START、current-unit、精确冻结身份 | 同步 FINAL receipt；whole 支持的单位另走耐久 ACK | 已授权报告；ACK 时可能 PENDING | Scale 原 facts/compact/shared facts + parent 引用/报告 | T7；E1 vertical4、exact-lazy、worker 已有正式证；E4 prepared whole **不覆盖发布/START**；缺：PR363 共享输入变化的窄失效审查 |
| 08 Training Cognitive | S5/S6 精确配置/assignment、素材与年龄政策 | CognitiveRunner；独立/组合 session 绑定 | S7 一次性 FINAL、epoch/hash、parent 聚合 | 独立/组合报告按资格/开放规则 | CognitiveRawSubmission.payloadEncrypted + frozen result/snapshot；当前仍写 PG | T8/T9；现有测试存在但本次未取得对应正式报告，不标绿；缺：映射原证或只补改变的具体消费者，不重跑所有 trial |
| 09 Training SJT | S5/S6 exact native/static mapping、许可 | SituationalRunner start/resume；组合 child | S8 FINAL、并发重放、parent 推进/修复 | 独立/组合冻结结果与授权报告 | SituationalRawSubmission.payloadEncrypted + result/canonical 密文 + parent facts | T9/T10；E2 的 sjt-authoring 单元不证明参与全链；缺：原候选实际 PG 证据定位及延迟开放断言 |
| 10 Training Composite | S5/S6 Composite 发布与所有子来源冻结 | parent/current-unit；子 session 恢复 | 同步 parent 与 whole ACK/worker 两协议；不可混称 | 完成转报告；whole 真实 worker 后 READY | parent/child facts + report job/outbox + whole envelope | T7/T9/T11；E1 ordinary-harness4/worker1 已正式成功；E4 prepared whole 局部；缺：改变的共享 C/P/R/家族桥接消费者；不要求把所有组合全量重跑 |
| 11 School Form | S9 Activity OPEN、发布者/班级/组织/consent；private Form 源 | 校园正式 Run START/current-unit；本人/observer 独立 | S10 共享 FORM_SECTION FINAL；完整 parent 才完成 | 完成确认；observer/群体报告走独立披露，不请求个人 Scale 报告 | Form/SectionAttempt、parent/Run execution；私有冻结源 | T12/T13；E2 编译浏览器独立 Form 和本地恢复；缺：新增混合 BUNDLE 不在此旧证范围 |
| 12 School Scale | S9 公共库授权/私有精确发布；当前组织/学生身份 | Run START、consent、原绑定续答 | S10 共享 Scale FINAL receipt；停新收不偷换既有完成语义 | S11 独立 student report；两次当前权限核查、报告图片独立许可 | Scale facts/snapshot、parent/Run 投影；default/compact | T14/T15；E2 Form/Scale 编译浏览器，E3 默认/compact 正式 PG；缺：新完成自动反馈生命周期、非 Scale 通用报告不在旧证 |
| 13 School Cognitive | 独立 COGNITIVE Run 在 S9 publish:228 **缺实现**；BUNDLE child 原有桥接不等同独立家族 | S10 已有学生 SELF 的精确 parent/item/session 校园路由；身份/数据库在 T16 被 mock | 校园 child FINAL → parent reread，禁止 Training cookie/trial API | S11 当前非 Scale READY 固定降 COMPLETED，空 narrative registry；可配置获准报告桥接**缺实现** | S7 复用认知原件/结果 + parent，不能只验报告 JSON | T16/T17 是路由/UI 合同，非 PG 权限；缺：N1/N2/N3 的真实发布/授权、START、恢复、重放、获准反馈/材料与存储 |
| 14 School SJT | S9 有 SITUATIONAL adapter；教育精确源/授权仍须实际接入 | S10 校园 embedded start/read/resume；parent guard | 校园 SJT child FINAL，parent 真完成才反馈 | S11 同上：当前只 completion，不能把未来合成获准报告列 N/A | S8 原始响应/冻结结果 + parent/Run | T9 共享引擎、T17 部分宿主；E2 明列未覆盖此家族；缺：N1/N2/N3 学校专用实际身份与完整参与/报告 |
| 15 School Composite | BUNDLE adapter 已有；任意混合来源、Form 的冻结身份均须对齐 | S10 多种 runner；当前人口/活动/关系权限 | 各子 FINAL，只有 parent COMPLETED 才完成；组织 Run 不自动获得 whole ACK | 当前完成→列表→反馈；通用获准混合报告仍缺 | 各子原件 + parent facts/报告；不另造引擎 | T9/T12/T17；缺：N2 两种 native + Form/Scale 混合顺序/恢复、N3 报告；共享训练组合测试不能替代校园授权 |
| 16 Teacher Form | S12 内置 Form 与 private Form 两协议；群体/学生评教师受保护 | 内置 form-attempt vs private Composite 分开 START/恢复 | 内置 FormFinal vs shared section FINAL；均须保持幂等 | 个人完成；群体隐私报告/正式发布独立，不能个人化心理评分 | HuiteacherFormFinal 或 CompositeFormAnswer/SectionAttempt；Run 投影 | T13/T18；E2 编译 private Form；缺：新 BUNDLE 不可覆盖/改写此家族的群体、observer 和内置协议 |
| 17 Teacher Scale | S12 精确资源与本人 TEACHER SELF、HUITEACHER entitlement | start-scale 或原 binding/current-unit；关闭后续答与新 START 分开 | shared Scale FINAL receipt，身份/consent/版本约束 | S12 personal-summary 独立当前授权；新自动读取尚待补证 | shared Scale facts/snapshot + 教育本人报告 | T14/T15/T19；E2 浏览器、E3 default/compact；缺：新生命周期/共享 authority 改动相交用例，不重跑旧完整界面 |
| 18 Teacher Cognitive | S12 个人政策合同已有，来源仅 DRAFT；COGNITIVE publish/adapter **缺实现** | S12 Scale SQL 限 SCALE、前端仅 Scale；认知 Teacher child transport **缺实现** | 共享 S7 引擎可复用，但未有此入口真实绑定/FINAL 链 | S11/S12 现本人报告仅 SCALE；通用获准报告 **缺实现** | 应复用 S7 原件/parent/Run；没有此入口已验证新链 | T20 仅合同/路由分派、不能计端到端；缺：N1–N4。没有已批准工具不是豁免理由 |
| 19 Teacher SJT | S12 SELF 个人政策已有，exact 教育发布/授权待接 | 没有 Teacher Situational child router/宿主；Scale API 不可复用身份 | S8 有引擎，入口 guard/子身份/恢复/重放 **缺实现** | 仅 Scale 个人报告；新 SJT 冻结报告投影/开放待接 | 应复用 S8 原件/parent/Run，不用枚举代替入库 | T20；缺：N1–N4，包括 Teaching 与 Training 同用户仍拒绝跨域、媒体精确绑定 |
| 20 Teacher Composite | BUNDLE policy 不等于发布能力；多源 C/P/R、Form 来源/顺序冻结待接 | 现 Form/Scale 分别借 Composite 运行，任意混合参与宿主 **缺实现** | 多 child 与 parent terminal、durable receipt 不能凭协议推断 | mixed report 聚合与当前授权、延迟/禁披露待接 | 既有子 facts/parent/报告复用；新 metadata 只是来源索引 | T9/T20 机制基础；缺：N1–N4，全体完成后反馈、部分失败恢复、旧 Form/Scale 行为保持 |

## 源码调用点（均为本快照）

以下路径均相对仓库根；行号用于定位，集成后按 symbol 与 `coverage-inputs.json` 复核，不把旧行号当新候选证明。

| 源码 ID | 精确调用点 |
| --- | --- |
| S1 Survey 主链 | `server-version/backend/src/modules/survey/public.routes.ts:89` START、`:101` checkpoint、`:111` FINAL、`:117` general；`server-version/backend/src/modules/survey/final.service.ts:52` submitResearchFinal、`:136` replay、`:178` create、`:200` readGeneralForOwnAttempt；`server-version/frontend/src/survey/SurveyPublicApp.tsx` |
| S2 Survey 冻结/报告 | `server-version/backend/src/modules/survey/publication.service.ts`、`server-version/backend/src/modules/survey/content-binding.service.ts`、`server-version/backend/src/modules/survey/participant-feedback.ts`、`server-version/backend/src/modules/survey/governed-package.reports.ts`；standard-triplet 与 native 源分别治理 |
| S3 Survey Cognitive | `server-version/backend/src/modules/survey/cognitive.public.routes.ts:37` start、`:41` read、`:47` restart、`:51` final；`server-version/backend/src/modules/survey/cognitive.service.ts:200` raw/result 密文落库；`server-version/backend/src/modules/survey/cognitive.results.ts` 验 parent 引用；`server-version/backend/src/modules/survey/measurement.result.ts:26` cognitiveParticipantFeedback，经 `final.service.ts:241` 分派 |
| S4 Survey native SJT | `server-version/backend/src/modules/survey/situational-native.public.routes.ts:27` start、`:30` read、`:33` final；`situational-native.service.ts`；parent 仍调用 S1 |
| S5 Training/共享 | `server-version/backend/src/modules/composite/composite.routes.ts:75` read、`:78` whole submit、`:88` Form、`:89` Scale、`:90` SJT、`:96` status、`:98` report、`:144` start；`server-version/frontend/src/modules/composite/CompositeAssessmentPage.tsx:141` 完成路由；`server-version/frontend/src/components/FinalCompositeAssessment.tsx` |
| S6 C/P/R | `server-version/backend/src/modules/composite/training-content-binding.ts:46` prepareTrainingContentSnapshot；`:49` Form 不走 measurement unit；`:186` identity 说明，调用者另查许可；`server-version/backend/src/modules/education-tools/assessment-resource.contract.ts:19` origin、`:50` DRAFT-only |
| S7 Cognitive 存储 | `server-version/backend/src/modules/cognitive/unified-final-submit.service.ts:302` FINAL、`:492` cognitiveRawSubmission.create；`server-version/backend/prisma/schema.prisma:2058` 原件、`:2078` unit snapshot；School 路由调用 `cognitive/final-submit.service.ts`，不是 Survey 独立研究存储 |
| S8 SJT 存储 | `server-version/backend/src/modules/situational/situational-final-submit.service.ts:327` commitPreparedSituationalFinal、`:378` raw.create、`:499` FINAL；`server-version/backend/prisma/schema.prisma:2171` 原件 |
| S9 Run 发布/START | `server-version/backend/src/modules/campus/activity.run.routes.ts:68` track、`:85` publish、`:144` start；`server-version/backend/src/modules/assessment-run/publish.ts:228` COGNITIVE 拒绝；`resourceAuthority.ts:262` 生产家族 registry；`startExecution.ts:460` transactional runtime 分派 |
| S10 School runtime | `server-version/backend/src/modules/campus/composite.routes.ts:32` parent guard、`:68` Cognitive 精确 child guard、`:198` Cognitive submit、`:202` parent、`:212` Form、`:215` Scale、`:218` SJT read、`:224` SJT submit；`server-version/frontend/src/school/SchoolCompositeRunner.tsx:45` current-unit、`:77` SJT transport、`:101` Cognitive transport |
| S11 教育报告 | `server-version/backend/src/modules/campus/student-feedback.ts:16` 非 Scale fallback；`server-version/backend/src/modules/reporting/education-scale-personal-report.service.ts:51` SCALE/SELF SQL、`:72` readEducationRespondentScaleReport；`server-version/backend/src/modules/assessment-run/currentPopulationAuthority.ts` 当前组织/事件/活动/来源权限 |
| S12 Teacher runtime | `server-version/backend/src/modules/huiteacher/run.service.ts:60` addTeacherRunTrack；`assessmentRunPolicy.ts:15` SELF 合同；`scaleRuntime.routes.ts:112` list、`:212` start、`:231` parent、`:244` FINAL、`:247` personal-summary；`formRuntime.routes.ts:216` start、`:263` task、`:267` final；`privateFormRuntime.routes.ts:98` start、`:106` parent、`:108` FINAL；`formFinal.service.ts:205` 内置 FINAL；`server-version/frontend/src/huiteacher/HuiteacherMyScaleTasks.tsx:248` 拒 Form 宿主 |

## 历史证据的实际可用边界

| ID | 本节点实际核读 | 可以支持的原断言 / 不能支持的内容 |
| --- | --- | --- |
| E1 PR356 | PR 元数据：head `3d433a58e313007bfb1e108e800b9da708589f9b` 已合并。正式 admission run `40382959231`，job `121783996831` success；下载 artifact `12678239249` 并匹配 SHA256 `d64174165708a4677e951835b81a67edf759f3ffbe82a21b8f7663532b7e1f1b` | `merge-admission.json` 中 qualification 指向 run `40378392007`。所列 vertical4、worker1、ordinary4、exact-lazy、产品 browser 保留原 source/phase/artifact 身份；原历史 case 标 `ciExecuted=false/originalExecutionSigned=false`。本节点未重新认证各原 phase ZIP/SARIF，未授予 PR363 复用资格。旧激活文档 pending 是历史记录，不能据此重跑已合格项目 |
| E2 PR357 | head `8ca7668234982340bae0349a15e55b1660d813ca`，run `40455202809`；三个小型 ZIP 已下载并逐一匹配官方 digest，详见 JSON 索引 | backend checks `12711074463`、frontend checks `12711938886` 是原成功资格的接纳记录，保留嵌套 reporter/原失败身份。connected `12712485342` browser PASSED/errors=[]，coverage 精确为两产品独立 Form/Scale、冻结发布、本地草稿恢复/FINAL/反馈；报告明确不覆盖媒体、observer/revocation、生产 TLS/DNS。归档内 source `9ece34cb...` 与 PR source `8ca766...` 名字不同，但 tree 相同；不能篡改原 source 标签或据此拒绝/默认证据 |
| E3 PR361 | head `74062c61e1bf60b9f491f362dded7bca26e8089d`，run `40465064872`；job `122058450231` 的 build、PG16 default/compact、runtime scan/upload 均 success；官方 artifact `12716670372` digest `53079a4b306c53fc2d811354072def109e055165c9a13337dd9a1437cf4be11c` | `.github/scripts/report-planning-checks.mjs` 明确 default 三文件9项、compact 私有报告4项。此 384MB ZIP **未下载核字节**，本节点仅核 metadata/job steps/源码检查器；不称独立重验 report 内容。报告测试 mock 身份传输/媒体字节，真实数据库授权/START/计分/FINAL 保留；不是全登录/素材链。新增非 Scale 系统不在该 exact route 里 |
| E4 PR361 随附开发探针 | `docs/performance/four-entry-20261027/{survey-baseline,training-whole,education-report,storage-and-bounded}` 以及 README | Survey ordinary/native/whole 合成 HTTP；Training prepared whole 不是发布/START；School/Teacher service completion + 报告 HTTP。PG17 本地不是正式 PG16，时间/密文大小/短并发不是完整矩阵、持续容量或总成本；不能把 `.ts.txt` 计划或 mock 报告当真实通过 |

官方查询、ZIP digest/成员 digest、精确 JSON pointer 和原 phase/job/artifact 坐标见 [metadata](coverage-official-metadata.json) 与 [case index](coverage-evidence-index.json)。查询工具的 jobs/artifacts 仅返回首页；本表只断言已返回的明确项，不宣称已经核齐本轮所有 selected jobs。

## 当前发现与接口需求

1. **独立 Cognitive 双重阻塞**：`resourceAuthority.ts` 无生产 Cognitive adapter；`publish.ts:228` 直接拒绝。School 已有 Cognitive child 是 BUNDLE 内部机制，不能证明独立家族完整；Teacher 的 policy/schema 新增也不改变这一事实。
2. **身份 reader 不能代替权限**：root 拟新增的 `origin/entry/runtime/releases/identityOnly:true` 应只作精确源身份。调用者另核当前组织任务、源许可/原授权者依据、product/account domain、材料、C/P/R 适用性和报告合同。测试须证明拿到 identity 仍不能直接 START/读结果。
3. **四层消费者缺口**：来源注册/发布 → Run preview/publish/START/provenance/current population → 产品 child/media/recovery/FINAL/reconcile → 报告投影/开放/图片。只在一处 registry 接新 key，其他三层仍可能拒绝或漏鉴权。
4. **组合 Form 不能消失**：现 C/P/R origin units 只有 SCALE/COGNITIVE/SJT 且 min1；Training snapshot 显式过滤 FORM。需要明确 Form/FORM_SECTION 在完整 runtime hash/顺序/恢复/FINAL 中的绑定，以及纯 Form BUNDLE 和多 Form section 的合法表示；不为 Form 伪造 measurement/report，也不把 Form+native 简化为只有 native 的组合。
5. **报告是独立能力缺项**：当前教育本人 report SQL 限 SCALE；School fallback 固定 completion-only。真实内容未批准时保持 withholding，但系统必须能在合成获准的 Cognitive/SJT/BUNDLE 冻结报告合同下返回适用反馈，不能以空 narrative registry 永远挡住系统能力。
6. **whole 协议不是通用优化开关**：已有 ordinary whole/worker 证据不表示所有教育组织 Run 和 native/Form 混合都支持这个提交协议。保留可靠 child FINAL/parent 聚合即可；如新增 whole，必须另证被支持单位与耐久恢复，不静默启开关。

本任务未遇到操作拒绝；root 曾明确告知 `runtime-table-policy.json` 上传审查阻碍，后续又告知已获用户明确授权解除。本节点未处理、重试或代传该文件。上述缺实现是本快照的待集成条件，不是请求扩大工具发布或批准内容权限。
