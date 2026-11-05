# RTTQ 2019：教师反思问卷来源与导入准备

**32题原附录已读；数字使用/再分发范围及个人计分键待确认，未实际导入。** 本交付只含原创元数据、原题号映射、缺项和反馈草稿，无题文或CATALOG_ONLY占位。原生Scale、Form、普通组合及可执行C/P/R新增均为0。

## 工作区与既有成果

独立worktree `/workspace/eduK12-rttq`、分支 `content/rttq-2019-teacher-self-20261102`；冻结前再次fetch并基于实际main `6cad86d8f721a45a47a91290edf1523519d1d239`，已含公共#551/#556。旧LCQ、TSAT、TFAPS、57项PR #568和Yan2014已推分支保持原样；没有重试Yan2014被拒的PR动作。本分支不改其他题文、共享引擎、权限、schema、依赖、检查器或生成索引。

主线扩展报告在本线程先前已通过Google Drive读取，缓存全文未检出“RTTQ”或此英文全名，故不虚称该报告已有对应段落或完整题本；本任务依据直接指定的原始链接独立核查。

## 已核原始来源

- [期刊原始页面](https://cjc-rcc.ucalgary.ca/index.php/ajer/article/view/56416)：标题、三位作者、2019-04-01、65(1):37–50、[DOI](https://doi.org/10.55016/ojs/ajer.v65i1.56416)已核。
- Choy, S. C., Lee, M. Y., & Sedhu, D. S. (2019), *Reflective Thinking among Teachers: Development and Preliminary Validation of Reflective Thinking for Teachers Questionnaire*。[作者公开稿](https://www.researchgate.net/publication/331729564_Reflective_Thinking_among_Teachers_Development_and_Preliminary_Validation_of_Reflective_Thinking_for_Teachers_Questionnaire)：实际读取Methods/Validation、Table 2、讨论与pp49–50完整32题附录；不是依据摘要补题。
- 官网PDF链接和about页面返回403，没有换隐藏路径绕过；改从独立的作者公开稿阅读。未取得PDF本地字节，不编造下载文件或SHA。作者公开上传不自动授予平台复制、翻译或商业/公开再分发权。
- 期刊页“License”是作者授予期刊编辑的出版协议，包含编辑可授权第三方的权利；它不是对本项目或所有读者的开放许可。公开稿署名©2019 Governors of the University of Alberta，未核到覆盖本项目数字题库、拆分或公开题文的许可。不能把论文中研究者“经原作者许可使用题项”的陈述当成我们的授权。

## 正式版本与拆分台账

| 2019附录组别 | 附录原题号 | 题数 |
| --- | --- | --- |
| Developing lifelong learning skills（终身学习技能） | 1–8 | 8 |
| Ability to self-assess（自我评估） | 9–21 | 13 |
| Belief about self and self-efficacy（自我信念与效能） | 22–25 | 4 |
| Awareness of how one teaches（对自身教学方式的觉察） | 26–32 | 7 |

Table 2的组内编号与附录连续编号分开，映射见`subitem-plan.json`。2012前驱33题经后续研究修订为2019附录32题，不能沿用33题的题序/键，也不猜被删题的身份。四组不是习惯行为/理解/反思/批判反思四级阶段；不套Kember题键，不与RPQ混为同母工具，不另造总反思能力或教学质量分。

五档同意选项1–5，3为中立，不能当成漏答。原文明确存在负向措辞，尚未核到完整反向、聚合、个人缺失及报告解释键；尤其第26–32组不能仅凭名称把高原始分解释为高觉察，也不凭语义擅自全部反向。因子载荷/拟合好不等于可直接个人评分或拆开施测已验证，优先保留原32题组卷与来源说明。

## 适用范围与报告

目标为教师专业反思自述，不是客观教学技能或课堂质量。原文称服务高教教师，验证段又分别描述中学样本和另一批教师；不把泛称“教师”推为中国K12所有年龄/学段均已验证。当前未设置臆测年龄/年级，不冒称中文版或常模。

`report-drafts.md`提供正常/困难/资料不足的教师成长文字，无实际结果或R版本。信念与效能保留自述含义，不把对反馈的不安诊断成心理问题、不用否定性措辞给教师贴标签。报告沿原接收者与群体匿名规则；没有原生学生对应题本，故不造学生平行报告。

## 标签、原生路线与缺件

共同母tag计划`family:rttq`，另有`role:teacher_self`、`language:en`、`source_year:2019`、`use:professional_reflection`及来源权利状态，沿既有tags和`constructOverlapTags`。已读现有`scale/library/catalog-discovery.ts`和`survey/standard-triplet.service.ts`规范，不新增标签引擎/表；未知命名空间不冒称已有专门facet。名称“RTTQ｜子项｜教师自评｜英文2019附录”，中文仅项目标签/草稿，不是验证译本。来源年不当平台C/P/R版本，当前未分配可执行身份。

完整题文及选项已从原稿读到，缺口不是“题文全无”，而是数字处理与公开范围、完整个人计分键。如果使用范围明确允许处理而评分仍缺，可保留原题/选项做原生无分Form，不以常模或独立施测验证缺失另设门禁；目前不把未经确证范围的题文改名Form导出。公开可读也不被自动判为禁止所有私人研究；我们只记录实际范围未知。

后续需取得此精确2019附录的使用范围（数字施测、必要拆分/翻译及公开题文分别明确）、原计分/反向/漏答说明；如只做原语无分Form，不必等待常模。再按目标库同义ID/作者/题文排重、现有原生导入、必要题量/选项/评分边界、代表性反馈和隔离库保存回读执行。无生产写入、合并、部署或伪造人类独立审阅。

## 实际验证边界

`dedup.json`记录初始主干和54个开放PR文件名/可用patch检索，并对最新main再次检索，另检查刷新后新增的PR #574；现有PR未重新抓取最新head，缺patch不冒称全文，生产/管理员自建未查，不能宣称全系统无重复。未取得数据库中题项，不能给出全系统逐题无重复结论。

本地仅验证JSON、四组连续题号32项分割、8/13/4/7计数与差异格式；无可执行合法内容包，未执行真实计分、报告渲染或隔离导入，不以零DB调用冒充入库。正式CI另读真实run，不改旧失败、共享检查器或运行平台全量。公开文件只有原创研究摘要、书目链接、原题号与反馈草稿；受限全文、原题、真实教师数据和凭据不公开。
