# D：课程投放核实完成后停止分页，2026-10-31

已只读确认 #436 合并为实际 main
`63f849c5bb3dfd7c215d719fc9b75e233664dca8`。本候选从该版本建立，独立于 #451
问卷补修和课程七文件候选，不扩大它们的待批发布内容；仅本地开发，未上传或创建 PR。

## 原浪费与最小修改

TrainingLearnerCourse 调用 loadCourseAssessments；availableComposites 在出现
null-course QUESTIONNAIRE 后，经原任务页核实投放。全部需要核实的 available ID
已经匹配时，原循环仍因 total 未读完而请求其余页。合成首屏匹配例读3页而只需1页，
跨页匹配例读4页而只需2页；后台每页又重新构建任务投影。这些是确定的合成请求数，
不是数据库 SQL 次数、生产 p95、CPU 或容量测量。

仅在原函数内增加 unverified Set：包含所有未由 course.id 直接匹配当前课的
available ID，不仅限于触发分支的某一个 null-course 项。只有原谓词
`kind === 'COMPOSITE' && courses.some(id === courseId)` 成立时才移除该 ID；
全部核实完成才停止。原进入条件、课程参数、页大小、页码、逐页 total/实际行数、
返回顺序与 filter/project 规则不变，没有新接口、缓存、授权或成员关系修改。

只要仍缺核实，就保留读到实际结束、空页不完整拒绝、服务端错误和最多50页。
若第50页已经完成全部核实，不再因不相关任务尚未读完而报“超限”；仍没有第51次请求。

## 结果与动态边界

固定 available 列表中，直接绑定当前课的项按原规则接受，其余 ID 均已有原任务接口的
合法正向匹配后，后续页只能增加与该列表结果无关的 delivered ID，不能改变原 filter。
对于未匹配项，继续使用最新返回的 total，保留列表收缩时的原结束行为；没有把首个
total 当成冻结快照，也没有新增持久化资格缓存。原实现本身不提供跨请求原子快照，
本候选也不声称预知未发请求时的新错误或撤权；实际开始/恢复/报告仍由原服务端校验。

## 最小反例及定向验证

新增9条合成用例：首屏全部核实、跨页有效匹配、非空旧主课程项仍需原投放核实、
候选始终未匹配、核实完成前请求失败、必要页为空、50页仍缺匹配、动态 total 收缩、
第50页刚好补齐。跨页用例包含同 ID 的错误类型及外课记录，不能因此提前停止。

修改前原 main：4 failed / 5 passed，exit1。补修后9条均通过，并仅补一条原有
`uses enrolled course scopes` 直接消费者，保留 Scale/Cognitive/Composite 课程参数及
原投放核对。实际命令结果10 passed / 13 skipped，exit0，未把过滤项计为通过。
变化源码/测试两文件 lint exit0，无 warning；git diff --check exit0。

运行使用环境已有 Node24.21.0、Vitest4.1.11、TypeScript5.6.3，没有安装依赖。
最终 app `tsc -p tsconfig.app.json --noEmit` exit0、约46秒，记录的源码/配置/锁/工具
输入前后相同；原始退出状态及绑定另保留本地，不以空日志推断通过。
原红/绿 reporter、基准源码、新测试及类型记录保留本地，不向公开仓库传工作区元数据。
没有真实用户数据、答卷、FINAL、数据库连接、后台改动、完整测试、Cognitive types、
构建、正式 CI、合并或部署；未触及正在整合的 #444 表单文件。
