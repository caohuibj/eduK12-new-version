# 来源评审方法与证据边界

## 目的和输入

本评审用于为认知任务库选择值得持续研究的公开GitHub来源，不授予复制、入库、部署、诊断或科学效度资格。研究快照为2026-10-25 UTC，20261026仅为交付批次。没有恢复产品编码，也没有运行第三方程序或其测试。

三路原始评审分别核验仓库身份、固定默认分支HEAD、文件树、许可/README及选定实际源码。框架lane记录102份固定SHA文本；浏览器lane记录73份获取/索引文本和2份PDF内容检查；这不表示每行均深审，研究任务库lane没有采用同一文件数口径，故不相加宣称总深审文件数。

| lane | 仓数 | 原始评级 | 处理方式 |
|---|---:|---|---|
| framework | 14 | A2 / B10 / C2 | 区分框架、真实任务示例和生态附属仓 |
| taskbanks | 8 | A4 / B4 | 任务/研究设计价值与直接代码复用分别判断 |
| browser | 12 | A3 / B7 / C2 | 浏览器task/battery，非仅后端或player |
| 合计 | 34 | 不做字母平均 | 统一用途和证据规则，逐条保留原判理由 |

来源评审输入的内容摘要如下，可识别整理所依据的冻结版本；原始完整源码快照不随报告发布。

| 输入文件 | SHA-256 |
|---|---|
| `framework_sources_review.json` | `d3470967d1093cc32209c4c1d1d5c0909f86283fc220408b3dc6d2281ede84ab` |
| `taskbanks.json` | `1ff3cb9925f13619c78a0299b09127537f1b800b235cf84fd1032a0baf0a381a` |
| `browser_batteries.json` | `e0dd70d445610c0105767950f8315097de1b35fcac830804e5331a9653095845` |

## 去重和计数

1. 有GitHub numeric repository ID时以ID为身份线索，同时统一canonical `owner/repo`大小写作去重键。保留了27个ID，其余7仓仅有canonical名称证据，ID保持null，不补造。34个canonical键唯一，已有27个ID也唯一。
2. 三路在发现阶段已经避免主要重叠，本次合并没有再次移除条目。独立仓的同生态关系保留在`related_repository_groups`，不是34个独立battery。
3. 外部OMI仓仅为图像许可证据，不计认知来源仓。ResearchKit、ResearchStack仅是待审线索，没有固定快照记录，不进入34仓/A类数。
4. 仓内目录、任务注册条目、README数、理论范式、独立实现、已入库任务是不同量。尤其MultiTaskBattery的24条、TestMyBrain的16目录、Niv的20个README不直接相加。
5. 项目基线24真实任务、旧Notion18候选页、未提交visualsearch草稿也不与本报告34仓混算。

## 统一证据规则

不用星数、最近更新时间或许可类型代替质量判断；不用伪精确的总分。每个结论都限定到建议取用内容和已审文件。

- **身份和实现**：canonical仓、完整40位SHA、提交日期与真实任务/框架文件相符。仅有演示网页或任务名称不够证明完整battery。
- **协议和计分**：可核条件、练习/正式试次数、反应窗、停止/自适应、原始字段、计分及排除规则；区分教学分、奖励数、研究指标、标准分与常模。
- **可追溯性**：seed/固定试次表、配置与raw数据链；存在随机API或seed变量不等于上游全部随机过程可重放，字段存在不等于保存闭环。
- **时序和异常**：核查时钟/response deadline、首响应锁、长按、遗漏/timeout、失焦/hidden、退出/保存失败。日志存在不等于自动invalid；计时单位毫秒不等于实测精度。
- **工程证据**：只报告测试文件/CI配置存在性及覆盖范围，不把网站构建、容器发布、vendor测试或分析脚本当任务评分测试通过。
- **科学证据**：分别记录软件论文、原始范式、具体版本变更、复现研究和人群效度。原文结果不会自动转移到中文、触屏或改素材实现。
- **适配目标**：React/TS迁移成本只影响工程方式，不否定源码/论文作为方法来源的价值。

### 推荐分层与原评级协调

七个主库重视能持续挖掘的任务覆盖和方法线索；四个专题强调明确、集中的协议/数据/计分契约；jsPsych单列技术底座。A表示这些特定用途值得优先细审，B是补充，C是当前不直接采用成品。原lane分级与理由仍保存在每条`original_lane_rating`。

PEBL、Experiment Factory合集、Niv和Flower原B→统一A，是将主库方法价值从原runtime直接复用成熟度中分开，不删除原工程问题。timelines原A→统一B，是作为jsPsych配套并保留arrow-flanker缺口，不将生态子仓凑成独立主库。其他原级别保留。统一A12由7主库、4专题、1技术底座组成；不是“12个已验证电池”。

