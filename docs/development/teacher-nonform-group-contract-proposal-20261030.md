# Teacher 非 Form 群体报告：同一合同保留本人摘要上限（待 DOT 确认）

本文件是只读核对后的产品／接线方案；没有修改 Teacher 权限、资源发布、旧合同、历史结果或报告范围。按 DOT 初审修订：首批范围包括库 Scale；新 GROUP 与原已批准本人摘要不做必须二选一。

## 已有边界

- 原创 Teacher Scale：`registeredResources.descriptiveResourceEntry(TEACHER_INDIVIDUAL)` → `teacher-scale:<id>:INDIVIDUAL`；`scaleLicense.releasedTeacherScaleEntry` 校验独立审阅、教师自评、人群及 `INDIVIDUAL_ONLY / ORGANIZATION NONE`。原注册／审核／发布只由平台 `SYSTEM_ADMIN` 执行，审核者不能是作者／创建者。组织使用许可由已获 HUITEACHER 入口授权的管理人员通过原 license 操作设置；组织管理员身份不自动包含这项平台入口权限。
- 库 Scale：`education-runtime-entry.ts` 的现有不可变适配器也固定 `INDIVIDUAL_ONLY`、组织 NONE。库的 `educationApplicability` 只声明 TEACHER:SELF 等人群／作答方式，明确不授予群报权，不能把它当 GROUP 开关。
- Cognitive / SJT / 普通组合 / Bundle 叶：现有教育投放发布器 `assessment-resource.service.ts` 及 `draftEducationAssessmentEntry` 仅发布个人合同。注册面板只能选择本人 NONE／COMPLETION_ONLY／已批准报告摘要，其他受众固定 NONE；`huiteacher/assessmentRunPolicy.ts` 再限制个人模式。
- 教育投放准备／审核／发布当前可由有精确来源及分发许可的本组织 PRODUCT_ADMIN、COUNSELOR + PSYCHOLOGY_STAFF，或经过原强认证的 SYSTEM_ADMIN 执行；审核必须与创建者不同，并复核原许可。**活动 Run 的选择／发布仍由原 Teacher productAdmin 与真实 Run manager/publisher 边界负责**，上述内容发布身份不自动得到结果读取权。

## 建议的最小产品选择

1. **在新投放版本准备／注册阶段明确选择 GROUP 用途，同时保留原已批准本人受众上限**。默认旧流程仍为个人模式。GROUP 只在已有精确 Teacher SELF 来源／分发许可的原独立审核发布流程生效，不能到生成报告时临时打勾，也不要求停掉已批准本人摘要。
2. GROUP 合同使用已有 `COHORT_AGGREGATE`、`cohortAnalysisPolicy`、`resultDisclosure`，明确组织聚合受众、允许的具体叶指标及最低人数。工具定义 C、正式计分、Profile／协议、单位不改变。可复用现有注册／教育投放表保存新的不可变版本，不新建授权表。
3. **同一次 FINAL、同一已发布 GROUP 合同，分别向本人投影原已批准摘要、向组织投影聚合**。RESPONDENT（原合同明确允许同一本人的 SUBJECT 时也保留该上限）的 mode / metricKeys / longitudinalMetricKeys / 报告版本／开放时间均只保留或收窄；原为 NONE／COMPLETION_ONLY 的资源不新增个人数字授权。组织的 GROUP 指标及人数下限另行明确审核，不能由本人或纵向指标推导。旧 INDIVIDUAL_ONLY / ORGANIZATION NONE 版本不改。
4. Teacher 管理员在活动中只能选新发布 GROUP 资源并收窄合同；不能通过换 task/spec 把旧 `INDIVIDUAL_ONLY` 来源变为群体来源。无 GROUP 发布版本的旧工具保持原个人入口，不出现可生成群报的假选项。

## 最小代码触点与谁设置

| 来源 | 明确选择／审核的位置 | 必要接线 |
| --- | --- | --- |
| 原创 Teacher Scale | 原平台资源注册选择新的 `TEACHER_GROUP` 用途 → 原独立审核／发布 → 原 HUITEACHER 入口 license 授予精确组织 | `registeredResources.ts` 生成新的 GROUP key／合同；`content.controller.ts` 接受该用途；`scaleLicense.service.ts` 按 INDIVIDUAL / GROUP 各自校验，保留旧分支。不能把旧 key 的 NONE 直接改掉。 |
| Cognitive / SJT / Bundle 具体叶 | 原教育注册面板新增明确 GROUP 用途，仍由既有有源许可发布人准备、另一名原有资格审核者审核；原 Teacher 管理员选择新资源用于活动 | `assessmentResourceClient` / 注册面板、`assessment-resource.contract.ts` / `.service.ts` 增加明确 GROUP 分支；现有个人分支保持原合同。父合同 GROUP 仍须列出合法叶及披露上限，不能从个人／纵向字段推导群报权。 |
| 库 Scale | 同样需要新的明确 GROUP 投放／适配版本，来源仍为同一已批准 Teacher SELF 库测量及精确组织分发许可 | 旧 `education-runtime-entry.ts` 的 v1 解释保持不变；增加显式版本／用途分支并沿现有精确身份 reader 消费。**首批必须一并完成这个显式 GROUP 分支**；旧 v1 解释仍不变，不能只放松 Teacher Run 校验。 |
| 活动与报告 | 原 Teacher productAdmin 选资源、发布活动；原有授权管理员读群报 | `huiteacher/run.service.ts` / `assessmentRunPolicy.ts` 只允许新 GROUP 合同的 SELF / SELF_REPORT / COHORT_AGGREGATE 收窄请求；复用现有 Run 具体叶来源和群报 Artifact／读取／打印入口。不是新增通用权限引擎或第二套报告页。 |

