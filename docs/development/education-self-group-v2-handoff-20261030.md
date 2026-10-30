# SELF GROUP v2：共享接线与文件交接

本文件固定接口与所有权，供 DOT 交 School 线程；不是生产授权或已经完成的功能声明。

## 合同识别

沿现有 `COHORT_AGGREGATE`，不新增 analysisMode／数据库模式。同一个新明确发布的精确资源版本，使用 `resultDisclosure.policyKey = EDUCATION_SELF_GROUP_V2`、同名 cohortAnalysisPolicy.policyKey、`policyVersion = 2.0.0`；适用 subject/respondent 为同一角色且只允许 SELF / SELF_REPORT。教育／库 adapter 的新 GROUP 分支版本为2.0.0，旧1.0.0解释不变；原创 Teacher Scale 使用新的 `teacher-scale:<id>:GROUP` 发布资源。版本标记只是结构识别，必须再核对原发布的 resource key/version、entry hash 和真实使用／读取权限，不单独授予 GROUP。

新纯合同 helper 计划为 `assessment-policy/self-group-contract.ts`：导出固定key/version、结构识别和已批准本人上限校验，直接使用现有 ResultDisclosureContractV1；不构造新权限引擎。新GROUP允许原已批准 RESPONDENT（原合同也批准同一主体时含SUBJECT）摘要；metricKeys／longitudinalMetricKeys／时机只能保留或收窄。同一次 FINAL 投影，组织仅聚合。三个共享本人reader继续先核对实际发布entry，再接受新V2自有摘要；通用 raw COHORT_ONLY 不改。

School 的 TEACHER / PROFESSIONAL / ORGANIZATION 每个聚合规则必须在新完整披露合同内分别明确批准；未批准即NONE，不允许从ORGANIZATION回退、复制到另一个受众或推导角色读权。Teacher同样只给明确批准的现有管理受众，不扩大实际角色。

## 当前文件所有权

- 本群体线程：新增纯合同helper；`assessment-relational/product-registry.ts`；`education-tools/assessment-resource.contract.ts` / `.service.ts` / 对应source/repository的新native发布身份；`scale-library-governance/education-runtime-entry.ts` / `education-runtime-resources.ts`的新库版本；`reporting/education-assessment-personal-report.service.ts`、`education-scale-personal-report.service.ts`、`respondentSummary.ts`；Teacher注册／许可／Run／读取与原注册UI接线。`assessment-run/registeredResources.ts`仅追加Teacher GROUP，不改School旧注册分支。
- Long / School线程：School私有工具、普通组合、campus、`educationCompositionExecution`及它们的私有来源／发布接线；不要并发改上述共享发布／本人reader。School可在自己的新发布entry中使用固定V2合同helper，沿同一次FINAL和原群报消费，不复制统计／个人reader。
- 历史续页拟涉及 `reporting/task-artifact.ts` 和 Survey / Training服务／页面。`group-longitudinal.ts`不改；task-artifact先交接口，等待Long自然点确认文件状态再写，不覆盖未发布变更。

## 历史续页拟定最小接口

现有 Task Artifact目录增加可选 `before: {generatedAt:string,artifactId:string}`，SQL按`(generated_at,id)`稳定倒序游标，返回`{artifacts,nextCursor}`。Training先对每个指针按真实任务来源授权，再形成页，而不是先截全课程25个后筛；来源清单的100条仅是UI发现窗口，不当完整授权集。旧版本列表提供“更早版本”，只读目录指针，不加载／解密或重新扫描FINAL。保持原单个Artifact读取接口。Survey/Training路由新增可选cursor query；已有调用者保留原默认首屏行为。

待School线程对接受众及版本契约后，实际代码分批提交；当前Legacy Scale兼容修复独立于上述共享文件。
