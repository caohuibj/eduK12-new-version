# AIR／GTL SEL 教学反思：2014 来源核对与无分辅助表单

本批处理一个母工具：Nicholas Yoder（2014年2月）的 AIR／GTL 教师 SEL 反思工具。**原手册已完整取得；原题文的数字改编、中文翻译和公开再分发范围尚未核明，原工具未导入。** 已实际导入专用隔离库的是三份明确标注“项目自编”的开放记录辅助表单，不是原题译本、短版或原工具的测量实现。

三份自编表单通过现有 `/submissions/original-form` 相对路由保存并回读为 `SUBMITTED`，`approvedBy=null`，没有公开上线、使用授权、试运行或评分报告。隔离验证不等于开发公共库或生产已入库。PALS2000 原分支/PR 保持独立，未改动；隔离执行基于 main `ae05ed2e70691bda817ab323130f9caf4dff26ca`；提交前工作区已更新至 main `688d61eb61094fe692ad8c6e6ce41315c8bc3402`，13个原生消费文件哈希未变，复用上述证据，已包含公共 #551/#556 检查器修复，没有自改 CI。

## 子项与实际交付

- `air_gtl_sel2014_practice_journal_zh_cn`：**AIR/GTL SEL｜实践证据札记（项目自编）｜教师自评｜zh-CN v0.1.0**。7 个字段，区分具体片段、当前理解、支持条件和下一小步；可选 10 个实践话题。
- `air_gtl_sel2014_competency_journal_zh_cn`：**AIR/GTL SEL｜自身SEL情境札记（项目自编）｜教师自评｜zh-CN v0.1.0**。6 个字段，分别选择社会互动/教学互动语境及 5 个自身 SEL 话题，再写自愿保留的经历和需要的支持；没有将两个语境当作等值测量版本。
- `air_gtl_sel2014_action_review_zh_cn`：**AIR/GTL SEL｜行动与回顾计划（项目自编）｜教师自评｜zh-CN v0.1.0**。6 个字段，记录目标话题、可尝试的小步骤、回看证据、资源、时间与后续调整。

全部为原生 `FORM`，内容候选版本 `0.1.0`，参数和报告版本均为 `null`，研究状态仅标 `PILOT`。所有字段可跳过；无选项分值、维度聚合、反向计分、常模、能力百分比或跨工具总分。既有 Form completion/facts 语义不等于能力分析报告。

[forms.json](forms.json) 提供子项、版本与来源关系。管理应用的实际挂载地址是 `/api/platform/survey-tools/submissions/original-form`；本次隔离夹具将同一router挂在本机 `/tools`，没有验证应用外层feature/origin guard或生产访问。每项的 `*.submission.json` 是当前原生待审入口可接受的完整请求；`*.form.json` 是实际 Form 定义；`*.import.txt` 为现有 CSV 导入语法，适合编辑器追加题目。CSV 会按现有导入器生成字段键，且不携带完整的说明/长度元数据，不能冒称与原生 JSON 字节相同。选择有评分的量表导入入口会改变语义，本批不这样做。

## 母工具标签和角色

共同稳定标签为 `family:air_gtl_sel`，共同名称前缀为 `AIR/GTL SEL`；另有教师自评、K–12、zh-CN、项目版本、发展性反思、PILOT、自编和无计分标签。没有新增标签引擎、数据表、共享枚举或权限。

当前原生 Form 的 `classificationTags` 只接受已有标签字典。本批复用 `population:teacher`、`response:self`、`domain:teacher_workplace`、`language_validation:content_zh-CN`、`license:self_authored`、`use:not_diagnostic`。自定义母工具与话题标签存于已有 `reference.tags`，落库后为 `reference.metadata.annotations.tags`；隔离 SQL 分组查询确实返回三份记录。它们不是自动注册的新目录 UI 标签项：当前可用已有分类与共同名称/机器前缀定位，精确母工具分组可读取来源元数据；不声称 UI 的家族筛选已接通。

这些中文自编记录不等同原英文工具，不存在已验证中文版或师生分数等值关系。此来源没有本批已取得的原生学生对应版；未把教师题改写给学生。老师自评也不证明学生实际获得了什么支持，不改叫实际教学质量。

## 原手册的拆分与缺项

[source-components.md](source-components.md) 和 [source-ledger.json](source-ledger.json) 定位 10 个教学实践话题，以及社会互动/教学互动两个语境各 5 个自身 SEL 能力话题，共 20 个来源组件元数据，合计 104 个原始条目位置。仅是来源索引，没有这些题文的 native 可施测包。原工具的 C/P/R 没有冻结版本。

原文确实有评分说明：实践按各实践内平均，教师自身 SEL 另行汇总反思。本批的无分形式来自发展性反思用途与版权边界，不能说成“原手册没有计分”。更不能把缺常模或没有独立短版效度一概作为只能做 Form 的理由。

另发现原手册第一项实践有 a–h 共 8 条、响应为 1–5，但汇总页列满分35，与8×5=40不一致。原文缺失值处理未明确。本批保留此冲突，没有删题或自行修正官方分母；后续要做原计分版，须先核定该问题及许可。工具未在正式教师评价系统中完成实证检验；不能生成 SEL 教学质量总分、优秀教师排名或诊断。

## 反馈、组合和后续

[teacher-feedback.md](teacher-feedback.md) 给出一般记录、困难情境、信息不足三种发展性示例及可见条件。它们是待审文字，不是自动生成的心理解释；Form 实际没有 R 评分报告。可自选普通组合按“实践札记 → 自身情境札记 → 行动计划”排列，也可单独使用；组合只组织记录，不汇总得分、不自动共享开放回答。

原文许可可由管理员通过 AIR 官方渠道核实，需明确题项/指导语、中文改编、数字使用及拟公开范围；这里未发送联系、接受条款或代签协议。后续取得许可后，先在实际目标库和管理员私有工具按作者、版本、题项与来源哈希再查同义 ID，再决定原题量表或无分原题表单的准确身份。现有已批准/冻结版本不得覆盖。

[validation.json](validation.json) 与 [native-receipt.json](native-receipt.json) 记录实际范围与隔离回执。未进行生产写库、部署或人类独立批准；本线程只准备独立内容 PR，由主线串行协调合并。
