# SEL 内容入库与验收记录｜2026-10-27

17 个工具家族已登记，形成 21 个精确版本：14 个家族、17 个版本具备完整原生 DRAFT；另外 3 个家族（SECDS-28、AIR、CASEL 量规）保留 catalog-only，其完整题文或行为锚点尚未写入可执行源码，不能施测。不得把目录登记当作工具入库完成。2026-10-28 第二轮按库负责人指示补入 ERICA-16、ERQ-CA、CCNES-T 与 BESSI-45 英文自评版，过程见下方「2026-10-28 补充导入」。

由 3 个 gpt-6.1-terra / xhigh 子任务逐份处理，主 agent 负责题文与计分、报告完整性两项验收。每工具家族一个独立提交；语言、长短版和报告者版本不重复计为独立构念。全部为内容草稿，没有导入生产数据库、发布、PR、CI、合并或部署。

基线：main `7e6d7da4a01e4a42b410cf2dbdcfa76f11759fdc`；对照内容分支 `content/dot-local-scales-20261025`：`b92c69aefa2472775fa7ee86b9c208366886c908`。精确key与两分支均无重复；相邻构念关系见下方。

| 顺序 | 工具与内容记录 | 评价层次 | 题文与计分验收 | 报告 | 原始全文 |
|---|---|---|---|---|---|
| 1 | [WCSD-SECA 40/17](./wcsd_seca/) | 学生能力/相关策略自评 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://pmc.ncbi.nlm.nih.gov/articles/PMC11117818/) |
| 2 | [DSECS-R2](./dsecs_r2/) | 学生能力/相关策略自评 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://cdn.secondstep.org/static/pdf/dsecs-s-technical-guide.pdf) |
| 3 | [SECQ-25](./secq25/) | 学生能力/相关策略自评 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://www.um.edu.mt/library/oar/bitstream/123456789/6140/1/ENSECV4I2P2.pdf) |
| 4 | [BESSI-45](./bessi45/) | 学生能力/相关策略自评 | 通过（英文版）；原生DRAFT | 原生模板＋图文样稿 | [来源](https://www.sebskills.com/uploads/1/3/1/0/131015187/bessi-45_form_self.pdf) |
| 5 | [ERQ-CA](./erq_ca/) | 学生能力/相关策略自评 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://eleonoragullone.wordpress.com/wp-content/uploads/2018/09/erq-ca.pdf) |
| 6 | [EAQ30](./eaq30/) | 学生能力/相关策略自评 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://www.wcasa.org/wp-content/uploads/2020/05/Evaluation_6.-EAQ_English.pdf) |
| 7 | [ERC-24 家长/教师](./erc24/) | 家长/教师对孩子的观察 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://novopsych.com/wp-content/uploads/2024/06/ERC-emotion-regulation-checklist.pdf) |
| 8 | [ERICA-16](./erica16/) | 学生能力/相关策略自评 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://eleonoragullone.wordpress.com/wp-content/uploads/2018/09/erica_items_scoring.pdf) |
| 9 | [Fast Track SCS 教师/家长](./fasttrack_scs/) | 教师/家长对孩子行为的观察 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://fasttrackproject.org/wp-content/uploads/sites/2/2021/08/sct.pdf) |
| 10 | [BES-20](./bes20/) | 学生能力/相关策略自评 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://publications.iadb.org/publications/english/document/Skills-for-life-A-review-of-life-skills-and-their-measurability-malleability-and-meaningfulness.pdf) |
| 11 | [SECTRS-14](./sectrs14/) | 教师个人能力自评 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://files.eric.ed.gov/fulltext/EJ1422263.pdf) |
| 12 | [CCNES-T](./ccnes_t/) | 教师对假设情境的回应倾向 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://ccnes.org/ccnes-teacher-responses) |
| 13 | [SECDS-28](./secds28/) | 学生能力/相关策略自评 | 未通过：完整题文未纳入 | 仅图文样稿；未动态接入 | [来源](https://doi.org/10.1108/CE-12-2011-0003) |
| 14 | [AIR 教师自我反思](./air_educator/) | 教师个人能力与教学反思（分开） | 未通过：完整题文未纳入 | 仅图文样稿；未动态接入 | [来源](https://www.air.org/sites/default/files/2022-12/GTL-Educator-Self-Assessment-Refreshed-2014-508.pdf) |
| 15 | [Delaware Techniques](./delaware_techniques/) | 学生感知的教学/纪律做法 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://cdn.secondstep.org/static/pdf/dsecs-s-technical-guide.pdf) |
| 16 | [Delaware School Climate](./delaware_climate/) | 学生感知的学校环境 | 通过；原生DRAFT | 原生模板＋图文样稿 | [来源](https://cdn.secondstep.org/static/pdf/dsecs-s-technical-guide.pdf) |
| 17 | [CASEL Schoolwide Rubric](./casel_rubric/) | 学校 SEL 实施评价 | 未通过：完整题文未纳入 | 仅图文样稿；未动态接入 | [来源](https://files.casel.org/sites/2/2019/06/Blank-Rubric-Template-3.30.20.pdf) |

## 版本与计分核验

17 个可执行版本的 70 组原生 golden cases 全部通过，21 个源记录通过 SourceV1 schema 和来源级校验。注册索引保留 main 的 57 个源，新增 20 个精确版本，合计77；未运行与本次内容无关的全仓构建或数据库测试。

- WCSD：40题八维；17题主要给总体反馈，八个话题不冒充稳定分量表。两种版本独立报告。
- DSECS：20题五维和总体均值；题号以学生实表为准，保留手册冲突说明。
- SECQ：1–6，保留SA5在自我觉察；不猜测中间选项文字。
- EAQ：1–3、20项反向、六维；身体线索方向与其他维度不同，不做个人高低解释。
- Fast Track：教师25题与家长12题独立；教师总平均包含学习活动，不宣称纯SEC总分。
- ERC：两维求和，方向不同；题12不进两维；家长与教师结果不混合。
- BES：两维求和及总和，示例44/27/71；修复公开附录把认知第6题写成第5题的错误。
- SECTRS：四维、1–6；题7/14按作者归属，选项6按正文更正附录误印；不做教师排名。
- Delaware Climate：保留欺凌分维原方向；30题总和只在总分反向9/14/26。工具专属scorer和原生定义同一提交。31题不计内容分，未声称实现完整调查的有效性筛查。
- Delaware Techniques：正向、惩罚、SEL三维分开，不合成个体SEC。

缺答不补0。若采用比原作者更严格的 complete_required，已在各工具记录中明确为产品保守约定；不声称这是原作者缺答规则。未发明常模、百分位、临床界值或能力等级。

## 报告验收

20 份 HTML 样稿均有原始分图或水平分布图、非学术反馈、反思问题及可尝试行动。数值为明确标注的模拟数据。17个原生定义同时提供实际结果解释与建议，系统现有 ReportRangeTrack 用真实分数绘图；未引入新的报告渲染框架或外部图片依赖。3项候选目前只有样稿，不能据此声称已能生成实际被试报告。

浏览器安全策略阻止本地file预览，独立浏览器进程也未能启动。因此本次只完成静态内容、分数和配图结构核验，未通过实际浏览器视觉/交互验收；不得把本记录用作UI上线证据。

## 全文固定与独立版本

### WCSD-SECA 40/17

[完整来源](https://pmc.ncbi.nlm.nih.gov/articles/PMC11117818/)：Table 2 全40题；17题按官方FAQ标记核对。

- [原生记录 `wcsd_seca_17_zh_cn@1.0.0`](../../server-version/backend/src/modules/scale/instruments/wcsd_seca_17_zh_cn/1.0.0/instrument.ts)；DRAFT；zh-CN。
- [原生记录 `wcsd_seca_40_zh_cn@1.0.0`](../../server-version/backend/src/modules/scale/instruments/wcsd_seca_40_zh_cn/1.0.0/instrument.ts)；DRAFT；zh-CN。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/57b1260ae23aad12f062ec7762b2b30b6a62df07)。
- [图文样稿：report.html](./wcsd_seca/report.html)。
- [图文样稿：report_17.html](./wcsd_seca/report_17.html)。

### DSECS-R2

[完整来源](https://cdn.secondstep.org/static/pdf/dsecs-s-technical-guide.pdf)：2021手册附录A及B/C，20题；以实际学生题本题序为准。

- [原生记录 `delaware_dsecs_r2_student_en@1.0.0`](../../server-version/backend/src/modules/scale/instruments/delaware_dsecs_r2_student_en/1.0.0/instrument.ts)；DRAFT；en。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/69e0e8652f0188a689fabf658e73d91ebdb6ebce)。
- [图文样稿：report_sample.html](./dsecs_r2/report_sample.html)。

### SECQ-25

[完整来源](https://www.um.edu.mt/library/oar/bitstream/123456789/6140/1/ENSECV4I2P2.pdf)：PDF16页／期刊42页，25题。

- [原生记录 `secq25_zhou_ee@1.0.0`](../../server-version/backend/src/modules/scale/instruments/secq25_zhou_ee/1.0.0/instrument.ts)；DRAFT；en。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/918e7bab820672efacdaea51724534c67da834e1)。
- [图文样稿：report-sample.html](./secq25/report-sample.html)。

### BESSI-45

[完整来源](https://www.sebskills.com/uploads/1/3/1/0/131015187/bessi-45_form_self.pdf)：官方45题自评；观察者版同家族，不另算独立构念。

- [原生定义 `bessi_45_self_en@1.0.0`](../../server-version/backend/src/modules/scale/instruments/bessi_45_self_en/1.0.0/instrument.ts)；DRAFT；en。2026-10-28 交付：45 题英文原题逐字誊入，五域各 9 题均值，无反向题；4 组 golden cases。
- [原中文记录 `bessi_45_self_zh_cn@1.0.0`](../../server-version/backend/src/modules/scale/instruments/bessi_45_self_zh_cn/1.0.0/instrument.ts)；catalog-only（翻译需按官网说明联系作者，中文路径待授权）。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/5761d7537edff9474945950318beb68f799db2ed)。
- 2026-10-28 英文版[独立提交](https://github.com/caohuibj/eduK12-new-version/commit/809cdd81b7da62a5462ccba5a89555b35b587218)。
- [图文样稿：report.html](./bessi45/report.html)。
- 许可核验（2026-10-28）：官网声明 BESSI 供非商业用途（科学研究、项目评估、个人使用）自由使用、无需请求许可；商业使用需许可；题本页脚保留 ©2019 作者版权声明。英文版按非商业研究草稿登记，商业部署前须取得许可。

### ERQ-CA

[完整来源](https://eleonoragullone.wordpress.com/wp-content/uploads/2018/09/erq-ca.pdf)：作者10题版；作者站另有erq-ca-scoring.pdf。

- [原生定义 `erq_ca_5point@1.0.0`](../../server-version/backend/src/modules/scale/instruments/erq_ca_5point/1.0.0/instrument.ts)；DRAFT；en。2026-10-28 交付：10 题英文原题逐字誊入，认知重评 6 题、表达抑制 4 题各取均值，无反向题；4 组 golden cases。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/bd32a0955e2fd082053a6d377a917d9a61aada0e)。
- 2026-10-28 [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/25d2d97fc1e8dceda781ca50543a512d69d95beb)。
- [图文样稿：report_sample.html](./erq_ca/report_sample.html)。
- 当前缺口：中文译题未交付（中文施测前须翻译验证并立新版本）；动态接入与浏览器视觉验收未完成。作者公开提供不等于不限用途授权，许可状态仍记录为未确认。

### EAQ30

[完整来源](https://www.wcasa.org/wp-content/uploads/2020/05/Evaluation_6.-EAQ_English.pdf)：完整英文30题及同目录6SCORE语法，来源与冲突见工具记录。

- [原生记录 `eaq30_rieffe_zh_cn@1.0.0`](../../server-version/backend/src/modules/scale/instruments/eaq30_rieffe_zh_cn/1.0.0/instrument.ts)；DRAFT；zh-CN。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/f83bd076ea87c547bd424b5cc3855bf74e74a0d1)。
- [图文样稿：report-sample.html](./eaq30/report-sample.html)。

### ERC-24 家长/教师

[完整来源](https://novopsych.com/wp-content/uploads/2024/06/ERC-emotion-regulation-checklist.pdf)：24题；与大学附录交叉，未照搬提供方括号增补措辞。

- [原生记录 `erc24_parent_zh_cn@1.0.0`](../../server-version/backend/src/modules/scale/instruments/erc24_parent_zh_cn/1.0.0/instrument.ts)；DRAFT；zh-CN。
- [原生记录 `erc24_teacher_zh_cn@1.0.0`](../../server-version/backend/src/modules/scale/instruments/erc24_teacher_zh_cn/1.0.0/instrument.ts)；DRAFT；zh-CN。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/d96eaecf59a0be86ac12c32f219ba7acd8b1edb3)。
- [图文样稿：parent-report-sample.html](./erc24/parent-report-sample.html)。
- [图文样稿：teacher-report-sample.html](./erc24/teacher-report-sample.html)。

### ERICA-16

[完整来源](https://eleonoragullone.wordpress.com/wp-content/uploads/2018/09/erica_items_scoring.pdf)：作者16题及计分键。

- [原生定义 `erica16@1.0.0`](../../server-version/backend/src/modules/scale/instruments/erica16/1.0.0/instrument.ts)；DRAFT；en。2026-10-28 交付：16 题英文原题逐字誊入，官方三分量表各取均值（情绪控制、情绪自我觉察、情境回应），10 题反向；4 组 golden cases；不提供总分。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/43b9f60d7c9fd4f376da5e2856b4c7dadfee7400)。
- 2026-10-28 [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/fd210823f018049fab3275fcba6049a45cc20b37)。
- [图文样稿：report_sample.html](./erica16/report_sample.html)。
- 当前缺口：中文译题未交付；动态接入与浏览器视觉验收未完成。作者公开提供不等于不限用途授权，许可状态仍记录为未确认。

### Fast Track SCS 教师/家长

[完整来源](https://fasttrackproject.org/wp-content/uploads/sites/2/2021/08/sct.pdf)：教师25题；[家长12题](https://fasttrackproject.org/wp-content/uploads/sites/2/2021/08/socialcompetenceparent.pdf)；可读大学题本与官方SAS交叉。

- [原生记录 `fasttrack_scs_parent_zh_cn@1.0.0`](../../server-version/backend/src/modules/scale/instruments/fasttrack_scs_parent_zh_cn/1.0.0/instrument.ts)；DRAFT；zh-CN。
- [原生记录 `fasttrack_scs_teacher_zh_cn@1.0.0`](../../server-version/backend/src/modules/scale/instruments/fasttrack_scs_teacher_zh_cn/1.0.0/instrument.ts)；DRAFT；zh-CN。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/c9cbb8c78cc28a78b276993c1a7f5ffdf0d7fb01)。
- [图文样稿：parent-report-sample.html](./fasttrack_scs/parent-report-sample.html)。
- [图文样稿：teacher-report-sample.html](./fasttrack_scs/teacher-report-sample.html)。

### BES-20

[完整来源](https://publications.iadb.org/publications/english/document/Skills-for-life-A-review-of-life-skills-and-their-measurability-malleability-and-meaningfulness.pdf)：IDB 2022报告印刷29页，完整20题；认知题键笔误另行更正。

- [原生记录 `bes20@1.0.0`](../../server-version/backend/src/modules/scale/instruments/bes20/1.0.0/instrument.ts)；DRAFT；en。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/565079c7ec43a2090552218f588853941b1fe08d)。
- [图文样稿：report_sample.html](./bes20/report_sample.html)。

### SECTRS-14

[完整来源](https://files.eric.ed.gov/fulltext/EJ1422263.pdf)：期刊87页Appendix 1，14题；维度归属由同作者资料交叉。

- [原生记录 `sectrs14_teacher_en@1.0.0`](../../server-version/backend/src/modules/scale/instruments/sectrs14_teacher_en/1.0.0/instrument.ts)；DRAFT；en。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/384ffd2adf78632b2dbc81fc2e0114ba65a15f43)。
- [图文样稿：report_sample.html](./sectrs14/report_sample.html)。

### CCNES-T

[完整来源](https://ccnes.org/ccnes-teacher-responses)：作者页可下载12场景、72回应及评分表。

- [原生定义 `ccnes_t@1.0.0`](../../server-version/backend/src/modules/scale/instruments/ccnes_t/1.0.0/instrument.ts)；DRAFT；en。2026-10-28 交付：12 情境 × 6 回应共 72 条英文原文逐字誊入（每条回应重复完整情境题干），六维各取均值，仅苦恼维 2A、7C、8C、10A 反向；4 组 golden cases。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/db9ca75cfda8cbb2399f3d7bc278c3d5e6ac36bf)。
- 2026-10-28 [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/0f29d6cc03173bfec3fd689b7d55b6e7688507e5)。
- [图文样稿：report_sample.html](./ccnes_t/report_sample.html)。
- 当前缺口：中文译稿未交付；动态接入与浏览器视觉验收未完成。作者下载页限定教育及／或研究用途并要求指定引用格式，已保留于 usageRequirements；不将教育/研究用途等同于商业、翻译或再分发授权。

### SECDS-28

[完整来源](https://doi.org/10.1108/CE-12-2011-0003)：原作者论文完整28题附录；不替换成25题西语修订版。

- [原生记录 `secds_28_self@1.0.0`](../../server-version/backend/src/modules/scale/instruments/secds_28_self/1.0.0/instrument.ts)；catalog-only。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/90d4093b3e07ed2763c03a44a59c62d068490df9)。
- [图文样稿：report.html](./secds28/report.html)。
- 当前缺口：28题原文来自标注仅限许可再使用的原论文；未取得明确公开再分发依据，因此题文验收未通过。

### AIR 教师自我反思

[完整来源](https://www.air.org/sites/default/files/2022-12/GTL-Educator-Self-Assessment-Refreshed-2014-508.pdf)：36项个人SEC与10类教学实践分开；Power of Language计分页与题表有冲突。

- [原生记录 `air_educator_sec_2022@1.0.0`](../../server-version/backend/src/modules/scale/instruments/air_educator_sec_2022/1.0.0/instrument.ts)；catalog-only。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/a3c01fdc9843405924f2c171a99572c48374ef64)。
- [图文样稿：report.html](./air_educator/report.html)。
- 当前缺口：2022工具末页标注AIR all rights reserved，公开仓库再分发或翻译完整题文的许可未确认；题文验收未通过。

### Delaware Techniques

[完整来源](https://cdn.secondstep.org/static/pdf/dsecs-s-technical-guide.pdf)：附录B学生版16题，正向/惩罚/SEL做法三维。

- [原生记录 `delaware_techniques_student_en@1.0.0`](../../server-version/backend/src/modules/scale/instruments/delaware_techniques_student_en/1.0.0/instrument.ts)；DRAFT；en。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/521c99981d3252f5fce170b2406f557539b43316)。
- [图文样稿：report.html](./delaware_techniques/report.html)。

### Delaware School Climate

[完整来源](https://cdn.secondstep.org/static/pdf/dsecs-s-technical-guide.pdf)：附录B印刷188–189页，30内容+31真实性题；只实施Grades 3–5英文表。

- [原生记录 `delaware_school_climate_student_en@1.0.0`](../../server-version/backend/src/modules/scale/instruments/delaware_school_climate_student_en/1.0.0/instrument.ts)；DRAFT；en。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/4f310e1722013ec1fefcb7e96c720611d0b33dc2)。
- [图文样稿：report.html](./delaware_climate/report.html)。

### CASEL Schoolwide Rubric

[完整来源](https://files.casel.org/sites/2/2019/06/Blank-Rubric-Template-3.30.20.pdf)：7页、23指标、4水平；附属记录表未包含原行为锚点。

- [原生记录 `casel_schoolwide_rubric_2020@1.0.0`](../../server-version/backend/src/modules/scale/instruments/casel_schoolwide_rubric_2020/1.0.0/instrument.ts)；catalog-only。
- [独立提交](https://github.com/caohuibj/eduK12-new-version/commit/313307069e15462d3d46d692ea5ed6453f8fcce7)。
- [图文样稿：report-sample.html](./casel_rubric/report-sample.html)。
- 当前缺口：原量规受CASEL使用条款约束，学校版许可限定美国境内、非商业且附带衍生作品义务；记录表未复用四级行为锚点。；本记录无Scale executable，不能当作个人量表。

## 2026-10-28 补充导入

按库负责人指示，本轮在 SELcontents 分支继续补入 4 个家族的可执行草稿，标准与第一轮一致（逐字题文、官方计分键、`complete_required` 缺答不补 0、zh 反馈、golden cases、独立提交、`[skip ci]`；未触发 CI、未建 PR、未合并、未部署）：

1. **ERICA-16**（`erica16@1.0.0`；commit `fd21082`）：16 题英文原题誊自共同作者站题本 PDF；官方三分量表均值，10 题反向；native 报告与静态样稿改为三维均值口径，不再显示总分。
2. **ERQ-CA**（`erq_ca_5point@1.0.0`；commit `25d2d97`）：10 题英文原题誊自作者题本；认知重评 6 题、表达抑制 4 题均值，无反向；不合并总分。
3. **CCNES-T**（`ccnes_t@1.0.0`；commit `4722199`）：12 情境 × 6 回应共 72 条英文原文誊自官网 PDF（`ver=1740847826206` 链接本轮确认可访问）；六维均值，仅苦恼维 2A、7C、8C、10A 反向；每条回应重复完整情境题干；保留作者教育/研究用途限制与指定引用格式于 usageRequirements。
4. **BESSI-45 英文自评版**（新精确版本 `bessi_45_self_en@1.0.0`；commit `42a35d7`）：45 题英文原题誊自官网自评表；五域各 9 题均值、无反向。本轮复核官网许可页，确认其声明“非商业用途（科学研究、项目评估、个人使用）自由使用，无需请求许可；商业使用需许可；翻译需联系作者”，据此以非商业研究草稿交付；中文路径 `bessi_45_self_zh_cn` 维持 catalog-only，翻译前须联系作者。

全部 16 个可执行版本的 70 组 golden cases 与各资料包参考 `scoring.py` 独立交叉复核一致；每份定义经本地 JSON 结构断言（题数、计分键、反向集、逐题归属、golden 值），TypeScript 编译与运行时核验仍由集成方完成。ERICA、ERQ-CA、CCNES-T 三项的作者站公开下载仍不等同不限用途授权，许可状态继续记录为未确认；中文译题一律未包含，中文施测前须翻译验证并立新版本。

SECDS-28（Emerald 论文标注许可后复用）、AIR 教师工具（末页 all rights reserved）、CASEL 学校量规（使用条款限制且非个体量表）本轮维持 catalog-only，未复制受限题文。

## 查重与适配

- ERQ-CA与内容分支的`erq10_zh_cn_research`属于同一策略家族；儿童青少年五点版与成人七点版不混用，不把年龄/语言变体计为新的独立构念。
- EAQ30与`ipip_attending_emotions10_zh_cn_research`只在情绪关注方面相邻；EAQ六维结构不等于成人IPIP条目组。`ierq20_zh_cn_research`属于人际情绪调节，也不等于ERQ-CA。
- 本轮没有给既有ACT、一般心理灵活性或相邻心理症状量表自动贴上个体SEC标签。
- ERC/FastTrack报告者版本、WCSD长短版各有精确key，但各自只计一个工具家族。
- 13个原生版本复用Scale单选、反向、均值/总和、缺答与报告架构；学校气候专属scorer无需改共享计分代码。
- CCNES是72个独立Likert回应，未来可沿用Scale，不应改造成单选正确答案的情境任务。
- CASEL是学校实施量规，附属`casel_rubric/form.json`通过FormV2校验（7页69字段），只记录水平/证据/行动；未包含原四级行为锚点，不能替代完整官方量规。此表未注册为个人Scale或发布为实际问卷。

新增SEL及Domain、Construct、Orientation、Population、Response、Use、License、Language Validation命名空间标签。只根据原工具构念与实际版本标注；中文工作译文不标为已验证中文。License标签只是记录，不是额外的内容schema/发布审批门禁，不声称获得不存在的授权。明确受限的整套题文未复制到公开仓库。

## 建议正式入库批次

1. WCSD-SECA、DSECS-R2、SECQ：先覆盖完整学生SEC。（2026-10-28：ERICA-16、ERQ-CA、CCNES-T、BESSI-45 英文版已补入原生，见上方记录；入库批次仍按本顺序推进。）
2. EAQ30、ERC、Fast Track SCS：补充觉察与多报告者观察。
3. BES、SECTRS、Delaware Techniques：补充共情、教师自评和教学情境。
4. Delaware School Climate：单独做学校环境反馈。

继续为7项候选补入可交付的完整题本/行为锚点，再逐项完成同样的题文计分和报告两项验收；保持独立提交与原版/译稿/来源/计分/反馈版本分离。本分支不自动发布或启动CI。
