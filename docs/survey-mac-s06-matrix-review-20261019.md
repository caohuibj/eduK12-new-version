# S06 第一小批：矩阵名称

S05 结果反馈修复由父任务独立复核关闭后继续。先前报告将 CSRF 断言归给链接回归的措辞已单独改正；未因此重跑 S05 检查。

Survey 参与页 `SurveyPublicApp` 和研究者预览 `ResearchPreview` 的 MATRIX 表格现为每个普通选项与拒答提供“题目 · 行 · 选项”可访问名称。保留原表格行／列表头、radio 分组、答案键、值、checked、refusal 与 onChange。没有修改共享 ProfessionalFormAnswer、Teacher/Training、认知刺激、后端、权限或计分。

新增两项（参与／预览）验证所有六个组合名称、真实 DOM 键盘箭头分组、独立行答案、拒答互斥及恢复原值；均通过。原 Builder 的拒答用例因名称变化更新一条查询，定向 1 项通过、7 项未选择。相关四文件 lint 通过。原始 JSON／日志及源码 SHA-256 见同名 matrix-evidence 目录。三项不同用例不冒充原生辅助技术或完整历史测试。

只读准备已确认共享 MATRIX_MULTIPLE 现有 label 与行 legend，S06 不重复实现。独立下载是下一小 commit；Mac 原生 Chrome／Safari 名称与下载、Numbers 证据另补，不以本次组件测试计为通过。S05 原生非空授权状态与 Safari 历史异常保持 S07 欠项。
