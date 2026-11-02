# TOSA 0.4.2 发布与入库清单

## 本轮检查范围和分工

纯声明内容与生成注册表 → 原生 schema/来源、76个真实 goldenCases、分支和报告契约 → 主要在 GitHub 内容 CI 执行；锁依赖、代表性计分/报告、真实数据库权限守卫 → 本地隔离环境补缺。已有15单故事960个 golden、完整工具76个 golden、服务/数据库与42轮浏览器结果只按原输入复用，完整浏览器不重复执行。普通内容 CI 预算约5分钟，超时只定位具体任务。

本地 Node 24.21.0；前后端按 adad907a 原锁文件 npm ci --ignore-scripts --no-audit --no-fund，官方 registry；全部必需包存在，已安装版本零差异。Prisma5.22.0按当前schema生成；只读缓存不能utime时，将同版本缓存引擎复制到可写目录，以显式 PRISMA_QUERY_ENGINE_LIBRARY/PRISMA_SCHEMA_ENGINE_BINARY生成，未降级校验或修改源码。系统Chromium151.0.7922.173与Playwright默认捆绑revision不同，UI结果限定为该实际二进制，不宣称官方捆绑浏览器验收。

[锁依赖证据](../../evidence/tosa-teacher-wd-042/locked-dependencies.json)、[权限和路径证据](../../evidence/tosa-teacher-wd-042/verification-check.json)、[代表性UI](../../evidence/tosa-teacher-wd-042/ui-check.json)记录实际执行范围。

本轮服务级权限检查使用真实隔离数据库身份及真实权限函数，没有mock注册状态：管理员prepare成功；普通教师、过期step-up、错误tokenVersion、缺少精确measurement.publish授权拒绝；拥有精确授权的管理员对DRAFT发布仍返回CONTENT_STATIC_SJT_SOURCE_NOT_PUBLISHED。合成会话proof不等于实际HTTP登录/MFA，不作为生产身份验证证明。

历史数据证据为隔离库26条attempt、25条raw、17个mapping前后摘要一致；该库measurement releases为0，故不宣称实际生产已发表记录完成了数据库回归。旧已发表源文件在git差异中无修改，CI原生immutableReleaseIssues另作基线核对。生产旧记录只需在同目标按版本有限回读，不重跑全库。

## 最低发布步骤（由主线统一协调）

1. 取得本项目具write/maintain/admin权限、与PR作者不同的真实人类APPROVED review，覆盖上述publicationContentDigest；确认教师场景、行为键和授权范围。review URL必须是真实 GitHub pullrequestreview链接，不能使用本说明、机器检查或用户的一般发布授权替代。保留PILOT、空证据和暂定编码，不虚构科学升级。
2. 仅把该版本 publication.json 改为PUBLISHED，并加入 `review:{kind:"github-review",reviewUrl:<真实批准链接>,contentDigest:"2e164231c0f77c7483f9c23dc8235b84a27704b3906c3ef344a1bbe94a805aec"}`。既有验证器会检查审阅者身份、权限、最后有效审阅和所审内容。内容有实质修改必须另冻版本/重新审阅；不能覆盖旧冻结版。
3. 由授权主线完成审阅合并和既有内容发布。当前候选保持Draft PR，未自行合并或部署。正式运行源必须与批准内容一致；复用现有产物发布机制，不在生产重跑已通过的完整检查。
4. 在同一生产目标，以真实SYSTEM_ADMIN会话完成最近300秒管理员双因素验证，调用 `POST /api/admin/permissions/static-sjt/prepare`，body为 `{"instrumentKey":"tosa-teacher-wd-full","instrumentVersion":"0.4.2"}`。此步骤只准备不可变mapping，不自动授予许可、入口权限或发布。
5. 按现有 `POST /api/admin/permissions/content-grants` 给发布操作者授予精确scope：product=TRAINING、scopeKind=PLATFORM、scopeId=situational-registry、resourceKind=measurement、resourceKeys=[返回mappingId]，capabilities=[measurement.publish]；有限有效期，无多余委托。随后调用 `POST /api/admin/permissions/static-sjt/publish`，body为 `{"mappingId":<实际ID>,"grantId":<实际精确授权ID>,"deployment":{"locale":"zh-CN","territory":"CN"}}`。遵守实际部署地区，不凭候选默认替管理员声明。
6. 使用返回measurementReleaseId/contentHash，按选定产品原有工具来源、material.use/分发与工具发布流程入库。measurement发布不等于四入口自动分发。回读真实库卡片/源版本、PILOT、教师适用范围、三版本和报告；用一名实际授权教师做一条短流程。此前未做真实HTTP/MFA或实际生产发布回读，这些是主线待完成项。
7. 回退只撤销/暂停本轮新工具对新施测的可见性或授权，保留已有FINAL和冻结版本；不删除mapping或覆盖旧内容，不通过数据库绕过不可变触发器。

