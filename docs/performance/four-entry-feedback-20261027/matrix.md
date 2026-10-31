# 四入口作答—反馈—存储矩阵与下一切片

基线：main `7e6d7da4a01e4a42b410cf2dbdcfa76f11759fdc`（PR361已合并，正式CI及main源检查成功，未部署）。本页为源码核查，不把接口存在当作当前生产可用或完整端到端验收。

## 状态口径

- **已接线／待补证**：读到前端与后端对应调用，不代表本轮全部运行。
- **部分证据**：PR361隔离代表链或既有正式验收有明确范围，不外推其他工具。
- **受控保留**：有意不开放的权限、内容或协议；优化不解禁。
- **未接入**：当前产品没有相应参与流程；不是本优化批自动新增的产品需求。
- 开始/恢复分别包含真实准入和原绑定恢复；完成子项不等于整卷完成。

## 20行工具—入口矩阵

|入口／工具|开始、恢复|交卷|反馈|存储|缺口／本轮处理|
|---|---|---|---|---|---|
|Survey FORM|研究波次与身份；可选加密checkpoint|研究FINAL、摘要/提交ID重放|GENERAL_ONLY首交内联回执；描述模式另读|SurveyWaveFinal加密结果|普通20题有HTTP样本；不生成心理分数|
|Survey SCALE|波次冻结内容/参数/报告；问卷恢复|研究FINAL中的量表计分|按报告模式和披露合同|研究FINAL结果；既有compact codec|逐工具描述反馈与浏览器可见时间待补|
|Survey COGNITIVE|独立research cognitive子session，与parent绑定|子FINAL引用进入研究FINAL|按研究报告合同；不等同Training原始指标页|SurveyCognitiveSession/Result及研究FINAL|本批不激活PR360候选；恢复/归档边界需独立证据|
|Survey SJT|native子attempt绑定、专用resume|native提交回执引用进入parent FINAL|授权general/描述反馈|原native结果与parent结果|Form+native代表HTTP与恢复有证据；不是全部SJT已上线|
|Survey组合|研究task/package冻结；与Training Composite不同|whole研究package FINAL|general与授权package报告|研究FINAL和package报告密文|代表链有证据；不能直接换用Training API|
|Training FORM|Composite current-unit；本地sealed draft恢复|FORM_SECTION FINAL；整卷模式另分|父完成后报告路由，表单只给获准摘要|CompositeFormAnswer及section attempt/whole envelope|表单section完成不触发整卷反馈；本批保留|
|Training SCALE|Composite准入、current-unit、冻结版本|Scale FINAL receipt；重放不重复接受|已有完成后转报告；whole可能PENDING|Scale结果/共享facts及parent引用|PR361 prepared whole有证据，不算真实发布/START|
|Training COGNITIVE|既有CognitiveRunner及Composite子项|一次性FINAL、父子绑定|按独立/组合及报告开放规则|当前main仍写CognitiveRawSubmission|不把未合并COS改造计为已完成，不增加科研重算|
|Training SJT|SituationalRunner及组合绑定|既有情境FINAL及父推进|独立/组合报告按授权|SituationalRawSubmission及冻结结果|完整链与延迟开放证据待逐例绑定|
|Training组合|CompositeAssessmentPage；已有绑定恢复|同步与whole耐久ACK/worker分开|现有报告页、状态等待；ACK不是报告|parent/child facts、outbox、整卷envelope|已有自动转报告为教育入口UX参考；不复制异步协议|
|School FORM|官方Run START/恢复，SchoolCompositeRunner|共享FORM_SECTION FINAL|完成确认，不请求个人量表报告|共享Form/Composite事实|既有FORM无报告读取断言保留；不得误触自动报告|
|School SCALE|官方Run、同意/组织/受试身份；current-unit|共享Scale FINAL receipt|独立student反馈接口；获准量表报告或完成/暂缓状态|共享Scale facts/报告引用|PR361真实服务完成+报告HTTP；下一切片直接引导获准反馈|
|School COGNITIVE|校园专用parent/child/session适配|校园一次性FINAL；禁止Training凭据及逐trial接口|student披露政策；无已审解释则不给原始分|共享认知FINAL原件/parent事实|代码接线已核，当前全部工具内容/浏览器未验；不扩范围|
|School SJT|校园专用Situational客户端resume|校园child FINAL，再读parent|student独立披露，不因提交就开放|共享情境FINAL/parent事实|宿主和路由已核；逐内容资格与浏览器待补|
|School组合|官方Run对应Composite；各子项宿主|子项完成后load，parent COMPLETED才完成|目前完成页→返回列表→另点反馈|Composite及各子事实|下一切片只对已完成、允许查看反馈的本人任务减少绕路|
|Teacher FORM|内置评价form-attempt及私有Form Composite两协议|内置FINAL或私有FORM_SECTION；身份/版本约束不同|完成确认；群体反馈有独立隐私发布|原Form/Composite记录|两个协议分别保留；不造个人心理分数或报告|
|Teacher SCALE|start-scale或既有绑定恢复；current-unit|共享Scale FINAL receipt|personal-summary独立鉴权；当前完成后刷新列表再点|共享Scale事实/教育本人报告|PR361默认+compact正式PG覆盖；下一切片自动读取获准反馈|
|Teacher COGNITIVE|当前参与入口无该runner；Scale宿主明确拒绝|未接入|不适用当前本人Scale流程|无本入口新写入链|保留未接入，不当成性能优化需扩权|
|Teacher SJT|run schema虽有SITUATIONAL，service实际拒绝非FORM/SCALE|未接入本人参与链|不适用|无已确认本入口写入链|不能按管理枚举宣布已支持；本批不开发|
|Teacher组合|FORM/SCALE内部借Composite运行，不等于任意BUNDLE产品|仅对应工具协议|仅各自授权反馈|对应Composite实现细节|run service拒绝BUNDLE；任意组合参与未接入|

