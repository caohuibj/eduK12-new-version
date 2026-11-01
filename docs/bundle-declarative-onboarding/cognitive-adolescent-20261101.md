# 青少年认知控制与自我调节 DRAFT

本候选沿用 `declarative-evidence-v1@1.0.0`，以 Go/No-Go、CPT-X、Flanker 与真正的 TEXI 青少年自评提供互补描述。任务和自评独立保留，不生成跨量尺总分、IQ、能力等级、诊断或一致／分歧分型。

## 版本与实际交付

核对主干 `24061f5e349d1f8df34b0ed5dd99a33e3014da8c`，而非附件快照。新增公开候选为 `cognitive_self_regulation_adolescent_en_v1@1.0.0` 与 `texi_self_en@1.0.0`：英文原题及英文单量表报告，Bundle 综合报告使用中文。施测者需确认青少年理解英文。源码登记不表示生产已安装。

官方简体自评全文、计分、中文单量表报告和独立的 `cognitive_self_regulation_adolescent_zh_cn_v1@1.0.0` / `texi_self_zh_cn@1.0.0` 已制作成[私有管理员待审交付](https://chatgpt.com/space/page_244aeb6c934c81919c413c4e9f0eb785)。授权范围未完整确认没有阻止这份 DRAFT 制作；中文完整译文没有进入公开 Git。该私有覆盖包须进入管理员审阅用代码环境并生成原有注册产物后才可走现有安装流程；附件本身不是生产可用状态。

三任务分别锁定现有标准配置 `config/engine/scoring@1.0.0`：Go/No-Go 120、CPT-X 180、Flanker 80试次。没有修改任务协议、运行器、计分、已有发布状态或参考模式。Flanker 种子仍是 DRAFT；这些现有参数不等于完成青少年分年龄验证。用时未实测，不承诺整个包18–25分钟。

## 去重与量表选择

全目录、别名、可执行源与远端 TEXI 分支已核对。主干 `texi_parent_zh_cn@1.0.0` / `texi_teacher_zh_cn@1.0.0` 实际是英文他评，保持原样。历史[PR48](https://github.com/caohuibj/eduK12-new-version/pull/48) 已关闭、未合并；分支 `scale/zh-cn-sdq-texi-draft@11681a6977a1b1845089799be6afce7bc30fdb3f` 是项目他评译稿，既不是真正自评，也不是本次官网 Angela Siu 译本。

[作者官网](https://chexi.se/translations) 现在提供独立的英文、简体、繁体 TEXI 自评及家长／教师题本。真正自评全文可获得，故本轮保留贴合工作记忆与日常自我调节的 TEXI，无需将他评改写或用测量冲动特质的工具替代。家长与教师可以共享官方他评题文，但仍是不同观察者和情境，不与自评分数平均。

年龄来自2020原研究13–19岁，在现有适用性字段表达为 `[156,240)` 月；不增加年龄收集或另一道准入流程。18–19岁与成人18+版交叉，研究情境选定版本后保持一致，不能将两工具当成同一量尺。

## 来源与允许的解释

| 来源 | 版本、报告者与来源公开性 | 本候选采用范围 |
| --- | --- | --- |
| [Thorell等2020原研究](https://pubmed.ncbi.nlm.nih.gov/32090688/) / [DOI全文](https://doi.org/10.1080/09297049.2020.1726885) | 公开原文献；塞尔维亚302名13–19岁青少年及家长；原样本语言为塞尔维亚语 | 自评及家长评定的两因素与信度依据；不冒称瑞典样本、中国验证或教师效度研究 |
| [作者英文自评PDF](https://chexi.se/onewebmedia/English%20TEXI%20self-report.pdf) | 公开；PDF署名Lisa B. Thorell；20题真正自评 | 原题文与1–5选项，合并PDF换行；没有从他评自动转换 |
| [作者官网简体自评PDF](https://chexi.se/onewebmedia/Teenage%20Self%20report%20Executive%20Functioning%20Inventory_SimplifiedChinese.pdf) | 公开可获取；Angela Siu，香港中文大学 | 完整文字、指导语、选项及译者信息保存在私有待审包；保留原有港式用语与混用字形，不自行本土化 |
| [简体家长／教师PDF](https://chexi.se/onewebmedia/Teenage%20Parent_Teacher%20Executive%20Functioning%20Inventory_SimplifiedChinese.pdf) | 公开可获取；Angela Siu；同一他评表供家长／教师 | 收集作版本辨别，未作为学生自评、未加入本次自评Bundle |
| [作者TEXI计分PDF](https://chexi.se/onewebmedia/TEXI%20subscales.pdf) | 公开；适用于自评和他评 | 工作记忆1、2、5、7、8、9、11、12、13共9题；抑制3、4、6、10、14–20共11题；各取均分，不新增总分或反向题 |
| [Lin等2026 TC-TEXI](https://pubmed.ncbi.nlm.nih.gov/42253085/) | 公开摘要；台湾784名高中生及家长、教师，繁体版本 | 记录为不同语言版本的研究，不能作为Angela Siu简体译本或大陆常模的证据 |
| [Toplak等2013](https://pubmed.ncbi.nlm.nih.gov/23057693/) | 公开摘要及出版者全文；20项研究，286项比较，中位相关0.19 | 支持任务与问卷分别解释；不推导个体一致／差异阈值或诊断 |

官网提醒年龄常模尚未建立。[官网使用说明](https://chexi.se/translations) 允许研究／临床工作者使用所列现成语言版本，无需另行作者许可；商业数字化、地域与再分发范围未完整确认，仍由现有 InstrumentAuthorization 记录。原论文的 [Crossref出版商许可记录](https://api.crossref.org/works/10.1080/09297049.2020.1726885) 为CC BY4.0；此记录不自动授权独立中文译文。来源未知、项目自编、作者译本和未验证人群分别记录，不把未知许可写成已授权。

题本没有固定7天或30天回顾期；没有擅加。完整分量表作答后取均分是本平台保守缺失处理，不声称作者提供了插补规则。高分是报告的困难更多，非能力分或个体缺陷判定。独立参考常模字段为空，文献放在来源与科学依据中，不把参考文献误装为常模表。

## 综合报告与共享边界

报告包含任务观察、日常体验、两种视角的互补说明、可尝试的小步骤、质量及解释限制。跨方法文字需其列出的每个来源均可解释；缺失、无效或有限质量不生成完整联合说明。原始零值、负的Flanker差值与缺失null分别保留。建议是项目撰写的教育性尝试，没有训练疗效或作者原报告声称。

当前声明式契约只接受`number/string/boolean`，但任务计数字段的注册类型是`integer`。本候选未改共享契约；保留任务slot中的误按次数、Go／No-Go数与CPT目标／命中数选择器，真实原任务结果继续携带分母；Bundle evidence-map只映射现已支持的浮点指标。整数证据进入通用Bundle图表是已记录的共享展示缺口，不能把本PR说成已完成分母图形。本轮没有修改成人线负责的`BundleReport.tsx`，未声称浏览器或最终视觉验收通过。

## 定向验证与执行位置

本地Node24.19.0、现有依赖。英文实际三任务计分→证据映射→声明式报告及来源回归：1文件5例通过；检验了1/30误按、1/36遗漏、原分母、9/11均分与第13题归属、零与有符号差值、缺失／有限／无效来源、他评身份替换拒绝和报告受众边界。英文量表完整package结构校验`valid:true`；四态Bundle fixtures与精确依赖解析通过。

中文覆盖包在本地临时接入现有source registry后，完整量表结构校验通过、4个golden向量通过、独立Bundle四态fixtures及精确依赖校验通过；随后已移除临时中文接线，未上传公开仓库。两份交付都保留DRAFT。没有连接生产库、写库、安装、发布、合并或部署；没有执行真实数据库生命周期或浏览器用例。

本候选只新增内容、来源适用性与定向测试；无引擎、表、依赖、workflow或审核门禁修改。主干历史包未改；两份generated文件由原工具生成。后续三线集成时应重生成它们，不将本分支的整份生成物覆盖成人／儿童新增内容。Draft PR只用于审阅，正式CI选路以真实完整差异决定，不把本地结果冒充正式应用资格。
