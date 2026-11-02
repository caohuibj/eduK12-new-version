# KSTC：韩国科学教学能力自评（Appendix B 54题）

本批形成9个原生 Scale 候选，共54题；**已在任务专属 PostgreSQL 隔离库真实物化、读回并生成代表性报告，均 DRAFT/HIDDEN**。未写正式应用开发库或生产库，未部署、发放或开放施测。不是目录占位，也不把隔离验证称为生产入库。

## 来源、年代与许可

Kang, N.-H., Kang, H., Maeng, S., Park, J., & Jeong, E. (2020). *Teacher Competency in Competency-Focused Science Teaching in the South Korean Context: Teacher Self-Assessment Instrument Development and Application*. Asia-Pacific Science Education, 6(2), 480–513. [DOI](https://doi.org/10.1163/23641177-BJA10012)。出版社与 Crossref 显示在线日期 **2020-12-16**；研究线索称“韩国2021”作为别名保留，不能覆盖原文年代。本工具不同于2005年77题或2014年50/51题工具。

读取过[出版社 HTML](https://brill.com/view/journals/apse/6/2/article-p480_10.xml?language=en)的书目和正文，后续访问出现403；再从[公开原论文全文副本](https://www.researchgate.net/publication/347669053_Teacher_Competency_in_Competency-Focused_Science_Teaching_in_the_South_Korean_Context_Teacher_Self-Assessment_Instrument_Development_and_Application)读完方法、因素与 Appendix B。该副本保留原论文和文内 CC BY 4.0 声明；[Crossref 原始登记](https://api.crossref.org/works/10.1163%2F23641177-BJA10012)也列出同一许可。未登录、付费、破解访问限制或取得有效出版社PDF字节，不伪造PDF哈希。

原附录题文依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)署名使用，未见 Appendix B 单独排除许可的标记。保留五位作者、DOI和许可链接。改动明确为：去除版面断行/连字符及PDF字形编码；按原附录完整因素拆包；中间数字选项呈现；项目完整作答缺失规则；原创教师报告。不复制全文、封面、标识或无关图片，不声称作者认可本平台、中文版本或独立短版效度。

## 母工具与子量表

母前缀 `kstc2020_`，名称前缀 `KSTC｜`，共用 `family:kstc2020`。以下 key 均加 `kstc2020_` 前缀、`_teacher_en` 后缀，完整身份及原题码见 [factor-map.json](factor-map.json)。C/P/R分别为 **1.0.0 / 1.0.0 / 1.0.1**。

| key 中段 | 原领域／因素 | 题数 | 解释边界 |
|---|---|---:|---|
| `slp_environment` | SLP：Consideration of science learning environment | 10 | 自报备课考虑和条件安排 |
| `slp_content` | SLP：Understanding of science teaching content | 4 | 包含自认为理解，不能叫知识测验成绩 |
| `slp_cognition` | SLP：Consideration of student cognition | 3 | 自报考虑学生已有观念等 |
| `stp_inquiry` | STP：Teaching science inquiry | 14 | 自报提供的探究机会，非观察质量 |
| `stp_everyday` | STP：Relating science to everyday life | 7 | 自报科学与生活联系的机会 |
| `stp_engagement` | STP：Facilitating productive engagement | 6 | 自报支持参与，不代表每名学生实际体验 |
| `stp_assessment` | STP：Administrating assessment | 3 | 自报评价实施及有效性判断，非外部评定 |
| `spd_new` | SPD：New mode of professional development | 3 | 原论文的新方式类别，不表示比传统方式优越 |
| `spd_traditional` | SPD：Traditional mode of professional development | 4 | 原论文的传统方式类别，不表示落后 |

44条指标属于 Appendix A；54条可回答陈述属于 Appendix B，不能把指标数当题数。17+30+7分属三个领域，原文因素数为3+4+2；此处按因素完整题组登记，未将三个领域合成一个质量总分。原研究使用完整54题，因素可计分不证明拆开施测有效；推荐在同一原研究语境中组合使用，并保留此项限制。

## 语言、标签与计分

采用原论文发表的**英文题文**，没有取得原始韩文施测题本，也没有制作正式中文版。中文目录名称仅为项目检索标签；报告正文为英文。原样本为210名韩国小学、初中及高中科学教师。成人18+为项目使用范围，不冒充原作者年龄界线。

同母tag以现有 `catalog.construct.constructOverlapTags` 承载，另有 `role:teacher_self`、`population:teacher`、`stage:primary_secondary`、`subject:science`、`language:en`、`version:2020_appendix_b`、`use:research`、`license:cc_by_4_0` 及因素tag。既有普通 Scale.tags 在隔离库同步存储这些字符串。`ENGAGEMENT`只是当前有限目录枚举中的粗分类，具体构念以完整名称和因素定义为准，不把它改名成单一自我效能或学生投入量表。无新标签引擎、数据表、权限或门禁。

方法§3.1报告五级频率，1＝rarely、5＝always；**没有给出2、3、4的文字锚点**。本包保留中间数字，不补造“偶尔/有时/经常”，也不把它们描述为经核原版文字。项目指导语说明这一呈现选择；未指定额外回顾期。

按原文各因素均分的处理给出等权1–5原始均分，无反向；越高表示该题组自报更频繁，含理解/有效性判断的题仍属自我判断。原作者未提供完整缺失算法，本包明确采用项目完整作答规则：一题缺失或无效即该因素无分，不置零、不插补、不折算。没有常模、分级阈值、优秀教师排名或跨因素总分。

没有额外原生无分表单：原附录54题均归于上述因素，正文仅提到学段和教龄背景，没有完整背景题措辞，因此不补写“原表单”。原文没有的行动问题不冒称原题。可选普通组合清单是依附录顺序引用上述9个精确 C/P/R、共54题，保留各自结果、不增加汇总分；本PR未创建组合发布或分配。

## 报告与实际验证

教师成长报告区分自报实践、理解/能力感和外部证据，不根据高低均分生成教师能力标签；每个因素有具体反思问题和一个可行微行动。正常完成、困难/较少实施、信息不足示例见 [report-examples.md](report-examples.md)。没有已核学生平行版，也不制作改人称学生版。

沿现有报告接收者能力声明及访问授权使用，不因报告内容增加主管/同事权限，不改匿名、发布或最小人数政策；隔离验证未创建发放或部署记录。没有伪造人工审校、语言验证或科学评审。

本地定向原生检查：9个来源通过现有 schema/Scorer/报告契约，每个4个golden、6次去重计分执行，共54次。该初次完整检查对应 R1.0.0；随后只将报告建议细化为 R1.0.1，C/P、题项和权重未变，不把旧报告结果冒充新R。最终同提交正式 selected Scale 检查结果在PR说明读回，不重复运行全量平台。

隔离 PostgreSQL 使用现有迁移和 `materializeScaleInstrumentContent`，真实创建9行、54题、9个初始轴快照，读回定义hash和tag。R1.0.1修订沿同一物化入口追加另9个快照，旧R1.0.0仍保留。由数据库读回定义，在SLP/STP/SPD各一个代表因素验证正常完成、较少实施、缺一题三种情境，共9次真实报告构建；缺失时value=null、无解释/参考，完整时正常输出单因素报告，无常模或总分。未测HTTP/浏览器和完整参与者交卷链，不外推这些尚未执行的阶段。

详细hash、版本、状态、初次夹具问题及修正边界见 [verification.json](verification.json)。隔离库只含合成账号，正式应用开发库和生产库均未接触。原生包仍DRAFT，管理员可在既有流程检查来源、用途与部署资格后决定后续发布；管理员审核不替代版权或科学证据。

## 排重及后续

基于 `688d61eb61094fe692ad8c6e6ce41315c8bc3402`（含公共#551/#556）：检查258个注册版本、235份source.json，54条新题与既有题文经大小写/标点归一后无匹配；母名、DOI、作者和45个开放PR文件/可见patch亦无命中。GitHub可能省略过大patch，精确文本匹配不能排除全部语义同源；生产和管理员自建仍未核，不能称全系统无重复。

本PR只含这9份内容包、官方生成器更新的索引及必要说明/证据；不修改计分引擎、权限、CI、公共parser或其它工具。管理员后续先按精确版本/题项核最终环境排重，保留英文原题及项目改造说明，按既有原生物化与普通tag编辑流程同步，再独立决定发布/部署。正式库未入，不自动生产写库、合并或部署。
