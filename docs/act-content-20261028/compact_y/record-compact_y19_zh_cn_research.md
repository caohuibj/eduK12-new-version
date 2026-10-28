# CompACT-Y 内容记录与验收状态

基于 ACT 六过程框架的青少年多维心理灵活性自评：价值行动（VA）、对体验的开放（OE）、对行为的觉察（BA）三个维度及总分。正向与负向措辞题并存，负向题反向后计分；总分越高表示越多报告心理灵活性。

## 登记与状态

- 原生记录：`server-version/backend/src/modules/scale/instruments/compact_y19_zh_cn_research/1.0.0/instrument.ts`（数据在同级 `source.json`）。
- 题文与计分验收：**通过；原生 executable DRAFT（zh-CN 工作译稿）**。
- 报告：原生模板定义 + 图文样稿。
- 原始来源：Morey, D. P., et al. (2024). Validation of the comprehensive assessment of acceptance and commitment therapy processes for youth (CompACT-Y). JCPP Advances, 4(4), e12271.
- 来源链接：https://acamh.onlinelibrary.wiley.com/doi/10.1002/jcv2.12271

## 计分

- `total`：心理灵活性总分（19题） —— 11 个负向键题（OE、BA 全部）按 6−原始分反向后与 8 个正向键题相加，范围 0–138。分数越高表示越多报告心理灵活性。
- `valued_action`：价值行动（VA，8题） —— 八个正向键题原始分求和，范围 0–48。分数越高表示越多报告：清楚什么重要，并按它行动。
- `openness_to_experience`：对体验的开放（OE，6题反向后） —— 六个负向键题反向后求和，范围 0–36。分数越高表示越少报告分心、回避和压制感受。
- `behavioural_awareness`：对行为的觉察（BA，5题反向后） —— 五个负向键题反向后求和，范围 0–30。分数越高表示越多报告做事时留意当下。

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
