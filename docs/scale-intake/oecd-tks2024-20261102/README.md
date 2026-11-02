# OECD TKS 2024｜课堂实践情境模块｜ISCED2英文

状态：**隔离开发库实际新增4份原生无计分Form DRAFT，复用5份既有Form，建立1份普通组合并回读；生产未入库。** 不是完整Teacher Knowledge Survey，也不是一般教学知识测验。新内容版本均为`1.0.0`，计分/报告版本为`null`；原生草稿修订号另见[validation.json](validation.json)。没有新增量表注册、评分引擎、权限、标签数据表或组合总分。

## 原始来源和范围

- OECD (2024), [Teacher Knowledge Survey (TKS): Teacher Questionnaire, redacted English ISCED2](https://www.oecd.org/content/dam/oecd/en/about/programmes/edu/talis/tks2024questionnaires/TKS_MS_instrument(long)_withSEnames-REDACTED.pdf)，24页；SHA256 `93b8ecdf49bec06df4987b5842ec9fd3c7be93455db8667d29bf0628f3744d45`。实际下载、逐项读取pp16/18–24，Q27选项另对原第23页视觉核对。机器映射与原题见[native-forms.json](native-forms.json)、[source-mapping.json](source-mapping.json)。原题未翻译；中文资源名和反馈是项目原创说明，不是已验证中文版。
- [OECD TKS 2024 Database](https://www.oecd.org/en/data/datasets/Teacher-Knowledge-Survey-2024-Database.html)明确区分TKS教师问卷和TALIS核心问卷，并明确公开教师题本已删去GPK试题。不能因为共用题块就用TALIS Q50/51冒充整个TKS。主线研究清单A12是检索线索，原题和范围以这里实际核读的原件为准。
- OECD (2026), [TALIS 2024 Technical Report V3, EDU/TALIS/GB(2025)8/REV1](https://one.oecd.org/document/EDU/TALIS/GB%282025%298/REV1/en/pdf)，2026-08-19；SHA256 `19942b8f378e02a067e7fe7de7e19571af2fd01df7c814b16ed5d98610e4526c`。§11.3 pp228–230为CFA分数估计/缺失/标准化；§11.4.3 pp537–546明确TKS与核心问卷的共享尺度；表11.108/112/120分别给出T4ADLE/T4PBLE/T4FULFIL原项；TKS表11.404–406给出该组件结果。附录H pp826–828保留TKS公共变量TT4G53/55/56/58，与题本内部`TKS_Context_Cluster2_*`标签交叉映射。附录H的中位数插补属于GPK条件模型预测变量预处理，**不挪用为个人Form缺失规则**。
- [User Guide V3, EDU/TALIS/GB(2025)9/REV1](https://one.oecd.org/document/EDU/TALIS/GB%282025%299/REV1/en/pdf)，2026-08-18；SHA256 `2acc4dfb840c80c647c3843549a8ef9ac708ca4c871cd3e00b726d0951ac674e`。复用本线程前一TALIS任务已经取得的同一官方文件，不重复下载。TKS网页当前三条手册链接误共用一个链接，不能把网页标签当作已分别读到三份手册的证据。

所有题块以**同一目标班级**为语境：上周二11点后本校所教的第一个ISCED2班；若周二未教该层级，选周二之后一天的班级。公开母题本中的`Level x`由文件页脚的ISCED2明确展开，这是已说明的组卷适配。Q27特别限定**上周所教课程**，不能改写成“通常”“整个学期”或能力感。

## 子项和逐题块排重

本次新增4个完整原题块，均为Form、非已实现官方因子量表。保留原题和原选项；拆出方便描述性反思不等于证明单独施测效度。

| 新子项key（共同前缀`tks2024_`） | TKS原题 / 内部标签 | 公共变量 / 行数 | 科学边界 |
| --- | --- | --- | --- |
| `assessment_methods_isced2_teacher_self_en` | Q24 / Cluster2_18；p20 | TT4G53A–F / 6 | 各类评价方法频率，未找到该整组六项的官方统一因子分依据；不能把同伴相对排名或频繁测验当作必然更好 |
| `adaptive_learning_isced2_teacher_self_en` | Q25 / Cluster2_20；p21 | TT4G55A–E / 5 | 对应T4ADLE完整原项，官方分数另有CFA链；当前仅记录实践频率 |
| `progression_learning_isced2_teacher_self_en` | Q26 / Cluster2_23；p22 | TT4G56A–D / 4 | 对应T4PBLE完整原项，当前无分；不把反复练习频率当作学习有效性的证明 |
| `lesson_aims_isced2_teacher_self_en` | Q27 / Cluster2_25；p23 | TT4G58A–G / 7 | 原问卷七项均保留；**T4FULFIL仅用A–E五项**，F情绪/思维/行为自我管理与G行为管理不混入该因子；是教师感知的目标达成，非客观学生成效 |

`Q22 / Cluster2_14`三项时间分配与`Q23 / Cluster2_16`十五项实践，已逐原文、题干、选项、目标班级语境核对TALIS2024。它们与[#569](https://github.com/caohuibj/eduK12-new-version/pull/569)的ISCED2内容相同，**直接引用该分支`2a5e57fadbc5b578594b2feb0ab661578e2de379`既有原生Form，不新建5份同题模板**：

| TKS来源位置 | 既有模板key | 本次动作 |
| --- | --- | --- |
| Q22A–C，3项 | `talis2024_time_allocation_isced2_teacher_self_en` | 复用；100%常数和约束不变 |
| Q23A–D，4项 | `talis2024_clarity_isced2_teacher_self_en` | 复用完整清晰教学原项组 |
| Q23E–H，4项 | `talis2024_cognitive_activation_isced2_teacher_self_en` | 复用完整认知激活原项组 |
| Q23I–L，4项 | `talis2024_classroom_management_isced2_teacher_self_en` | 复用完整课堂管理原项组 |
| Q23M–O，3项 | `talis2024_other_practices_isced2_teacher_self_en` | 复用描述性实践组，不称官方单一尺度 |

每条共享引用保存原Form定义的规范化SHA256和TKS别名，不改旧模板名称、代码、题项或修订号。别名是本次交付的来源映射，**不是平台已新增的别名UI功能**。共享模板可以同时属于多个母工具；保留TALIS前缀体现原已建模板身份，TKS普通组合和4个新表单统一以“OECD TKS2024｜…”命名。

排重基线为实际main `25d812d1f024bcc375b738235dd400654c679ff4`：当时235份`source.json`及现有intake文件检索TKS、Teacher Knowledge Survey、原变量/措辞，另检查开放PR名称并重点读取#569原文/原生参数。7个TALIS2018注册版本为Q41课堂扰乱、Q28发展障碍、Q48参与、Q33交流、Q34三效能，不覆盖本次新增Q24–27；#569只覆盖共享Q22/23。Q24–27也与TALIS核心2024 Q53/55/56/58共享来源，记录这个关系，不宣称22道原创题。提交前快进至`6cad86d8f721a45a47a91290edf1523519d1d239`（245份source.json），新增SEEQ条目不重合，所消费schema/锁/原生Form文件未变。没有声称已逐题读取所有无关开放PR，也没有生产/管理员自建排重结论。目标库已有相同公共变量/原题的包时应继续引用它，不再创建。

## 计分和报告边界

Q24–26选项保持`Never or almost never / Occasionally / Frequently / Always`，Q27保持`Not at all / To some extent / Quite a bit / A lot`。原始1–4只是选项代码，原生选项不带`score`；没有反向题转换、求均分或总分。Q24–26数值更大仅表示自报更频繁，Q27仅表示自报达成程度更高；不能变成“更优秀教师”。矩阵不答的行保留缺失，不当作“从未”或0，不能做中位数填补。无分表单没有量表分数范围、等级或能力结论。

TKS官方T4CLAIN/T4COGAC/T4CLASM/T4ADLE/T4PBLE/T4FULFIL为CFA因子分，技术报告采用lavaan经验贝叶斯模态估计、固定池化结构参数、至少2项响应，再按ISCED2数据标准化（原项中点对应10、标准差2）。0/1项响应不作分数插补。本次**没有实现或验证这一整套官方参数链**，因此不冒充已导入可计分Scale，也不拿普通原始均分替代。采用现有Form完成允许的无分描述；缺常模或独立施测效度并不是无分Form的额外门禁。将来若需官方分数，应按既有C/P/R流程另做具体参数和算法验证，不修改此处无分版本。

知识测验在p24明确删节，39题正文、正确答案及完整作答原件未公开取得，**零知识题导入、零知识评分/合理值生成**。Q15为“在教学中能做到什么”的效能感，部分衍生TSES，未纳入本实践模块，也不把它当作知识或实际能力。Q20/21班级人数和敏感组成、背景信息、专业学习与职业状态均不扩入本片。

原创教师反馈见[teacher-feedback.md](teacher-feedback.md)，逐题记录和可行微行动，涵盖常见情况、困难与信息不足。接收者是该教师本人，或在既有授权与汇总条件允许时的改进团队；没有学生报告，没有新增个体披露、匿名豁免、发布权限或最小人数规则。无分Form原生`COLLECTION_ONLY`，这里是可审核的配套解释文案，**不是已经渲染上线的评分报告版本**。

## 标签、组合和许可

新增4份Form和1份普通组合使用现有`tags`：`family:tks24`、`role:teacher_self`、`level:isced2`、`lang:en`、`wave:tks2024`、`use:reflection`、`state:research`、`source:oecd`。5份共享的合成库**本人创建DRAFT**只补充`family:tks24`、`wave:tks2024`，保留原8个TALIS标签，恰为10项；回读确认题文/items和原生revision未变。这是检索元数据，不能据此宣称两调查等值或生成跨调查总分。当前Form模板标签编辑API尚不接受`FORM_TEMPLATE`，隔离验证以owner+DRAFT+现值条件限制更新已有tags列；普通问卷用现有`updateCatalogTags`。不添加产品接口或权限，也不称UI已支持这一操作。

普通组合`tks2024_practice_context_isced2_teacher_self_en`顺序Q22→Q23四组→Q24→Q25→Q26→Q27，共9个原生FORM项目。实际`importFormTemplate`复用来源快照，组合instruction保存TKS来源和选班说明；没有新Bundle协议、评分报告包、分析协议或跨工具总分。目标库使用前先有#569的五份ISCED2模板；它们缺失时明确补该已有内容，不能偷偷生成TKS同题替身。这里只依赖既有导入能力，没有新增产品门禁。

TKS数据库页面“Using and citing these questionnaires”**专门将这些题本的使用引向**[OECD Terms & Conditions](https://www.oecd.org/en/about/terms-conditions.html)，并给出本删节问卷的OECD(2024)引用。PDF仍有`Restricted Use – À usage restreint`页脚，已如实保留来源记录；本片不是仅凭“可以公开下载”推断许可。适用的是当前题本专门指向的署名复制/改编规则：OECD自有英文文字在§1.1/1.2两时间区间均允许署名复制/改编；原件未明确给出具体首次发布时间，故**不擅称本问卷CC BY4.0**。只选这里核实的英文实践文字，排除知识试题、整本PDF、OECD标志/封面和第三方TSES效能内容。没有新商业中文题文翻译或接受需用户签署的许可。版权©OECD，原作者引用和改编声明附在每份新增Form instruction，组合亦保留TKS引用：

> This is an adaptation of an original work by the OECD. The opinions expressed and arguments employed in this adaptation should not be reported as representing the official views of the OECD or of its Member countries.

## 验证、执行范围与下一步

[validation.json](validation.json)记录真实原生`createFormTemplate/addItem/detail`和普通`create/importFormTemplate/update`调用、所有者/草稿/不公开状态、标签和来源哈希。使用本线程现存隔离PostgreSQL16.15合成库`eduk12_talis24_test`，不复制共享题库；新增4份Form22行和1个9题块组合，复用5份/18个来源位置。24个原生Form回答边界检查覆盖四类完整/部分/全缺失与非法选项；未答不生成分数。五份旧模板另做只读内容对比及受限标签元数据更新，确认内容和revision不变。Q22常数和边界的相同输入证据复用#569已验证结果，不重复跑。没有真实学生/教师数据、Attempt、FINAL、访问令牌或公开投放。

本地第一次准备因backend工作目录下相对路径错误，未复制/运行脚本即失败；修正路径后实际导入一次PASS，记录在validation，不抹掉失败。Q27 PDF布局文本提取把多行选项按横向交错，改用同页原始阅读顺序提取并视觉核对；没有改选项来迁就检查器。

[reproduce-native-import.ts.txt](reproduce-native-import.ts.txt)为现有隔离库重现配方，不是生产自动导入器；从仓库根复制到backend目录后，在该目录执行，显式设置隔离`DATABASE_URL`、`NODE_ENV=test`、`QUESTIONNAIRE_PRODUCTS_ENABLED=true`、`BACKGROUND_WORKERS_ENABLED=false`。它复用已有#569模板，需要同一个合成所有者fixture；无生产权限。当前schema、锁文件、Form service/runtime与实际复用Prisma client输入相同，未修改共享node_modules、代码、schema或依赖。普通组合及FORM模板的原生修订号和合成UUID仅作证据，不能复制UUID到生产。

修改组件→本母工具许可范围内的英文Form参数、来源映射、教师文案和隔离证据；必要检查→题文/选项/共享源哈希、原Form schema与答题边界、原生导入/回读和标签/组合；主要位置→本隔离云端，已通过；相同输入不复验，后续CI按既有纯内容路由处理缺失项，预算约5分钟。未改应用/锁/schema/registry，不跑全前后端、构建或生产测试。已实际读取Qiang连接的Notion《CI常见错误清单》，按CI001/003/006/020核隔离库、输入闭包、真实合成owner和精确SHA；不伪造人类独立评审。正式CI状态由真实run决定，本地PASS不冒充CI成功。

管理员后续先在实际目标库按作者/原变量/题文/语言/角色排重，确认#569共享模板是否已存在，再以既有流程导入新增4份Form和可选组合；按实际可用权限处理Form标签，确认教师接收者、用途说明和合法投放范围。需要官方尺度分数时另补完整算法链；现有无分内容可按许可范围使用。主线统一协调合并，本线程不merge、不写生产、不部署。
