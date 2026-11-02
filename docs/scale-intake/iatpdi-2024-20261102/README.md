# IATPDI 2024：M2题集与补充表单的原生导入准备

**实际状态：6份原生无计分FORM_TEMPLATE DRAFT、1份普通组合，已在独立隔离开发库创建并读回；生产/正式库未入。** 不是目录占位，也不声称已导入四个可计分量表。内容版本1.0.0；scoringVersion、reportVersion均为null，原生Form修订为1。没有新引擎、计分器、标签表、权限或CI门禁；不改Cultivate #544和待审批的TALIS2024分支，不重试它们的PR动作。

## 原始来源与版本差异

已读取用户扩展研究报告A07及其原始来源，核心判断依赖实际取得的下列材料：

- Dorji T & Nima P (2024), [Psychometric properties of an instrument to assess teachers’ practice of differentiated instruction (IATPDI): a confirmatory factor analysis on Bhutanese teachers’ data](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2024.1445865/full), Frontiers in Education 9:1445865，2024-11-13。原网页、13页PDF和JATS XML均取得并读取，原项直接从XML Table1逐行抽取，以PDF编号交叉核对。没有根据理论补写原题。
- [原PDF](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2024.1445865/pdf)与[XML](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2024.1445865/xml)字节SHA-256及35项完整映射在[native-forms.json](native-forms.json)、[source-mapping.json](source-mapping.json)中。
- 原文§3.2明确四级频率：never=1，seldom (infrequently)=2，sometimes (on certain occasions or in certain circumstances)=3，often (frequently or many times)=4。新Form原样保留锚点，以r1–r4存类别，不能把类别代码当作加权得分。
- 原文§4.2、Table1明确**M2删除评价第8项**，其M1载荷0.034、M2为空，留下7/10/10/7共34项；§5讨论又**建议在IATPDI问卷中保留该项**。所以“34项”应称拟合的M2研究题集，不能不加说明地叫唯一“最终34题问卷”；也不能将35项表直接发布成“已验证最终35题”。

四个题集涵盖评价、内容、过程、产出。本片机器身份显式带`m2`、题量及2024，保留原B01–B35位置（B编码是项目定位，不冒称作者的数据库变量）。作者建议保留的B08另行处理，不进入34项组合。初始35与M2删项状态都可追溯，不静默删题或用补充题填回M2。

## 子项、标签、版本

| key | 原文位置/题量 | 原生载体 |
| --- | --- | --- |
| iatpdi_2024_m2_assessment7_teacher_self_en | Table1 B01–B07 | 7行MATRIX Form |
| iatpdi_2024_m2_content10_teacher_self_en | Table1 B09–B18 | 10行MATRIX Form |
| iatpdi_2024_m2_process10_teacher_self_en | Table1 B19–B28 | 10行MATRIX Form |
| iatpdi_2024_m2_product7_teacher_self_en | Table1 B29–B35 | 7行MATRIX Form |
| iatpdi_2024_summative_item8_teacher_self_en | Table1 B08、§4.2删除/§5保留建议 | 独立1行Form，明确未纳入M2 |
| iatpdi_2024_qualitative_reflection_teacher_self_en | §5作者新增、未编号的开放问题 | LONG_TEXT Form，无分 |

名称统一“IATPDI｜子项（无计分）｜教师自评｜2024M2/补充英文”，原题为英文，中文仅目录和项目报告草稿，不宣称已验证中文版。没有原生学生、观察者或理想自我版，不能改人称制造平行版。原样保留英文拼写（包括原文部分拼写问题），没有静默替换成后续量表题目。

全部实际写入现有`CompositeAssessment.tags`：**family:iatpdi**、role:teacher_self、level:k12、lang:en、version:2024-m2或version:2024-extra、use:reflection、state:research、license:ccby4。符合现有最多10项/单项20字符规则。现有code列保存上述稳定机器key。K12仅标注原研究目标人群，不代表不丹样本证据已外推每个国家/学段。

原生FORM_TEMPLATE的标签编辑API当前不支持此kind；此次只对隔离库本人新建DRAFT记录写已有tags/code列，未新增API或扩大权限，不能声称UI标签编辑已支持。普通组合通过现有`updateCatalogTags`真实保存。共同tag只作筛选/并列分析，不改变授权、不建立等值或跨工具总分。

## 计分选择与理论限制

论文报告的是CFA拟合、载荷、alpha/CR/AVE及因素关联，**没有提供可核的个人维度总和/均分算法、反向清单、缺失阈值或常模**。不能把Table1载荷直接当计分权重，也不能把四级选项存在理解为已获得官方个人维度计分。按用户要求，本次采用原题、原锚点、无score的原生Form，不自造计分规则；不因为缺常模或独立施测验证阻止无分内容导入。

Table4：内容与过程相关0.980、内容与产出0.891、过程与产出0.883。内容AVE为0.41，样本237名不丹教师；这些结果不能支持将四维当作彼此清晰独立的能力画像或一般教学质量。分组内容可单独整理，但完整原组卷关系保留于普通组合，不宣称拆开施测仍有相同效度。没有百分制、优秀教师排名、诊断或“DI能力不足”标签。

原文若干条目提及学习风格、VARK、Kolb、多元智能或学习画像；[source-mapping.json](source-mapping.json)列出理论敏感原项。保留它们是复现原材料，**不是推荐按固定学习风格/多元智能类型匹配教学**。不得借原研究CFA或较高alpha宣称这些理论已获证实。报告不鼓励给学生贴类型标签；任何删改此类题目均需另立内容版本，不能冒用原模型验证。本片没有删改原文以制造“更科学的原量表”。

