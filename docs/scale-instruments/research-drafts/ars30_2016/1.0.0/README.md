# ARS-30：2016论文派生中文研究文档1.0.0

> **状态更新（2026-10-27，PR356 合并后重核）**
> 原先的接入阻塞已解除。量表内容分支已 merge 到 main（merge commit `601a43a86d02891bf050bedd721e54748a9f0e40`，双亲 `0f723dae` + `83955b89`），
> PR356「STANDARD 双入口接入、审核与冻结版本治理」带来的指导语契约现已生效。经代码核实：`schema.ts` 顶层 `instruction`
> 为 `.optional()` 且内部 `.strict()`（schemaVersion/text/language/version/source），`materialize.ts` 将 `source.instruction?.text`
> 写入 Scale 行并在呈现修订时保留计分定义，而 `scale-definition.ts` 完全不含 instruction——即指导语不参与 measurement hash。
> 必需本人情境因此可随内容版本冻结并在 Survey 公共作答端展示。
> 据此本工具已注册为可执行来源版本 **`ars30_2016_zh_cn_research@1.0.0`**（第61个新增来源版本，第57个工具身份）。
>
> 下方原始 DOCUMENTATION_ONLY 段落作为历史记录完整保留，不改写为未曾发生。

**DOCUMENTATION_ONLY / 接入阻塞：必需本人情境尚未随内容版本冻结并展示。**（2026-10-26 原始结论，绑定内容分支基线 `0f723dae`，代码读取绑定 `ebbf389bb9812189f06987038b6a0859c8cea72b`；该结论成立于当时尚未合并 PR356 的分支，现已由上段重核取代。）本目录当时不是后台source，不注册、不导入数据库、不增加可执行版本计数。

原作者Simon Cassidy；精确载体为2016原论文Methods本人逆境情境与Table2的30题。中文身份为`ars30_2016_zh_cn_research@1.0.0`，与英文原作关联，但独立版本管理。

| 版本层 | 文档计划版本 | 实际运行身份 |
| --- | --- | --- |
| 题文／计分／本地化 | instrument1.0.0 / scoring1.0.0 / localization1.0.0 | 已创建：`ars30_2016_zh_cn_research/1.0.0/source.json`，30题、20题6−x、三维14/9/7与总分30–150 |
| 参数 | parameterPlan1.0.0，score_only，无阈值 | ReferenceSet未创建；`referencePolicy.type = none`，无经验切点 |
| 报告 | report1.0.0 | reportVersion1.0.0 已随定义注册，score_only，无bands、无标签；样例经真实 `buildScaleResult` 生成 |
| 目录标签 | catalogDocument1.0.0，八轴 | 53个标签已写入 source 的 constructOverlapTags；实际检索索引 NOTRUN |

[双语全文与逐题规则](bilingual-content.json) · [必需情境](administration.md) · [评分和参数](scoring-and-parameters.md) · [报告文字](report-draft.md) · [报告结构](report-plan.json) · [八轴标签](tags.json) · [来源与许可](source-manifest.json) · [归属说明](THIRD_PARTY_LICENSE.md) · [现有运行支持核查](runtime-support-review.md) · [验证状态](validation.md)。

原英国大学生n532，主本人情境321，比较他人情境211；不合并成532份同一版本的主验证样本。不推定中国或K12效度、临床阈值、学习能力或成绩预测。原作者未规定的缺答处理明确作为平台提案，不暗称作者规则。

本版本仍维持 DRAFT/CANDIDATE、`catalogStatus=CANDIDATE`、`scientificMaturity=PILOT`，未发布、未激活；preview 明确返回 `EXECUTABLE_NOT_PUBLISHED` 与两个本地化待审 blocker，因此 open CC BY 4.0 许可标签不构成可否决 DRAFT 门禁的授权。未新增任何数据库行，正式激活0、双入口实际使用 NOTRUN。累计新增来源版本由60增至**61**，工具身份由56增至**57**。
