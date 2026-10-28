# TAAQ 内容记录与验收状态

教师教学情境中的经验性回避/心理不灵活性：由 AAQ 适配到教学情境（如学生拒绝配合、课堂干扰等场景下的接纳与行动）。教师版 ACT 过程指标，不测教学能力或绩效。

## 登记与状态

- 原生记录：`server-version/backend/src/modules/scale/instruments/taaq10_zh_cn_research/1.0.0/instrument.ts`（数据在同级 `source.json`）。
- 题文与计分验收：**未通过：完整题文未纳入（权利受限），catalog-only**。
- 报告：仅图文样稿；未动态接入。
- 原始来源：Grégoire, S., Bouffard, T., & Vezeau, C. (约2018). Développement et validation du questionnaire d'acceptation et d'action chez les enseignants (TAAQ). Canadian Journal of Behavioural Science（卷期页码待核，转引自 TAAQ-PT 与日语版二手文献）。
- 来源链接：https://www.researchgate.net/publication/341327844

## 计分



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
