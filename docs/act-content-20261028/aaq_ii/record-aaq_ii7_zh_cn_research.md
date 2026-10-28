# AAQ-II 内容记录与验收状态

单因子七题自评，测量心理不灵活性/经验性回避：个体被困难想法与感受缠住、并因此干扰价值导向行动的程度。测的是与内心体验的关系方式，不是想法内容，也不是症状诊断。

## 登记与状态

- 原生记录：`server-version/backend/src/modules/scale/instruments/aaq_ii7_zh_cn_research/1.0.0/instrument.ts`（数据在同级 `source.json`）。
- 题文与计分验收：**通过；原生 executable DRAFT（zh-CN 工作译稿）**。
- 报告：原生模板定义 + 图文样稿。
- 原始来源：Bond, F. W., Hayes, S. C., Baer, R. A., et al. (2011). Preliminary psychometric properties of the Acceptance and Action Questionnaire - II: A revised measure of psychological inflexibility and experiential avoidance. Behavior Therapy, 42, 676-688.
- 来源链接：https://ruthbaer.com/academics/AAQ-II.pdf

## 计分

- `total`：心理不灵活性总分（7题） —— 七题求和，范围 7–49。分数越高表示越多报告心理不灵活性/经验性回避：被困难想法与感受缠住、并因此干扰行动。不是症状诊断，也不是能力高低。

缺答策略 `complete_required`：任一题缺失则该分数不计算并标记未完成，不插补、不补 0；这是产品保守约定，不声称是原作者规则。不设常模、百分位、临床界值或能力等级。

## 文件

- `source-and-scoring.md`（原文出处、题文与计分核对、冲突记录）
- `instrument-data.json`（题码/原文/工作译文/维度归属/反向题）
- `scoring.py` + `test_scoring.py`（参考实现与 golden 测试）
- `sample-responses.json`（模拟作答与期望分）
- `report-sample.html`（图文样稿，模拟数据）

## 两项验收

1. **题文与分数准确：通过（以已核实来源逐题录入）** 题文、量尺与计分规则来自已核实公开来源（见 source-and-scoring.md），golden cases 覆盖全最低/全最高/中点/混合/缺答/全缺。
2. **报告完整：样稿层面完成。** 各分数含结果说明、反思与行动，明确示例为模拟数据与适用限制；未设常模、等级或临床阈值。动态接入、缺答分支和浏览器视觉验收尚未完成。

中文为工作译稿，未经独立回译、作者审阅或目标人群验证，不标为已验证中文量表。
