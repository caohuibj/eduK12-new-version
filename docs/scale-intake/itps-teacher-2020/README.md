# ITPS 教师通用版（A04，Schwab & Alnahdi 2020）

本次取得并逐项读取原论文 Appendix A 的14题教师通用英文题文及四级选项，完成3份私有非商业研究原生 Scale 草稿（14/7/7题）的定向计分、报告和隔离 PostgreSQL 导入读回。公开仓库只登记3份 `CATALOG_ONLY / CANDIDATE / PILOT` 元数据候选及项目原创反馈、来源和收据，**不含 NC 题文，不能直接施测**。共享开发库与生产库均未写入；不是“生产已入库”。

## 原始来源和版本边界

- Schwab, S., & Alnahdi, G. H. (2020). *Do they practise what they preach? Factors associated with teachers’ use of inclusive teaching practices among in-service teachers*. JRSEN, 20(4), 321–330. [原论文、方法、结果和 Appendix A](https://nasenjournals.onlinelibrary.wiley.com/doi/full/10.1111/1471-3802.12492)。首发2020-09-13，实际数据2019年采集。
- [维也纳大学机构记录](https://ucrisportal.univie.ac.at/en/publications/do-they-practise-what-they-preach-factors-associated-with-teacher/)明确标记 **CC BY-NC 4.0**，©2020 The Authors。公开可读不等于商业平台可再分发。没有接受 Wiley 分享条款，没有处理机构库验证码，没有绕付费墙。私有非商业研究处理不是平台授权证明；不建立 InstrumentAuthorization 或其他许可事实。
- [Schwab, Sharma & Hoffmann (2019 online / 2022 issue), DOI 10.1080/13603116.2019.1629121](https://doi.org/10.1080/13603116.2019.1629121)，原作者公开全文的 Table 3 明确列个人化1/2/3/4/9/10/14、差异化5/6/7/8/11/12/13。通过[作者公开全文](https://www.researchgate.net/publication/333843646_How_inclusive_are_the_teaching_practices_of_my_German_Maths_and_English_teachers_-_psychometric_properties_of_a_newly_developed_scale_to_assess_personalisation_and_differentiation_in_teaching_practice)读取。该文是学生版为主、另有教师改人称版本说明，许可 BY-NC-ND；这里只取事实性题号归属和版本关系，不从该文改写或再分发题文。其教师选项英文与2020不同，未混用。
- [Lindner, Alnahdi, Wahl & Schwab (2019), Frontiers 4:58](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2019.00058/full)，CC BY，支持教师通用14题、两维各7题的前期研究关系。该文未取得完整逐字教师题本，不能给2020附录换贴CC BY许可。
- 本候选题文只来自2020 Appendix A。2020论文实际施测**德文教师版**，其221名奥地利在职教师样本不是英文版或中文版验证。此处英文是公开附录文本；没有从学生版改人称造教师版，没有造中文版。
- 2020确认两因子模型，并报告整体/差异化/个人化内部一致性；没有重新列教师版逐题计分键。两维归属是前期原作者题号表与2020附录14项逐号对齐的继承键，仍待作者确认；不宣称论文明确再次刊载该键。原题9的 `me` 照录，疑似措辞问题不静默修正。

## 子项、计分与组合

详见 [inventory.json](inventory.json)。三项内容、计分、报告、本地化轴均为 `1.0.0`。完整14题是同母原组卷参照，不是额外14个新题；两个7题提取与完整量表重叠，不可重复求和。

| 原生候选 | 原题号 | 分数范围/方向 | 公开状态 |
|---|---|---|---|
| `itps_teacher_general_en_2020` | 1–14原序 | 两维各1–4均分，以及原文有依据的14题整体均分 | 仅目录，不可施测 |
| `itps_teacher_personalisation_en_2020` | 1,2,3,4,9,10,14 | 1–4均分，越大表示更认同相关实践描述 | 仅目录，不可施测 |
| `itps_teacher_differentiation_en_2020` | 5,6,7,8,11,12,13 | 1–4均分，同上 | 仅目录，不可施测 |

四级响应为符合程度，不改名为频率或能力：Appendix A第一档写作 `Not true at all`，方法段写 `not at all true`；数字化保留附录版本。编码1/2/3/4，等权均分，没有作者规定的反向条目。2020结果表报告1–4整体均值，因此保留母工具内部整体均值；这不支持与其他工具拼总分。

原文未给漏答计分规则。本项目采用透明保守规则：某分数所需条目全答才计算，漏答不填0、不用样本均数补齐。完整14题若有漏答，受影响维度及整体不出分；另一完整维度可保留其有限解释。全部未答时不生成数值解释。没有常模或界值，`referencePolicy:none`；没有按研究样本均值制造“正常/优秀/低质”阈值。

拆分是原生内容提取，不自动继承独立7题施测效度。保真施测优先在普通 GENERAL 问卷中放完整14题 Scale，保持1–14原序；如普通组合分别放两个7题 Scale，必须标为探索性反思，因为分组改变题序。普通组合只列候选，本轮未在共享开发库创建。没有加入其他来源工具或跨工具总分。

附录没有独立事实/描述表单，本轮不杜撰背景题凑 Form；无常模也不把有原计分的量表降为无分表单。

## 标签和教师反馈

沿用现有 `tags` 字段、`parseCatalogFilters` 和原生轴快照，不建引擎/表/门禁。统一 `family:itps`，另有 `role:teacher_self`、`stage:k12`、`lang:en`、`version:2020`、用途/许可/PILOT标签。8项均符合现有最多10项、单项20字符；隔离库已实际保存并读回。共享tag只用于筛选并列分析，不表示不同语言/角色/年代测量等值。

原生报告为**英文教师自评反馈**，接收者为教师本人，需现有 run/result 授权；其他教师、管理者、研究者不因这份内容自动获得个体结果。原生 disclosure 拒绝上述其他角色的自动披露；已有匿名、发布、最小人数与授权规则不变。本版无学生填答、无学生接收者，不伪造配套学生报告。

[report-copy.json](report-copy.json)提供项目原创中文草稿及完整/困难/信息不足三例，明确不是已验证中文量表或常模分类。原生英文文本保存在私有研发定义中，语言与英文内容轴一致。得分反映自述符合程度，不说成实际教学质量、能力感、诊断或教师排名。微行动只建议选择一个课堂例子、观察参与机会、尝试一种表达/反馈方式并向可信同事寻求资源。

原题8包含学习风格措辞，照录仅为源版本保真。报告不鼓励固定“风格”分型或按风格匹配教学；改动题文必须另版本并重新说明证据，不能假承原验证。原题9若经作者澄清修正也须新内容版本。

## 已验证和限制

- [dedup.json](dedup.json)：基线main的235份source.json、258份instrument.ts；45个开放PR的6,336条路径、619份工具源内容；同源标识、作者、两个辨识度较高题项均无命中，读取无错。基线后main已对齐52b8a574，直接来源/消费者/schema/依赖未变，复用原检查；新增/变化的13个PR head也已增量核对，详见同文件。生产/管理员自建库**未查**，不能宣称全系统无重复。
- [native-contract-validation.json](native-contract-validation.json)：3份私有原生定义和3份公开目录候选结构验证；原生最小/最大/混合计分及报告、标签/题序、28项逐题漏答及全空情况。私有题文和答案只用合成数据，不进入公开收据。
- [isolated-import-validation.json](isolated-import-validation.json)：现有 `materializeScaleInstrumentContent`、registry readiness/compile和轴冻结；PostgreSQL16.15一次3个隐藏草稿导入，标签、原题号、定义hash、C/P/R和存库定义生成的教师反馈读回。`prisma db push`当前schema加原有轴快照SQL，不声称完整迁移链验证。授权/部署/真实答卷均0。
- [validation-history.json](validation-history.json)保留两次研发脚本失败和修正：报告locale契约，以及收据末尾误用不存在的响应模型。恢复前回查已导入3行，没有重复建量表或将失败改称通过。
- 本地Node24.19.0低于仓库要求24.21.0；结果仅为定向研发证据，不替代正式轻CI。未跑全量前后端/部署/生产写库，也未伪造人类独立评审。独立协调审核及真实CI状态以PR为准。Draft当前带skip-ci以等待精确候选独立复核，正式CI为NOT_RUN；这是[AGENTS.md](../../../AGENTS.md)要求的“先准备可审阅的精确 base/head/tree、完整差异…再按既有独立复核及实际授权决定激活”的执行状态，不把跳过算通过。[ci-review-plan.json](ci-review-plan.json)列出定向路线与未执行项。

## 管理员下一步

先按本批来源/作者/题项/语言/角色再次核生产与管理员自建库，同源直接引用。再明确非商业施测适用范围或取得商业/公开电子化许可，核作者题号键及第9题；保留署名、NC许可、数字化变化说明和第三方权利。之后才能在既有导入与授权流程内将合法完整内容提交审核/启用。私有原生payload有hash和本机交接位置，**未推GitHub**；不能把公开目录当作可施测工具。没有生产部署操作。
