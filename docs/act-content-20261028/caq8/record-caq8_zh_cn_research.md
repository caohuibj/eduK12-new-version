# CAQ-8 内容记录与验收状态

承诺行动：以价值为方向、在遇到困难时仍能坚持并灵活调整目标导向行为。正向键四题测价值坚持，负向键四题测困难面前的松懈式放弃。不是执行力测验，也不是疗效承诺书。

## 登记与状态

- 原生记录：`server-version/backend/src/modules/scale/instruments/caq8_zh_cn_research/1.0.0/instrument.ts`（数据在同级 `source.json`）。
- 题文与计分验收：**通过；原生 executable DRAFT（zh-CN 工作译稿）**。
- 报告：原生模板定义 + 图文样稿。
- 原始来源：原版: McCracken, L. M., Chilcot, J., & Norton, S. (2015). Further development in the assessment of psychological flexibility: A shortened Committed Action Questionnaire (CAQ-8). European Journal of Pain, 19, 677-685. 题本核实来源: Li, Y., et al. (2021). Validation of the Committed Action Questionnaire-8 and its mediating role... Frontiers in Psychology, 12, 655518 (CC BY 4.0, Table 3 八题及因子归属).
- 来源链接：https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.655518/full

## 计分

- `committed_action_total`：承诺行动总分（8题，负向键反向后） —— 第 5–8 题（负向键）按 6−原始分反向后与第 1–4 题相加，范围 0–48。分数越高表示越多报告：即使困难或进展缓慢，仍朝自己看重的目标行动。
- `values_persistence`：目标坚持（第1–4题） —— 四个正向键题原始分求和，范围 0–24。分数越高表示越多报告为目标坚持、小步前进、换方法而不放弃。
- `negative_committed_action_raw`：困难时的坚持（第5–8题反向后） —— 四个负向键题按 6−原始分反向后求和，范围 0–24。分数越高表示越少报告“不成功就放弃、被想法缠住就不做了”式的反应，与“目标坚持”同向。开放验证论文以原始分报告该子量表；本实现按引擎题级反向规则统一方向，解读以本说明为准。

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
