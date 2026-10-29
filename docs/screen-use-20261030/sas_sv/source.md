# SAS-SV｜来源与验收记录

## 全文固定

- 来源：Kwon M, Kim DJ, Cho H, Yang S. (2013). The Smartphone Addiction Scale: Development and Validation of a Short Version for Adolescents. **PLoS ONE, 8(12), e83558**. doi:10.1371/journal.pone.0083558
- 题文取自作者随文分发的 **Appendix S1 "English version of SAS-SV"（XLSX）**，2026-10-29 从 PLoS 官网逐题提取核对，共 10 题，未改动任何词语。
- 应答集为官方 6 点同意度：Strongly disagree(1) / Disagree(2) / **Weakly disagree(3)** / **Weakly agree(4)** / Agree(5) / Strongly agree(6)。注意 3/4 两档为 Weakly，与常见 6 点格式不同，照原样保留。
- 官方计分：10 题总和（10–60）；无反向题、无分量表。可执行定义用 `aggregation: sum` 精确等价。

## 许可

原文许可声明（PLoS 页面原文）：*This is an open-access article distributed under the terms of the Creative Commons Attribution License, which permits unrestricted use, distribution, and reproduction in any medium, provided the original author and source are credited.* —— **CC BY**，署名即可自由使用与再分发。登记 `license.status: verified`、`redistribution: allowed`，引用并保留作者署名。

## 关键数字（XML 原文核对）

- 验证样本：韩国初中生 **N=540**（男 343 / 女 197），平均 14.46±0.54 岁；Scale mean 25.26, SD 10.78。
- 信度：**overall α = .911**（Table 3 原文）。
- 并行效度：与 SAS（33 题长版）、SAPS、KS-scale 显著相关。
- ROC：男 **cut-off 31**（AUC .963, sens .867, spec .893）、女 **cut-off 33**（AUC .947, sens .875, spec .886）。切分点记录于文档与 limitations，报告不据此给个人等级（韩国初中样本、非本地常模）。

## 证据与中文路径

- 中文验证：Cheung et al. (2019) 香港青少年；Luk et al. (2018) 香港成人（Addictive Behaviors, doi:10.1016/j.addbeh.2017.12.006）。中文施测须以已发表中文版为参照完成翻译验证并立新版本。
- 指导语：官方附录未含中文；当前 zh-CN 指导语为工作译文并已注明，中文验证时以已发表中文版核对。

## 验收结论

- 题文与计分：**通过**（CC BY 逐字誊录、官方总和计分、4 组 golden cases 与 `scoring.py` 交叉一致）。
- 报告：原生模板＋静态样稿 `report_sample.html`（模拟数据已标注）。
- 缺口：中文译题未交付；动态接入与浏览器视觉验收由集成方完成。
