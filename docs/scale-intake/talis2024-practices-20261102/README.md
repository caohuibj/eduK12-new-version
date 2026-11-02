# TALIS 2024 教学实践：原生无计分 Form 与隔离库验证

本母工具仅取国际英文主问卷 **Q50 时间分配、Q51 教学实践**，保留p28指定目标班级说明。**15份原生 Form 已在一次性隔离开发库实际创建、回读，另有3份普通组合问卷 DRAFT；未生产导入、未投放、未生成计分报告。** 不改 Cultivate 学生评教分支/PR #544，不改既有TALIS2018内容，不新增引擎、计分器、权限、标签表或CI门禁。

## 版本与拆分

技术报告Version 3已确认三个四题量表题集及其官方因子计分方法。本片不把简单均分冒称官方因子分，也不为接入创造新计分器，因而将三个原题集先承载为**原生无计分Form**，并保留官方量表映射供后续工作。不是“量表已导入”，也不是只登记CATALOG_ONLY。

| 子项 | 官方原变量 | 当前载体 | 官方计分身份 |
| --- | --- | --- | --- |
| 清晰教学 | TT4G51A–D | 4行 MATRIX，无计分Form | T4CLAIN题集，保留映射，不计算该因子分 |
| 认知激活 | TT4G51E–H | 4行 MATRIX，无计分Form | T4COGAC题集，保留映射，不计算该因子分 |
| 课堂管理 | TT4G51I–L | 4行 MATRIX，无计分Form | T4CLASM题集，保留映射，不计算该因子分 |
| 其他课堂实践 | TT4G51M–O | 3行 MATRIX，无计分Form | 不强造第四量表或总分 |
| 课堂时间分配 | TT4G50A–C | 1道 CONSTANT_SUM、3个百分比字段，无计分Form | 完整作答合计100%；不是能力分 |

每个子项分别有ISCED1、ISCED2、ISCED3身份，共15个，完整key和实际API参数见[native-forms.json](native-forms.json)。子Form的现有原生code字段也保存各自`talis2024_`机器key（仅本人新建DRAFT元数据写入），角色`teacher_self`、语言`en`与学段分别进入key。名称统一为“**TALIS2024教学实践｜子项（无计分）｜教师自评｜ISCEDx英文**”。三个学段版本不宣称等值；一份通用母版中相同英文题项不表示可以混合年级/角色/参照班级分析。

本片内容交付版本1.0.0；原生Form是DRAFT修订记录，不伪称已冻结Scale的C/P/R。`contentVersion=1.0.0`标识本内容交付；`scoringVersion=null`、`reportVersion=null`，原生存储修订值见验证记录。中文仅导航名称和原创说明，没有翻译原题或声称已验证中文版。没有学生版、观察者版或理想教师版，不能由教师原文改人称捏造对应版。

## 原始来源、许可与范围

已读用户研究报告对应TALIS2024段及其S10/S11线索，后续判断依赖以下实际原始材料：

