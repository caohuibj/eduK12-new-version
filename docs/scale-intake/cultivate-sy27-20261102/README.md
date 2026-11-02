# Cultivate CPS SY27：来源已读，目录候选待审

固定母工具为 **Cultivate CPS 2026–27（SY27）英文版**，题本页眉标记使用2024基准的Measures。目录元数据身份1.0.0不代表原工具版本号；内容C、计分P、报告R均尚未创建。状态：**9个原生 CATALOG_ONLY 量表候选 + 14个无计分表单资料候选；开发库未入，生产未写入**。不新增引擎、权限、门禁或总分；不修改任何既有冻结source。

## 2026-11-02 可解决性补充

[逐项核查及具体路径](resolution-20261102.md)纠正先前过宽的许可挂起：原件明确授权非商业学校改进／研究的复制、数字化与改编，缺一封独立许可函不自动等于完全禁止。现已补齐23份私有无分Form准备（75回答单元）及179项真实表单运行器检查，不公开原题、不写库。公开映射不含题文或选项标签。实际EduK12用途事实仍需用户说明，商业／公开库／特殊改编如超原授权则需权利方具体确认；正式计分缺失不阻断无分路径。下方原catalog状态和首次验证按历史保留，不将本补充伪报为实际入库或评分报告上线。

## 已独立读取的原始来源

