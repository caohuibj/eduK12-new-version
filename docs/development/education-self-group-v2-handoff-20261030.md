# SELF GROUP v2：共享接线与文件交接

本文件固定接口与所有权，供 DOT 交 School 线程；不是生产授权或已经完成的功能声明。

## 合同识别

沿现有 `COHORT_AGGREGATE`，不新增 analysisMode／数据库模式。同一个新明确发布的精确资源版本，使用 `resultDisclosure.policyKey = EDUCATION_SELF_GROUP_V2`、同名 cohortAnalysisPolicy.policyKey、`policyVersion = 2.0.0`；适用 subject/respondent 为同一角色且只允许 SELF / SELF_REPORT。教育／库 adapter 的新 GROUP 分支版本为2.0.0，旧1.0.0解释不变；原创 Teacher Scale 使用新的 `teacher-scale:<id>:GROUP` 发布资源。版本标记只是结构识别，必须再核对原发布的 resource key/version、entry hash 和真实使用／读取权限，不单独授予 GROUP。

新纯合同 helper 为 `assessment-policy/self-group-contract.ts`：导出固定key/version、结构识别和已批准本人上限校验，直接使用现有 ResultDisclosureContractV1；不构造新权限引擎。新GROUP允许原已批准 RESPONDENT（原合同也批准同一主体时含SUBJECT）摘要；metricKeys／longitudinalMetricKeys／时机只能保留或收窄。同一次 FINAL 投影，组织仅聚合。三个共享本人reader继续先核对实际发布entry，再接受新V2自有摘要；通用 raw COHORT_ONLY 不改。

School 的 TEACHER / PROFESSIONAL / ORGANIZATION 每个聚合规则必须在新完整披露合同内分别明确批准；未批准即NONE，不允许从ORGANIZATION回退、复制到另一个受众或推导角色读权。Teacher同样只给明确批准的现有管理受众，不扩大实际角色。

## 当前文件所有权

- 本群体线程：新增纯合同helper；`assessment-relational/product-registry.ts`；`education-tools/assessment-resource.contract.ts` / `.service.ts` / 对应source/repository的新native发布身份；`scale-library-governance/education-runtime-entry.ts` / `education-runtime-resources.ts`的新库版本；`reporting/education-assessment-personal-report.service.ts`、`education-scale-personal-report.service.ts`、`respondentSummary.ts`；Teacher注册／许可／Run／读取与原注册UI接线。`assessment-run/registeredResources.ts`仅追加Teacher GROUP，不改School旧注册分支。
- Long / School线程：School私有工具、普通组合、campus、`educationCompositionExecution`及它们的私有来源／发布接线；不要并发改上述共享发布／本人reader。School可在自己的新发布entry中使用固定V2合同helper，沿同一次FINAL和原群报消费，不复制统计／个人reader。
- 历史续页拟涉及 `reporting/task-artifact.ts` 和 Survey / Training服务／页面。`group-longitudinal.ts`不改；task-artifact先交接口，等待Long自然点确认文件状态再写，不覆盖未发布变更。

## 历史续页拟定最小接口

现有 Task Artifact目录增加可选 `before: {generatedAt:string,artifactId:string}`，SQL按`(generated_at,id)`稳定倒序游标，返回`{artifacts,nextCursor}`。Training先对每个指针按真实任务来源授权，再形成页，而不是先截全课程25个后筛；来源清单的100条仅是UI发现窗口，不当完整授权集。旧版本列表提供“更早版本”，只读目录指针，不加载／解密或重新扫描FINAL。保持原单个Artifact读取接口。Survey/Training路由新增可选cursor query；已有调用者保留原默认首屏行为。

待School线程对接受众及版本契约后，实际代码分批提交；当前Legacy Scale兼容修复独立于上述共享文件。

## 已落地的共享 API（第一提交）

模块：`server-version/backend/src/modules/assessment-policy/self-group-contract.ts`。

- `SELF_GROUP_POLICY_KEY = 'EDUCATION_SELF_GROUP_V2'`；`SELF_GROUP_POLICY_VERSION = '2.0.0'`。
- `SelfGroupAggregateAudience = 'PROFESSIONAL' | 'TEACHER' | 'ORGANIZATION'`。
- `isSelfGroupV2Entry(entry)`：只识别 SELF／SELF_REPORT、同一 subject/respondent 角色、COHORT_AGGREGATE 与两个固定政策标识；不是授权证明。
- `assertSelfGroupV2Entry(entry)`：验证完整披露合同与 cohort policy 一致；个人摘要只允许 RESPONDENT／SUBJECT，聚合只允许上述三个逐个明确声明的受众。
- `selfGroupAggregateCeiling({contract,audience})`：该受众没有聚合批准返回 null，绝不回退；否则返回该受众原规则（含 delaySeconds）及内容 minimumRespondents。实际生成／读取还要和父 Track、任务、Spec 下限取 max，并使用原延迟检查。
- `assertSelfGroupOwnSummaryCeiling({approved,proposed})`：发布时用原经批准本人合同核对摘要／纵向指标只能保留或收窄，SUBJECT 不因与本人是同一主体而自动继承 RESPONDENT。原 feedbackPolicy／时机另行原样冻结并核验，不由这个 helper 推导。
- `buildSelfGroupCohortAnalysisPolicy(contract)`：原 `RelationalCohortAnalysisPolicyV1`，schemaVersion=1、固定 key/version、合同 minimumRespondents、三个获准聚合受众 metricKeys 的去重并集；没有聚合指标时拒绝。
- `selfGroupParentIdentitySchema`／`SelfGroupParentIdentity`：`{resourceKind,resourceKey,resourceVersion,entryHash}`，资源精确版本和 entryHash 必须来自已核验发布记录。
- `resolveSelfGroupLeafIdentity({parent,leaf,core}): SelfGroupLeafIdentity`：leaf 沿用 `ReportingLeafSourceV2`（slotKey、unitType、instrumentKey、instrumentVersion、compiledRuntimeHash）；core 沿用 `CanonicalUnitResultCoreV1`。调用者先核验发布父及 frozen parent→slot 映射，本函数再比对实际 canonical 的类型、工具／版本、runtime hash。返回 `{parent,leaf,disclosureIdentityHash}`。

`disclosureIdentityHash` 不包含父容器、slot、值、个人身份或 compiledRuntimeHash，包含实际工具／版本、sourceDefinitionHash、scorer、Cognitive protocol/profile/config 及指标单位，因此同一个叶工具放进另一个父容器不能建立独立披露身份。它仅服务来源披露分域；跨波可比性仍使用现有 C 身份／version axes，不把它另作纵向引擎。P/R 选择、父合同、entryHash 和执行 runtime hash 仍分别核验，不能靠这个 hash 替代。

School 持有的来源 resolver 负责在父来源和 canonical 叶来源之间提供上述真实映射，并按实际 PROFESSIONAL／TEACHER／ORGANIZATION 选择原规则；不要将父的 GROUP 合同隐式当作叶的 GROUP 批准。新 helper 尚未接到发布／读取生产路径，Teacher 全量实现继续下一切片。
