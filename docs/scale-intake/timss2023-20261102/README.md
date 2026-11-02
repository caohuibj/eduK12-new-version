# TIMSS 2023：学生课堂体验模块

本轮是**候选待审**：8个原生 `CATALOG_ONLY` 量表目录、4个无分表单元数据候选、4个可选普通组合清单。没有开发库可施测安装、生产入库、公开发布或部署。母工具稳定前缀为 `timss2023_`，不创建母工具总分。

基线为 main `adad907a4b68606ce71bb1a4f2d7c511c872c715`。修改范围只有新目录声明、现有生成索引和本目录说明。来源合同与生成索引 → 发现非法声明、错误身份及过期索引 → 选中内容检查和原生目录只读验证；约2分钟。正式CI若激活，沿现有纯Scale内容轻量路线，约5分钟定位阈值，不修改控制、不启动应用全量检查。

## 针对性复核

[五栏缺口与解决方案](resolution.md)：本范围实际英语题本和原选项完整，PCM/WLE不是题本缺失。许可获准后可先以现有原生无分Form处理8个课堂体验模块及4个活动模块（共66题），无需等待计分引擎。当前没有实际创建Form或导入；非商业、内部数字化、公开再分发、商业及翻译范围分别核实，不要求内部使用一定获得公共GitHub题文分发许可。

## 来源与许可

