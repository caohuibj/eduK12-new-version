# Westside Test Anxiety Scale｜来源与验收记录

## 全文固定

- 来源：Driscoll, R. (2007). *Westside Test Anxiety Scale Validation* (ERIC ED495968). American Test Anxiety Association. 全文公开：https://files.eric.ed.gov/fulltext/ED495968.pdf
- 题文与官方计分取自该报告 **Appendix A**（第 5 页）：10 题、5 点『真实程度』量表（5=extremely or always true，1=not at all or never true）、计分为 10 题总和除以 10、作者提供六档描述区间。
- 指导语逐字：`Rate how true each of the following is of you, from extremely or always true, to not at all or never true. Use the following 5 point scale.`
- 2026-10-29 提取全文并逐题核对；PDF 抽取产生的断行空格（如 `modera tely`）已按词义合并，未改动任何词语。

## 许可

官方量表页脚授权声明（逐字）：

> © 2004 by Richard Driscoll, Ph.D. You have permission to copy this scale for personal use and for institutional uses (but not for resale).

验证报告摘要另声明量表 *public access and free of charge to schools*。据此登记为 `license.status: authorized` / `redistribution: allowed`（非商业、原样复制、禁止转售）。**翻译与商业化不在该声明范围内**：中文施测前须完成翻译验证并立新版本，翻译权利建议另行确认。

## 计分核验

- 官方计分键：总和 ÷ 10 = 均分（1.0–5.0）。可执行定义用 `aggregation: mean` 精确等价于官方算法；无反向题。
- 附录明确构成（6 项损害 + 4 项担忧，无生理唤醒题），但**未给出逐题因子键**，因此只计官方总分，不发明分量表拆分。若后续作者材料给出逐题归属，以新版本登记。
- 作者描述区间（记录用，报告不作为个人等级）：

| 区间 | 作者原文 |
|---|---|
| 1.0—1.9 | Comfortably low test anxiety |
| 2.0—2.5 | Normal or average test anxiety |
| 2.5—2.9 | High normal test anxiety |
| 3.0—3.4 | Moderately high (some items rated 4=high) |
| 3.5—3.9 | High test anxiety (half or more of the items rated 4=high) |
| 4.0—5.0 | Extremely high anxiety (items rated 4=high and 5=extreme) |

区间源自美国大学生与五年级样本，非诊断阈值，未建中文常模；报告 limitations 中已声明。

## 证据

- 主证据：两项干预研究的变化分数相关（大学生 r=.49、五年级 r=.40，加权 r=.44）；焦虑变化分数子样本 n=11/14（合并 25）与 n=34。样本小且为 ERIC 技术报告，评级 MIXED。
- 辅证据：Barbu et al. (2025) 罗马尼亚样本重测与语言等值初步验证（doi:10.2478/picbe-2025-0158）。
- 报告未公开内部一致性系数，本登记不补充未公开数值。

## 验收结论

- 题文与计分：**通过**（逐字誊录、官方计分键、golden cases 4 组与 `scoring.py` 交叉一致）。
- 报告：原生模板＋静态样稿 `report_sample.html`（模拟数据已标注）；分数曲线用系统现有报告轨渲染，未引入新渲染框架。
- 缺口：中文译题未交付；动态接入与浏览器视觉验收由集成方完成。