## 原生安装与检查命令

原生三个JSON已经位于固定路径，**不是需要另写导入器的交换格式**。不执行本地脚本直写生产DB。

```sh
# 在 server-version/backend，使用Node24.21.0和项目锁定依赖
npm run situational:manifest:generate
# 下两项由既有内容CI执行；相同输入已合格时勿在服务器重复
npm run situational:contracts
npm run situational:onboarding-check -- --all --verify-reviews --base <完整基线SHA>
```

`--verify-reviews`由现有CI提供GITHUB_TOKEN，本文不提供或复制凭据。DRAFT的eligibleToPublish仅说明技术结构，不是已经批准或已经入库。

## 四入口适用范围

| 入口 | 本候选适用性 | 现有边界及发布后待回读 |
| --- | --- | --- |
| Teacher | 教师SELF形成性试用 | teacher_self_report相符；精确测量发布、来源material.use与教师工具发布后可接入。当前尚未完成真实入口入库。 |
| Survey | 教师研究/试用可用原生staged SJT协议 | 当前多轮TEXT分支与可选追问符合SITUATIONAL_NATIVE_V1定义；DRAFT header正确拒绝。需批准版本与原有Survey治理/分发，确认招募对象、知情说明和研究授权。不能退化为历史静态表单。 |
| Training | 教师独立SJT参与适用；普通学员组合不适用 | standalone检查真实role=TEACHER；普通Training资源列表主动排除teacher_self_report，不为让它出现在学员库而改角色。若产品要教师专用库，使用已有教师入口/授权通道。 |
| School | 学生SELF工具不适用 | 当前School SELF仅participant_self_report/student_self_report，不能把教师担责伪装成学生工具。学校内教师使用应走教师适用的产品与授权范围。 |

标签复用sjtClassificationTags，从publishedMetrics.construct派生212个描述标签；它们是本故事行动描述/完整性标签，不证明SEL/人格效度，不自动授予入口权限。Teacher来源头当前原生versions只显示content，parameters/report为null；真实冻结内容仍有scoringVersion与reportVersion，发布回读必须核对冻结源，不能把列表空值误称缺少计分或假填成独立版本。

## 已知待审事项

真实独立人类发布review、实际管理员HTTP/MFA、PUBLISHED发布及选定工具库入库/回读尚未执行。教师认知访谈、动作键独立编码一致性、试点参数与效度研究属于PILOT后续科学工作，不要求伪造完成才允许标注试用入库。适切性和心理潜变量仍UNSCORED。

Notion历史CI错误清单在当前Hui连接返回404 object_not_found，未声称读取或写回；记录pending，不尝试绕过。当前仓库AGENTS与release规则已读取。新增检查脚本准备时两次本地harness问题（纯score函数不生成narrative、错误枚举USER应为STANDARD）已分别改用原生buildSjtNarrative和真实schema枚举；均非候选功能失败，未触发CI、未修改产品或降低断言。

代表性报告UI用当前锁定前端的原生ReportCard读取本轮原生计分/叙事输出，桌面1280×900和窄屏390×844通过，科学说明显示PILOT、无水平溢出或页面错误。预览壳初次缺favicon产生404，补data favicon后定向复验；没有修改产品组件或屏蔽资源错误。完整42轮作答仍复用历史证据。

## 已确认的发布工具兼容阻碍

原生 instrument.json 为3,099,475字节（仅去空白仍2,050,166字节）。`src/scripts/situational-onboarding-check.ts` 的 git helper 使用未设置 maxBuffer 的 execFileSync，Node默认约1MiB。对暂存区相同candidate执行对应git show读取已实际返回 **ENOBUFS**；显式8MiB读取同一对象成功且解析身份一致。独立审阅验证会经contentAt读取批准commit的instrument.json；基线包含该版本之后，历史不可变核对也会读取此文件。因此当前首次DRAFT内容CI通过仍不能证明未来PUBLISHED审阅/历史校验可以完成。

这是正式发布的功能性阻碍，需协调者在既有脚本git helper增加明确、有界的读取容量（例如沿用同仓content-scope.mjs的8MiB），并只验证大文件读取及审阅/历史相关检查；不改算法、schema、审阅权限或新增门禁。本内容PR没有混入该共享脚本修复，也没有拆题、删golden或弱化检查以规避。修复完成前不能宣称正式入库就绪；本候选仍可作为Draft审阅。