实际读取了 [NCES美国问卷入口](https://nces.ed.gov/timss/questionnaire.asp)、四／八年级美国英语学生原始PDF、[国际英语四年级和八年级综合科学题本](https://timss2023.org/results/context-questionnaires/)，以及 Yin & Reynolds (2024) [技术报告第15章](https://timss2023.org/wp-content/uploads/2024/12/T23_TR_Chap15.pdf)。八个指数的原项参数、转换常数、原始分等值表分别核对了官方Exhibits 15.3–15.10的对应工作表。下载URL、字节数和SHA-256见 [sources.json](sources.json)。没有把研究附件、摘要或二手论文当题本。

NCES页面要求外部使用前取得NCES和IEA许可；国际问卷页也要求用于测评或学习材料时事先取得许可，并限制复制、分发、翻译。当前没有取得许可，没有代表用户签署条款或发送许可申请。因此PR只登记来源、原项编号和项目原创说明；不提交题文、选项、指导语、PDF、整份计分参数表或译本。受限原始材料只在本执行环境 `/tmp/timss2023-research` 研究使用，不是可移交的授权题库。管理员后续审核不代替权利人的许可。

## 排重与版本边界

[dedup.json](dedup.json) 记录258个声明、235个source.json及26个开放PR的完整分页路径检查（6020条），核对TIMSS、IEA来源、八个官方指数变量和代表性原项内容指纹，未发现本范围既有声明或开放PR同源路径。母线程另已检查十个内容PR来源；既有 `teacher_subject_liking_*` 与TALIS不是本工具。生产DB、管理员自建内容、未登记远端草稿及完整语义同源检查仍未知，不能称生产完全无重复。实际安装前按来源、作者、版本、原项集合再查同义ID；相同内容直接引用既有身份。

本次登记范围为**美国英语2023波次**，四年级和八年级、数学和综合科学分别建身份。国际英语题本只作来源交叉核对，不能当成美国本土化版本或自动生成第二套重复包；其他国家、语言及八年级生物／化学／物理／地球科学分科版本不在本轮。本地中文目录名和报告编辑稿不构成已验证中文版。年级是已核适用队列，不伪造统一年龄界限或常模。

## 子项清单

完整机器清单和统一命名见 [inventory.json](inventory.json)。下表前缀为 `timss2023_`，后缀为 `_student_us_en`；目录身份均1.0.0、catalogManifestVersion均1。它们还没有运行时C（内容）、P（计分参数）、R（报告）版本。

| 中间key | 官方指数／类别 | 美国题号 | 题数 |
|---|---|---|---:|
| instructional_clarity_mathematics_g4 | ASBGICM / ASDGICM | Q21 A–G | 7 |
| disorderly_behavior_mathematics_g4 | ASBGDML / ASDGDML | Q22 A–F | 6 |
| instructional_clarity_science_g4 | ASBGICS / ASDGICS | Q26 A–G | 7 |
| disorderly_behavior_science_g4 | ASBGDSL / ASDGDSL | Q27 A–F | 6 |
| instructional_clarity_mathematics_g8 | BSBGICM / BSDGICM | Q24 A–G | 7 |
| disorderly_behavior_mathematics_g8 | BSBGDML / BSDGDML | Q25 A–F | 6 |
| instructional_clarity_science_g8 | BSBGICS / BSDGICS | Q30 A–G | 7 |
| disorderly_behavior_science_g8 | BSBGDSL / BSDGDSL | Q31 A–F | 6 |

四个原生普通表单候选没有伪装成量表目录：`classroom_activities_mathematics_g4`（Q19、Q21 H–I，共3项）、`classroom_activities_science_g4`（Q24、Q26 H–I，共3项）、`classroom_activities_mathematics_g8`（Q22、Q24 H–J，共4项）、`classroom_activities_science_g8`（Q28、Q30 H–J，共4项）。这些是课堂活动／频率描述，不设得分、反向、诊断、认知激活或教师表现分。未填保留null／未填，不能补零或解释为从不发生。

母工具有四个可选普通组合：同一年级、同一学科的清晰度＋失序行为＋活动表单。清单只保存引用，获得许可并核对原施测语境后再在既有普通组合问卷中选配。指数在整套调查中可以单独计分，不证明裁出原组卷后仍有同样效度；不默认学生先后重复回答多份同内容模块。不引入普通组合之外的新聚合引擎。

## 计分、报告与导入准备

[scoring-notes.md](scoring-notes.md) 说明原计分方向、缺失、范围和官方参数的读取位置。PCM/WLE还没有在EduK12复现核验；不以求和／均分代替官方指数。没有常模或跨学科、跨年级总分。

[report-examples.md](report-examples.md) 给出四／八年级学生与教师接收者分别适用的正常、低体验、证据不足及无分情形。学生报告谈自己的体验，教师报告只用既有权限允许的群体汇总。中文文案是原创编辑草稿，未接入运行时、未产生R冻结版本；正式内容语言与报告语言沿现有独立选择及授权配置，不把中文反馈当中文题本。

现有 `materializeScaleInstrumentContent` 和install入口要求executable；本次目录没有可安装内容，不能为满足“入库”而写入空题目、合成替身或伪称DRAFT可施测。因此无需对空内容跑隔离数据库迁移、计分边界或真实学生流程。选中来源schema／validator、目录注册、不可执行／无runtime policy及materialize前置拒绝只做对应检查，真实结果见 [validation.json](validation.json)。现有完整选中CLI实际返回失败：内置CHEXI的导出函数不在静态依赖解析子集内（`child-chexi-observer-zh-cn-v1.ts:factory-shape`）。错误在八个来源检查之后发生；这些前序完成是从代码控制流推断，没有伪造该CLI成功或每项日志。原生注册／不可执行／materialize前置拒绝探针及实际差异路由独立通过。未修改检查器或切换全平台路线。报告样例是人工内容检查，不冒称真实作答路径、图表或接收者权限测试。

## 管理员最终操作

1. 核对生产库和管理员自建同义来源，重合直接复用；确认选择的国家、语言、波次、年级和学科。
2. 从NCES与IEA取得相应使用、再分发及必要翻译授权，按授权范围保存原件；不从本PR公开元数据推定已有授权。
3. 保留完整原模块语境；确定是否需要独立施测研究。沿现有三版本体系准备内容、参数和报告，核验官方参数与实际缺失模式；无分部分走普通表单。必要的原生能力缺项单独报告，不在本内容PR新造引擎。
4. 按真实接收者和既有规则选择学生反馈／教师群体汇总，不改变匿名、发布或最小人数规则。取得合法内容后的隔离导入、计分与代表性报告验证再记录；本轮不执行发布命令。

当前具体阻碍是NCES／IEA许可未取得、可执行包未准备、官方PCM/WLE未复现、独立施测未验证。题本和官方技术表已实际读到，不误报为缺题本；其他国家语言的精确题本仍未核。未运行CI、合并、生产写库或部署。由于现有CLI静态解析阻碍及Notion连接问题，本PR保留Draft/[skip ci]，正式轻量CI待主线协调；不冒称门禁成功。CI激活前要求读取的Notion错误页 `404d27635a388186ac80de3593da05a5` 在当前连接调用失败（先缺link_id，补字段后Unknown tool），读取状态pending；未假称读取完成，也未绕过连接另建页面。
