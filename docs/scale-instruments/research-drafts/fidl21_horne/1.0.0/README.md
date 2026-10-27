# FIDL-21｜Horne、Chen与Irish｜正式21题版来源缺口记录（未构建量表包）

**状态：SOURCE_KEY_PENDING；不是18项计划中已完成的DRAFT内容包，未入生成式Registry。**

## 已由原研究确认
- Horne, K., Chen, T., & Irish, M. (2025). *Development of the Flexibility in Daily Life scale to measure multidimensional cognitive and behavioural flexibility in health and disease*. *British Journal of Clinical Psychology*, 64, 315–329. DOI: 10.1111/bjc.12505，2024-09-22在线发表。https://pmc.ncbi.nlm.nih.gov/articles/PMC12057328/
- 正式版是探索性因素分析之后的**21题**，不是最初收集的37题；五因素分别为Repetition 6、Switching 5、Predictability/Control 4、Routine 3、Thoughts/Beliefs 3题。
- 过去两周的自评，1 Never、2 Rarely、3 Sometimes、4 Often、5 All the time；正向叙述题需反向处理，整体高分表示灵活性较低。完整21题数学范围21–105，各维如果求和理论范围6–30、5–25、4–20、3–15、3–15，**仅为数量与端点数学推导，不代表正式评分键完成验证**。
- 研究对象美国19–78岁成人，未验证此独立简体中文版本。2026年中国强迫症样本报告的25题/三因子探索性修订不能充作2025原版21题五因子计分键。
- 论文正文以CC BY 4.0开放获取并保留作者署名；将来使用实际补充表须保留其准确出处和权利声明。管理员确认独立简体中文翻译及电子呈现事项。

## 尚未取得，严禁猜测
原作者论文的**Supporting Information，Appendix S1，BJC-64-315-s001.docx** 含正式21题问卷。此次已找到论文、补充材料名称，但无法在当前研究入口取得该DOCX字节并核验：逐题原文、正式21题顺序、五因子题号、逐题反向键**全部未核实**。网页示例题不是完整键，不能据因子名或37题草稿反推。

- 官方论文： https://pmc.ncbi.nlm.nih.gov/articles/PMC12057328/
- 原始补充材料入口： https://pmc.ncbi.nlm.nih.gov/articles/PMC12057328/ （Supporting information > Appendix S1；文件名如上）
- 恢复条件：取得可完整解析的官方补充DOCX，逐项核对21题、维度及反向，再生成 source.json、instrument.ts、THIRD_PARTY_LICENSE.md、完整黄金用例和注册表增量。不得制造虚构内容“凑足”18/18。
- 八轴预置检索：domain:cognitive_flexibility；construct:daily_life_inflexibility；orientation:transdiagnostic_non_diagnostic；population:adult_19_78_original；response:self_five_point_two_weeks；use:research_reflection；license:paper_cc_by_4_with_attribution_review_translation；language_validation:en_original_zh_cn_pending；中文检索：日常灵活性、认知灵活性、行为灵活性、重复、任务切换、规律、刻板、信念。
- 普通报告草稿意向：“生活安排有时会变化，我们也会用熟悉的方式应对。它不代表一个人有多优秀，只帮你看看在哪些情境里改变做法更容易，哪些更需要支持。”不生成分数等级、诊断、常模、百分位。
- 源内容、计分、中文本地化、报告预留独立版本 1.0.0（**尚未产生实质内容版本**）。没有可验的常模或临床切点。

## 本次最小核对
仅正文出处、项目规则及Git对象静态检查。Vitest、TypeScript、真实评分、CI、数据库、浏览器、服务器、部署、人工科学审查：**NOTRUN**。
