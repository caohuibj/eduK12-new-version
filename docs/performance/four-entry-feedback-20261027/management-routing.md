# 管理端第二切片：真实目录与任务写入接线

继续使用独立云端和 `feat/pr363-education-management`。第一切片为 `c656b5ce811813b6753aab1cb9c972e0a4d0ba1e`；正常吸收 root 来源基础 `f46336cc45abaa21d4b946029cda2a0dfadec654` 的合并提交为 `95a4ca5d6c9d4e31be332545af2777af85c18ca8`，无 force。第一切片中“等待 adapter”的记录保留为当时事实，以下真实接线取代该待办。

## 实际路由和协议

- Teacher：`GET /api/huiteacher/organizations/:organizationId/evaluation-events/:eventId/run/assessment-resources?runId=UUID&expectedVersion=N[&cursor=UUID]`。沿用当前 Teacher 认证、产品管理员/MFA 会话门槛；actor 仅来自 req.user。
- School：`GET /api/campus/organizations/:organizationId/activities/:courseId/runs/:runId/assessment-resources?expectedVersion=N[&cursor=UUID]`。沿用 School 认证和实际活动/run editor，并在目录事务内再次检查活动编辑权限。
- 两者响应 DTO 沿用第一切片 `{scope:{product,organizationId,workflowId,runId,expectedVersion},list,nextCursor}`，另有受控 `unavailableCount`。每个 list 项只含标题、精确 resource ref、产品/组织、PUBLISHED/AVAILABLE、origin hash、测量 C/P/R 指针和已核定的个人政策。没有题本、素材 URL、runtime id、原始原件或授权者证明。
- 写入继续使用对应原 `.../tracks` POST。新命名空间的 body 现在同时要求 `expectedRunId` 和正整数 `expectedVersion`；旧 Form/Scale 请求不要求新增字段。Teacher event 隐式 run 路径仅有版本号无法拒绝“event 换绑到同版本号另一 run”，因此新字段是必要的精确绑定，不是浏览器权限证明。
- `frontend/src/api/educationAssessmentResourceClient.ts` 的真实 factory 使用产品已存在的同源 API；不发送 actorKey、session ID、目录批准状态或 origin 对象。客户端 scope 的 product、组织/workflow/run UUID、版本和 cursor 均严格检查。

## 目录和仓储检查

新增 `education-tools/assessment-resource.catalog.ts`。先读取实际持久化 workflow/run，核对入口、组织及活动/event，保持 Organization 在 Activity/source 之前的锁顺序。空目录也核当前管理者权限。仅 DRAFT workflow 与 DRAFT run 可读目录，期望版本不同返回 409。

候选 SQL 只从当前 product、organization 的 PUBLISHED `education_assessment_deliveries` 读 id/family，按 id 游标最多取 11 条，最多检查/输出 10 条。每项通过 root 的 `assertEducationAssessmentRunUse` 完整成功结果和实际 START adapter 能力后才生成 AVAILABLE 投影；没有直接调用 identity reader 冒充准入。来源停用、原授权者撤回和运行 adapter 尚未启用可计为受控不可用；数据库/传输错误、来源身份损坏不静默变空。目录不自动批准工具或开放报告。

新命名空间写入的 `expectedVersion` 透传到原仓储的 `SELECT ... FOR UPDATE` 后比较，再插入 track 并递增 version。仓储还要求 `expectedRunId===runId`，以及由真实产品路径提供的 `educationWorkflow:{product,id}`，并在同一事务内重新读/锁定该确切 workflow、复查 root 来源授权和政策收窄；通用组织 tracks 路径没有产品 workflow，不能借该路径写新来源。旧命名空间不受这项新要求影响。

Teacher 的学生评教师专用 Form config 在目录中拒绝，并在新来源写入事务中再次拒绝；现有 `addTeacherRunTrack` 的专用保护保持。当前 Teacher/School 管理页仍保留原量表、私有工具与群体 Form 的独立协议。

## App 合并区段

- `HuiteacherApp.tsx`：一个 `educationAssessmentResourceClient` import、teacherApi 之后的稳定 factory 实例、`ht-school-evaluations` 的管理组件 adapter prop。隐藏该分区时撤下 adapter，让迟到响应失效；不会卸载已有表单编辑器。
- `SchoolApp.tsx`：同样一个 import、api 之后的稳定实例、SchoolActivityManager 的 adapter prop。
- `SchoolActivityManager.tsx`：compact 管理页离开 assessments 分区时撤下目录 adapter，保留活动/run 和草稿输入。

