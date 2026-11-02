# Draft PR 正文（尚未创建）

标题：content: DMEE-Class-T 教师自评八分组与原生无分表单

S1完整题表及S5最终结构已核。最终保留55题，按目标导向7、结构组织7、提问7、策略示范6、应用练习7、学习环境4、评价11、差异化6拆成八个原生无计分Form，并保留完整55题Form。初始时间管理56–58已排除，六个差异化题按最终键重新分组；不据初始理论造维度。

正文及附件分别标CC BY4.0，保留Dierendonck(2023)署名、DOI、许可及改动说明。只处理DMEE的S1及S5，不复制CSS-T题文。Form使用S1作者英译及英文频率锚点，不称已验证英文或中文版本；原法文题文已取得，但法文锚点精确措辞与完整施测脚本仍缺。

原研究使用ESEM因素分数，附表载荷不是完整个体计分参数。本轮八个Scale目录只是计分候选；实际交付为九份完整原生Form，保留七级频率类别、无score字段、无评分报告。不因为缺常模或独立施测验证阻止合法无分描述，也不把简单均分冒充ESEM因素分。

名称统一DMEE-Class-T前缀，真实现有tags字段写入family:dmee-class-t及teacher_self/学段/语言/版本/反思用途。共同标签仅供筛选并列分析，不推等值或跨工具总分。原生普通组合选择完整55题或若干子Form，避免重复包含同题。

已验证：隔离PostgreSQL16.15调用现有questionnaire-product.create/addItem/detail与updateCatalogTags，创建9个DRAFT普通问卷、110个原生字段，回读题序、标签、选项及COLLECTION_ONLY；低端/高端/缺失、非法选项和陈旧tags CAS检查通过；27个既有报告显示器情境通过，没有评分报告。合成教师身份、没有真实师生数据；隔离容器与自建匿名PG卷已清理，不冒称持久开发库入库。

教师发展性说明包括一般反思、困难、信息不足及各分组微行动；不作绩效排名、诊断或学生标签，不把频率说成实际教学质量或学生成绩因果。接收者沿既有授权，不新开可见权限。

实际main已更新到ae05ed2e70691bda817ab323130f9caf4dff26ca，包含公共#551/#556修复。9项原生Form/标签/显示消费者及schema/lock与原隔离执行输入逐blob一致，复用真实证据。修复后的现有scale-intake-selected-check本地对8个来源通过，原始receipt绑定e3d85131bcbcf44a3442f83ad5ef506e0b0e8959。没有重跑旧parser失败run、改共享CI、跑平台全量或使用skip-ci。

排重：main全体source.json/instrument.ts按作者、名称、DOI及58题法/英文本116次比较没有同源命中；更新main时42个开放PR无DMEE命中。生产数据库/管理员自建尚未核，管理员正式导入前必须再核。

交接位于本目录README、manifest、source-items、forms、report-examples、source-evidence及verification。内容与Form候选待审；隔离导入回读成功，生产未入库、未部署。主线串行协调合并，不在工具线程并发merge。

创建状态：自动审批拒绝创建Draft PR，理由是认为未明确授权该PR；分支回查确认没有PR。已收到批次授权的上下文予以保留，本线程不换工具重试。正式CI尚未触发，不能以本地检查或跳过状态宣称CI通过。
