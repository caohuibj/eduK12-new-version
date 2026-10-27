# BESSI-45 自评：验收材料

**题文验收未通过；本条目仅为目录预览，不能施测。** 官方英文题本声明 ©2019 作者所有权利保留；官网说明非商业用途免费、商业用途需许可，但未明确允许公开仓库再分发或修改。按本任务公开仓库约束，本目录不复制完整题文或翻译，不凭空推断再分发授权。官网同时提供中文自评题本；不可将其存在等同于已取得公开仓库使用权。

- 官网与授权说明：https://www.sebskills.com/the-bessi.html
- 英文自评题本：https://www.sebskills.com/uploads/1/3/1/0/131015187/bessi-45_form_self.pdf
- 中文自评题本：https://www.sebskills.com/uploads/1/3/1/0/131015187/bessi-45_chinese_self-report_form.pdf
- 官方计分：https://www.sebskills.com/uploads/1/3/1/0/131015187/bessi-45_scoring.pdf
- 官方他评题本：https://www.sebskills.com/uploads/1/3/1/0/131015187/bessi-45_form_observer.pdf 。本材料为学生自评，不将他评内容混入。

`scoring.py` 实现官方五组每组9题均值，无反向；1–5分表示自评能做得多好，而非频率或喜好。缺任何一题不输出该领域分数，是产品保守约定，不声称原作者缺答规则。`test_case.json` 给出可复现的模拟回答。运行 `python3 scoring.py` 校验完整与缺答、非法值。`report.html` 是使用同一模拟数据的五领域报告样稿，不做常模等级。`native/instrument.ts` 为 ScaleInstrumentSourceV1 的 CATALOG_ONLY 记录，含 applicability/disclosure，不含 executable。正式可执行入库需要清晰的题本公开再分发权利及具体使用授权，并完成题文核验；商业用途按官网需许可。
