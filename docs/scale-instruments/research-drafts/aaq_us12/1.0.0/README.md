# AAQ-US12｜独立中文研究工作稿1.0.0

## 精确身份和题序
原始大学生情境Acceptance and Action Questionnaire for University Students（Levin、Krafft、Pistorello、Seeley，2019），研究作者原12题DOC：https://www.utahact.com/uploads/5/1/3/4/51340265/aaq-us_1.doc。
不是AAQ-II7题、其他AAQ系列、一般中小学学习动机量表，也不直接移植葡萄牙语2022年两个因素的本地化研究。

**题序警示**：作者原施测DOC的12题顺序与2019论文Table1及OpenScales排列不同；作者DOC题号1–12相应论文Table1行号为 **12、5、4、6、11、8、3、1、2、10、9、7**。本包严格按作者DOC次序显示、存储和计分；`source-manifest.json`逐题记录映射，不能根据论文表行号覆盖旧数据。

## 评分与报告
原作者回复标度是描述真实符合程度的1–7七档；1 Never true、7 Always true，中间为Very seldom / Seldom / Sometimes / Frequently / Almost always true。无反向项，12道题原始分求和范围 **12–84**，没有单独分量表。原开发观察最高77不是理论最大值84，也不是中国量表cutoff。

所有结果只score_only；报告给大学生解释生活、作业、课堂和考试情境中想法或难受情绪有时怎样影响行动，不评价人格/智力/学业价值。完整12道题才计算、不插补是平台保守规则，不是原论文原始统计样本的listwise deletion同义词。

## 版本及标签
instrumentVersion1.0.0 / scoringVersion1.0.0 / localizationVersion1.0.0 / instructionVersion1.0.0 / reportVersion1.0.0，referencePolicy=none。八轴domain/construct/orientation/population/response/use/license/language_validation与中文词汇写入source。18+自评限制不是“已核实是大学生”；真实大学生身份要由研究筛选/场景元数据确定，本次无新权限门禁。

## 许可与验证边界
作者完整原题本存在不等于本站独立中文译文公开GitHub再分发及电子施测许可已确认，详见THIRD_PARTY_LICENSE.md。当前内容只为DRAFT研究工作稿，不认为已经完成中文测量学验证或普通大学人群常模。

本批仅在GitHub对象生成、静态数学比较中核对题数、七档、作者DOC→Table1映射、单总分、十组合成期望。Vitest、TypeScript、真实scoreScale/buildScaleResult、数据库、浏览器、CI、部署均 **NOTRUN**。
