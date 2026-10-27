# School / Teacher 管理端独立切片

后续真实 HTTP 目录、App adapter 注入和事务版本绑定已在[第二切片](management-routing.md)实现；本文保留第一切片当时的状态与原始证据。

分支 `feat/pr363-education-management`，起点 `6cf241d65b4bc44878ef9d9fe21c81fdd02561cd`，主干参考 `7e6d7da4a01e4a42b410cf2dbdcfa76f11759fdc`。独立云端 `/workspace/eduK12-new-version` 已可用，原工作区干净，没有使用 Mac、创建其他对话或修改集成分支。

## 已核实调用点

- School：`frontend/src/school/SchoolActivityManager.tsx`，真实 API 为 `GET /organizations/:organizationId/activities/:courseId/run-resources`、`GET .../runs/:runId`、`POST .../runs/:runId/tracks`。旧目录只返回 Run policy 投影，没有新教育来源的完整准入信息；前端还曾显式过滤 COGNITIVE。
- Teacher：`frontend/src/huiteacher/HuiteacherEvaluationStudio.tsx`，真实 API 为 `GET /organizations/:organizationId/evaluation-events/:eventId/run/released-scales`、`GET .../run`、`POST .../run/tracks`。只有 Scale 目录。`run.routes.ts` 的 tracks 输入为 strict schema，当前不接受 `expectedVersion`。
- Teacher 群体 Form 继续使用 `/forms` 和原有 `HUITEACHER_FORM_GROUP_V1` / `COHORT_AGGREGATE` 配置；学生评价教师继续使用专用管理流程。新选择器只配置 TEACHER→TEACHER（School 为 STUDENT→STUDENT）、SELF、SELF_REPORT、INDIVIDUAL_ONLY、minimumRespondents=null。
- Training 参考为 `TrainingAdminResources.tsx`、`trainingResourceCatalog.ts` 和原 Composite 运行链；不使用其客户端、cookie、session ID 或材料授权代替教育入口资格。

## 本切片和后端接口需求

新增 `frontend/src/api/educationAssessmentResources.ts`，没有改动其他共享 API 文件。`EducationAssessmentResourceAdapter` 有两个由产品提供的操作：

1. `list(scope, cursor?)`：scope 为 `{product,organizationId,actorKey,workflowId,runId,expectedVersion}`。返回 `{scope:{product,organizationId,workflowId,runId,expectedVersion},list,nextCursor}`。`actorKey` 仅用于浏览器生命周期隔离，不能作为 HTTP 调用者身份。真实身份必须来自当前教育入口会话。
2. `addTrack(scope,input)`：input 为 `{expectedVersion,resource:{family,key,version},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},requestedPolicy}`，只提取已有服务器政策的个人 SELF 子集，不上传目录状态、原始 origin、C/P/R 对象、批准布尔值或 session ID。产品 adapter 必须映射到实际的受控 tracks 路由，并在服务端原子校验 workflow→run、当前 run 版本、当前编辑者权限、当前组织授权、原授权者证明、来源状态、许可、兼容性和冻结政策。

每个目录项的 DTO 为 `{title,family,key,version,product,organizationId,releaseStatus,availability,educationOriginHash,units,requestedPolicy}`：

- `family` 为 COGNITIVE / SITUATIONAL / BUNDLE；key 为 `education-assessment:PRODUCT:ORGANIZATION_UUID:RESOURCE_UUID`，version 固定 `1.0.0`。
- `releaseStatus` 只有 PUBLISHED 可呈现为可投放；DRAFT/HOLD/DEPRECATED/ARCHIVED 不可选。
- `availability` 由服务器核定 AVAILABLE / UNAUTHORIZED / INCOMPATIBLE / LICENSE_REQUIRED / HOLD，仅 AVAILABLE 可选；它是目录呈现状态，不取代 POST 的权威准入检查。
- `educationOriginHash` 和 `units` 使用当前 `assessment-resource.contract.ts` 的不可变来源字段。每个 unit 为 `{itemId,family,measurement:{releaseId,contentHash,measurementHash},references:[{releaseId,contentHash}],report:{releaseId,contentHash}|null}`。空 references 和 null report 是明确未选，不能替换为 latest。当前后端 unit 家族为 SCALE/COGNITIVE/SJT；包含 Form 的任意组合如何投影完整大纲，由 root 的冻结源合同决定，本线不自行新增来源家族。
- 原始内部 identity reader 的 `{origin,entry,runtime,releases,identityOnly:true}` 不能直接成为目录项。前端明确拒绝带 identityOnly 字段的行。由 root 的实际授权服务在上述检查后生成 DTO。

