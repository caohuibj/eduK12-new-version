# CSS-T／CSAS：卢森堡2023频率版原生无计分Form候选

**当前可导入清单只保留15份完整原生Form：法文8份49题、英文7份43题。英文纠正反馈模块因原第35题缺距离数字已整体撤下，完整英文49题组合也不可施测。** 初次16份隔离提交只保留为历史验证记录，不代表当前16份均可施测。公共工具未上线。正式生产/共享开发库、授权分配、人工批准、上线、部署均未执行。Panorama分支与PR543保持原成果，本母工具另用独立worktree/branch。

本分支已快进纳入#551/#556后的实际远端main `ae05ed2e70691bda817ab323130f9caf4dff26ca`。只增加本母工具的可公开许可内容、来源说明、Form提交JSON和验证证据；没有应用、数据库schema、权限、标签引擎、计分器或冻结版本变更。当前15份完整内容的版本仍为`0.1.0`（内容字节未改），参数和报告均为`null`，总分不存在。完整身份、题号、语言和逐文件SHA-256见 [batch.json](batch.json)，逐份库回执见 [validation.json](validation.json)。

## 原文、精确版本和许可

- 已读取研究比较报告的CSS-T／CSAS段：[教师自评教学质量工具13项比较](https://docs.google.com/document/d/1ic-HBy3OdxvauwbyUxvZTX7cxghiDhdpkMHk_38Fxb4/edit)。它仅作检索线索，不代替题本或许可。
- 实际读取Dierendonck（2023）[论文全文](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2023.1281431/full)及[原始XML](https://public-pages-files-2025.frontiersin.org/journals/education/articles/10.3389/feduc.2023.1281431/xml)。XML SHA-256：`e758c30412fc601f92f71192e695df68c8a8ec2afbb62b12a3b62b9fc71383d8`。
- 出版社页面普通链接和旧附件路径404，不等于题本不可取得。沿页面本身使用的公开接口 [supplemental-data](https://www.frontiersin.org/api/v4/articles/1281431/supplemental-data)成功定位到当前[Table_1.docx版本2](https://public-pages-files-2025.frontiersin.org/articles/1281431/file/Table_1.docx/1281431_supplementary-materials_tables_1_docx/2)。附件SHA-256：`2f66cfe95b203e774ad670313ff33a4972ecb0db44bbec7be54d01462424451b`。S2列出49个法文／英文题位，八组对应明确；法文49题完整，英文第35题距离数字缺印；S7/S8为因子载荷/独特性。S1属于另一母工具DMEE，本分支不加工或发布S1。
- 论文明确为©2023 Dierendonck、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。已核[Frontiers in Education许可说明](https://www.frontiersin.org/journals/education/for-authors/author-guidelines)：允许署名下商业或非商业使用，另有禁止复制的第三方通知除外。实际检查附件所有word XML部分，S2没有另外禁止复制的版权通知或排除声明；S2明确署名Reddy et al. (2015)。本批按该公开许可处理**这份S2材料**，保留Dierendonck与Reddy、Dudek、Fabiano、Peters署名、原DOI、许可链接和项目改动说明。没有将此许可扩张为当前商业CSAS软件、原2015论文、正式手册或全部历史版本的授权。
- [R&D Innovations官方产品及作者说明](https://www.rdinnovates.com/csas)确认CSAS另有观察、反思及报告服务；[原CSS-T书目](https://researchconnect.buffalo.edu/en/publications/measuring-teacher-self-report-on-classroom-practices-construct-va/)对应DOI `10.1037/spq0000110`。原2015论文的完整正式题本和评分手册未取得；Ovid显示402，Sage `10.1177/15345084221112858`明确Restricted access，只读摘要。未接受条款、购买、注册、联系作者或绕过付费墙。

题文仅来自已取得的S2，不据理论补写。法文题文逐字保留；S2公开七级选项的英文标签，本批法文选项为项目法译，已明确其编辑性质，不能称为核过的官方法文施测锚点。英文题文使用S2标为original的原英文，但研究数据在法文环境收集，英文数字版不自动继承其效度。英文第35题源表为“i.e., - feet”，距离数字缺印；原文只保留于不可施测来源记录 `withheld/css_t_lu2023_corrective_feedback_en.source.json` 及Git历史，没有用常识补值。该来源记录不含原生definition/requestId/toolKey，不能作为导入JSON。缺件停止推进；后续只有取得完整授权原文才考虑新修订版本，不覆盖既有冻结内容。所有中文仅为目录名和原创反思说明，未生成或声称已验证中文版。

## 拆分、量表与表单判断

| S2组 | 原题号 | 题数 | 本分支交付 |
| --- | --- | --- | --- |
| Student Focused Learning & Engagement · 学习投入与参与 | 1–7 | 7 | FR／EN各一原生Form |
| Instructional Delivery · 教学呈现 | 8–14 | 7 | FR／EN各一原生Form |
| Promotes Student Thinking · 促进学生思考 | 15–20 | 6 | FR／EN各一原生Form |
| Academic Performance Feedback · 学业表现反馈 | 21–26 | 6 | FR／EN各一原生Form |
| Praise · 表扬与鼓励 | 27–31 | 5 | FR／EN各一原生Form |
| Corrective Feedback · 纠正性反馈 | 32–37 | 6 | FR原生Form保留；EN整组已撤出可导入清单，原35缺印未补 |
| Prevention Management · 预防性管理 | 38–42 | 5 | FR／EN各一原生Form，测量证据弱已标 |
| Directives/Transitions · 指令与过渡 | 43–49 | 7 | FR／EN各一原生Form |

名称统一“CSS-T／CSAS｜子项（无计分）｜教师自评｜LU2023-FR/EN·小学”。拆分保留原分组与题号，**模块单独填写仅是描述性反思，不宣称原独立子量表施测效度**。常模或独立施测验证的缺失不是转为Form的理由：实际原因是本研究用Mplus ESEM模型估计因子分，没有可直接复现个体分的完整系数/阈值/缺失算法或作者逐维求和手册。载荷表不能直接当个体计分权重；原CSAS实际/应当频率差分更不能移植到本版。故不发明均分、总分或因子分，按用户要求用原生Form收集完整原题描述。

题项为七级频率：1 never、2 rarely、3 sometimes、4 regularly、5 frequently、6 very frequently、7 systematically。保存的是f1…f7选项身份，**没有任何score属性**，不把数值显示前缀变成分数。S2虽然有通用R脚注，实际49行题号均无R标记；本Form不作反向、缺失补零或任何聚合。任选/明确拒答是本次无分数字Form的设计，不冒充原研究WLSMV pairwise-present缺失处理。

预防管理在原ESEM中定义较弱、CR=.148；保留5个原始行为描述用于反思，不能据此生成该维度高低结论。原研究依据是卢森堡小学教师自报，不是课堂直接观察、学生学习增益或本数字版验证。某策略更频繁不必然更适切，尤其纠正、表扬、过渡等应结合情境与学生实际反应。

当前仅保留法文8子项／49题的普通组合计划，待现有审查后组卷。英文49题组合从 `optionalComposites` 移出，仅在 `withheldComposites` 记不可施测原因，无可装配childKeys；英文其余7份仅保留独立完整子表，不把它们包装成原版43题短版。没有新组合运行时、包报告或跨模块总分。原“实际频率＋应当频率”版与观察版仅保留精确来源/缺项状态，另身份管理；未取得现行题本不创建空可运行工具。未核到原生学生平行版，不机械改人称。

## 排重和现有标签规范

刷新main后检查493份source.json/声明，按CSS-T／CSAS、Reddy、Dudek、原DOI、2023 DOI以及两种语言代表性原句未见同源。检索42个开放PR标题/分支并做GitHub全部状态CSS-T／CSAS查询，未见同母工具；远端相关命名分支也无匹配。题项全量同源哈希无法证明生产/管理员自建库不存在，二者**未核**，正式目标导入前仍须按来源、作者、语言、版本、题项查同义ID，重合引用既有。TALIS、QTI、SPS、TSR不重复创建；DMEE不混入。

既有`originalFormSubmission`只接受现有词表的`classificationTags`；本批使用教师、自评、研究、非诊断、PILOT及英文内容语言已有ID。每份来源元数据的现有`reference.tags`同时保存`family:css_t_csas`、`role:teacher_self`、小学、语言、`source_version:lu2023_frequency49`、用途与无计分状态，实际导入后保存在`reference.metadata.annotations.tags`。初次历史隔离库用同一个家族标签筛得16份，当前交付清单仅15份完整内容；**现有UI未将annotations.tags投影为家族facet，本批不声称已接通UI筛选**，也不为此修改共享词表或标签引擎。主线若需统一目录facet，可集中沿既有词表处理，不必各内容节点改共享代码。

## 实际验证与状态

修改组件仅本目录原生Form JSON和来源说明；直接消费者是既有originalFormSubmission、Form V2 schema、compileFrozenResearchUnit、dryRunSurveyForm与submitOriginalForm/governedDetail。主要检查位置是本云端独立工作树；验证约7秒，隔离库schema准备约4秒。不是平台全量测试或全后端构建。

使用独立新空数据库`eduk12_css_t_verify_20261102`，只向该本地隔离库执行当前迁移和合成管理员夹具。16份Form真实经`submitOriginalForm`提交、`governedDetail`回读，全部SUBMITTED、approvedBy=null、无trial/使用授权/ONLINE。初次98个题位实例与S2抽取文本相等只证明转录一致，不证明缺印题完整；英文缺件整组现已撤下。页序/题号/语言/选项及来源tags保留。64个最低/最高频率、漏答、拒答检查通过，非法选项/数字代替选项/未知题项/非管理员拒绝通过；一次相同requestId续办回读未多建。Form无参数、无评分摘要、无指标和报告，均实际核对。未伪造人类审批、登录实机、真实参与者FINAL或生产导入。

正式CI未运行，不将skip ci、来源文件或局部函数检查当正式CI通过。此批是文档路径中的完整可提交Form内容包，无Scale注册声明，不能假造一个Scale source来骗入selected Scale轻路线，也不重跑旧CHEXI失败run或全量平台；已纳入#556修复，Scale专用解析器不适用于这些原生Form。主线集中复核后决定适用的既有轻量流程。底层原生Form schema、导入、数据库读取和无分反馈的实际证据已单列，不用metadata候选冒充真实隔离提交，也不把历史16份schema通过等同当前可施测清单。

下一步：管理员仅从当前 `forms/`、`batch.forms` 和 `batch.files` 的15份完整内容导入，不能沿缺件组历史隔离提交ID批准或上线。核目标库排重与本次S2材料许可/加工说明，核对英文缺件整组及英文49题组合已不可施测、法文锚点为项目翻译；可按现有原生Form提交入口读取本目录JSON，保持待审并核返回版本/hash。正式公开/授权分配只按现有审查流程执行，组合仅在子项实际可用后创建。若要可计分原版，需另取得精确原题本、实际与应当频率指导语、作者评分手册和对应使用范围；不能让这份频率Form自动成为原版差分量表。

实际隔离验证执行于adad907a4基线。后续纳入ae05ed2e7时，核完整main差异只有10个公共检查/发布工具文件；Form导入/编译/运行时、Prisma/schema/迁移、lock和本批payload均未变，因此复用同输入验证证据，不重放16次数据库提交。最终候选另核精确差异和JSON包完整性。

## 英文缺件模块撤下后的定向检查

此次只改本母工具交付清单／来源说明：移除 `forms/css_t_lu2023_corrective_feedback_en.json`、从 `batch.forms`／文件哈希表移除它、从可装配组合移除完整英文49题计划。来源原文保留在非原生元数据中，不猜补数字。保留的15份payload与修正前SHA逐一相同；法文49题组合只引用8份完整法文子表。

仅运行清单、目录与组合引用的受影响检查，结果见 `withdrawal-validation.json`。初始 `validation.json` 原字节及16份历史回执不改，不重跑schema、64个用例或数据库。旧隔离库中的缺件SUBMITTED记录没有被修改、批准、上线或删除；本次没有运行任何DB操作。没有修改系统通用门禁或引擎。
