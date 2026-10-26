# 来源与逐层版权核对

## 原作者题本（实际使用）

Kato, T. (2020). Examination of the Coping Flexibility Hypothesis Using the Coping Flexibility Scale-Revised. Frontiers in Psychology, 11, 561731. https://doi.org/10.3389/fpsyg.2020.561731.

- 正式论文与12项原题文：https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.561731/full
- DOI：https://doi.org/10.3389/fpsyg.2020.561731
- 权利：© 2020 Kato，CC BY 4.0：https://creativecommons.org/licenses/by/4.0/
- 论文 “Item Development” / Table 1 记录三因子、12题、0–3端点以及日语研究施测事实。没有第三方作者对原版CFS-R条目的单独排除说明。

## GitHub 发现记录（仅索引和交叉核对）

- OpenScales CFSR：https://github.com/stmueller/OpenScales/blob/main/scales/openscales/CFSR/CFSR.osd
- 读取时该文件 Git Blob：`8bb2d96eeaca01ba30db33d9376f269e439e60f1`。
- 数据集 README 宣称仓库结构CC BY 4.0，根/LICENSE却是CC BY-NC-SA 4.0；以独立原作者 CC BY 文献为复制依据。
- OSD 的维度 `mean_coded` 与论文三个维度的均值（约5.35、4.84、4.47）不匹配；论文是四题求和。别的工具与仓库许可不得代替本工具校验。

## 证据不等价

- 研究实际施测语言：日语；Table 1 英文为作者发表的表述；现中文为平台工作稿，不是日本研究的直接受试题本，也非已有验证中文版本。
- 原样本日本成年人20–98岁N=4000，不能把作者的内部一致性/结构效度机械称为中国或K12已验证。
- 无可靠原始中文常模、诊断界值/ROC、百分位或最小临床重要变化的可直接适用证据，运行 ReferenceSet 留空。

## 补充：2026 年独立中文验证版（不等于本项目工作译稿）

Shan, R., Wang, S., Golfenshtein, N., et al. (2026-07-21). *Adaptation and psychometric properties of the Coping Flexibility Scale-Revised in Chinese parents of children with cancer*. **BMC Psychology** 14:1492. DOI: https://doi.org/10.1186/s40359-026-05160-7；[PubMed PMID 42482252](https://pubmed.ncbi.nlm.nih.gov/42482252/)。

- 这项研究实际招募 **318 名中国癌症患儿父母**，对**该研究自行翻译并跨文化适配的 C-CFS-R** 报告了三因子模型、内部一致性与重测证据。这说明 2026 年已有特定中国成人群体的验证性中文版，不能笼统宣称世上不存在中文验证版。
- **不能将这项效度自动转移到本项目的不同中文工作译稿** `cfsr12_zh_cn_research@1.0.0`。题文、指导语和被试人群不是同一精确版本；该研究也不能直接证明普通中国成人、教师或 K12 学生的适用性。
- 此次只取得论文元数据与摘要，**尚未确认该研究的完整精确中文题本可再分发的独立权利**；不把作者中文题干写入公开仓库，也不把其样本统计值当作本项目 ReferenceSet、常模或阈值。
- 若下一批考虑改为采用 Shan 等的验证中文题本，需首先取得**全文题本及具体版权/翻译使用依据**，另建明确 localization/measurement 版本，按现有科学审核重新验证，不能静默覆盖本稿。