### 许可与素材单列

许可文字是本次观察，不是法律保证。代码和素材分别判断：根MIT/Apache/GPL不能自动覆盖外部图像、音频、字体、词表或品牌图案。vendor许可也不能覆盖研究者自写代码。无标准LICENSE但有README复用声明的情形保留原措辞，不粗暴写成“完全无许可”。

NC与SA不降低科学质量；它们影响复制、改编、分发或商业场景是否适合。文献驱动的独立实现可继续研究，但不能复制受限表达/素材或忽略其他权利。授权、具体应用范围和科学协议需分别确定。

## 实查深度

`sampled_task_key_path`共16仓，意思是至少一个实际任务的关键源码路径经静态核对，不是整仓逐行审计。其余18仓为源码/文档抽样，范围以逐条证据为准；不能把两类理解成量化覆盖率。

| 仓库 | 本次关键路径范围 |
|---|---|
| [baranan/minno-tasks](https://github.com/baranan/minno-tasks/commit/f8ceef0b9ec5fcad878e14de2f9720baa8caeef4) | IAT/iat11.js与scorer/nogaScorer.js、示例导出/管理器；其他extensions为覆盖核验，底层Minno运行时另审。 |
| [DiedrichsenLab/MultiTaskBattery](https://github.com/DiedrichsenLab/MultiTaskBattery/commit/d6f49f568872157c1180bf6b22dc5ba255771d79) | 通用Task响应/汇总/TSV、NBack、DemandGrid、NBack生成和随机调用、tests/test_tasks.py；其余仅目录/task_table/类名。 |
| [flowersteam/cognitive-testbattery](https://github.com/flowersteam/cognitive-testbattery/commit/58ba32fa8b582bedac65ef1c037c9974303dbf5c) | Go/No-Go参数、scene响应/计时与CSV出口；其余6项主要覆盖/配置核验。 |
| [manybrainsproject/TestMyBrainCodeRepo](https://github.com/manybrainsproject/TestMyBrainCodeRepo/commit/ec09ea0d35779bb39997131313dfd1380ee34922) | Flanker关键实现及MRMET/EmotionRecognition源码与两份Task Overview PDF；16份字典仅存在性，非全电池深审。 |
| [stmueller/pebl](https://github.com/stmueller/pebl/commit/eb22a0725d765a0597a4905920ad3c603b1c9ae8) | Flanker与Corsi：参数、trial流、计分、论文/版本关系、代码及音频许可。 |
| [embodied-computation-group/dg-metacognition](https://github.com/embodied-computation-group/dg-metacognition/commit/0c38aba4eb720a143d126b7c7d4c313a900bc536) | 仅trivia的runTrial.m、UpdateStaircase.m、triviaGetParams.m；知觉/情景记忆仅目录/README，未深审HMeta-d分析。 |
| [lnccbrown/task-effort](https://github.com/lnccbrown/task-effort/commit/8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba) | experiment/main配置、generateStartingOpts/addData、pressBalloon计时/重复键/奖赏及utils.test.js；其余trial模块/后端未逐一深审。 |
| [nwrim/continuous_recognition_task_jsPsych](https://github.com/nwrim/continuous_recognition_task_jsPsych/commit/b4ad68e5376ee7256763abb622cf06470514edf5) | 唯一任务的序列生成/参数校验/固定时长trial与03_calculate_metrics.py的ISI归属、排除及HR/FAR/CRR；tests仅存在性/小helper。 |
| [expfactory-experiments/stop-signal](https://github.com/expfactory-experiments/stop-signal/commit/04796ee87b083d7a0bd5f8a9ee722ea4d60d5c8e) | experiment.js、poldrack相关plugin、index保存路径与许可；按默认参数/计分/SSD/timeout路径静态审阅。 |
| [jspsych/jspsych-timelines](https://github.com/jspsych/jspsych-timelines/commit/8c93b6a465083a40b66a0c32cba902a65edda01c) | arrow-flanker与Go/No-Go全部task源码和所列tests静态核对；不覆盖所有timeline包。 |
| [laureate-institute-for-brain-research/StimTool3](https://github.com/laureate-institute-for-brain-research/StimTool3/commit/bc26881f66f8798cf019c2c703fd1338b2ac8209) | 仅Horizon/Horizon.py及README的强制/自由选择、固定schedule、reward、event/RT及无超时等待；其他仅目录。 |
| [lucklab/CNTRACS_tasks_public](https://github.com/lucklab/CNTRACS_tasks_public/commit/e641a9e0dfdc50d15a227833fc89bd80f3edf95a) | RL-WM的调度/响应/计分/输出/seed/Session与WM的生成/时序/角误差/TrialHandler；未深审情景/感觉任务；拟合文件仅存在性。 |
| [NCMlab/CognitiveTasks](https://github.com/NCMlab/CognitiveTasks/commit/80efeaeee934bb7b999134e3715d8b7f84c70532) | 仅WCST/WCST_v4.py练习/正式长度、切规则、正确性、RT/按键与结束流程；其他任务仅README/目录。 |
| [open-cogsci/OpenSesame](https://github.com/open-cogsci/OpenSesame/commit/5b2479d556996a5b628e9526eba4a922196a1d84) | Stop-Signal与Attentional Blink示例：.osexp流程、时序、计分与原文差异。 |
| [vrtliceralde/squared_jspsych](https://github.com/vrtliceralde/squared_jspsych/commit/945ad7309c2e4d47953f18f62a206968870be27a) | squared.js公共计时/seed及Stroop Squared刺激、计分、timeout/汇总；Flanker/Simon未逐任务独立深审。 |
| [NYUCCL/psiTurk](https://github.com/NYUCCL/psiTurk/commit/af007240c6f4ee682e63dce0f40ca272913e2a18) | 内置9-trial Stroop：刺激、随机、Date RT、hit输出、trial截止与saveData重试。 |

所有记录的`third_party_code_executed`、`tests_executed`、`browser_timing_measured`均为false。静态可见问题区分如下：

- 明确源码事实可写“字段/分支/公式如此实现”，但只有执行后才能说运行故障已复现。
- NCM结束拼写、CNTRACS Session保存、Flower长按/首响应及PEBL边界等标为静态疑点。
- Argira的已审调用链支持“在依赖加载成功、进入main并响应的条件下尝试外发”；不支持“已成功上传”。不收录外部URL凭据或client key。
- Dyscalc官方预印本线索存在；部分全文访问受限，正式出版状态及归档版本关系未确认。不把访问失败写成没有论文。
- “未见”限定所查目录/文件；没有执行就不写“测试通过”“可用”“时序可靠”。

## 可发布结构

`sources.json`是完整逐仓记录，`sources.csv`是同组记录的扁平投影。字段包括canonical URL、类型、任务例子、固定SHA/日期、代码与素材许可、协议/计分、seed/raw、计时/失焦invalid、维护/测试、科学引用、React/TS适配、实查深度、证据、风险与用途。README只作决策与简明矩阵，不代替完整观察。

公开报告不包含本地工作区路径、用户通信原文、上游源码大段复制、参与者数据、云端连接key或凭据。只保留公开仓/论文链接与本项目必要的非敏感边界说明。

## 一致性核验范围

核对JSON解析、CSV读回与34条唯一canonical/ID、计数与推荐分层、40位SHA/日期/commit URL、GitHub blob链接固定SHA、JSON/CSV逐字段一致、README完整矩阵、已知许可冲突与公开内容检查。此类文档结构核验不是第三方任务执行、CI或部署验证。结果由本轮实际检查记录，不以文档自述代替执行。

### 本轮实际检查结果

- JSON与CSV均为34条，canonical名称不区分大小写唯一；已留存27个numeric ID无重复，其余7个为null。
- 统一A12/B18/C4、主库7/专题4/技术1，以及13/8/9/4用途计数相符；README矩阵覆盖全部34仓。
- 34个完整SHA、提交日期和commit URL结构相符；241条唯一GitHub blob证据链接均固定40位SHA。此项是冻结链接结构/来源一致性检查，不声称本次重新联网逐一验证链接可访问。
- CSV逐项读回与JSON字段一致；四文件whitespace检查干净，CSV保留UTF-8 BOM并使用LF行尾。
- 已知代码/素材许可分层均保留；公开内容模式检查未发现本地私有路径、私有通信链接、连接key/凭据或内部工具引用标记。
- 创建报告前后的29个既有未提交文件哈希与HEAD/分支一致；本轮只有四份报告新增，没有改动暂停的源码、测试、generated或readiness。

这些结果只验证报告结构与范围，不是第三方程序正确性、法律合规、科学效度、CI或部署验收。

### 字段读取提示和独立复核

`priority_shortlist=true`只标记七个主库，不是全部A来源。需要全部优先推荐时，筛选`unified_priority=A`，再按`recommendation_track`区分主库、专题与技术底座；JSON的`field_definitions`列出各字段口径。

另一次只读独立审阅交叉检查了四文件与三份来源评审，未发现阻断交付问题；NC-SA措辞、主库布尔字段定义和CNTRACS的CI观察措辞已据此澄清。该复核同样未执行第三方程序或重新验证其运行结果。