- [SY27 CPS Cultivate Codebook](https://uchicagoimpact.org/sites/default/files/SY27_CPS_Cultivate_Codebook_FINAL.pdf)，6页；2026-11-02经常规HTTPS下载、PDF文本提取并全文读取。网页读取器报不可读，但本地下载成功。SHA-256：`6396e19ade910c11b8a92f433afc91c27a649d5074fc3c3354c145dc93feac8f`。p1许可，p2引导和Q1，pp3–4课堂条件，pp4–6学习信念/策略/动机，p6 TEST及辅助题。
- [CPS SY27 Cultivate Administration Manual, Updated Fall 2026](https://uchicagoimpact.org/sites/default/files/CPS%20SY27%20Cultivate%20Survey%20Manual.pdf)，19页，已下载并读取；SHA-256：`3381ce12055376f4614c0508ee158e1e4ec7bcbbbd59e95be0b023918a5c3641`。p4九条件框架，p7响应率与报告阈值，pp11–12跳题、语言与课程分配，pp14–15用途边界。它是施测手册，**不是计分手册**。
- [CPS 2026–27官方入口](https://uchicagoimpact.org/chicago-public-schools-survey-information)：链接上述两份SY27原件；秋季和春季分别管理。页面使用Mindsets & Strategies，codebook章节仍名Learning Beliefs，不把FAQ的五信念直接当成SY27十题块计分表。
- [官方FAQ](https://uchicagoimpact.org/frequently-asked-questions-cultivate)：九类条件名称及发展性用途；不支持教师问责/绩效评价。当前For Schools与For Coaches施测形态不同，不混成同版本证据。

原文引用署名按codebook p1：University of Chicago. 2026. Cultivate® Survey. Chicago, IL: University of Chicago Consortium on School Research.

**授权缺口**：p1注明CC BY-NC 3.0 Unported及非商业学校改进/研究用途，也同时要求大学明确许可、禁止无许可使用和向第三方授予许可。当前未确认EduK12具体使用、改编、公开Git再分发及非商业范围，不能仅凭CC字样登记为已获授权。联系点为原文的`ccsr-survey@uchicago.edu`，本轮未发送联系、未代表用户接受条款。本PR仅原创目录元数据、定位和报告草稿，不提交原PDF、题项、选项或指导语。不能因后续管理员审核而推定取得权利。

## 排重边界

基线`adad907a4b68606ce71bb1a4f2d7c511c872c715`。现有258份instrument声明与235份source.json，按母工具名、UChicago来源域、九条件同义名称及可读取英文原项核对，没有发现Cultivate同源条目。构念相近不代表同源：现有`teacher_subject_liking_*`、学科自我效能/成长信念及TALIS不应直接替换本工具。英文精确匹配不能证明不存在中文翻译或管理员私有副本。

2026-11-02另查当时26个开放PR的1280个文件路径，未见Cultivate路径/标题；含instrument内容的PR为#537、#413、#383、#373、#370、#362、#329、#328。本次路径检查不等于逐项读取所有开放PR新题文。父任务已完成更早一轮来源/内容PR排重；本轮结果只对这个时间和基线负责。

**尚未核查生产DB、管理员自建、私有表单。** 合法取得题本和计分后，落地前须按作者、来源、原项、SY27波次、语言、填答者重查同义ID，重合引用既有ID，不新建重复包。不得宣称生产完全无重复。

## 九个原生量表目录候选

全部为学生填答，评价教师/课堂，5–12年级，英文。中文名仅供导航，不是已验证中文版。key统一前缀`cultivate_sy27_`、后缀`_en`，目录版本均1.0.0。

**下表Q块→条件的对应来自题意对读，只是待确认映射。** codebook只标CLCOND和Q块，没有正式子维度映射、权重或计分表；官方手册确认九个条件的名称，没有确认逐题归属。不得按本表启用计分或认为拆开施测已经有效。

| key中段 | 名称（前后为“Cultivate｜…｜5–12年级｜学生填答”） | 原Q块/项编号 | 项数 |
| --- | --- | --- | --- |
| meaningful_work | 有意义的学习任务 / Meaningful Work | Q02_01–05 | 5 |
| learning_goals | 学习目标 / Learning Goals | Q03_01–04 | 4 |
| well_organized_classroom | 课堂组织 / Well-Organized Classroom | Q04_01–04 | 4 |
| supportive_teaching | 支持性教学 / Supportive Teaching | Q05_01–05 | 5 |
| feedback_for_growth | 促进成长的反馈 / Feedback for Growth | Q06_01–05 | 5 |
| classroom_community | 课堂共同体 / Classroom Community | Q07_01–06 | 6 |
| student_voice | 学生声音 / Student Voice | Q08_01–03 | 3 |
| teacher_caring | 教师关怀 / Teacher Caring | Q09_01–04 | 4 |
| affirming_identities | 身份认同支持 / Affirming Identities | Q10_01–04 | 4 |

共40项。9份source使用现有strict schema、candidatePreview、PILOT、年级/填答者/语言/来源许可标签及原generated index；无executable、runtime policy、scorer或分数。catalog中20分钟仅引用**原整卷**时间，layoutConstraints明确不是单独子量表时长；requiredTraining=false仅表示资料候选不实施培训要求，不代表原工具无需说明或组织准备。具体年岁未由原件界定，不杜撰年龄常模。

## 十四个无计分表单候选

这里只记录定位及未来原生Form用途，没有伪造可导入题文或将其注册为Scale。各项的完整key、名称、原项编号见[candidates.json](candidates.json)；此JSON是工作记录，**不是后端导入payload**。

| key中段 | codebook位置 | 项数 | 后续形态与限制 |
| --- | --- | --- | --- |
| subject_context | Q1，p2 | 1多选题 | 事实背景；仅适用原条件分支，四选项不计成四道评分题 |
| beliefs_q11 | Q11，p4 | 3 | 描述性学习信念；不命名为已确认因子 |
| beliefs_q12 | Q12，p5 | 3 | 同上 |
| beliefs_q13 | Q13，p5 | 3 | 同上 |
| beliefs_q14 | Q14，p5 | 2 | 同上 |
| beliefs_q15 | Q15，p5 | 3 | 同上 |
| beliefs_q16 | Q16，p5 | 3 | 同上 |
| strategies_q17 | Q17，p5 | 2 | 描述性学习策略；不计量表分 |
| strategies_q18 | Q18，p5 | 2 | 描述性学习策略；频率选项，不能套真实性选项 |
| beliefs_q19 | Q19，p6 | 2 | 描述性学习信念；信心选项单独保留 |
| motivation_q20 | Q20，p6 | 1 | 单题动机描述；不冒称多题量表 |
| test_classroom_q21 | TEST Q21，p6 | 4 | 原文TEST研究题块；与已命名条件分开，不吸纳为正式子量表 |
| feedback_impact_q22 | Q22，p6 | 1 | 二分类的反馈用途预期；是学生看法，不是学校实际采纳的事实 |
| test_school_voice_q23 | TEST Q23，p6 | 5 | 学校层面的描述性研究题块；目标由课堂转为学校，不与Q8混合 |

Q11–20共24项；Q21与Q23共9项；加Q1与Q22共75个回答单元、23个编号Q块。十个信念/策略/动机块缺正式计分时只做无计分描述候选，不按旧五信念框架强行归并。许可和原组卷依赖未解决，因此首次未制成原生可施测Form。后续已完成23个原Q块的私有无分原生定义与运行器检查（见上方补充），仍不公开题文或宣称已入库。

## 计分与组合：已知和缺项

- 原始响应编码：Q2–17及TEST Q21/Q23为1–5真实性编码；Q18为1–5频率；Q19为1–5信心；Q20为1–5动机；Q22为1/2二分类；Q1为多选类别。这里仅记编码范围，不复制选项文本。
- **反向规则未取得**；不能因语句表面正向而声称官方无反向。维度合成、权重、缺失最低回答数、插补、原分范围及官方方向、2024基准换算均未取得。没有均分/总分/0–100/常模/优秀教师阈值。
- 原手册允许跳题，不应强制完整作答；缺失不是0。p7“至少5个核心题才计入响应率”是响应率口径，**不是每个子量表可计分阈值**。学校报告至少50%响应率且10个响应的原版规则，不外推成每个交叉小组或新学生报告的许可。
- `candidates.json.ordinaryCompositeCandidate`按Q1–Q23保留原顺序作为**普通组合问卷清单候选**，不新增Bundle或聚合计分引擎，不创建可发布组合。九条件与学习信念/策略分开展示；Q23学校语境切换、Q1原路由、TEST标识、同一目标课程及秋春记录必须保留。
- For Schools原版按课表随机指定一门核心课程；将原`[TARGET]`替换为任意教师/课程会改变设计。拆成目录子项不是授权单独施测；默认保留原组卷及引导。英文、已有西语和任何未来中文应分别管理，本轮只定位英文。

## 报告接收者及后续操作

[report-drafts.md](report-drafts.md)含学生与教师的三种状态示例；均为原创待审文案，无实际结果或运行时R版本。填答者是学生，不自动使学生或任课教师拥有个体结果访问权。复用现有接收者授权、报告版本、保密/匿名和发布规则；不自动开放新接收者。无分表单只作事实/描述，不显示分数、排名或评分式分析。

管理员后续：先核具体许可与来源版本，再核生产/私有重复并复用ID；取得正式SY27计分/映射、缺失与基准规则及拆分依据；有授权范围时用既有原生Scale、Form和普通组合流程制作内容，分别冻结C/P/R；核查适龄接收者文案及披露范围后在隔离库验证。当前installer没有可安装的runtime policy，本轮不绕过它、不作DB写入、不发布、不合并、不部署。

## 实际验证与CI边界

修改组件→9份目录source/普通声明wrapper及生成索引、资料文档。所需检查→原strict schema、source validator、真实registry目录/无可执行投影、原安装plan提前拒绝和generated index一致性，防止候选误变成可施测内容。主要执行位置→本云端本地；约2分钟，复用已安装依赖。已有内容与后端/前端业务、Prisma/schema、锁文件、环境开关均未改，不运行全量测试/构建/恢复。

[validation.json](validation.json)记录实际PASS：9个source schema/validator均无issues；真实registry读取全部9条，getExecutable/getRuntimePolicy均undefined；原`planScaleInstrumentInstall`全部在DB访问前拒绝，DB访问计数0。23子项唯一、Q1–Q23完整、75回答单元通过一致性核对；原生成器`--check`通过。9项均0次计分；这不是9项得分测试、真实DB导入或报告渲染成功。

已读AGENTS、release规则与Notion“CI常见错误清单”：本切片适用CI-007（生成物一致）和CI-020（精确候选/来源绑定），CI-001/003/006/008/009/014对应的DB、跨前端依赖、权限fixture、UI/HTTP或SAST不因本切片另行启动。既有轻量scale-intake可按完整diff选择；不手动触发全量CI，不将本地复用依赖的检查称为干净CI或正式合并资格。候选head/tree以Git提交与PR实际回读为准，不在文档伪造自签资格。

计分、反向/缺失边界、代表性实际报告及隔离库导入当前均**未执行**：缺executable、正式计分和具体许可；其验证只在合法内容就绪后沿现流程补齐。生产排重、个体接收者授权及聚合披露未验证。此处是可审阅资料交付，不是已入开发库或生产库。