1. [OECD国际英文教师问卷](https://www.oecd.org/content/dam/oecd/en/about/programmes/edu/talis/talis2024questionnaires/TALIS2024TeacherQuestionnaireISCED1-2-3.pdf)，52页。全文取得；实际逐项核对p28目标班级、p31 Q50、p32 Q51。Q51页底印成`TQ_52`，本片按可见题号51及`TT4G51*`变量定位，不能与下一页Q52数字工具使用混同。SHA-256：`f6ff9c69c98ced95500ed0201bef3c46d6bb97e0baba2ae317c1479ae4cc7ba7`。
2. [官方数据库：Using and citing these questionnaires](https://www.oecd.org/en/data/datasets/talis-2024-database.html)，问卷专用说明明确要求遵循[OECD Terms & Conditions](https://www.oecd.org/en/about/terms-conditions.html)并给出问卷署名方式。
3. [Technical Report Version 3, EDU/TALIS/GB(2025)8/REV1](https://one.oecd.org/document/EDU/TALIS/GB%282025%298/REV1/en/pdf)，2026-08-19。已取得全文并读取计分方法pp228–230及题集/方向表11.84（p307）、11.88（p311）、11.92（p315）。SHA-256：`19942b8f378e02a067e7fe7de7e19571af2fd01df7c814b16ed5d98610e4526c`。
4. [User Guide Version 3, EDU/TALIS/GB(2025)9/REV1](https://one.oecd.org/document/EDU/TALIS/GB%282025%299/REV1/en/pdf)，2026-08-18，pp37–38列明三个MGCFA量表，保持Version 3身份，不称为此后正式出版版本。SHA-256：`2acc4dfb840c80c647c3843549a8ef9ac708ca4c871cd3e00b726d0951ac674e`。

**许可依据不是“能下载”。** 原问卷页脚确为“Restricted Use - À usage restreint”；已保留在本来源记录。进一步核对得到：官方数据库的**问卷专用使用说明**直接指向通用条款，条款§1.1对2024-07-01后多数书面内容实行CC BY4.0，但要求检查个别声明；§1.2对更早、OECD单独持有的英文书面内容也允许署名复制、分发及改编。两种日期路径均允许本片的英文摘用；本片不将2024调查波次或2025 PDF生成日期当成准确发表日期，也不据它们擅自贴CC BY4.0许可标签。

本片采用该问卷专用指引下的**署名英文摘用/改编**路径，保留日期/适用范围记录与改编声明；没有签署教育许可、开订阅、绕登录/付费墙或代表用户接受需另行同意的条件。所选Q50/51页未标注第三方权利来源；Q31效能/TSES与其他模块不在公开内容中。没有使用OECD封面、图标、视觉设计或原PDF；后续商业中文翻译应另核条款，不由本片英文依据自动推出。

统一署名：OECD (2024), “Teaching and Learning International Survey (TALIS): Teacher Questionnaire”, 原始问卷URL。

本片英文各Form说明已包含OECD要求的改编声明：This is an adaptation of an original work by the OECD. The opinions expressed and arguments employed in this adaptation should not be reported as representing the official views of the OECD or of its Member countries.

改编仅为选题拆分、指定ISCED层级和增加不计分/可跳题说明；原题、选项措辞及顺序保留。不存在OECD对EduK12独立施测、中文适用性或教师评价用途的认可。

## 排重与跨波次关系

初始main为`adad907a4b68606ce71bb1a4f2d7c511c872c715`；提交前已纳入最新公共修复main `ae05ed2e70691bda817ab323130f9caf4dff26ca`（#551/#556）。本片所用Form、组合与标签服务、Prisma/schema和lock在两基线之间字节不变，复用已完成的同输入验证，不重跑业务全量。

复用主线独立题项对读结果，并核本地现有七个TALIS2018包：Q41课堂扰乱、Q28发展障碍、Q48参与、Q33交流以及Q34三效能，均不含Q39时间分配或Q42实践。不能拿这些不同构念替代本次题集，也不能重复建Q31效能。当前42个开放PR标题/分支扫描没有TALIS2024教学实践候选；它不是对所有PR题文的全面排重。生产DB、管理员自建/私有工具仍未核查。

跨波次并非“2024全新题”：Q50对应2018 Q39三项及100%约束；Q51 A/C–M与2018 Q42同字母原项一致，B改写，N对应旧O，O新增同伴论证质疑；旧N练习转2024 Q56D，旧P ICT不在本片Q51。该对应来自主线对[2018英文问卷](https://www.oecd.org/content/dam/oecd/en/about/programmes/edu/talis/talis2018questionnaires/TALIS-2018-MS-Teacher-Questionnaire-ENG.pdf)与2024原件的逐项独立核对，本线程不重复大范围检索、不将2018现有中文包换年份重建。正式开发/生产导入前仍需作者、原变量、题文、语言、角色、波次及私有ID核重；确有同源内容时引用既有。

## 填答、计分与解释边界

- 指定班级按原p28：上周二11点后在该校教授的首个目标ISCED班级；周二无该层级班级时顺延至之后一天。五个子项在同一次组合中必须针对同一班级。不能自行换成“印象最好的班级”或“所有班级平均”。原规则通过说明保留，不声称本片新增了自动课表校验。
- Q51四个频率选项及原编码顺序1–4保留。Form将类别存作`r1`–`r4`，`r1`对应原码1，以此类推；原变量在rowKey中逐一保留，不把数字代码放进option.score。三个官方题集方向均为“更频繁地自报该实践”，不是实际教学质量越高。
- 技术报告官方分数用多组CFA固定结构参数与lavaan经验贝叶斯模态估计；每量表至少回答2项，无响应或单响应不插补，随后用ISCED2池化数据标准化，使题项中点对应10、标准差为2。**本片没有实现该公式或参数链，不输出官方因子分，不以原始均分/总分替代**。Q51原项频率不做反向；没有制造统一“越频繁越优秀”方向，也不把T4CLSM变成T4CLSDIS课堂扰乱分。
- Form无计分，不使用官方“2项”阈值强制补答，不因缺常模/拆分效度拦住无分记录。缺失保留为缺失，绝不变成0/从未。Q50填写时三个百分比为非负有效数且合计100，接受小数；整题不答保持缺失，不能生成“教学时间0%”推断。
- 无常模、等级、诊断、优秀教师排名、跨工具总分或跨角色等值结论。M–O的生活联系、长项目与同伴论证等实践要结合任务机会解释；课堂管理条目频繁不等于安静就是学习好。

## 标签和普通组合

所有15个子项在现有 `CompositeAssessment.tags` 中共用 **`family:talis24_tp`**。还包含`role:teacher_self`、`level:isced1/2/3`、`lang:en`、`wave:talis2024`、`use:reflection`、`state:research`、`source:oecd`，均符合当前最多10项、每项20字符限制。tag只是筛选和并列分析，不能改变授权、发布或科学结论。

当前Form模板标签编辑API不接受FORM_TEMPLATE类型；本次隔离导入仅对**本次本人创建的DRAFT**通过Prisma写入已有tags字段，没有添加API、权限或新字段，不能宣称UI标签编辑已支持。3份普通QUESTIONNAIRE组合标签通过已有`updateCatalogTags`真实保存及回读。正式环境的Form标签管理能力缺口需单独说明，不能为此扩大本内容PR。

每层级一个普通组合，顺序Q50→Q51 A–D→E–H→I–L→M–O，均复用当前`create/importFormTemplate`服务；`COLLECTION_ONLY`，无reportPackage、analysisProtocol或分数聚合。每层级是独立身份，不把3个年级层级混成一个问卷或总分。组合不是新的Bundle、跨工具报告或自动教师—学生关联能力。

## 实际验证与复现

[validation.json](validation.json)：一次性loopback PostgreSQL16.15，库名`eduk12_talis24_test`。按当前Prisma schema `db push`准备空库，仅证明本地原生内容持久化合同，不冒称迁移/恢复/部署通过。独立工作区按原锁文件从官方npm源安装，Prisma5.22客户端按未变schema生成；只复用现有引擎二进制，未修改共享node_modules。

实际调用`createFormTemplate/addItem/detail`创建、读取15个FORM_TEMPLATE DRAFT；逐项回读原题、rowKey、选项、无score、标签、source数量与修订。实际`create/importFormTemplate`建立3个5项普通组合，并回读集合状态与无计分设置。没有真实被试、Attempt、FINAL、access token、公开投放或授权提升。

93个原Form运行器回答边界：各矩阵r1/r3/r4、部分遗漏、全缺失、非法r5；Q50正常整数、小数、0值，以及99%、负数、101%拒绝。15份Form题干、原项文字、锚点及变量ID均与原PDF对应页逐一归一化对比（仅忽略提取空白/标点）。共有54个原变量位置=18×3层级，不是54个独立原创题。

首次本地导入因API参数误含平台分配的`itemKey`被strict schema拒绝；保留该FAIL，随后仅从addItem参数移除该键，保留独立Form定义/source mapping，未改schema/引擎；实际导入随后PASS。Prisma首次工具准备因只读缓存utime失败，改用已有官方引擎路径后成功；不修改HOME或关闭验证。

[reproduce-native-import.ts.txt](reproduce-native-import.ts.txt)是明确的隔离验证配方，须在**单独一次性测试库**按文档执行，可复制到backend目录运行；不是应用自动加载器，不会被生产自动执行。它使用现有本地隔离库检查，固定该合成库名，不是新增产品门禁。未运行全后端/前端、构建、浏览器、OECD因子计分、实际参与者报告或生产/管理员私有排重。无分反馈只记录事实，原创成长文案见[teacher-feedback.md](teacher-feedback.md)，不是已发布评分报告。

修改范围→本母工具英文原题Form参数、说明与验证证据；必需检查→原Form schema/响应边界、原生导入/回读及普通组合和标签；位置→本隔离云端，已完成；预算→约3分钟，后续不重复不变输入。CI使用现有纯内容分类，先核精确差异再按实际路由运行；不手动触发全平台，不以skip-ci补绿，不将本地证据冒作正式门禁。Notion常见错误清单已读，适用CI-001/003/006/020分别核隔离库、锁定输入、合成真实owner及精确证据；CI-007无生成索引变化，CI-008/009不涉及UI/HTTP实现。

## 管理员下一步

当前**隔离开发库DRAFT已入并回读，生产未入**。先在目标库按原变量/同义名/语言/角色排重，再沿既有Form流程导入、核标签及用途说明，并确认教师接收者和实际投放范围；不直接复用合成库UUID。只有需官方因子分时才另立明确范围补齐既有计分能力与完整参数验证；目前无分表单可供合法范围内整理、反思和普通组合，不以缺常模或独立施测效度阻断。主线串行协调合并，本线程不merge、不部署或写生产。
