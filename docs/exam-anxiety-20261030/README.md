# 考试焦虑内容入库与验收记录｜2026-10-30

本分支（`exam-anxiety-20261030`）基于 main `9801107019d51a4af7ddb651789b674867539d24`，延续 `SELcontents` 分支确立的入库标准：逐字题文、官方计分键、`complete_required` 缺答不补 0、zh 反馈、golden cases、逐家族独立提交、`[skip ci]`；未触发 CI、未建 PR、未合并、未部署。

## 本轮结果：4 个工具家族，1 个可执行 DRAFT + 3 个 catalog-only 登记

候选排序依据文献检索（引用次数高、年代更近优先），完整候选清单见库外工作记录《exam-anxiety-candidates》（2026-10-29），本轮执行第一批：AEQ、TAI、CTAS、Westside。

| # | 工具 | 状态 | 验收 | 阻塞点 |
|---|---|---|---|---|
| 1 | [Westside Test Anxiety Scale](#westside-test-anxiety-scale)（`westside_10_driscoll_en@1.0.0`） | **可执行 DRAFT**（en） | 通过 | 中文译题未交付 |
| 2 | [AEQ 考试焦虑分量表](./aeq/source-and-blockers.md)（`aeq_test_anxiety_en@1.0.0`） | catalog-only | 登记阶段 | 官方手册本环境不可达；条款未归档 |
| 3 | [CTAS-27](./ctas/source-and-blockers.md)（`ctas_27_cassady_en@1.0.0`） | catalog-only | 登记阶段 | 题文在订阅墙内；作者条款未核 |
| 4 | [TAI-20](./tai/source-and-blockers.md)（`tai_20_spielberger_en@1.0.0`） | catalog-only | 登记阶段 | Mind Garden 商业分发，题文不得复制 |

不得把 catalog 登记当作工具入库完成。三个登记项的升级路径见各自 source-and-blockers 文档。

## Westside Test Anxiety Scale

[完整来源](https://files.eric.ed.gov/fulltext/ED495968.pdf)：Driscoll, R. (2007). *Westside Test Anxiety Scale Validation* (ERIC ED495968)，题文与官方计分取自 Appendix A，2026-10-29 逐题核对。

- [原生定义 `westside_10_driscoll_en@1.0.0`](../../server-version/backend/src/modules/scale/instruments/westside_10_driscoll_en/1.0.0/instrument.ts)；DRAFT；en；zh 反馈。
- 许可：官方量表页脚书面授权——个人与机构用途可复制、禁止转售（逐字引用见 `usageRequirements`）；`license.status: authorized`、`redistribution: allowed`（非商业、原样复制）。**翻译与商业化不在授权范围**，中文施测前须翻译验证并立新版本。
- 计分：官方为 10 题总和除以 10，用 `aggregation: mean` 精确等价；无反向题；附录未给出 6 项损害/4 项担忧的逐题因子键，**不发明分量表拆分**，只计官方总分。
- 作者六档描述区间（1.0–1.9 … 4.0–5.0）按原样记录于 `source.md` 与 limitations，报告不据此给个人等级（美国样本、非诊断阈值）。
- 证据：干预研究变化分数相关 r=.49/.40（加权 .44），样本小、ERIC 技术报告，评 MIXED；辅以 Barbu et al. (2025) 罗马尼亚重测初步验证。
- [工具记录与区间全文](./westside/source.md)；[计分参考 `scoring.py`](./westside/scoring.py)（4 组 golden cases 全部通过）；[图文样稿](./westside/report_sample.html)（模拟数据已标注）。
- 独立提交：见 `commits.json`。

## 报告验收

Westside 样稿含总分图、非学术反馈、反思问题、可尝试行动与免责声明；数值为明确标注的模拟数据；未引入新的报告渲染框架或外部图片依赖。三个登记项无样稿（登记阶段）。

浏览器安全策略与既有记录一致：本轮完成静态内容、分数和结构核验，未通过实际浏览器视觉/交互验收；不得把本记录用作 UI 上线证据。

## 查重

`dedup.json` 登记本轮全部相邻构念关系：对 `dass21_zh_cn`（泛化焦虑）、PR 328 草稿 `gad7`/`k6`/`phq9`、`pss10`/`sswq16`/`spane12`（跨情境构念）、`erq_ca`（调节策略）、`value_cost_*`/`academic_self_efficacy_*`（控制-价值前因）、CTAS↔Westside↔TAI 互相之间的家族边界，以及 `texi`（执行功能）与 TAI 的名称防混淆。与 SELcontents 分支 `docs/sel-content-20261027/dedup.json` 的既有关系无冲突，精确 key 均为新 key。

## 下一轮计划

1. **AEQ 升级为原生 DRAFT**（优先）：取得 2022 AEQ-R 手册（Essex 作者自存档）或作者分发件 → 归档条款 → 确定精确版本（原版/AEQ-R/AEQ-ES）→ 逐字誊录。
2. CTAS：归档作者分发条款后誊录 27 题。
3. TAI：由库负责人决定是否采购 Mind Garden 许可。
4. 第二批候选（FTAS 中文 PAF 对照、TAQ-C 小学段）与第三批（Lowe 系列、TAS 中文版、RTT）按同一标准逐项处理。
5. 中文译题：所有工具的中文施测路径独立立项，翻译验证完成前不标"已验证中文"。