上述 App 修改未触碰作答宿主、HuiteacherAssessmentTasks 或报告展示。如果运行工种也添加 App import，请按这三个最小区段合并。

## 纯 Form 组合

选择器允许 BUNDLE 的测量 `units=[]`，仍要求 PUBLISHED、AVAILABLE、精确来源 hash、个人 SELF/INDIVIDUAL 政策和版本；COGNITIVE / SITUATIONAL 仍要求各自唯一测量单元。纯 Form 组合显示完成确认说明，不制造心理分数、C/P/R 指针或报告。实际非空 Form section 与 runtimeDefinitionHash 的来源校验仍由 root 负责；本分支没有修改其 origin/schema/producer。

## 复用与必要适配

以 Training 已有资源管理、固定版本选择、分配草稿→预览→发布流程为功能参照；两教育入口共用同一个选择器和 API factory，没有各造一份目录 UI。共享 `readEducationRunLibraryContext` / Run manager boundary / School activity editor 提供现有工作流和身份权限；`relationalEntryToRunPolicy`、`assertRunTrackNarrowing` 与原 Run 仓储行锁/版本递增提供同一政策和存储实现。root 的来源合同继续复用 Training Composite flow、C/P/R 发布与共享执行引擎，本线没有新增任何题本、作答、计分、报告或版本存储引擎。

必须新增的适配只有：两个已认证产品路径、按当前教育组织与 workflow 授权的最小目录投影、同源客户端注入、精确 run/event/版本写入绑定及隐藏分区生命周期。Training 资源目录的管理者身份与材料权限不能直接替代教育产品的组织授权，因此没有复用 Training 客户端凭据或将其目录直接透传。

## 验证与剩余边界

所有原始命令、退出码、reporter、输入快照和无损日志位于 `evidence/management-routing/`。Node 24.21.0 / Vitest 4.1.11。先运行本切片新增或受影响项；随后仅对锁序、隐藏分区、精确 run 绑定和专用学生 Form 拒绝做相应补验。未把旧失败、未执行或 filtered 状态改成 PASS。不同源码快照的中间类型检查保留原身份，最终前端类型对应 run-binding 快照，最终后端类型另覆盖 protected-Form 增量。

结果为后端 48 个不同用例、前端本片 9 个不同用例（其中 7 个新增，2 个为受影响的原选择器提交场景）；共 88 次实际成功用例执行。没有应用检查失败。前后端最终类型 exit 0；相关 lint 均 exit 0 / 0 errors，保留 5 个不同的既有警告位置。最初目录 15 个成功用例只因新增 Organization 锁顺序受影响而补验；HTTP GET、旧 Teacher 路由等不受后续 run-binding POST 修改影响的原成功场景未重复。

其中基础设施失败与来源损坏两个参数用例保留了原重复 fullName（后端共有 47 个不同 fullName、48 个参数用例）。证据按原文件、原 fullName 和同名 occurrence 区分，原始 reporter 顺序与源输入均保留，不把历史标题改写为新身份；不能仅按 distinct fullName 数声称覆盖全部参数输入。

HTTP 测试实际启动 loopback Express，真实 factory 穿过两个真实产品路由；认证/业务/数据库使用明确的合成 mock，不能证明生产 cookie、真实 PG 授权或并发。仓储测试检查事务分派、行锁查询、版本冲突阻止 INSERT/UPDATE 及路径关联拒绝，也是 mock 合同。没有运行实际 PG 业务链、并发 CAS、浏览器、生产构建、CI、合并或部署。

该 HTTP 合同为核实真实 factory，直接导入相邻前端的 `api/educationAssessmentResourceClient.ts`、`api/educationAssessmentResources.ts` 与 `test/educationAssessmentResources.fixture.ts`（均为纯 transport/数据，无浏览器依赖）。最终 CI 必须保留这些精确输入及仓库相对布局，不能仅复制 backend 子目录后声称测试环境相同；后端生产编译本来排除 __tests__，不新增运行时跨包依赖。

root 仍需完成并集成来源登记/审核/发布 producer、纯 Form origin 修订、START/C/P/R/素材许可及报告终端检查，并用实际已授权合成来源验证真实 PG、浏览器和并发。目录主动保留实际 runtime adapter 准备门槛；本切片不因为系统支持家族就自动展示未满足准入的具体工具。