## 可追溯源码索引（相对仓库根）

- Survey：`server-version/frontend/src/survey/SurveyPublicApp.tsx`；`server-version/backend/src/modules/survey/public.routes.ts`、`final.service.ts`、`cognitive.public.routes.ts`、`situational-native.public.routes.ts`。
- Training／共享：`server-version/frontend/src/modules/composite/CompositeAssessmentPage.tsx`、`CompositeReportPage.tsx`；`server-version/frontend/src/components/FinalCompositeAssessment.tsx`；`server-version/backend/src/modules/composite/final-submit.service.ts`、`whole-questionnaire.service.ts`。
- School：`server-version/frontend/src/school/SchoolCompositeRunner.tsx`、`SchoolStudentTasks.tsx`；`server-version/backend/src/modules/campus/composite.routes.ts`、`activity.run.routes.ts`、`report.routes.ts`、`student-feedback.ts`。
- Teacher：`server-version/frontend/src/huiteacher/HuiteacherAssessmentTasks.tsx`、`HuiteacherMyFormTasks.tsx`、`HuiteacherMyPrivateFormTasks.tsx`、`HuiteacherMyScaleTasks.tsx`；`server-version/backend/src/modules/huiteacher/run.service.ts`、`formRuntime.routes.ts`、`privateFormRuntime.routes.ts`、`scaleRuntime.routes.ts`。
- 共享存储／报告：`server-version/backend/src/modules/assessment-runtime/compact-assessment-storage.ts`；`server-version/backend/src/modules/reporting/education-scale-personal-report.service.ts`；`server-version/backend/src/modules/cognitive/unified-final-submit.service.ts`；`server-version/backend/src/modules/situational/situational-final-submit.service.ts`；`server-version/backend/prisma/schema.prisma`。

## 下一最小切片：完成后直接到获准反馈

目标不是用receipt冒充报告，也不是删掉当前权限查询。参考Training已有完成后转报告、Survey已有内联一般回执，补School/Teacher教育本人任务完成后的UX断点。

1. 仅在权威parent状态COMPLETED时触发；不能由child receipt.completed或空currentItem推断父完成。
2. School FORM仍只完成确认，observer不触发学生本人报告。School非Form本人任务与Teacher SCALE调用各自**现有**受控报告接口；不合并两种身份域。
3. 复用一个有界完成后读取生命周期：每次完成信号最多一次、请求状态明确、失败可手动重试；切换身份/任务/退出后迟到响应不能复活旧报告。不轮询、不跨请求缓存权限。
4. 完成确认先展示；反馈读取失败不反转已接受FINAL、不重新交卷、不让作答者卡住。保留关闭/返回/重新读取途径。
5. 列表刷新与报告读取不串行等待；已完成任务的状态展示不能依赖列表网络成功。并发读取是否值得做需结合实际渲染结构，避免报告跟随列表pending一起消失。
6. 保持原报告组件和WITHHELD／COMPLETED／READY处理，未知格式不展示数值；不绕过科学适龄或延迟开放政策。

