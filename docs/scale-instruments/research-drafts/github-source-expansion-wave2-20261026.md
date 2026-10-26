# GitHub 量表扩充 Wave 2｜EBQ-16 源码落地与候选差异审查

**审查日期：** 2026-10-26（亚洲东京）。**内容线：** `caohuibj/eduK12-new-version` / `content/dot-local-scales-20261025`。

本文是**来源、计分、授权与草稿技术状态的研究审计**，不属于已经执行的 CI/数据库/浏览器验收。冻结范围仅包含 GitHub 量表候选 source/registry、定向测试与公开研究文档，不变更评分引擎、权限或 PR #356；不触碰生产、不触发 CI、不创建/合并 PR。完整必需门禁遵循实际 `AGENTS.md` 与 `docs/release/README.md` 的受影响最小验证规则。

## A. 本批真正新增的源码版本包

**EBQ-16：情绪信念问卷，简体中文独立工作译稿**

- 源码：`server-version/backend/src/modules/scale/instruments/ebq16_zh_cn_research/1.0.0/source.json`；导入注册 `backend/src/modules/scale/onboarding/instruments.generated.ts`；定向测试 `backend/src/__tests__/scale/instruments/ebq16_zh_cn_research.test.ts`。
- 完整初始提交：`2e62b608f07ad3131922a23a8971d8c5bcc90654`。元数据修订提交：`0798707b57b276e86035216f7f9a64eb0628aed6`。当前 EBQ `instrumentVersion=1.0.0`、`scoringVersion=1.0.0`、`reportVersion=1.0.1`、`localizationVersion=1.0.0`、`catalogManifestVersion=1`；保持 DRAFT/HIDDEN。
- **原版证据：** Becerra、Preece、Gross（2020）完整英文16题见 [PLOS ONE 原文 Table 3](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0231395)，原文 CC BY 4.0；作者发布的 [Stanford 两页题本与计分说明](https://spldev.sites.stanford.edu/sites/g/files/sbiybj19321/files/media/file/ebq_questionnaire_and_scoring_instructions_042020.pdf) 提供固定题序、1/4/7选项锚点与七项 SUM 计分键。独立PDF用于核对，不能据此无条件扩大非原作者材料的许可。
- **七项准确分数：** 四个4题分维分别是1/5/9/13、2/6/10/14、3/7/11/15、4/8/12/16，理论4–28；两个8题综合维度分别为“两个可控性”和“两个有用性”原题相加，理论8–56；全部16题总分16–112。**均为原始项求和，无反向，不采用 OpenScales EBQ.osd 的 mean_coded**。分数不能当七个独立构念重复加权。
- **来源身份：** 当前正式英语源验证来自161名澳大利亚成年人，18–83岁；平台中文题干、中文锚点、反馈均为工作翻译/原创说明，没有专家译审、认知访谈、中国成人或K12效度证据。无常模、临床切点、百分位、分档或激活ReferenceSet。
- **证据层级：** 完整源/生成注册/定向Vitest测试及报告消费者正文已经提交，独立手算黄金向量6组（最低/最高/中点/混合/单题缺失/全部缺失），源报告包含七项解释及生活化建议。真实 TypeScript、Vitest、`scoreScale`/`buildScaleResult` 执行、非owner数据库物化/轴快照、API/UI、双入口、正式科学审核均 **NOTRUN**。没有使用旧量表结果冒充本包PASS。
- **语言层待审：** 原作者中点锚是 *Neither agree nor disagree*。当前DRAFT中文采用“既不同意也不赞同”，语义不够准确，应在正式施测前由人工译审更正成明确中立、无偏向的表达（如“既不赞同也不反对”），同时按 instrument/response-set/localization 版本规则保留原冻结身份；不擅自把尚未审核的新译法写成原作者正式中文标签。**当前未获最终译审放行**。

## B. GitHub 后续候选发现与精确阻碍

| 工具及发现入口 | 原始来源和复核结果 | 当前处理 |
|---|---|---|
| **MPMI-s（前瞻记忆与内外部策略）** [OpenScales MISS10999](https://github.com/stmueller/OpenScales/blob/main/scales/miss/MISS10999/MISS10999.osd) | [Rummel、Danner、Kuhlmann 2019](https://doi.org/10.1186/s42409-019-0008-6) / [MISS作者页](https://miss.psychopen.eu/index.php/miss/article/view/10999) CC BY4，基于德国代表性成年人两波样本（N4069/N3857，19–71岁）。GitHub OSD为22个题项：PMA8、内部策略7、外部策略7；但原文引言也写22项，而Methods写三个分维各8项，合计24，需精确查看作者附录的德英双语逐项清单/图并确认最终21/22/24等语境。记忆能力维包含4反向。论文分析时未反向以控制措辞效应，而个人参考分数应反向，不能混为同一评分版。原德国年龄/性别参考数据不得直接作为中国常模。 | **BLOCKED—SOURCE VERSION**：原附录PDF本轮链接缓存失败。未固定完整词句、次序、计分版本，不注册；仅研究线索 |
| **CSBS-4（受挑战的归属感）** [OpenScales MISS11035](https://github.com/stmueller/OpenScales/tree/main/scales/miss/MISS11035) | [Fuchs等2021原文](https://doi.org/10.1186/s42409-021-00021-y) 4题，原样本是德国难民/庇护申请者的跨语言验证，原作者明确从已有的 Social Connectedness Scale 与 Sense of Belonging Instrument 寻找/修改条目；不能将新文章CC BY泛化为第三方题文无条件再分发。反向五级答项的“高分方向”也需要独立原版核对。 | **HOLD—DERIVATIVE RIGHTS + POPULATION**：未证明全部第三方题文/翻译链权利，不复制原文、不设中国/K12适用 |
| **ERSS-19（2019情绪调节策略）** [OpenScales ERSS](https://github.com/stmueller/OpenScales/blob/main/scales/openscales/ERSS/ERSS.osd) | [Torrence、Connelly 2019](https://doi.org/10.3389/fpsyg.2019.01486) 19题4维（3/4/7/5），其中注意策略2题反向。原始论文明确引用/改编了Gross & John等原ERQ思想与条目；该第三方原题版权链不能仅凭2019文章CC BY自动补齐。不要与另一个2024年同名ERSS混同。 | **HOLD—THIRD-PARTY RIGHTS**：授权未核完，未导入 |
| **MAIA-2英文37题** [UCSF官方入口](https://osher.ucsf.edu/research/maia) | [官方PDF](https://osher.ucsf.edu/sites/osher.ucsf.edu/files/inline-files/MAIA2%202018.05.27.pdf) 37题8维0–5，9反向；官方论文/题本第9题存在版本文字差异；官网“public domain”说明与题本使用/标注/提交译本要求应以具体版本一并记录。中文验证子版本不同于英文37题。 | **RESEARCH PENDING**：未凭GitHub仓库自行生成验证中文版、总分、常模或临床等级 |
| **BAT英文核心23题** [作者网站](https://burnoutassessmenttool.be/start_eng/) | 核心23题四域8/5/5/5，整体总分需23题均分而非四维均分；官网已有中文和学生版，使用条件不准擅改。版权不同载体不自动互通。 | **RESEARCH PENDING**：等待官方准确版本/许可核对，未重复注册 |
| **BRCS-4/FFMQ-15/AAQ-US/BPS等** [OpenScales](https://github.com/stmueller/OpenScales) | BRCS仅仓库声称Public Domain未独立证实；FFMQ短版沿用基础量表题文需完整权利核验；AAQ-US OSD引错开发论文；BPS“17个对象”含非题目类型，WIBPS需要独立共同stem。 | **RESEARCH / RIGHTS HOLD**，不强行凑包 |

## C. 当前计数与最小验证

- 冻结历史：20261025固定清单 **37个**原来源包；此前20261026交接三包RES-9、ACT-SQ6、CCFQ18增加为 **40个 DRAFT**；随后 CFS-R12 增为 **41个**；本轮 EBQ16 增为 **42个源码版本包**。另有 **3个仅资料HOLD**（PHQ9、PCL5、PC-PTSD-5），没有额外“第四类”。来源版本包计数不是42份独立构念，也不是42个已入库/已激活工具。
- 20261025历史快照不可覆盖，未正式发布的20261026清单不能被本次自动升级为43/44；新候选以后需独立新快照、保留旧映射和历史时间。
- **唯一开发测试位置**应为有精确本分支源码/依赖的隔离内容工作区：EBQ16源合同、golden计分、原始报告构建与按当前真实schema的非owner PostgreSQL DRAFT/HIDDEN幂等/失败回滚。验证后的成功证据若输入一致且正式可核验，其他环境不重复；真实 Survey/Training 交互、译审、科学效度是不同证据，必须分别注明 PASS/FAIL/BLOCKED/NOTRUN。**当前仅来源证据和纯算术静态复核PASS**。
- 前端全文或索引“标签可搜索”是独立功能能力缺口，属于PR356/后续功能线；不能因source有标签就称筛选已经通过。本批不修改任何共享过滤器、schema、生产配置或既有授权门禁。
- 下一步顺序：**先在可执行环境真实验证EBQ**，并解决中文中性选项表达；MPMI-s先看原附录固定正式题数/版本与reverse判定，CSBS/ERSS须核第三方权利；只有精确完成原文与许可归类者才继续新增可执行包。没有现实阈值就只做score_only与生活化报告。
