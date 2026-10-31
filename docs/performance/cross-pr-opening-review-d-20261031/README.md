# D：跨 PR 访问与交互查漏，2026-10-31

开发基准为 main `093d86e842da12d443301fd4a37d5d046ecb9185`。
发布范围仅为一个页面、一份合成测试和本脱敏摘要；原始本地报告不在发布内容中。
本线不修改 CI 路由、不激活 CI、不合并或部署，不写 Hui 页面。

## #434 与 #442 的共享消费者遗漏切页失效处理

`App.tsx` 的 `/student/questionnaires/:questionnaireId` 继续复用
`QuestionnaireAssessment`。#434 缩小 available 查询，#442 增加失败重试，
但 A 的 GET 在进入 B 后返回仍会 POST 创建/恢复 A，或跳到 A 的报告。
旧 POST/错误也会覆盖 B；A 已显示后，B 打开失败仍残留 A，遮住 B 的重试入口。

修复仅在该页面用请求代次限制打开流程及恢复回调；导航/卸载使旧代次失效，
容量重试 POST 前以及异步 freeze、complete、答案读取后重新核对。
切页在绘制前清掉旧页面显示状态。保留单问卷参数、当前页容量恢复、完成跳转、
checkpoint 和 FINAL 协议；不删除持久化草稿，不取消已经发出的服务端请求。
目标是减少无意请求并恢复正确交互，没有生产延迟或容量测量。

## 跨 PR 复核范围

| PR | 实际消费者与核对结论 |
| --- | --- |
| #432 | FinalQuestionnaireAssessment 已提交恢复、FormSectionManager units 投影、reporting specSummary。#444 后普通问卷用 combined 接口，Composite 仍保留旧接口分支。 |
| #434/#442 | 单问卷 available → 打开/恢复 → 报告或 runner。本补丁修复其生命周期遗漏。 |
| #437/#435/#436 | TrainingLearnerCourse → loadCourseAssessments。main 已含 Composite/Scale 课程参数；#436 diff 保留两者并补 Cognitive 参数。非 Training 的 CourseDetail 使用独立读取链；先前将它写成共享 loader 消费者有误，已在此更正。 |
| #439 | SchoolApp 登录身份、organizations/my-status/availability。普通登录包含 mustChangePassword，MFA refresh 和 401 清理入口仍在。 |
| #444 | 两类 QuestionnaireEdit 与 CompositeAssessmentEdit → FormSectionManager。combined DTO 对应，Composite fallback 保留；不双写原 PR。 |
| #445/#447 | 登录结果页和 PublicQuestionnaireResult 的错误恢复、当前 assessment/session 失效处理均在 diff 中；不重复开 PR。 |
| #448 | runtime-table-policy 的 task report artifacts 受限角色策略。只读核对，数据库实施和实际资格仍归原线。 |
| #449 | HuiteacherEvaluationStudio → Form/Numeric 群报组件。原 PR 已修初读/保存版本重试及固定叶文本区分，不重复实现。 |
| #450 | QuestionnaireProducts 导出 → exportReports → getTrainingVariantReportsForTeacher。job 投影保留实际绑定和密文所需字段，后台实现归 B。 |

这是静态消费者/差异复核加定向合成验证，不是 13 个 PR 的完整端到端资格。
待合内容没有在本分支整体集成，也没有冒称 main 生效。

## 交主线协调的分页机会

`availableComposites` 为 null-course QUESTIONNAIRE 核对任务投放。201 条合成任务、
唯一候选在第 1 页匹配的探针，记录到仍 GET 第 2、3 页（1 个观察用例通过）。
静态追踪确认 `listStudentTasks` 每页重新构建任务后才 slice，因此这条路径有
`1 + 页数` 次 Composite discovery，包括首个 available 请求；这不是 SQL/时间实测。
建议所有候选已取得合法投放匹配时停止翻页，其余保留不完整列表拒绝和 50 页上限。
该函数与待合 #436 同文件，交母 DOT 协调原 PR 或后续补丁，本线未修改共享 loader。

## 本地验证及限制

- 基准最初 6 个切页/卸载反例全部失败，Vitest exit 1；首个补丁与原 5 个成功/重试用例共 11 passed。
- 后加异步边界时 2 passed / 1 failed / 6 skipped。失败是合成 B LEGACY fixture 的空内容触发现有自动完成，而 mock 未接受该 POST；修正为非空 fixture 后仅该项通过。没有弱化断言或修改自动完成行为。
- 最终补丁 16 passed（11 新 + 原有 5），exit 0：`vitest run src/pages/student/__tests__/QuestionnaireAssessment.open-race.test.tsx src/pages/student/__tests__/QuestionnaireAssessment.open.test.tsx --maxWorkers=1`。
- 两个变化文件 eslint exit 0，0 error、1 条原有 Hook 依赖 warning；git diff --check exit 0。
- 最终 app `tsc -p tsconfig.app.json --noEmit` exit 0，约 45 秒，所记录源码/锁/配置前后摘要一致。此前执行期间改过源码的一次 tsc 不作为最终输入资格。

测试仅用合成 DTO/API mock，没有真实答卷、个人数据、凭据、数据库连接或 FINAL 提交。
使用预装 TypeScript 5.6.3、Vitest 4.1.11、React 18.3.1、Router 7.18.3，没有 npm ci。
Node v24.19.0 低于仓库 engines 的 >=24.21.0；本地成功不冒称受支持 Node 的正式 CI
资格。没有全套测试、构建、后端、Cognitive types、服务器验收或其他 PR 的重复验证。

## #451 独审补充：FINAL 后重读的源绑定

独审确认 opening 链已保护，但 reloadFinalAttempt 原先在 GET 后直接 setData。
真实 FinalQuestionnaireAssessment 的区段/量表保存成功及人工重读都会调用 onReload：
A 的 GET 在途切 B 会回填 A；A 保存等待结束后才调用保留的旧 onReload，也会新发 A GET。
这是相邻遗漏，不把它说成 opening 补丁引入的新回归。

修复在渲染时捕获 openingRequest 和 attemptId，旧回调在执行前不能借用 B 的当前代次。
GET/容量重试前及 GET 返回后均核代次，响应还必须属于原 attempt；旧读取错误静默结束，
当前来源错误仍抛给原通道。已发出的合法 FINAL 不取消，原持久化确认与草稿完成协议不变。

仅新增1条合成回调用例：先核同源重读真实更新进度，再核旧 GET 迟到和旧回调在切页后调用。
初次1 failed / 11 skipped，三处断言同时显示错页及多出第三次 A GET；定点修后1 passed /
11 skipped，exit0。没有真实 FINAL、答案或用户数据，旧16例没有重复执行或改写环境身份。
这次使用已有 Node24.21.0；变化两文件 lint exit0（仍1条原 warning），最终 app types
exit0、约46秒，记录输入前后相同。前述 Node24.19 的16例仍保留原验证边界，不能因新的
类型检查成功而说它们已在新运行时重跑。原红/绿 reporter 和类型原件仍仅保留本地。
