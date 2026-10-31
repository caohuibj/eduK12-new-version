# Teacher 非 Form 群体报告：最小合同接线方案（待 DOT 确认）

本文件是只读核对后的产品／接线方案；没有修改 Teacher 权限、资源发布、旧合同、历史结果或报告范围。

## 已有边界

- 原创 Teacher Scale：`registeredResources.descriptiveResourceEntry(TEACHER_INDIVIDUAL)` → `teacher-scale:<id>:INDIVIDUAL`；`scaleLicense.releasedTeacherScaleEntry` 校验独立审阅、教师自评、人群及 `INDIVIDUAL_ONLY / ORGANIZATION NONE`。原注册／审核／发布只由平台 `SYSTEM_ADMIN` 执行，审核者不能是作者／创建者。组织使用许可由已获 HUITEACHER 入口授权的管理人员通过原 license 操作设置；组织管理员身份不自动包含这项平台入口权限。
- 库 Scale：`education-runtime-entry.ts` 的现有不可变适配器也固定 `INDIVIDUAL_ONLY`、组织 NONE。库的 `educationApplicability` 只声明 TEACHER:SELF 等人群／作答方式，明确不授予群报权，不能把它当 GROUP 开关。
- Cognitive / SJT / 普通组合 / Bundle 叶：现有教育投放发布器 `assessment-resource.service.ts` 及 `draftEducationAssessmentEntry` 仅发布个人合同。注册面板只能选择本人 NONE／COMPLETION_ONLY／已批准报告摘要，其他受众固定 NONE；`huiteacher/assessmentRunPolicy.ts` 再限制个人模式。
- 教育投放准备／审核／发布当前可由有精确来源及分发许可的本组织 PRODUCT_ADMIN、COUNSELOR + PSYCHOLOGY_STAFF，或经过原强认证的 SYSTEM_ADMIN 执行；审核必须与创建者不同，并复核原许可。**活动 Run 的选择／发布仍由原 Teacher productAdmin 与真实 Run manager/publisher 边界负责**，上述内容发布身份不自动得到结果读取权。

## 建议的最小产品选择

1. **在新投放版本的准备／注册阶段有意识地选择“本人报告”或“群体汇总”**，默认仍为原本人模式。GROUP 只出现在已经具备精确 Teacher SELF 来源和分发许可的发布流程，经过原独立审核后才成为可选资源；不是生成报告时才临时打勾。
2. GROUP 合同使用已有 `COHORT_AGGREGATE`、`cohortAnalysisPolicy`、`resultDisclosure`，明确组织聚合受众、允许的具体叶指标及最低人数。工具定义 C、正式计分、Profile／协议、单位不改变。可复用现有注册／教育投放表保存新的不可变版本，不新建授权表。
3. 本轮最小方案为**新 GROUP 投放保留本人 NONE／COMPLETION_ONLY，不新增个人数字摘要**；旧 INDIVIDUAL 投放及其已批准的本人摘要／纵向指标继续原上限。这样不需要引入同一施测同时兼容个人与群体两种 analysisMode 的新语义。若产品要求“同次施测同时给本人原摘要和组织群报”，需 DOT 明确确认这一项，然后沿同一现有受众合同分别固定；也不能超过原已批准本人报告指标。
4. Teacher 管理员在活动中只能选新发布 GROUP 资源并收窄合同；不能通过换 task/spec 把旧 `INDIVIDUAL_ONLY` 来源变为群体来源。无 GROUP 发布版本的旧工具保持原个人入口，不出现可生成群报的假选项。

## 最小代码触点与谁设置

| 来源 | 明确选择／审核的位置 | 必要接线 |
| --- | --- | --- |
| 原创 Teacher Scale | 原平台资源注册选择新的 `TEACHER_GROUP` 用途 → 原独立审核／发布 → 原 HUITEACHER 入口 license 授予精确组织 | `registeredResources.ts` 生成新的 GROUP key／合同；`content.controller.ts` 接受该用途；`scaleLicense.service.ts` 按 INDIVIDUAL / GROUP 各自校验，保留旧分支。不能把旧 key 的 NONE 直接改掉。 |
| Cognitive / SJT / Bundle 具体叶 | 原教育注册面板新增明确 GROUP 用途，仍由既有有源许可发布人准备、另一名原有资格审核者审核；原 Teacher 管理员选择新资源用于活动 | `assessmentResourceClient` / 注册面板、`assessment-resource.contract.ts` / `.service.ts` 增加明确 GROUP 分支；现有个人分支保持原合同。父合同 GROUP 仍须列出合法叶及披露上限，不能从个人／纵向字段推导群报权。 |
| 库 Scale | 同样需要新的明确 GROUP 投放／适配版本，来源仍为同一已批准 Teacher SELF 库测量及精确组织分发许可 | 旧 `education-runtime-entry.ts` 的 v1 解释保持不变；增加显式版本／用途分支并沿现有精确身份 reader 消费。若不实施这个分支，本批就明确暂不开放库 Scale 群报，不能只放松 Teacher Run 校验。 |
| 活动与报告 | 原 Teacher productAdmin 选资源、发布活动；原有授权管理员读群报 | `huiteacher/run.service.ts` / `assessmentRunPolicy.ts` 只允许新 GROUP 合同的 SELF / SELF_REPORT / COHORT_AGGREGATE 收窄请求；复用现有 Run 具体叶来源和群报 Artifact／读取／打印入口。不是新增通用权限引擎或第二套报告页。 |

## 现有保护与首批范围

沿原合同取父／叶／任务／spec 人数下限的最大值，复用当前 Teacher 人群与差分披露、历史子群、Artifact 版本读取；不增加审批层、全平台安全矩阵或新质控研究。Bundle 只聚合合法测量叶，不含 Profile／Context。GROUP 发布不带来普通教师／被试的管理群报入口，也不自动给 SYSTEM_ADMIN 所有组织结果访问权。

必要验收只覆盖：原个人合同仍不能聚合；一个新经审核 GROUP 资源可通过真实活动生成／读取；叶下限仍有效且未新增本人数字披露。共用均值／计分不按三个工具家族重跑。实施前需 DOT 确认：是否接受第 3 项的 **GROUP 投放不新增本人数字摘要**，以及首批是否同时包含库 Scale 的新 GROUP 适配版本。确认前保持方案，不改 Teacher 生产文件。
