# 四入口的 Enumeration native 适配边界

基线 `a67f425269283d8281379fdf8234f9fd6b0acebc`；分支 `review/cog-entry-adapters-20261028`。这份表来自实际客户端、router、service、native hook及定向合同用例，**不是四入口新登录施测成功证明**。Enumeration原计分/时序/3+25未重跑。

结论：当前没有“后端已经授权、仅遗漏客户端archiveRaw”的School/Teacher/Survey路径。三者的问题涉及已有身份/Composite/模板/完成收据合同。未添加客户端方法、未调用Training后备、未移除guard，也未扩展后端权限。实际可逆交付是准确的入口表与可执行边界证据。

## 逐入口事实

| 入口 | 真实身份与START | 实际读取／FINAL | 原件归档 | Enumeration现状 |
| --- | --- | --- | --- | --- |
| Training authenticated standalone/course（对照） | 现有LEGACY/TRAINING学生身份；`POST /api/cognitive/sessions`，body assignmentId；课程/任务/版本准入 | `GET /api/cognitive/sessions/:id`；`POST .../:id/submit`；native要求精确coreSaved/epoch/submission/hash回执 | cognitiveApi已有archiveRaw/getRawArchive；`POST/GET .../:id/raw-archive`；POST为有界octet-stream，独立确认后清理 | 源码支持，并有旧隔离3+25/HTTP/IndexedDB/归档证据。正式库发布和真实投放不是本次证明 |
| School | School cookie/CSRF；学生SELF的官方Activity/Run Composite；`POST /api/campus/organizations/:org/activities/:course/runs/:run/executions/:execution/start` | `GET /api/campus/composite-attempts/:parent/items/:slot/cognitive/:session`；`POST 同路径/submit`，只返完成收据 | 客户端无archiveRaw；campus router无原件端点。通用归档拒Composite，且通用认证不是School credential audience | 当前不支持Enumeration native。Composite配置读取仍走legacy registry；campus runner还固定aggregateOnly，不能仅补方法 |
| Teacher | HUITEACHER cookie/CSRF及当前Teacher来源/Run授权；`POST /api/huiteacher/run-executions/:execution/start-assessment`，返回官方Composite绑定 | `GET /api/huiteacher/assessment-composite-attempts/:parent/items/:slot/cognitive/:session`；`POST 同路径/submit`，完成收据 | 注入Teacher client无archiveRaw/getRawArchive；Teacher router无原件端点，通用归档也拒Composite/非通用学生身份 | 当前不支持Enumeration native。除Composite/aggregateOnly外，Teacher runtime projection刻意未透传nativeTask/sessionSnapshot，FINAL不返回native coreSaved身份收据 |
| Survey respondent | `credentials:'omit'`的public proof，不是Training/School cookie；`POST /api/public/survey/r/:public/attempts/:attempt/cognitive/:slot/start` | `POST 同路径/:session/read`；`POST 同路径/:session/final`，严格120条及resultReference | Survey client无archiveRaw并设localDraftScope；专属router没有原件端点，使用独立SurveyCognitiveSession/Result模型 | 固定gonogo-software-frame-v1模板，120题Go/No-Go，未承载Enumeration。不是缺一个通用客户端方法 |

公开access-token入口也不支持：`assertNativeDeliverySupported(resource,'public')`拒Enumeration；publicCognitiveApi未提供archiveRaw。不能把“public Survey固定Go/No-Go可运行”写成Enumeration四入口可运行。

## 精确阻止位置

- `frontend/src/modules/cognitive/pages/CognitiveRunner.tsx:79–85`：campus/embedded均成为relationalMode，传aggregateOnly=true。
- `frontend/src/modules/cognitive/core/useCognitiveSession.ts:213–216`：native先核snapshot，再拒无archiveRaw、aggregateOnly或localDraftScope；发生在校准/曝光及FINAL之前。给测试对象临时塞一个archive函数仍绕不过后两项。
- `frontend/src/school/SchoolCompositeRunner.tsx:115`：只建立当前Composite child读/FINAL/media client；没有standalone启动或Training回退。
- `frontend/src/huiteacher/assessmentRuntime.client.ts:31`：相同绑定到parent/item/session的Teacher client，完全使用注入的Teacher transport。
- `backend/src/modules/composite/composite.service.ts:552`及`:2426`：配置校验和冻结Profile解析仍requireCognitiveRegistryEntry。Enumeration只在native resource registry，不在这个legacy registry，不能据通用authenticated admission推断Composite可启动。
- `backend/src/modules/huiteacher/assessmentRuntime.routes.ts:33`：运行数据白名单未含nativeTask/sessionSnapshot；完成后进一步只保留收据字段。School完成读取同样刻意不披露未批准的指标。
- `backend/src/modules/cognitive/raw-archive.routes.ts:23`：通用归档authenticate＋STUDENT；`raw-archive.service.ts:58–60`先核同一user owner，随后明确拒Composite parent/item、accessToken。userId=null和不同owner实际先得到ARCHIVE_FORBIDDEN/403；同owner Composite/access-token得到UNSUPPORTED_ARCHIVE_SCOPE/422。
- `backend/src/modules/survey/cognitive.definition.ts:45–56`固定Go/No-Go；`cognitive.public.routes.ts:20`的FINAL长度固定120。Survey proof和本机保留scope均独立，没有原生Enumeration准入。