频率更高只描述教师自报更多使用某实践，不等于教学更优、更公平或学生学得更多。缺失保留为空，不记成0/never，不插补。原研究使用强制回答得到无缺失数据；本项目表单允许不答，属于已标明的实施改编，不冒称作者缺失计分政策。反思题保存叙述，不提取隐藏分数或评判教师诚实度。

## 许可及尚未取得的部分

原文版权页明确©2024 Dorji and Nima、[CC BY4.0](https://creativecommons.org/licenses/by/4.0/)，允许在署名和引用条件下再用。Table1的35项是作者新增的四个题集；本片原项和新增开放反思来自本篇开放论文，保留作者、题名、期刊、DOI和改编说明。公开的是必要英文题项及项目说明，不上传原PDF、原XML、封面或审稿/专家文件，不使用机构标识；没有代表用户签署许可或接受需另行同意的教育条款。

原文称完整问卷还有Section A七个背景题、C36/C37策略熟悉度/使用、D38/D39影响因素、D40资源清单，并声明C/D改编自Adlam(2007)，作者此前取得改编使用许可。**该许可不自动证明EduK12获得第三方题项再分发权**，也不能按这些类别描述恢复具体选项。

XML中的补充附件仅给出`Data_Sheet_1.zip`；本轮常规原站两个文件目录及DOI补充下载路径均返回404，未取得并读取附录题本。只报告本轮下载失败，不断言附件全球不可得。A/C/D精确题文/选项与第三方范围待补，当前只记录缺项，不造表单、不公开受限原件。这不阻断已合法取得的Table1四题集、B08及开放题。

## 排重与普通组合

基于当时实际main `688d61eb61094fe692ad8c6e6ce41315c8bc3402`建立独立工作区，提交前已纳入main `826f8e2ee5171acfff644efdd9e8527d41a8238f`新增SJT内容；已核记录的Form/组合服务、schema与lock哈希不变，没有本工具路径变化，不重复已过回答检查。main工具与来源记录按IATPDI、DOI1445865、Dorji/Nima及核心原项检索未发现同源；同样审阅当时45个开放PR标题/分支，未见本工具。该检查不等于逐条读取所有开放PR原文，更不代表生产/管理员私有库完全无重复。原有DI-Quest或其他差异化教学工具即使构念接近，也不能未经作者/题文/版本核实视为同源或替代。

现有普通组合`iatpdi_2024_m2_four_groups_teacher_self_en`按评价→内容→过程→产出引用四份已创建Form，**恰好34行**、排除B08，没有补充题或开放题混入。原生模式为COLLECTION_ONLY，无reportPackage或analysisProtocol，不建新Bundle，不制造总分。B08和开放反思为可选独立补充，管理员有明确用途时可沿现有普通组合另选；不把它们自动当成M2的一部分。

## 实际验证、影响与管理员操作

[validation.json](validation.json)记录真实独立PostgreSQL16.15、`eduk12_iatpdi_test`隔离库结果；按当前未改Prisma schema `db push`准备空库，不声称完成迁移/恢复验收。复用另一独立工作区同锁、同schema的依赖及Prisma客户端，没有改写其内容，未运行全平台安装或构建。

- 6份Form真实调用`createFormTemplate/addItem/detail`，原题/选项/rowKey/无score、DRAFT状态、code及tags均读回；只有合成教师owner，无实际被试数据、Attempt/FINAL/token或公开投放。
- 1份普通组合真实`create/importFormTemplate`复制四题集，回读4个Form、34行唯一原项、无B08、COLLECTION_ONLY和无计分/报告包。
- 34个回答边界真实PASS：五个矩阵分别检验r1/r3/r4、全遗漏、部分遗漏、非法r5；开放题检验正常文字、遗漏、错误类型及超长拒绝。未将类别转成得分；计分执行0次。
- 35条原项与Table1 XML完整映射、原频率锚点与§3.2、开放题与§5逐字核对通过。原文保留表不等于35项都进入M2；组合实测确保34项。
- [reproduce-native-import.ts.txt](reproduce-native-import.ts.txt)为隔离验证配方，复制到backend目录、显式选择同名一次性本地测试库后执行；不是自动生产加载器，不改权限。工具首次准备遇到只读Prisma缓存，改用已存在的官方引擎路径解决，未改HOME或关闭验证。

[teacher-feedback.md](teacher-feedback.md)给出教师较顺利/困难/信息不足情境和四组具体微行动；仅为待审编辑文案、无运行时R版本。Form不产生“正常/困难分级”。生产UI、HTTP、真实参与者提交与评分报告均未测，不拿文字审阅冒称报告渲染通过。

影响范围仅为本母工具英文原生Form参数、来源映射、报告草稿及隔离证据；主执行地点为本云端，约3分钟的定向内容检查已完成，不重复未变输入、不启动全后端/前端/浏览器/镜像。纯内容CI以实际精确diff分类为准；不改#551/#556公共修复，不重跑旧factory-shape失败run，不用skip-ci伪称通过，不伪造独立人类review。

管理员下一步：先核目标库按作者/DOI/原项/语言/版本/角色的重复及原许可署名，再沿既有Form/普通组合流程导入所需DRAFT，核标签、接收者及反思用途；不要复用合成库UUID。若需要四维量表分，先取得可核的合成/缺失规则或明确另版改编方案，不能将本无分记录静默变成原作者评分。A/C/D待取得题本和合法再分发依据后再处理。当前不生产写库、不部署，合并由主线串行协调。
