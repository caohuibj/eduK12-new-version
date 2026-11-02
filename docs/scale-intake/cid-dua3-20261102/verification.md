# 精确验证交接

- 固定base：688d61eb61094fe692ad8c6e6ce41315c8bc3402（含#551/#556）。
- 已检查内容head：4c5962ceece33dbda75fe2aeef1f2ff736d9e817。之后仅新增本记录/选中结果和说明既有版本事实，不改题文、native-form.json、source.json或生成索引；不重复相同输入的已完成检查。
- native-form.json文件SHA256：b5a71238071b423215d64e38d6c1187211cc6e027c38090cf21e01721eca47a9。隔离库保存的原生artifact摘要见isolated-validation.json（摘要域不同，不直接混比）。
- 索引check退出0。完整定向CLI以本base/head实际运行，SCALE_INTAKE_SELECTED_PASSED，选中1个整量表CATALOG_ONLY source，0次计分；结果见selected-validation.json。没有采用旧CHEXI错误或修改共享检查器。
- Form已通过现有schema、编译与真实独立PostgreSQL导入回读，原生SUBMITTED与可复用DRAFT模板各一个；完整定义/15字段/12原文/标签及幂等性验证见isolated-validation.json。数据库准备只发生在新独立库，不改其他库；本地PostgreSQL/Redis为既有托管开发服务，未启动应用构建或全量测试。
- 真正使用的Node为v24.21.0，工作区依赖复用现有本地安装；未更改锁文件或重新安装全平台。运行脚本见validation-harness.mts.txt，使用配置的TEST_DATABASE_URL派生独立库连接且硬拒绝非loopback/专用库；不把凭据写入公开资料。
- 两次辅助脚本失败与纠正详见README，原始日志保留于/tmp/cid-dua3-source/check.log及second-attempt.log；没有改写为成功，未把本地失败称CI失败，也没有重复建库。后续从已有工具/模板回读后续填，同一幂等提交仍回到原工具。

公开候选仅本工具内容及说明，无源二进制、私人材料、真实答卷、凭据、引擎/权限/CI修改。未运行浏览器/全后端/前端构建或全量回归。无分表单不承载P/R；原量表计分、真实报告渲染、生产排重与生产安装尚未执行。SUBMITTED/approvedBy=null不得描述为人工批准或ONLINE。

现有Notion CI清单已在本对话通过Qiang连接读取；适用CI-007/018/019/020：索引、准确source/payload、原失败保留及本地/CI身份分开。CI前仍由主线按既有流程独立复核精确base/head/tree、内容范围与复用边界，不伪造人工独立审查。当前[skip ci]只表示未执行，不能视为通过；主线串行协调正式轻量CI与合并。本内容分支不新造门禁或自动激活全平台。