## 最小后续改动建议（pending，未实施）

School/Teacher如果后续获准支持Enumeration，最小工作包仍需要后端及产品合同，不能只有client archiveRaw：

1. Composite精确native资源准入及冻结Profile读取；保留parent/slot/source/epoch/admission绑定，不能把legacy helper改名后当作已有资格。
2. School/Teacher各自已认证域下的parent/slot/session原件端点，复用现有存储/加密/幂等设施，但必须沿当前respondent、subject、Run和consent重新授权。不得删除通用loadAuthority的Composite/accessToken/userId限制来借其权限。
3. 初次/恢复读取透传必需native身份及snapshot；FINAL提供精确coreSaved身份、payloadHash和完成状态，不必因此泄露表现指标。当前completed-only/独立反馈政策保持，任何披露扩展另审。
4. 后端合同存在后，再在注入的School/Teacher client增加本域archiveRaw/status，支持原octet-stream与identity字段。最后独立设计native host与aggregateOnly的兼容能力；不得先撤guard。

Survey若要承载Enumeration，需先定义受其publication/slot/proof/measurementDigest及保留规则约束的native模板和原件归档合同；固定120题/schema、专属session/result模型和无userId主体不能靠Training接口替代。本节点没有获准新增这些身份/权限/后端scope。

建议更新此前“School/Teacher还需补archiveRaw”的简写为：“二者目前使用Composite，尚无获批native原件端点；需要精确准入、冻结运行事实、完成回执和本域归档合同，客户端方法是最后一步。”本表纠正该简写，不把服务端能力缺口写成普通前端遗漏。

## 本次实际执行

全部使用 `/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node`，没有安装依赖、启动DB/服务或发送产品账号请求。

| 命令（Node后参数） | cwd | 真实结果 | 原件 |
| --- | --- | --- | --- |
| `node_modules/vitest/vitest.mjs run src/modules/cognitive/__tests__/education-native-boundaries.test.tsx --reporter=json --outputFile=../../docs/parallel-review/entry-adapters/frontend-boundaries.json` | frontend | 退出0，5通过 | frontend-boundaries.* |
| `node_modules/vitest/vitest.mjs run src/__tests__/cognitive/education-native-boundaries.test.ts --reporter=json --outputFile=../../docs/parallel-review/entry-adapters/backend-boundaries.json` | backend | 退出0，7通过 | backend-boundaries.* |
| `docs/parallel-review/entry-adapters/check-types.cjs frontend` | 根目录 | 退出0，380源码，零诊断 | frontend-types.* |
| 同脚本backend | 根目录 | 首轮退出1：测试闭包缺实际auth.ts全局Express.Request扩展；补真实根后退出0、1095源码、零诊断 | backend-types-original.*保留；backend-types.*为最终结果 |

前端实际Teacher/Survey factory＋真实native hook验证拒绝；School挂载真实SchoolCompositeRunner/CognitiveRunner，仅stub父级展示，注入假设native响应验证到read后立即停止。**注入响应不等于当前服务器允许分配该native子项**。所有这些fixture都不代表新登录START成功；它们证明现有consumer不会因补假archive函数而绕过scope。

后端直接执行现有registry/Survey定义及raw archive service的提前身份拒绝，DB只提供合成session查询替身；没有读取raw记录、写资产或调用COS。未重跑既有完整HTTP/DB/原件归档与计分流程。类型检查仅以这两份新测试为入口；结果不冒称正式CI或真实产品环境认证。

本节点没有auto-review拒绝或不确定写入。入口扩展处于**pending：需要后端scope/身份/完成收据合同及明确授权**，不是某个已授权client操作遭拒。普通客户端遗漏已核查，没有可安全补接的现存端点。guards和产品代码保持，只有证据/测试/建议提交。
