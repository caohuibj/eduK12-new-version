# C-SACS-9 / 中文以己为景量表：第一类候选完整来源包
核验日期：2026-10-25。只写 scratch；未修改仓库、数据库、GitHub、Notion。

## 去重和建议 key
对当前 `eduk12-dot-local-scales-20261025` 全仓运行 `rg -i -l 'sacs|以己为景|self.as.context'` 无命中。建议 `csacs9_zh_cn@1.0.0`（builder 再按实际命名规则确认）。

## 原始证据及版权
- Fang S, Huang M, Wang Y (2022). Measuring self-as-context in Chinese college students: Validity and reliability of the Chinese version of self-as-context scale (C-SACS). Frontiers in Psychology 13:1051661. https://doi.org/10.3389/fpsyg.2022.1051661
- 出版社全文：https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.1051661/full
- 出版社 PDF：https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.1051661/pdf
- 实际下载 `csacs-frontiers-2022.pdf` SHA256 `17e0fb5810edb4ab4e29e5b17b870f2f6d11bef76bc6730891db8d1f03ef1275`；`article.txt` 是 pdftotext，`appendix.png` 是最后一页实图，已目视读取中文。
- 第 1 页与 HTML copyright 均为 © 2022 Fang, Huang and Wang, CC BY；许可链接实际指向 https://creativecommons.org/licenses/by/4.0/ 。第 11 页 Appendix 1 展示完整双语题本，无另署第三方排除/禁止复制/单独版权行。
- 方法 Procedure 明确：第一作者联系原作者并获同意，获得 SACS 翻译及修订权；有正向/回译、专家比较、20 名非心理专业学生认知理解评估。此处不是“仅因论文 OA 就套许可”：有具体中文作者翻译修订权 + 作者公开 CC BY 的中文附录 + 未见附录另行排除。
- 原始工具引用：Zettle RD, Gird SR, Webster BK, Carrasquillo-Richardson N, Swails JA, Burdsal CA (2018). The self-as-context scale: development and preliminary psychometric properties. Journal of Contextual Behavioral Science 10, 64–74. DOI 10.1016/j.jcbs.2018.08.010 。应一并署名引用，但本实现只抽取获许可发表的中文版本，不把原英文出版物笼统标 CC BY。
- 建议 attribution：中文条目据 Fang、Huang、Wang（2022）Appendix 1，CC BY 4.0；原工具 Zettle 等（2018）。按该中文验证论文 Table 2 删除原第 7 题、保留原题号映射，数字化呈现。通俗报告为平台新增，不属于原量表验证内容；作者未背书本系统。
- CC BY 不应额外打“非商业”限制标签；标签 `CC BY 4.0 / 可公开再分发 / 需署名`。

## 必须处理的版本陷阱
附录列出研究施测时完整 10 题，最终验证模型 **9 题**。Table 2 明确 “Item 7 has been deleted”；正文结果和可靠性分析亦用 9 题。不要把初始 10 题的验证结论当最终版本，不能自选其他题。

## 精确中文题干（按 Appendix 1 人工读取；保留原编号）
1. 当我心烦意乱时，我能在自己的心中找到一个平静的地方。
2. 我对生活有一种领悟，可以让我应对生活中的不如意，而不会被它们压倒。
3. 尽管我的人生发生了许多变化，但有一个最基本的“我”保持不变。
4. 回顾迄今为止的生活，我意识到那个能觉察情绪或想法的“我”一直在那里，陪伴着我。
5. 我允许我的情绪起伏变化而不挣扎其中。
6. 我能够注意到自己不断变化的想法而不会陷入其中。
8. 尽管我的人生发生了很多变化，但我意识到心中有个“观察者”见证了这一切。
9. 我能够站在一个更高的视角去觉察我的想法、感受和情绪。
10. 当我回想曾经的生活，我意识到那个能够观察情绪和感觉的“我”依然存在。

供溯源，不纳入最终九题计分：原第7题“我对自己有一种基本的认识，即使我的想法或感受改变了，这种认识也不会改变。”

## 选项、计分、参数
- 论文 Measures：7 级同意度，1=strongly disagree，7=strongly agree；全为正向题，无反向题。
- 附录只有题干，没有额外中文作答指导语和完整七档文字。不要伪称已有完整中文锚点原文。安全数字化：1 至 7 数字选项，两端以平台译注标“非常不同意 / 非常同意”，不创造中间五档的作者原文；指导语也明确为界面说明而非验证原文。
- 最终9题总和范围 9–63；higher = more self-as-context。Centering 原题 1/2/5/6，总和4–28；Transcending 原题3/4/8/9/10，总和5–35。若数据库重新连续编号：Centering=1,2,5,6；Transcending=3,4,7,8,9，并明确originalItemNumber。
- 不要用两个维度总和直接比较高低（题数不同）。报告可用题均分作为透明界面转换，但不是临床阈值/常模分。
- 未报告诊断分界、低中高经验阈值、可靠变化界值或缺失插补规则。设置 `thresholdStatus=no_validated_cutoff`；不硬造三分档。实现完整作答9/9才计分，漏答返回无法计分并提示补齐；这属于保守平台规则，不冒充作者规则。
- 如果系统要求必须有阈值表才能启用，标记 schema/workflow blocker，而不要编造阈值。

