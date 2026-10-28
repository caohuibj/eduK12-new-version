# CAMM 内容记录与验收状态

儿童青少年对当下体验的觉察与不评判接纳：留意眼前正在发生的事、允许想法和感受存在而不被其带走。是 ACT 相邻的正念测量，不是 ACT 专属过程量表，也不是注意能力测验。

## 登记与状态

- 原生记录：`server-version/backend/src/modules/scale/instruments/camm10_zh_cn_research/1.0.0/instrument.ts`（数据在同级 `source.json`）。
- 题文与计分验收：**通过；原生 executable DRAFT（zh-CN 工作译稿）**。
- 报告：原生模板定义 + 图文样稿。
- 原始来源：Greco, L., Baer, R. A., & Smith, G. T. (2011). Assessing mindfulness in children and adolescents: Development and validation of the child and adolescent mindfulness measure (CAMM). Psychological Assessment, 23, 606-614.
- 来源链接：https://ruthbaer.com/academics/CAMM.pdf

## 计分

- `total`：正念总分（10题，反向后） —— 按官方规则先逐题反向（0↔4、1↔3、2 不变）再求和，范围 0–40。分数越高表示越多报告“留意当下、允许感受存在”；分数越低表示越多报告走神、评判自己或推开感受。方向与题目字面相反，解读时以本说明为准。

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
