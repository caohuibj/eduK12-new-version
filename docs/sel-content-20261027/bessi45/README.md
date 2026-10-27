# BESSI-45 自评：验收材料

2026-10-28 更新：**英文自评版题文验收通过。** 官网明确声明 BESSI“供非商业用途（科学研究、项目评估、个人使用）自由使用，无需请求许可；商业使用需许可；翻译需联系作者”。据此以新精确版本 `bessi_45_self_en@1.0.0`（`server-version/backend/src/modules/scale/instruments/bessi_45_self_en/1.0.0/instrument.ts`）交付英文原题可执行 DRAFT：45 题逐字誊入、官方计分页五域各 9 题均值、无反向题、4 组 golden cases。中文版（`bessi_45_self_zh_cn`）仍为 catalog-only：官网中文题本的存在不等于取得翻译与再分发授权，中文施测前须按官网说明联系作者。题本页脚 ©2019 作者版权声明与官网非商业授权并存，记录于定义 license.note 与 usageRequirements。

- 官网与授权说明：https://www.sebskills.com/the-bessi.html
- 英文自评题本：https://www.sebskills.com/uploads/1/3/1/0/131015187/bessi-45_form_self.pdf
- 中文自评题本：https://www.sebskills.com/uploads/1/3/1/0/131015187/bessi-45_chinese_self-report_form.pdf
- 官方计分：https://www.sebskills.com/uploads/1/3/1/0/131015187/bessi-45_scoring.pdf
- 官方他评题本：https://www.sebskills.com/uploads/1/3/1/0/131015187/bessi-45_form_observer.pdf 。本材料为学生自评，不将他评内容混入。

`scoring.py` 实现官方五组每组9题均值，无反向；1–5分表示自评能做得多好，而非频率或喜好。缺任何一题不输出该领域分数，是产品保守约定，不声称原作者缺答规则。`test_case.json` 给出可复现的模拟回答。运行 `python3 scoring.py` 校验完整与缺答、非法值。`report.html` 是使用同一模拟数据的五领域报告样稿，不做常模等级。`bessi_45_self_zh_cn` 为 CATALOG_ONLY 记录（中文路径待翻译授权）；英文路径 `bessi_45_self_en` 已含 executable 与 golden cases，本地结构断言通过（45 题不重不漏、计分引用完整、样例分与 scoring.py 一致），TypeScript 编译与运行时核验由集成方完成。商业用途按官网需许可。