## 样本/适用边界
中国大学生便利样本 N=708，年龄17–25，均龄20.28；158男/550女。343完成关联量表，217完成3周复测。分EFA/CFA各354。总量表alpha0.88、Centering0.80、Transcending0.85；不是临床诊断效度，不宜称已验证于中小学生、所有成人、ASD父母或临床患者。可供大学生自我了解/ACT过程研究，其他人群须单列未验证状态。无需把17岁单独当临床儿童工具。

## 通俗报告（平台原创、不作为诊断/固定人格标签）
标题：给念头和情绪留一点空间
总说明：这份问卷关注的不是“你有没有烦恼”，而是烦恼出现时，你能不能一边觉察它，一边保留自己的选择。结果只是你此刻的自我描述，不是心理疾病诊断，也没有公认的好坏分界。
维度1显示名：起伏中稳住自己。说明：看看情绪和想法像浪一样涌来时，你能否找到一点平静，不急着跟它们较劲。一次烦乱不说明你做得不好。
维度2显示名：退一步看见自己的经历。说明：除了“我正在难过”，也试着留意“我正在觉察难过”。经历会变，你不必把某一刻的念头当作自己的全部。
行动建议：下次被一个念头缠住时，可以试着加一句“我注意到，我现在有一个……的想法”，再选择眼前一件小事去做。如果这种练习让你更不舒服，就先停下来，换成看看身边的物品、感受脚踩地面。
解释界限：不把分数翻译成“心理健康/不健康”“已掌握ACT”“独立自我更强”；不把两维度的关系画成越高越好等级榜。若困扰持续并影响生活，可以向合适的专业人员寻求支持。
展示：优先上述两段解释和一个小行动；原始分数可放“查看计分详情”。不展示百分位、全国排名、风险红黄绿或阈值带。
配图可选：原创“天空与云”中性示意，说明想法会来去；不复用作者图片、不把图当疗效承诺。

## 8轴标签
1 领域：心理灵活性 / 情绪与认知过程
2 构念：以己为景 / 观察视角 / Centering / Transcending
3 理论取向：ACT直接过程工具；第三波CBT可为上位关系；不打DBT专属工具
4 人群：中国大学生 / 验证年龄17–25 / 非临床便利样本
5 作答方式：自评 / 9题 / 7级同意度
6 使用场景：自我了解 / ACT过程研究 / 非诊断 / 无验证临床阈值
7 许可：CC BY 4.0 / 需署名 / 可公开再分发
8 语言版本：简体中文 / 经原作者同意翻译修订 / 中国大学生验证 / 2022最终9题版

## 本轮其他线索（不作为落地候选）
- 香港CFQ-7 BMC2025 DOI10.1186/s40359-025-03011-5：CC BY且有DOCX，但方法只说明从Wang中文9题改传统中文再删两题，未见原作者具体授权；不在本轮据此放行。
- 医学生PPFI BMC2024 DOI10.1186/s40359-024-02121-w：出版页面实为BY-NC-ND，不按泛OA误判CC BY；不深挖。

## 计分聚合补证（原作者2025）
中文文只写与原计分一致，Table 4/可靠性段确实使用total score及两个subscale scores；没有逐字写sum公式。补充原作者 Zettle RD, Lyons GA, Larson JM, Leonard C (2025). Psychometric Properties of the Self-as-Context Scale with a University Counseling Center Sample. Behavioral Sciences15(7):910. DOI10.3390/bs15070910。
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12292914/
- https://www.mdpi.com/2076-328X/15/7/910
- 作者机构存档：https://soar.wichita.edu/bitstreams/7c979ea0-ca9a-4274-94b4-634e0f835ae5/download
- 官方研究文本明确英文10题相加产生total score（不是平均数）。因此本包sum使用的是原作者原计分规则 + 中文文“计分与原版一致” + 中文明确剔除7并使用最终9题总分的证据链。不能拿英文10题常模/分界套中文9题。
- 本次web搜索可读取PMC索引全文，直接open触发recaptcha；机构PDF下载是否成功需独立核实，不能为未完整下载文件写hash。本证据不是另一个版本的中文题本。
- 实际机构下载返回 HTML 防护页，已重命名 `zettle2025-download-blocked.html`，不是有效PDF；未作为题本或许可原件。主中文2022 PDF实字节下载正常且hash已给。
