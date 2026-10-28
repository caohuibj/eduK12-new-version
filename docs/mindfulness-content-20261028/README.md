# 正念内容入库与验收记录｜2026-10-28

10 个正念工具家族已登记，形成 6 个精确版本：6 个家族具备完整原生 DRAFT；另外 4 个家族保留 catalog-only（登记缺口，题文/许可/版本问题解决前不得施测）。不得把目录登记当作工具入库完成。

每家族一个独立提交；语言、长短版和报告者版本不重复计为独立构念。全部为内容草稿：没有导入生产数据库、没有发布、没有开 PR、没有触发 CI；已在本分支内重生成 `scale:instruments:check` 所需的源级注册索引（`instruments.generated.ts`）并使该检查通过，仅此而已。

基线：main `6203a829dc8d7de707e67f413acfa5a354a21e09`（#364 合并后）。对照内容分支 `content/dot-local-scales-20261025`（`b92c69ae…`）与 PR 365 候选清单（90 个身份）：10 个精确 key 与三者均无重复；相邻构念关系见 [dedup.json](./dedup.json)。

| 顺序 | 工具与内容记录 | 评价层次 | 题文与计分验收 | 报告 | 原始全文 |
|---|---|---|---|---|---|
| 1 | [FFMQ-39](./ffmq39/) | 成人正念特质自评（观察/描述/觉知行动/不评判/不反应五侧面） | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://www.ruthbaer.com/academics/FFMQ.pdf)（Baer 学术页） |
| 2 | [KIMS-39](./kims39/) | 成人正念技能自评（四技能） | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://www.ruthbaer.com/academics/KIMS.pdf)（Baer 学术页） |
| 3 | [CAMM-10](./camm10/) | 儿童青少年正念自评 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://www.ruthbaer.com/academics/CAMM.pdf)（Baer 学术页） |
| 4 | [MAAS-15](./maas15/) | 成人正念特质自评（单维频次） | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://ppc.sas.upenn.edu/sites/default/files/mindfulnessscale.pdf)（UPenn PPC） |
| 5 | [CAMS-R](./cams_r12/) | 成人正念特质自评（单维总分） | 通过（锚点差异已记录）；原生DRAFT | 原生模板＋图文样稿 | [来源](https://ggsc.berkeley.edu/images/uploads/The_Cognitive_and_Affective_Mindfulness_Scale_%E2%80%93_Revised.pdf)（GGSC Berkeley） |
| 6 | [TMS-13](./tms13/) | 练习后即时状态正念（两维） | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://www.rotman-baycrest.on.ca/files/publicationmodule/@random45f5724eba2f8/pid3280.pdf)（Lau 2006 论文附录） |
| 7 | FMI（Walach 原版14题） | 成人正念特质自评 | 未通过：仅找到中文 FMI-12（周仁来/陈思佚），非原版；原版题本仍无可验证来源 | 未开始 | 待核 |
| 8 | MTS（教学正念） | 教师正念自评 | 未通过：原文付费墙，缺完整题文（锚点已核实：五级 1=Never true…5=Always true） | 未开始 | 待核 |
| 9 | MIPQ（正念教养） | 家长正念教养自评 | 未通过：四级/五级版本冲突未解决 | 未开始 | 待裁定 |
| 10 | MEQ（正念饮食） | 成人进食觉察自评 | 未通过：官方要求联系作者取得许可 | 未开始 | [Fred Hutch](https://www.fredhutch.org/)（需许可） |

## 版本与计分核验

6 个可执行版本的 39 组原生 golden cases 全部通过（ffmq39×5、kims39×10、camm10×6、maas15×6、cams_r12×6、tms13×6）；6 份源记录以可验证来源逐字录入，工作副本 SHA-256 均记录于各家族 source.md；6 个原生记录均通过本分支 `scale:instruments:check`（重生成 `instruments.generated.ts` 后）。未运行与本次内容无关的全仓构建或数据库测试。

- FFMQ-39：五侧面 8/8/8/8/7，官方计分表 19 道反向题（6−response）；PDF 计分表无总分行，故不设 total。
- KIMS-39：四技能 12/8/10/9，18 道反向题；Observe 分维在原论文部分样本内部一致性偏低的已知情况仅陈述、不作裁定。
- CAMM-10：全部 10 题按官方规则反向（4−response）后求和，总分 0–40；PDF 与作者页面均未印年龄下限，不据此设硬性门槛。
- MAAS-15：官方计分页只写"取 15 题均值"；逐题极性核对确认 15 题全部为不留心措辞、锚点 1=Almost Always → 6=Almost Never，直接取均值即方向正确，**无反向题**。导入过程中曾按"全卷 7−原始分 反向"实现过一版，经复核与官方句矛盾而否决，核查轨迹存档于 [maas15/source.md](./maas15/source.md)（含 Brown & Ryan 2003 两处 "reverse scored" 表述的归类：分别针对替代直接测量版与 State MAAS，不适用于本题本）。
- CAMS-R：GGSC 官方托管表逐字给出 12 题、反向键（2/6/7）与"反向后求和、高分=更多正念品质"；**托管表未印选项锚点**，本条目采用同行评审 OA 文献逐字佐证的 4 点锚点（1=rarely/not at all、2=sometimes、3=often、4=almost always），总分 12–48；差异如实记录于 [cams_r12/source.md](./cams_r12/source.md)，取得作者原件后复核。
- TMS-13：题干、指导语、五档锚点（0=Not at all…4=Very much）与官方计分键**全部取自论文 Appendix 正式 administered 版**（非二次转述）：全部题目正向、无反向；Curiosity（3,5,6,10,12,13）求和 0–24、Decentering（1,2,4,7,8,9,11）求和 0–28，**两维不合成总分**；状态量表边界（不与特质正念混合）记录于 [tms13/source.md](./tms13/source.md)。

缺答不补 0。各工具统一采用 complete_required（任一题缺答该分记 null），已在各记录中明确为产品保守约定；不声称这是原作者缺答规则。未发明常模、百分位、临床界值或能力等级。

## 报告验收

6 份 HTML 样稿均有分数/水平条形图（标注真实 min–max 或轴范围）、非学术反馈、反思问题及可尝试行动；数值为明确标注的模拟数据。6 个原生定义同时提供实际结果解释与建议，沿用系统现有报告架构（ReportRangeTrack 用真实分数绘图），未引入新的报告渲染框架或外部图片依赖。TMS-13 样稿与记录明确"状态≠特质、单次有起伏"的使用边界。4 项候选未出样稿，不声称其可生成被试报告。

与 SEL 批次一致，本次只完成静态内容、分数和配图结构核验，未通过实际浏览器视觉/交互验收；不得把本记录用作 UI 上线证据。

## 许可与来源

- FFMQ/KIMS/CAMM：研究者 Ruth Baer 学术页（ruthbaer.com/academics）公开托管的完整题本 PDF；该页面未附明确再分发许可声明，本批次按"来源公开托管 + 再分发审查待定"记录（license:author_hosted_pdf / license:redistribution_review_pending），翻译与再分发前需另行确认权利范围。
- MAAS：UPenn PPC 资源页公开托管官方 PDF，页面未附明确许可声明（license:source_hosted_pdf）；作者原维护的 mindfulexperience.org 学术页面已不可访问，现状记录于 maas15/source.md。
- CAMS-R：GGSC（UC Berkeley Greater Good Science Center）量表页公开托管官方表，未附许可声明；选项锚点为 OA 文献佐证（差异已记录）。
- TMS-13：期刊论文为 Wiley 付费墙内容，本批次使用 Rotman-Baycrest 机构仓库公开托管的论文全文副本（license:institutional_repository_copy，再分发审查待定）。
- MEQ：官方 PDF 明确要求联系作者取得使用许可，取得前不复制题文。
- 明确受限的整套题文一律未复制到公开仓库；新增 `domain:mindfulness` 等 Domain、Construct、Orientation、Population、Response、Use、License、Language Validation 命名空间标签，与 content 分支 ffmq15/chime_s24/maia2_37 记录的词汇保持一致。中文工作译文（如有）不标为已验证中文。

## 与既有候选的关系

- `ffmq15_zh_cn_research`（content 分支）：与 ffmq39 同家族长短版，不重复开发；两版分数与证据不互换。
- `chime_s24_zh_cn_research`、`maia2_37_zh_cn_research`（content 分支）：正念体验/内感受觉察方向候选，本批次未重复登记；后续如需完善，从既有候选继续，不另起炉灶。
- `mwq5`（走神问卷）、`mpmi_s22`（前瞻记忆）名称相近但非正念工具，已在 dedup.json 中注明，防止后续误判重复。

## 建议正式入库批次

1. FFMQ-39、MAAS-15：先覆盖成人特质正念最常用两类工具。
2. CAMM-10：补充儿童青少年人群（学校心理教育场景）。
3. KIMS-39、CAMS-R：单维/多侧面特质补充，与 FFMQ 形成谱系。
4. TMS-13：状态正念单独一类，仅在"练习后即时施测"场景接入。
5. FMI/CAMS-R 锚点原件/MTS/MIPQ：按上表缺口逐项补齐题文/许可/版本裁定后，再做同样的题文计分与报告两项验收。

继续为 4 项候选补入可交付的完整题本并解决许可与版本冲突，再逐项完成验收；保持独立提交与原版/译稿/来源/计分/反馈版本分离。本分支不自动发布或启动 CI。