本提交没有虚构新 HTTP 路由或给现有 tracks 发送其 schema 尚不接受的字段。School / Teacher 管理页已新增可选的 `assessmentResources` adapter prop，并各自将当前 product/organization/activity-or-event/run/version/actor 传入共享选择器。root 仍须在真实产品 App 调用处注入 adapter；未注入时只显示目录暂不可用，没有调用不存在的接口。School 的旧目录不再按 COGNITIVE 家族删项，而是拒绝新的 education-assessment 命名空间经旧 policy-only 投影绕行；新来源一律走共享授权选择器。

已只读核对 root 的 `f46336cc45abaa21d4b946029cda2a0dfadec654`。其 `assertEducationAssessmentRunUse(tx,{actorUserId,organizationId,runId,resource})` 返回经 workflow/run、当前管理者和三个精确原始授权者证明检查后的 source。目录服务可在该成功结果上投影 title / applicability / origin.units / entry.educationOriginHash，并继续校验实际投放许可、兼容性；不能直接投影 identity reader 的结果为 AVAILABLE。该提交未 cherry-pick，本独立代码起点仍为 6cf241d65。

如果 root 选择为新目录建立 Teacher `GET .../run/resources` 或扩充 School 原目录，应以实际实现为准；本线未声称上述建议路由已经存在。现有 Teacher / School tracks 服务需接收并原子检查 expectedVersion，不能只在 adapter/浏览器中比较后再无条件写入。

## 管理权限与登记入口

共享选择器不新增题本、批准、发布或授权按钮。实际资源登记和编辑入口需由后端分别返回当前组织及入口的登记、审查、组织授权能力；调用者为已有教育产品管理员或被明确授权的心理教师，原授权者证明由后端校验。编制资格、内容审查、组织投放授权和报告开放不能互相推导。现有 `tool-authoring-capabilities` 仅代表私有 SCALE/FORM，不足以开放新来源登记或批准按钮。

## 生命周期与范围

加载/分页/空目录/错误/选择/写入/结果待核对均为受控状态。关闭、返回、卸载、切换组织/入口/身份/活动/run/版本/adapter 后迟到结果不能复活旧目录；同一读写同步加锁，重复点击不重复发送。相同资源 key/version 返回不同 originHash 时清空选择并停止添加；写入失败或写入后回读失败时，必须先读取任务配置核对，不自动重提。组件只解释目录资格，不读取、展示或开放个人报告。

本线不修改后端来源、迁移、运行源政策、Teacher 作答宿主、HuiteacherAssessmentTasks、报告或 CI。没有触碰 root 被拒绝上传的 `runtime-table-policy.json`。未创建替代 PR，未触发 CI、合并、部署或修改保护/凭据。

## 定向验证

初轮：Node 24.21.0 / Vitest 4.1.11，`EducationAssessmentResourcePicker.test.tsx` 24 PASS、`HuiteacherLibraryCatalog.test.tsx` 6 PASS、`SchoolActivityCatalogPagination.test.tsx` 2 PASS，总计 32 PASS，退出 0。这是合成 UI 契约，不是实际授权服务、PostgreSQL 或浏览器资格。原始 reporter/log 保留在 `evidence/management/`；初轮没有执行前的完整输入清单，不能追签为有完整历史输入证明的 CI 接纳。

随后只针对新增管理页消费、transport 更换中的写入恢复，以及修改的文案/同 adapter 上下文变化测试补验；未改正文的原成功测试不重复执行。最终命令、退出码与剩余未验证项见同目录验证记录。尚未运行真实 PG、浏览器、生产构建、正式 CI；最终资格由 root 冻结集成源码后独立决定。

补验 11 PASS / 16 filtered：8 个相关输入变更场景和 3 个新增场景。School 活动管理、Teacher 任务预览直接消费者另 18 PASS。合计 53 个不同 UI 用例、61 次实际成功用例执行（8 个受影响场景发生补验），没有原失败用例被改写为成功。前端 `tsc -p tsconfig.app.json --noEmit` exit 0；7 文件定向 eslint exit 0 / 0 errors / 5 warnings（ref cleanup 提示，含 1 个新组件提示）。`validation-summary.json` 保留精确命令与退出码，`validation-inputs.json` 是补验及静态检查前记录的前端文件哈希，未记录完整 node_modules 字节、不是签名证明。