## schema / reader 的实际拦截与最小修订

现有 `assessment-policy/result-disclosure.ts` 已能表示 COHORT_AGGREGATE 所需的正数 minimumRespondents、本人 INDIVIDUAL_SUMMARY 和组织 ORGANIZATION_AGGREGATE。`projectAudienceResult` 只对聚合受众应用人数下限，且始终禁止组织 INDIVIDUAL_SUMMARY。因此无需新 analysisMode 枚举／数据库字段或 dual 引擎；但目前还有以下硬限制，不能只传一份新 JSON 就声称支持：

- **registry**：`assessment-relational/product-registry.ts:42` 直接拒绝 COHORT_AGGREGATE + 任意 INDIVIDUAL_SUMMARY。最小修订只为新明确发布、精确版本识别的 Teacher SELF GROUP 合同允许原已批准的自有受众摘要；保留其他旧 cohort-only、observer、RELATIONAL_EXPERIENCE 的禁止规则。新来源身份／adapterVersion 与冻结 cohortAnalysisPolicy 由原服务端发布流程固定，不能用客户端自报的绕过标志。
- **发布**：`draftEducationAssessmentEntry` 要求 minimumRespondents=null、非本人受众 NONE，并固定 INDIVIDUAL_ONLY。原注册／发布器增加明确 GROUP 用途，服务端在同一合同里分别固定本人上限和组织聚合上限；原个人分支不改。原创 Teacher Scale 与库 Scale 的精确源／许可 reader 也须识别新的 GROUP 版本，旧版本构造／历史比对保持原样。库 educationApplicability 仍只声明人群／作答方式，不是群报授权。
- **活动**：`huiteacher/run.service.ts:96` 固定 Scale INDIVIDUAL_ONLY，`assessmentRunPolicy.ts` 限制其他个人家族。仅对新明确发布的 GROUP 版本接受 SELF / SELF_REPORT / COHORT_AGGREGATE 收窄请求，原教师组织／活动／源许可检查不变，不能改旧任务的 requestedPolicy 绕过源合同。
- **本人 reader**：`education-assessment-personal-report.service.ts:153`、`education-scale-personal-report.service.ts:81`、`respondentSummary.ts:60` 还要求 analysisMode=INDIVIDUAL_ONLY。原受严格 execution 授权的本人入口需接受上述精确新 GROUP 合同的原批准摘要，继续校验 subject=respondent=actor、当前读权、冻结来源／受众合同一致、原 P/R／开放时机及逐指标白名单。复用同一 native／canonical 数值与原报告投影，不新建第二套取数／计分。
- **通用 raw / FINAL 不放宽**：`assessment-relational/result-authority.ts` 对 SELF relational / cohort 来源默认 COHORT_ONLY。保留该通用默认和原始结果入口的限制；新 GROUP 的本人摘要从已有专用本人 execution reader 投影，不能把所有 cohort 身份改为 INDIVIDUAL_ALLOWED。`education-native-scale-feedback.ts` 已在自身严格绑定的本人范围里按受众合同投影，可沿用；组织群报消费既有叶统计／Artifact，不得到个人 payload。

这是一份新明确批准合同下的两种受众投影，**不新增第二个任务、第二次施测或重复 FINAL 事实**。组织不取得个人结果；未批准的本人指标仍隐藏。对应公开／私有／库源都必须有自己的真实 GROUP 上限，不能从个人／纵向读权推导。

## 现有保护与首批范围

沿原合同取父／叶／任务／spec 人数下限的最大值，复用当前 Teacher 人群与差分披露、历史子群、Artifact 版本读取；不增加审批层、全平台安全矩阵或新质控研究。Bundle 只聚合合法测量叶，不含 Profile／Context。GROUP 发布不带来普通教师／被试的管理群报入口，也不自动给 SYSTEM_ADMIN 所有组织结果访问权。

必要验收只覆盖：旧 INDIVIDUAL_ONLY / NONE 版本仍不可聚合；新经审核 GROUP 资源同一次 FINAL 向本人保留原批准摘要、向组织返回达到原下限的聚合；组织响应无个人行，未批准本人指标仍隐藏；首批库 Scale 新适配可用且旧 v1 不变。共用均值／计分不按三个工具家族重跑。方案等待 DOT 确认；当前不改 Teacher 生产文件，也不暂停独立 Scale 读取器的本地开发。
