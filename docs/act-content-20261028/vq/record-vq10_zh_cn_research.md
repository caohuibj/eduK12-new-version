# VQ 内容记录与验收状态

过去一周（含今天）价值导向生活的两个独立方面：Progress（在最在乎的领域取得进展）与 Obstruction（困难的想法、感受或记忆妨碍价值行动）。两个分量表分别求和，不合成总分。

## 登记与状态

- 原生记录：`server-version/backend/src/modules/scale/instruments/vq10_zh_cn_research/1.0.0/instrument.ts`（数据在同级 `source.json`）。
- 题文与计分验收：**未通过：完整题文未纳入（权利受限），catalog-only**。
- 报告：仅图文样稿；未动态接入。
- 原始来源：Smout, M., Davies, M., Burns, N., & Christie, A. (2014). Development of the Valuing Questionnaire (VQ). Journal of Contextual Behavioral Science, 3, 164-172.
- 来源链接：https://contextualscience.org/sites/default/files/Smout%20et%202014%20development%20of%20VQ%20published.pdf

## 计分

- `progress`：进展（Progress，5题） —— 范围 0–30
- `obstruction`：受阻（Obstruction，5题） —— 范围 0–30

缺答策略 `complete_required`：任一题缺失则该分数不计算并标记未完成，不插补、不补 0；这是产品保守约定，不声称是原作者规则。不设常模、百分位、临床界值或能力等级。

## 文件

- `source-and-scoring.md`（原文出处、题文与计分核对、冲突记录）
- `instrument-data.json`（题码/原文/工作译文/维度归属/反向题）
- `scoring.py` + `test_scoring.py`（参考实现与 golden 测试）
- `sample-responses.json`（模拟作答与期望分）
- `report-sample.html`（图文样稿，模拟数据）

## 两项验收

1. **题文与分数准确：部分完成，不能验收。** 题文、量尺与计分规则来自受限来源，只登记主题索引与计分归属；不得作为可施测量表。
2. **报告完整：样稿层面完成。** 各分数含结果说明、反思与行动，明确示例为模拟数据与适用限制；未设常模、等级或临床阈值。动态接入、缺答分支和浏览器视觉验收尚未完成。

中文为工作译稿，未经独立回译、作者审阅或目标人群验证，不标为已验证中文量表。