### 影响与最小验证计划（尚未执行）

- 修改：教育本人完成转反馈的前端生命周期及直接消费者；后端/schema/计分/版本/归档不动。
- 单元：正常完成、FORM与observer无读取、child未完成无读取、重复完成只一次、报告失败仍已完成、重试、关闭、切换任务/身份、晚返回拒绝、WITHHELD与未知格式不泄漏。
- 真实浏览器：复用已合格且完全匹配的后端产物；新前端只构建一次。School/Teacher本人量表完成立即呈现获准反馈，刷新/返回及手机键盘；Form/observer反例。若不可获取匹配产物，明确缺项，不能拿mock当后端真实链。
- 性能口径：预计少一次手动找任务/点反馈，不承诺少一次后台报告读取。记录接受确认→反馈可见、请求数；后端SQL优化已经PR361完成，不重复开发或重测。
- CI：实际修改后读取checklist再冻结候选及路由。现有PR361精确限定路线不接受新前端文件，不复用其绿灯作为本批资格；不先激发全平台试错。

本页只完成源码级20行矩阵与切片范围，不是20条全链运行PASS。存储摊销、持续多用户并发与浏览器统一口径仍开放。

## 用户追加：系统功能补齐优先（07:53 UTC）

上述20行是当前事实，**不是允许长期维持缺口的产品决定**。用户明确要求补功能、对齐Training，工具开发和实际使用由管理员或获授权心理老师负责。以下新范围取代前述“本批不开发Teacher新家族”的排期，历史核查保留。

### 两条相互独立的链

- 系统能力：发布/授权配置、正式任务、START/恢复、FINAL、获准反馈、存储与管理。不能因暂时无获批工具而硬编码不支持认知/SJT/组合。
- 内容资格：具体工具及内容/参数常模/报告三版本、许可、适用角色/年龄、授权范围、开放时间。由既有治理角色决定；系统提供配置与执行机制，不由开发者自动发布工具或解禁报告。

### 依赖顺序及小提交边界

1. 资源合同与冻结来源：复用Training `training-content-binding.ts` 已有SCALE/COGNITIVE/SJT source identity、C/P/R引用及Composite，不另建计分引擎。补教育产品所需的资源家族表达、精确发布来源与组织授权适配。单独的COGNITIVE现有Run类型虽声明，但生产adapter/关系合同尚不完整，不能只加下拉框。
2. 作者/管理员配置与治理：复用已有资源注册和授权边界，补可发现的认知/SJT/组合候选与批准版本；Teacher本人的任务与学生评教师群体Form独立。不得以删除`FORM/SCALE`拒绝条件替代资源权限。
3. Teacher运行适配：身份域仍SCHOOL账号+HUITEACHER entitlement，核组织、run、subject/respondent、具体child/session、冻结来源；复用Composite/Cognitive/Situational引擎和一次性FINAL。Training cookie、任意session ID或相同用户ID不能跨入口通行。
4. 报告功能：通用获准报告投影消费已有计分结果与冻结报告版本；支持完成、待生成、延迟开放、不可披露与可读。模板/阈值由工具授权版本提供。School不硬编码永远不给报告，但没有适用获批内容时仍不裸露原始指标；本批不造学生常模或自动批准内容。
5. 前端共享宿主：抽取已有runner的transport adapter，保留主题、列表及组织场景。复用恢复、轻量回执和完成后反馈处理，不复制一套题型引擎。表单不强行生成心理报告。
6. 验证与发布：合成已授权工具验证Teacher认知/SJT/混合组合及School相关消费者，正反权限、重放/恢复、撤回/急停、延迟开放、原始事件存储、C/P/R冻结。实际工具仍可保持DRAFT/HOLD；不以测试夹具当真实工具已上线。

### CI边界重定

扩展涉及后端资源/运行/报告与前端，不再按前述纯前端小修计算。每个commit保留可回退边界；正式候选冻结后再选择受影响的PG/合同/前端/浏览器/构建/扫描，不沿用PR361的范围或绿灯。是否需要迁移以现有存储模型可否承载为准，不预先新增六张表或另造治理系统。共享合同变化应核Survey/Training直接消费者，不能只测新增入口。

当前仅完成分析和范围调整；新能力未实现、未验证、未启用。先补系统能力，不开展具体工具研究/编写，不越过新的认知示意图人工审核。
