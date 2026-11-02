# DigCompEdu Check-In：高教英文 2023 问卷（PeerJ 2024 附件）

状态：6 个可执行原生 Scale + 3 个原生无分 Form，已在独立本地开发库导入并回读；全部 DRAFT，Scale 为 HIDDEN。仓库候选为 CANDIDATE / PILOT，尚未发布、合并或写入生产。不是已完成生产部署的工具清单。

本次取得并采用的是 **Ersoy 等发表于 PeerJ 2024 的完整英文高教教师问卷附件**，表内时间 2023-06-02。其来源、角色和学段单独标识，不把它冒充原官方学校版、SELFIEforTEACHERS 32 项版或新高教七领域版。题项未翻译成中文；中文名称/本说明仅为项目管理文案。

## 原件、许可及版本辨析

- Ersoy et al. (2024), *Digital competence of faculty members in health sciences measured via self-reflection: current status and contextual aspects*, PeerJ 12:e18456，[论文与许可](https://pmc.ncbi.nlm.nih.gov/articles/PMC11562777/)，[DOI](https://doi.org/10.7717/peerj.18456)。论文明确 ©2024 Ersoy et al.、CC BY 4.0，允许署名条件下复制、改编。
- [Supplemental Information 1](https://doi.org/10.7717/peerj.18456/supp-1)：[原附件 PDF](https://dfzljdn9uc3pi.cloudfront.net/2024/18456/1/Survey_Blind_Version.pdf)，20 页，*Digital Competency Assessment Questionnaire for Academicians*。附件第一页另有 CC BY 4.0 notice，署名原框架 Redecker (2017), editor Punie，European Commission JRC，doi:10.2760/159770。本包保留上述署名、许可链接和改动说明，不暗示作者或欧委会认可。只提取问卷文字，不上传 PDF 版式、商标或任何被试数据；未下载论文原始数据附件。
- [JRC 官方自我反思工具门户](https://joint-research-centre.ec.europa.eu/scientific-activities/key-competences-lifelong-learning/digcompedu/digcompedu-self-reflection-tools_en)：原 Check-In 试用站已于 2022-01-31 停用；SELFIEforTEACHERS 是 32 项，当前新高教 Check-In 有不同选项和第七个开放教育领域，不能拼成一个版本。
- [JRC131282 / SELFIEforTEACHERS 报告](https://publications.jrc.ec.europa.eu/repository/handle/JRC131282)，§3.2.2（印刷页17）回顾旧 Check-In 为22项、每项五选项0–4、总计0–88。这是区别版本和基础计分的证据，并不是取得旧学校版全部题本。
- [MetaRed 所存 English Master PDF](https://www.metared.org/content/dam/metared/pdf/Check_In_DigCompEdu_Self_Reflection_Tool.pdf) 的前言沿用2018年22项0–4说明，但下载实体已混入 BDT/0–6 选项和开放教育部分；不能删选项来“恢复”旧版。本次没有复制或从这个混合稿造题。
- [JRC129320 / 西班牙高校报告](https://publications.jrc.ec.europa.eu/repository/handle/JRC129320) 的附录也是高教七领域、七选项版本，未导入到本母工具。

采用的完整附件逐题页码、PDF SHA-256、22题/110选项和机械修订逐条保存在 [item-map.json](item-map.json)。PDF 可见缺字（如 `act vely part c pate n`）按明确语义修复并记录；去掉题干内重复的领域编号，合并行尾。保留原 `daprtment` 拼写，不悄悄修改选项含义。原附件的项目名/翻译者占位、知情同意和保密承诺没有冒充本平台承诺搬入施测。

## 母工具与子项

所有机器 ID 前缀 `digcompedu_checkin_peerj2023_`，版本均1.0.0。共同 `family:digcompedu_checkin` tag 用于筛选并列分析，不表示不同语言/版本等值。角色 `role:teacher_self`，语言 `language:en`，情境 `context:higher_education`，`version:peerj2023_2024`，以及研究、个体反思、PILOT、CC BY 标签。名称遵循 `DigCompEdu Check-In｜子项｜教师自评｜高教英文2023（PeerJ2024）`。

| 原生量表（ID省略共同前后缀） | 核心题号 / 附件问题号 | 题数 | 原始分范围 |
| --- | --- | ---: | --- |
| professional_engagement | 1–4 / 3–6 | 4 | 0–16 |
| digital_resources | 5–7 / 7–9 | 3 | 0–12 |
| teaching_learning | 8–11 / 10–13 | 4 | 0–16 |
| assessment | 12–14 / 14–16 | 3 | 0–12 |
| empowering_learners | 15–17 / 17–19 | 3 | 0–12 |
| facilitating_digital_competence | 18–22 / 20–24 | 5 | 0–20 |

ID 完整清单、三轴版本、题码和 tags 见 [manifest.json](manifest.json)。六个 source 包的 `executable.definition` 保存真实原生题目、逐题 responseSets、计分、教师报告；不是 CATALOG_ONLY 占位。

另有三个可直接交给既有原生 Form 编辑器/导入服务的定义，见 [forms.json](forms.json)：

- 施测前自我定位：附件问题2，A1–C2六个文字类别，1题。
- 背景与数字教学条件：附件问题25–38，14题，包括2个矩阵（4行个人使用、5行工作条件），覆盖21个基础回答字段，另有6个“其他”补充文本字段。保留高教/健康科学专业选项，不改作K12。
- 施测后自我定位：附件问题39，1题，原始 A1–C2 类别。

三表均无 `score` 字段、无计算等级、无量表评分报告；所有问题改为选填。来源问题1的 email 不另行收集，身份依既有平台功能处理。问题33的研究者编辑括注移除；34/35的土耳其语“其他”改为英文；36及题干断行缺字作机械修复。年龄/年限非负数是项目输入约束，不是评分依据。改动逐项列在 forms.json。

## 计分与组合边界

论文方法明确22项、每项0–4、总计0–88；附件按数字教学参与递增排列五个**逐题不同**的选项。原生计分保留打印顺序0、1、2、3、4，不反向。各领域用其所属题等权求和，这是公开标明的**项目领域描述分**；不把拆出的领域称为独立验证的新量表。原文总分依据不等于任一领域有官方分级阈值。

项目采用 `complete_required`：本领域任一漏答不出分，不插补、不把缺失记0。0是合法选项，包括机会/情境不允许开展某活动的回答。原作者未明确提供本实施所用的部分缺失规则，本规则因此明确标为项目选择。高分代表自报更多数字参与/实践，不证明客观能力、学生成效或教学质量。

优先按原22题顺序施测六领域；若单独用某领域，须保留未验证独立施测的说明。可选普通组合顺序为：前定位 → 六领域 → 背景 → 后定位。这里只提供组合清单，没有新引擎、报告包、跨工具总分或已发布组合。历史22题整体 A1–C2 分级不能套到这些领域，本实现不输出计算所得A1–C2，也不按理论描述推断分级。

## 报告、接收者与权限

原生报告面向成年教师，英文原创项目反馈；说明自报实践和机会条件，提供1–2个可行微行动，避免绩效排名/诊断。普通、较少数字实践、证据不足的实例见 [report-examples.md](report-examples.md)。分数没有常模“正常/低能力”分档；实例中的 normal/low_experience 是合成验证场景名。

填答者为教师自评。报告接收者必须经过既有资源授权、冻结 disclosure、当前限制与发布条件；不是任意教师均可见。以当前已授权教师个人为接收者，未经授权/未知策略不显示结果。没有原生学生填答版本，未捏造学生报告。表单只呈现事实/完成情况，开放文字/个人背景不自动分发给同事或管理员。本次没有扩大匿名、最小人数、开放时点或结果权限。

## 排重和验证

[dedup.json](dedup.json) 绑定最新核查主干 `6cad86d8f721a45a47a91290edf1523519d1d239` 和54个开放PR（6464条文件记录，已分页），按母名、作者、来源DOI和代表题文检查未发现同源。供应商可能省略超大文件 patch 的边界如实保留。未查询生产数据库/管理员自建内容；不能宣称全系统无重复，管理员导入前还需核对现有同义ID/来源/题项。

[isolated-import-evidence.json](isolated-import-evidence.json) 是真实本地持久化回读证据：独立 loopback 数据库，合成 ADMIN 编制账号，无真实学生/教师作答。6个Scale通过既有 `materializeScaleInstrumentContent`、冻结轴版本快照，3个Form通过既有 `createFormTemplate` / `addItem` 创建，读取实际 typed 定义和 tags。数据库初始使用当前 Prisma schema `db push`，另应用仓库已有 `20261001040000_scale_axis_snapshots` SQL（含不可变触发器）；这是内容导入验证，不是完整迁移测试。

本地针对实际保存定义验证领域最小0、最大、普通、缺答和非法选项；验证教师授权/拒绝/未知策略投影；三份Form的填写/留空预览无分。没有做全平台构建、全前后端回归、发布、参与者投放或生产数据库检查。早期环境/验证脚本失败及修复保留在证据中，不当作已通过。验证源码副本见 [local-verification.txt](local-verification.txt)，仅作可复核记录，不是生产导入器。

变更组件仅6个原生内容源、生成索引和本目录说明/脱敏证据。CI主要位置：既有 Scale intake selected 检查（schema、原计分golden cases、生成索引一致性），用来发现声明/计分/索引错误；本地主要位置：隔离持久化、回读和代表性接收者报告。与本地验证不同，不重复跑平台全套。采用既有 Notion CI历史清单的已读适用内容（Qiang 连接 `link_6ae487749ba88191982b4dcc83ac39b8`，CI-004/CI-020）；主要CI预算约5分钟。精确base/head/tree、输入和检查范围随Draft PR保留；CI结果以实际run为准。

## 管理员后续与确切缺件

1. 先在目标库按母工具、Ersoy/PeerJ DOI、2023-06-02表、语言和22题排重，已有同源版本直接引用。审阅分离领域/缺失规则、范围和许可署名。不得伪造独立人类科研审批。
2. 审核后按现有内容导入流程导入这6个精确Scale版本；现有materializer只默认写主领域tag，需用既有管理接口写 manifest 的共同/角色/版本 tags。三个 Form 定义通过既有表单作者流程建立并写现有 CompositeAssessment.tags，保留无分属性。该写tag操作已在隔离库验证，未改引擎。
3. 如需成套施测，按普通组合清单组卷，不合成总分；依已有内容/计分/报告三版本、用权与接收者策略审核后发布。主线串行合并，本线程不自行合并。生产发布另行按实际授权办理。
4. **旧官方学校英文22题版仍缺：** 干净、可定位年代的完整22题/110选项导出；对应原版计分/反馈等级规则；该确切问卷的电子呈现及公开再分发许可范围。官方停用站与混合Master稿不能补足这些件。需要这一个版本时再取得原件，不从框架造题，也不把本高教问卷改名替代。
