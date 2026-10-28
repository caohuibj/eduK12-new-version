# MPFI-24 内容记录与验收状态

基于 ACT 六过程框架的六个灵活性子量表（接纳、接触当下、以己为景、认知解离、价值、承诺行动）与六个不灵活性子量表（经验性回避、缺乏当下接触、以己为内容、认知融合、缺乏价值联结、无所作为），每子量表两题取均值，另有官方 12 题全局灵活性/不灵活性两个合成分。灵活性与不灵活性分开计分，不合成为总分。

## 登记与状态

- 原生记录：`server-version/backend/src/modules/scale/instruments/mpfi24_zh_cn_research/1.0.0/instrument.ts`（数据在同级 `source.json`）。
- 题文与计分验收：**通过；原生 executable DRAFT（zh-CN 工作译稿）**。
- 报告：原生模板定义 + 图文样稿。
- 原始来源：Rolffs, J. L., Rogge, R. D., & Wilson, K. G. (2016/2018). Disentangling components of flexibility via the Hexaflex model: Development and validation of the Multidimensional Psychological Flexibility Inventory (MPFI). 官方题本与计分说明见 Rogge 研究团队网站。
- 来源链接：https://couples-research.com/wp-content/uploads/2017/06/MPFI.docx

## 计分

- `acceptance`：接纳 —— 两题均值，范围 1–6；越高表示越多报告接纳。
- `present_moment`：接触当下 —— 两题均值，范围 1–6；越高表示越多报告对当下想法和情绪的觉察。
- `self_as_context`：以己为景 —— 两题均值，范围 1–6；越高表示越多报告从更大视角看待自己的经历。
- `defusion`：认知解离 —— 两题均值，范围 1–6；越高表示越多报告与消极感受保持距离。
- `values`：价值 —— 两题均值，范围 1–6；越高表示越多报告清楚并坚持自己的价值方向。
- `committed_action`：承诺行动 —— 两题均值，范围 1–6；越高表示越多报告在困难中仍朝价值方向行动。
- `experiential_avoidance`：经验性回避 —— 两题均值，范围 1–6；越高表示越多报告用分心等方式回避内心体验。
- `lack_of_contact_present_moment`：缺乏当下接触 —— 两题均值，范围 1–6；越高表示越多报告“自动运行”式的不觉察状态。
- `self_as_content`：以己为内容 —— 两题均值，范围 1–6；越高表示越多报告评判和不接纳自己的情绪。
- `fusion`：认知融合 —— 两题均值，范围 1–6；越高表示越多报告被消极想法缠住。
- `lack_of_contact_values`：缺乏价值联结 —— 两题均值，范围 1–6；越高表示越多报告在忙碌中与价值失去联结。
- `inaction`：无所作为 —— 两题均值，范围 1–6；越高表示越多报告被消极感受困住而停摆。
- `flexibility_composite`：全局灵活性合成分（12题均值） —— 官方短版全局合成分：六个灵活性子量表前两题共 12 题的均值，范围 1–6；越高表示越多报告整体心理灵活性。
- `inflexibility_composite`：全局不灵活性合成分（12题均值） —— 官方短版全局合成分：六个不灵活性子量表前两题共 12 题的均值，范围 1–6；越高表示越多报告整体心理僵化。与灵活性合成分分开解读，不合成为总分。

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
