# 新独立 Scale 的课程群报读取器

本子分支从 #423 已提交的 `a52af7a4a7aee6e6e1d06c862104e224a59e1524` 创建，未改 #422 / #423 候选、Composite START、School 路由或 Teacher 生产权限。被拒绝的 #422 正式绑定上传继续停止，本分支不包含该控制载荷。

## 来源与统计

- 原课程报告目录增加 `scale-course:<scaleId>` 来源。必须是 #423 新施测路径保存的 `training-standalone-scale-v1:<scaleId>` Episode，courseId、SELF 主体／作答者／发起者必须一致；排除组合、问卷、relational assignment。旧无归属记录和今天的 CourseScale / CourseStudent 名单都不能提供历史归属。
- 先复用现有 latest-completed 选择器按真实 userId 选最新正式完成，再检查冻结测量版本与数值披露。不把最新缺失替换为旧分数，不让另一 C 版本的旧结果复活；未完成重做不覆盖完成结果。沿用当前6000份来源上限。
- 工具选择只读取本课程该工具的正式来源头与冻结 runtime / 原 teacher 数值披露，不读取分数或原始答案。选择器中的日期明确是所选来源的 Episode 投放起点，不冒称新的内容发布时间。
- C 分组复用冻结 runtime 的 `legacyDefinitionHash`、scorer/version、SELF、responseSignature 和实际单位，不按标题／同名指标拼接。既有 versionAxes 的测量 hash 已分离 R，报告文字／reference 变化不破坏同 C 原始分数可比性；无 versionAxes 的旧定义继续其原有保守 hash，不发明旧版等值转换。每条原始 P/R/runtime 都留在自己的冻结来源中。
- 生成时按200条批量读取已有正式 Scale fact，复用原 compact facts / template 恢复的 report-only 数值视图，既不加载答案，也不重算 item/总分。仅投影已定义总分／维度、每指标 N、真实已保存量尺、单位与质量，保留 null／zero／有符号值。共享 `summarizeGroupMetrics` 与 Training N=5／小补集规则不变。

## 存储、读取与页面

继续使用原 `reporting_task_artifacts`、课程群报选择／生成／版本读取／打印页面。生成新版本，不覆盖旧版；assignedN 不可知保持 null，无新增资料字段或任务表。

内部 binding 只保存已纳入 assessment 的身份／epoch／提交／Episode／冻结 runtime／结果及不可变 fact 摘要。旧版读取先验证当前真实课程所有者权限，再读取 Artifact，只查询**原绑定 ID**的元数据与摘要；不发现最新完成名单、不解密结果或 runtime、不重新统计。当前成员退出不重写旧快照，另一课程不能读取该容器的 Artifact。参与者 ID 不出现在公开 projection。

没有新增评分／统计／权限引擎、缓存服务、队列、全量预生成或新 schema。课程被授权用户只能得到原冻结量表本来允许披露的数值；没有数值披露的来源不提供可生成版本。后续纵向仍复用既有计划，不能任意拼历史。

## 本轮必要验证

两个不同应用用例：纯适配验证零／missing／真实量尺／负值及 C/R 区分；真实N=5生成→读取（复用 #423 一名已完成者，只新增四次必要合成完成），均值0.4、样本SD√0.3、同快照相等。读取结果／runtime reader 调用均0；移除本轮新建成员的当前课程关系后旧版不变，其他课程读取被拒。原 unscoped 合成作答没有修改或纳入。

首次当前后端类型检查已成功。随后发现工具选择 SQL 不需要生成阶段的结果密文指针摘要，移除了 picker 的结果／fact join，仅对保留的来源做一次只读 picker 续验，再对实际改变的后端输入编译；未重做五人施测／生成或原两个用例。前端与 #423 相同，无新增 UI／浏览器或前端编译。原件与精确树见对应 evidence 目录，不声称生产收益、正式 CI、合并或部署完成。
