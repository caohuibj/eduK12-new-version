# WCSD-SECA 工作材料

- `instrument.json`：Cheung & Ng (2024) Table 2 逐题原文、中文工作译文、维度及 17 题对应；编号对应论文表内位置；已逐题对照 WCSD 2018 FAQ 附录中原始编号 1–40，顺序一致。17题按该附录所标项目保留原顺序。`build.py` 可重建。
- `scoring.py`：可运行的参考计算；每组完整时求题目均值，缺答不计为零，组内任一缺答则该组不输出均值。这是保守展示策略，并非声称已验证的原作者缺答规则。不机械合并分维成总分。
- `test_case.json`：运行 `python3 scoring.py` 生成。程序断言 17 题完整得分、缺答和非法值，并检查 40 题空答。`report.html` 使用原生 40 题定义中 report-sample 的模拟数据。
- 英文题文来自开放获取论文 Cheung RYM, Ng OOS (2024), Behavioral Sciences 14:399, DOI 10.3390/bs14050399, Table 2，CC BY 4.0。工作译文系新译，不是香港团队中文原表或经验证译本。原官网说明工具免费开放，适用于 5–12 年级；香港研究为 349 名小学生，平均 9.86 岁。不能把香港样本当普适常模。
- 官方将 40 题描述为八个领域、17 题描述为总体能力简表；论文拟合 17 题八因子结构，但自我概念仅一题，其他简版维度仅 2–3 题、内部一致性也有限。简版分组仅为探索性反馈。
- 四级标签已由作者团队研究明确核对：1=Very Difficult，2=Difficult，3=Easy，4=Very Easy，见 https://pmc.ncbi.nlm.nih.gov/articles/PMC12882773/ 。原始问卷题序及前导语已与 WCSD 2018 FAQ 附录第5–6页核对：https://resources.finalsite.net/images/v1744936277/washoeschoolsnet/deitjtnxbl9xmua4l30r/wcsd_seca_faq_format_october_2018_final.pdf 。完整作答要求是产品保守约定，并非原作者缺答规则。正式中文使用前需独立翻译/适用性验证。
- `native/40/instrument.ts` 与 `native/17/instrument.ts` 已按现有接口生成，均为 DRAFT、CANDIDATE，尚待主 agent 注册与验收。40 题逐维报告；17 题仅计算总体均值，逐方面的提示仅供反思。`generate_native.py` 可重建。题目文字及报告内容可供审核，不代表正式上线。

- `report_17.html` 使用原生17题 mixed golden 的17个回答，总体均值2.00；八个领域作为反思话题而非分维得分，示例与短版官方定位一致。
