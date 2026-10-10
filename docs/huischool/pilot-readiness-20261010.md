# Huischool PR1–PR5 联合审查、科学候选内容与 Pilot Readiness Matrix

> 2026-10-10；静态复核基线 `main@b925db18f17eaac84029d1681a27a56d1a7768b4`。**状态：REAL-SCHOOL PILOT NO-GO；仅合成数据的隔离验收可以进入准备。**
>
> 此文是跨 PR 联合审查的**执行清单、科学待签审材料、差分风险假设与证据索引**，不是 CI 结果、研究批准、隐私评估报告或部署指令。所有未实际执行的验收均标记为 NOT VERIFIED；任何后续更改须重新核对 main/PR exact head。相关定点工程修复见 [PR #263](https://github.com/caohuibj/eduK12-new-version/pull/263)，当前文件不构成其 CI 证据。

## 1. 最小验证与证据账本

- 发布规约：仓库根 `AGENTS.md`、`docs/release/README.md`，不在生产环境执行本表测试、迁移、停服或部署。
- 已核实的合并：#258／#259／#260／#261／#262 均为 MERGED；PR5 exact-head `d9ed8b6d77fda68f98a9cce848fd8b2f8b15183b` 的 [GitHub Actions 38028455685](https://github.com/caohuibj/eduK12-new-version/actions/runs/38028455685) conclusion=success。已通过的相同输入检查不重复。
- **代码发布门禁**：历史五 PR 已完成；PR #263 若未 merge 或 exact-head CI 未完成，不能声称本轮修复已进 main。
- **内容/许可门禁**：当前逐工具、逐受众缺独立签审。 `publishedCampusStudentNarratives=[]`，`reviewedParentTemplates` 无逐工具正式教育模板；`CAMPUS_PARENT_REPORT_ENABLED=false` 必须保持默认关闭。
- **隐私门禁**：10 人 GROUP / 5 名评价者保护性反馈 / 24h 延迟是工程暂定门槛，不是经过攻击模型验证的匿名保障。
- **真实 Pilot 门禁**：E2E-01..12、两校五角色、跨域/撤销/缓存/低 N、浏览器截图、4C4G 场景、校园心理事件 SOP **尚无综合通过证据**；均不得以 merged 或 CI success 自动勾选。

## 2. 联合业务链证据矩阵（代码具备 ≠ 端到端验收完成）

| # | 业务流/角色 | 已定位实现 | 必需端到端验证 / 当前结论 |
|---|---|---|---|
| 01 | 初始化学校 → 校管理员 | `src/scripts/campus-bootstrap.ts` 受控运维入口；不是普通 UI 自助建校 | 两个 SCHOOL 独立组织、初始强口令/TOTP、运维双人操作与审计；**运维手册待验** |
| 02 | 建年级/班级 → 校管理员 | `campus/organization.routes.ts`、`SchoolApp.tsx` | 建班、越校拒绝、班级数据和成员绑定；**E2E 未验** |
| 03 | 邀请普通/心理教师 → 校管理员 | `campus/staff.routes.ts`、`SchoolApp.tsx` | 单次邀请码、角色升权 MFA、撤销与跨校；**E2E 未验** |
| 04 | 学号+一次性码注册与班审 → 学生/心理教师 | `campus/admission.routes.ts`、`admission.service.ts` | 抢注隔离、名册版本、整班审批、恢复、离校；**E2E 未验** |
| 05 | 家长独立注册/亲子确认 | `campus/parent.routes.ts`、`parent.service.ts` | 多子女/多监护人/撤销与旧链接；**E2E 未验** |
| 06 | 任课关系/班主任变更 | `campus/relationships.service.ts`、`SchoolRelationships.tsx` | 双校教师、转班/撤销不保留不当权限；**E2E 未验** |
| 07 | 心理教师—CLIENT 建立/终止 | 同上、`campus/professional-reports.ts` | 双身份管理员不得自授个案，终止后专业报告 404；**E2E 未验** |
| 08 | Activity 提案/审批/开放/结束 | `campus/activity.routes.ts`、`activity.service.ts` | 普通教师不能 govern；过期/暂停后所有写入口拒绝；**E2E 未验** |
| 09 | 学生/家长/教师任务分配 | `campus/activity.run.routes.ts`、`activity.tasks.ts`、`teacher-tasks.ts` | 人群冻结/关系变更/幂等/大班非 N+1；**E2E 未验** |
| 10 | Student START→Runner→FINAL | `campus/activity.run.routes.ts`、`SchoolCompositeRunner.tsx`、既有 Run/FINAL | Scale/Form/Bundle/SJT 逐种正式许可和成功回执，离线重试幂等；**E2E 未验** |
| 11 | 家长、教师独立观察作答 | `SchoolParentTasks.tsx`、`SchoolTeacherTasks.tsx`、Run 交付 | subject/respondent 不互换；失权后不能新 START；**E2E 未验** |
| 12 | 同伴互评、学生/监护人撤销 | `campus/peer.service.ts`、`SchoolPeerConsent.tsx` | N 小班、孤立评价、已开放 Activity 分配、撤销后前后端拒绝；**E2E 未验** |
| 13 | 学生个人反馈 | `campus/student-feedback.ts` | 目前**只有无分数完成反馈**；未审数值不能从其它学生路由绕出；PR #263 尚需 CI/合并 |
| 14 | 专业个案报告/保护性反馈 | `campus/professional-reports.ts`、`protected-report-studio.ts` | COUNSELOR+PSYCHOLOGY_STAFF+当前 CLIENT；正式 spec/数据审查/撤销/完整 N；**E2E 未验** |
| 15 | 校内受控 GROUP | `campus/group-reports.ts` | SELF 学生全 Run、10+、24h，叠加历史 GROUP 与差分攻防；**对外披露未批准** |
| 16 | 个体/固定群体纵向 | `individual-longitudinal-studio.ts`、`group-longitudinal-studio.ts` | 真实 per-metric comparability、同人完整贡献、重叠波次泄露；**科学/隐私验收未通过** |
| 17 | 家长逐份披露/撤销、离校历史访问 | `campus/report.routes.ts`、既有 Parent Portal / Reporting | `CAMPUS_PARENT_REPORT_ENABLED` 保持 OFF；以后逐工具批准时验 consent+grant+专业授权+撤销+缓存深链 |

源文件相对路径除 `School*.tsx` 外均以 `server-version/backend/src/modules/` 为基准；前端在 `server-version/frontend/src/school/`。该表“已定位实现”仅说明存在代码路径或既有自动检查，不保证业务条件已在两校真实完成。

## 3. 可执行合成环境与 E2E-01～12

**Fixture：** School-A / School-B 完全独立，分别含 G7-A (12 名)、G7-B (9 名)、G8-A (20 名) 等合成班级；至少一名注册未审学生、转班/离校学生、两名普通任课教师、两名心理教师（一位双身份）、两名校管理员、每校多名独立家长（多子女/多监护人）。创建两次不同时间、不同重叠结构但可复核版本的合成 Run，包含未 FINAL/被撤销/缺失指标/相同人重复提交。**禁止使用真实未成年人数据。**

| 验收 ID | 正常业务路径（HTTP+浏览器均留证） | 必测拒绝/一致性断言 | 状态 |
|---|---|---|---|
| E2E-01 | 两校 bootstrap → TOTP → 建班/导名册/发码 → 注册/班审 → 开 Activity | 异校/错班/重复码/抢学号/未完成名册不得审批；无授权 Activity 不可见 | NOT VERIFIED |
| E2E-02 | 学生合法测评开始/FINAL → 适龄已批投影或完成状态 | 老师/管理员不能个人读；重复 FINAL 幂等；无签审数值全部 withholding | NOT VERIFIED |
| E2E-03 | 家长独立注册、学生批准关系、家长 Run → FINAL | 亲子关系不自动获得学生报告；多监护人不得互相越权 | NOT VERIFIED |
| E2E-04 | **仅在批准 exact template 后**逐份同意 → 专项 grant → 读取 → revoke | 旧链接/缓存/换孩子/解绑/期限到期均 404；当前保持功能开关 OFF | NOT VERIFIED/BLOCKED |
| E2E-05 | 教师合法任课观察，阅读自己的任务和完成状态 | 转班/撤课/撤身份再读取 404；普通教师不得读心理专业值 | NOT VERIFIED |
| E2E-06 | 学生评价教师按受控人群和延迟工作流 | 9/10/11 人、掉一人、不同 Run、时间窗、两班交叠、单人间接推断；**向教师披露功能继续 OFF** | BLOCKED |
| E2E-07 | 学生评价家长及合法学生自身支持反馈 | 被评家长从报告、export、旧 URL、纵向、反向深链都不能得单人答案 | NOT VERIFIED |
| E2E-08 | 撤销心理教师 CLIENT、教师任教、管理员 capability、学生离校 | 每类通过 UI/API/旧 artifact ID 再请求拒绝；跨学校/域凭据拒绝 | NOT VERIFIED |
| E2E-09 | 抢注→隔离→线下身份核验→单次恢复 | 原用户报告不得归给新 userId；旧 tokenVersion 失效；无明文学号泄露 | NOT VERIFIED |
| E2E-10 | Chrome/WebKit 390、768、1440 下 5 类身份工作台 | 输入法/焦点/按钮/断网恢复/长期报告/注销或切换学校无敏感残影，截图留档 | NOT VERIFIED |
| E2E-11 | TRAINING 的课程码、合法教师学生管理与 FINAL 回归 | 两个账号域 Cookie/JWT/密码恢复互拒；旧 Course API 不能访问 CAMPUS_ACTIVITY | NOT VERIFIED（可复用输入一致历史测试） |
| E2E-12 | 合法 10+ GROUP、2–4 波完整固定人群、专业个体纵向 | 低 N/不完整贡献/变动集合/不可比版本/差分/重复生成/历史 artifact 一律按策略拒绝 | NOT VERIFIED |

每条真实证据记录字段必须包括：`testId, fixtureHash, mainOrPrExactSha, environment, commandOrBrowserScript, expected, actual, result(PASS|FAIL|BLOCKED|NOT_VERIFIED), screenshotOrLogUrl, reviewer, date`。现阶段不得将此表中的 NOT VERIFIED 改写为 PASS。

## 4. 隐私威胁模型与专项判据（绝不将 N=10 等同匿名）

| 攻击路径 | 已有工程护栏 | 尚需证明 / 保守策略 |
|---|---|---|
| 低 N、缺失指标与贡献者未满 | GROUP 至少 10；受保护反馈至少 5；缺失/不完整抑制，单小数均值 | 对小班/特殊标签/单性别/单学科不只测 N；禁止随意过滤 |
| 更换一个学生或转班的跨 Run 相减 | `assertCampusNoGroupDifferencing` 拦重叠非同一 GROUP 历史人群 | 用 A10、A9+B1、A10+B1、A/B 相邻班组与旧 Group 报告构造差分，验证读写路径；不能仅校验列表总数 |
| 不同分析类型交叉差分 | 当前检查专注已有 `analysis_kind='GROUP'` | 对 GROUP vs REPEATED/MATCHED、保护性报告、普通 Reporting 旧导出作跨类型差分；未独立审定前非专业受众不开放 |
| 固定同一批 10 名学生多时点趋势 | 同一实名集合、2–4 完整波次、24h 延迟、无 N/SD/原始答案 | 外部已知时间点、成绩/事故、补测时刻与连续公开均值推断；精度 0.1 不等于匿名保证 |
| 学生评价教师/家长 | 校内 GROUP 工作台只接受 STUDENT→STUDENT SELF；亲子结果不自动披露 | 受评教师若知提交/缺席名单，可通过排课/答题时刻推断；教师反馈向被评方**继续关闭** |
| 被撤销专业权限访问旧生成链接 | SCHOOL counselor 当前 CLIENT+capability 检查，受众合同每读重新解析；`no-store` | 各 artifact 类型、export、CDN/浏览器离线、撤销后正在进行的请求、外部截图无法技术收回；需要设备与流程 SOP |
| 两校角色与账号域混淆 | 独立 SCHOOL auth audience、组织 membership/context、训练 Cookie 分开 | A 校同学号/B 校交叉链接，TRAINING token 打 SCHOOL，遗留通用 API 反向读 CAMPUS |
| 未成年人科学结果逃逸 | FINAL `COMPLETION_ONLY`、候选解释注册表空；PR #263 封闭学生纵向数值 | 综合扫所有 read/list/print/export/deep-link/cache；在修复 exact-head CI/merge 前不得说 P0 已上线修复 |

**攻击测试要求**：全量使用合成数据；从一个授权的活跃角色分别访问**当前、历史、撤销后**三种状态。输出同时审视 HTTP body、响应头、SQL 查询范围、持久 artifact 内容、前端 DOM/localStorage、下载/导出和审计事件。受保护内部生成不等于可向教师或家长发布。

## 5. 精确工具/许可证/学生报告候选审签表

以下均基于源文件 `server-version/backend/src/modules/scale/instruments/<key>/1.0.0/instrument.ts` 与 `docs/huischool/pr5-instrument-evidence-ledger.md`，仅代表代码注册事实；**不替代独立许可与科学审定**。

| 工具 @ 版本 | 源码里的适用界限/报告主体 | 证据缺口及本轮决策 |
|---|---|---|
| `SCALE/who5@1.0.0` | 9–18 岁、学生自评；PILOT，源码 executable PUBLISHED | 中文引用的主要研究样本平均约 20 岁；K–12 exact age/grade cut-off、电子使用授权和学生版文字未独立获准。**解释/常模 BLOCKED** |
| `SCALE/sdq_parent_zh_cn@1.0.0` | 4–17 岁、家长评价学生；PILOT/executable PUBLISHED | Du 2008 多评价者证据不能自动支撑当前 exact 版诊断 cut-off；电子许可、家长结果解释及 student consent 未闭环。**父母个体报告 BLOCKED** |
| `SCALE/sdq_teacher_zh_cn@1.0.0` | **实际可执行 en** 的 Teacher T4–10、年龄 4–10、29 items | 尽管 key 带 `zh_cn`，不能宣传为简体中文；大龄段与 exact 中文翻译不符合。**中文校园报告 BLOCKED** |
| `SCALE/dass21_zh_cn@1.0.0` | ≥14 岁，大学/成人中文证据，PILOT | <14 禁用；expert review/cognitive debrief PENDING；不能诊断或启用中国中学生 cut-off。**BLOCKED** |
| `SCALE/grit_s_zh_cn@1.0.0` | 8 题、标准 5 点，PILOT/源码 PUBLISHED | 中文本地化 review PENDING；原始青少年有效性不等于中国 K12 norm/结论。**解释 BLOCKED** |
| `SCALE/tipi_zh_cn@1.0.0` | 10 题、标准 7 点，PILOT/源码 PUBLISHED | 中文来源已记录，但专家适龄审核 PENDING，无中学生人格常模，禁止好坏人格标签。**解释 BLOCKED** |
| `SCALE/pss10_zh_cn@1.0.0` | 仅 CATALOG_ONLY，大学生样本为主 | MAPI/ePROVIDE 使用许可与译者权利未完成；**不得创建或部署可执行版，绝不能绕过** |

**额外候选**：BSCS、CD-RISC2、TEXI Parent/Teacher、GSE、学科学习自我概念等确有仓库内容目录，但尚未本轮逐版本完成权利/适龄/分受众审计；**不得标为可发布校园解释内容**。

### 必填人工审签记录（每个精确工具 × 受众 × 文本 revision）

- immutable `family/key/version/definitionHash`、语言、翻译版本与来源、适用 subject age/grade、respondent→subject 方向、perspective、禁忌与缺失语义；
- 原授权权利人、地域、电子施测/计分/显示/报表/改编使用范围、可核验 InstrumentAuthorization 或外部授权编号；缺任一必须 BLOCKED；
- 本地化证据与样本、信效度、误差、参考常模/cut-off 的适用人群及不适用场景；没有即写“无相应证据”，不能发明；
- 定量解释的每个 `sourceMetricKey`、反向计分、报告允许的 `audience + metricKeys`、科学成熟度、合适的心理保护/转介措辞；
- 两位**真实**人员：文字起草人、独立科学/伦理评审人，审核决定/日期、精确文本哈希与签字证据、校园监管审批及复核时限；
- 父母单份 consent/grant/revoke 与当前关系策略；教师仅教育摘要；纵向逐指标邻接版本 `evidenceRef + sha256` 可比性；学校危机支持责任人；
- 没有完整证据只能产出 candidate docs；**禁止通过提交此文件更新运行时 `publishedCampusStudentNarratives` / `reviewedParentTemplates`。**

## 6. 分受众候选文案（DRAFT_ONLY；无量表分数解释）

这些是供真实科学评审的**不带指标、cut-off、常模或诊断结论的原创建议**，不能用完成状态代替研究级解释，更不能因本文件而注册生产模板。

**学生（小学高年级/初中可进一步分龄）**：  
“谢谢你认真完成这次测评。它只是帮助我们了解你最近的一些经历，不是给你贴标签。你可以想想：最近在学习、和朋友相处，或心情方面，什么事情让你感觉比较轻松？又有什么事情希望有人帮你一起面对？如果愿意，你可以选择一位信任的大人或心理老师，从最想说的一件事聊起。你不需要靠一个分数来证明自己。”

**家长（只有获得逐份有效授权才可以见到正式报告）**：  
“孩子的感受会随着环境和时间改变。一份测评不是对孩子的评判，也不该成为追问、比较或监控的依据。可以先问：‘最近有没有什么事让你觉得不容易？我怎样支持你会更有帮助？’尊重孩子是否愿意说，以及报告授权可能被撤销。需要进一步帮助时，请优先与孩子共同讨论合适的学校支持方式。”

**普通教师（仅在独立批准教育摘要/合规群体信息后）**：  
“这类信息适合用来反思课堂中哪些支持可能还不够：例如清楚的任务说明、允许求助、减少当众比较、给学生表达和选择的空间。它不适合用来推断某个孩子的心理状况，也不能用于对学生贴标签或将匿名学生评价作为教师绩效指标。缺乏合格人群和隐私审定时不展示群体结果。”

**心理教师/辅导员（专业记录候选结构）**：  
“首先核对资源 key、版本、语言、适龄范围及受评者/作答者方向；记录本次有效回答范围、计分质量和心理测量证据界限。分清自评、家长观察与教师观察，不能直接平均为诊断。相邻波次只可在指标、版本、来源和测量不变性有相应证据时进行描述，不由变化分数推断原因。与学生沟通时优先了解现实情境、保护隐私、尊重自主表达；风险处置执行学校既定人工 SOP，不把本产品称为自动预警/诊疗系统。”

**候选文本也须审查**：不同学段词汇与可读性、敏感或污名化词汇、过度保证保密、向家长透露未同意信息、求助资源在校内是否真实存在。实际学龄阶段和危机热线/负责人应由学校确认后再出现于正式报告。

## 7. 4C4G 合成压测（独立验收，不是普通 PR 发布阻塞链）

- **环境**：独立授权的 4C4G Ubuntu，完整记录 Compose/image digest/DB/Redis/连接池/网络与运行 SHA；不得改生产配置或用真实未成年个人资料。
- **数据梯度**：100／1,000／5,000 合成学生；1／5／20 校；10／50／200 班；多监护人、多评价源、2–4 波历史报告。
- **并发梯度**：10／25／50／100／200 同时会话；区别“持续在线作答”与“同一秒大量 FINAL 提交”，Scale 与 Cognitive/SJT 按真实前端提交模型分开。
- **代表性混合业务（待固定种子正式核准）**：任务列表与授权读取、Scale FINAL、家长/教师观察 FINAL、批量 Run 发布、心理专业报告、GROUP 延迟生成、管理员 TOTP；每次 BASE/HEAD 使用相同请求组成与唯一新建数据。
- **记录**：p50/p95/p99、合法 FINAL durable receipt/重试/重复、HTTP 4xx/5xx、CPU/RSS、PostgreSQL 连接与锁等待/慢 SQL、Redis 队列、容器 OOM、网络和恢复。
- **判据**：结果以事前固定的需求 SLO/错误预算及已核验 main baseline 做判定；不依据静态分析写出并发容量数字或虚构改善百分比。失败后只针对异常项复测。

## 8. 生产前必须具备的操作 SOP（尚待学校/运维签收）

1. **初始学校开通**：仅操作员执行受控 `campus-bootstrap.ts`（默认禁止），双人核实学校身份和授予的初始管理员；首登 TOTP 与恢复码离线交接。不是校管理员网页自助创建组织。
2. **资格争议与学号抢注**：暂停班级批准、封存可疑身份、线下双人核验、隔离历史 FINAL，不把可疑账号成绩直接迁到另一个学生身份。
3. **家长争议/教师离校/心理个案交接**：先撤销关系/capability，再验证旧报告链接、缓存/其他设备和导出；依法保留不含不必要内容的审计记录。
4. **心理危机/未成年人保护**：明确校内专业人员值守、人工升级渠道、紧急情况法律与保密例外；未部署受核验的自动 SafetyCase 则不得宣传“自动识别/报警”。
5. **低样本/公开风险**：任何给普通教师、家长或公众的 group/peer-feedback release 先接受独立隐私攻击评估，不能仅调高 minimumN 即开放。
6. **发布/回退**：使用当次批准的镜像/SHA、受影响短路径、版本/健康/回退证据；不重复 CI、不写历史只读库、不使用真实学生压力数据。
7. **事件响应**：账号失窃、越权曝光、授权撤销争议、后台导出误发、备份泄露需有负责人、时间记录、围堵/告知/恢复程序；演练记录必须合成数据。

## 9. Pilot Readiness 总门禁

| 独立门禁 | 当前证据 | 判定 |
|---|---|---|
| PR1–PR5 原工程合并 | 五 PR merged，PR5 exact-head CI success | **PASS（历史版本）** |
| 本轮 P0 修复 | [PR #263](https://github.com/caohuibj/eduK12-new-version/pull/263)；以 GitHub 实际检查/merge 结果为准 | **PENDING** |
| 合规校园工具内容 / 逐受众报告 | 精确工具科学、许可、中文适龄文字及人工签审未完成 | **BLOCKED** |
| 教师评价隐私安全与差分审计 | 仅暂定技术门槛，独立两校攻击验证尚未提供 | **BLOCKED（教师披露保持 OFF）** |
| 两校完整 E2E-01..12 | 已有单元/集成代码测试不能代表该综合验收 | **NOT VERIFIED** |
| 390/768/1440 五角色真实截图与可用性 | 需要独立实际浏览器与交互证据 | **NOT VERIFIED** |
| 4C4G 代表性校园并发与恢复 | 尚无符合本矩阵的有效特定场景结果 | **NOT VERIFIED** |
| 学校流程、监护隐私及 SOP 签收 | 学校/科学/伦理/运维负责人没有本文件中的签审证据 | **NOT VERIFIED** |
| 仅合成数据的内部技术验收 | 可准备并执行，不以真实学生为前提 | **CONDITIONAL PREP** |
| 真实学校/未成年学生 Pilot | 上述关键准入证据缺失，不应开通解释性报告/教师群体披露 | **NO-GO** |
| 生产部署 | 本轮未授权，不因本文件或 PR 成功自动部署 | **NOT AUTHORIZED** |

**升级条件**：先处理 P0 exact-head CI / merge，再在隔离测试环境执行 E2E、隐私攻击和 4C4G 观察；逐工具科学、许可和分受众签审真实齐备后，只开放通过全部门禁的 exact tool / audience / mode。未获批准内容保留 PILOT/受控或关闭。
