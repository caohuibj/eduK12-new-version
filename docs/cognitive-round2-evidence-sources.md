# Round 2 认知任务证据、刺激来源与声明边界

**状态**：PR0 证据基线

**适用范围**：`docs/design-cognitive-round2-executable-pr-plan.md` 中的 Round 2 新任务

**用途**：给产品、内容、心理学和工程评审提供同一份来源与限制清单；不是常模手册，也不是临床效度声明。

---

## 1. 使用原则

1. 文献用于选择常见范式、核心构念、候选指标和最低实施注意事项，不把论文中的样本统计量自动变成本地常模。
2. 任务名使用通用范式名称；不得复制 NIH Toolbox、CANTAB、Raven、Wechsler 等商业或受保护产品的题目、图片、指导语、计分转换、常模或商标化呈现。
3. PUBLISHED config 必须钉死 `stimulusSetVersion`、engine/scoring/report versions 和三档 Profile；刺激变化发布新版本，不原地改历史。
4. 初始 `referenceMode: none`。只有协议、年龄带、施测方式和来源完全匹配且经过审核时，才能单独发布 criterion/literature/local reference。
5. 所有任务先输出本次任务内的可观察指标；不输出 IQ、诊断、正常/异常或教育处分建议。
6. 开放获取不等于可商用。每个实际刺激集仍须记录许可文本、下载日期、原作者/仓库和允许的使用范围。

---

## 2. 核心领域依据

NIH Toolbox 认知电池的专家设计优先覆盖执行功能、情景记忆、语言、加工速度、工作记忆和注意；儿童验证电池使用 DCCS、Flanker、Picture Sequence Memory、Pattern Comparison、List Sorting 等任务覆盖明确能力，而不是先产生一个任意加权总分。

- Weintraub et al. Cognition assessment using the NIH Toolbox: https://pmc.ncbi.nlm.nih.gov/articles/PMC3662346/
- Akshoomoff et al. NIH Toolbox large developmental sample: https://pmc.ncbi.nlm.nih.gov/articles/PMC3925365/
- Mungas et al. NIH Toolbox factor structure: https://pmc.ncbi.nlm.nih.gov/articles/PMC3950958/

产品侧只借鉴 PsyMetrics “按目标能力选择经过验证的测量内容并生成针对性报告”的结构，不复制其题库或商业解释：

- https://psymetrics.ai/platform/our-platform/
- https://psymetrics.ai/science/
- https://psymetrics.ai/solutions/assessments/cognitive/

---

## 3. P0 核心任务证据卡

### 3.1 `patterncompare`

**用途**：加工速度；主要测量限时内正确比较数量，同时受视觉搜索和动作速度影响。

**主要来源**：

- Carlozzi et al. NIH Toolbox Pattern Comparison Processing Speed Test: https://pmc.ncbi.nlm.nih.gov/articles/PMC4425122/
- 儿童/青少年可行性研究明确指出该任务也有 psychomotor demand：https://pmc.ncbi.nlm.nih.gov/articles/PMC9817474/

**Huisurvey 转化**：使用自有几何图形生成器；same/different、左右位置和视觉复杂度按 seed 平衡。输出 correct/minute、accuracy、正确 RT 和 lapse，不使用 NIH composite score 或年龄常模。

**刺激策略**：内部生成 SVG/Canvas 几何组合；记录 generatorVersion、shape vocabulary 和 item seed。无需外部图片许可。

**不可声称**：纯粹神经加工速度、智力速度或年龄校正标准分。

### 3.2 `flanker`

**用途**：干扰控制，以及在冲突刺激下维持正确目标选择。

**主要来源**：

- NIH Toolbox 儿童验证与任务结构：https://pmc.ncbi.nlm.nih.gov/articles/PMC3925365/
- DCCS/Flanker 儿童重测与效度研究：https://pmc.ncbi.nlm.nih.gov/articles/PMC8282650/

**Huisurvey 转化**：使用自有箭头/几何方向刺激；congruent/incongruent、方向、正确键和前序条件平衡。主要指标为 flanker effect 与 incongruent accuracy，速度解释必须同时满足准确性质量门。

**刺激策略**：内部 SVG；不复制 NIH 鱼形、布局、指导语或计分算法。

**不可声称**：等价 NIH Flanker 分数或单独诊断注意/抑制困难。

### 3.3 `cardsort`

**用途**：规则切换、认知灵活性和切换后的持续错误。

**主要来源**：

- NIH Toolbox DCCS 结构与儿童发展样本：https://pmc.ncbi.nlm.nih.gov/articles/PMC3925365/
- Developmental extension 的可靠性和适用性限制：https://pmc.ncbi.nlm.nih.gov/articles/PMC8282650/

**Huisurvey 转化**：自有颜色/形状卡片和明确 cue；服务端从 seed 重放当前规则、repeat/switch 和正确目标。输出 switch cost、switch accuracy 和协议定义的 perseverative error。

**刺激策略**：内部 SVG；颜色必须同时有形状/文字 cue，避免只靠颜色区分。

**不可声称**：Wisconsin Card Sorting Test 或 NIH DCCS 的等价版本。

### 3.4 `digitbackward`

**用途**：对短序列进行倒序操作，补齐 Round 1 forward digit span 只有 storage 的缺口。

**主要来源**：

- Woods et al. computerized forward/backward Digit Span 及计分可靠性：https://pmc.ncbi.nlm.nih.gov/articles/PMC2978794/
- Kofler et al. 儿童 Digit Span Backward 构念效度与传统停止规则的限制：https://pmc.ncbi.nlm.nih.gov/articles/PMC5743590/

**Huisurvey 转化**：独立 testType；每级两条不重复序列，服务端验证完全倒序；同时保留 span 与 totalCorrect，避免只用单一 all-or-none span。

**刺激策略**：数字由 seed 生成；限制连续重复和简单升降序模式。

**不可声称**：完整工作记忆能力、Wechsler 等价值或年龄标准分。

### 3.5 `picturesequence`

**用途**：事件/图片顺序的学习与即时保持。

**主要来源**：

- NIH Toolbox Picture Sequence Memory 开发与验证：https://pmc.ncbi.nlm.nih.gov/articles/PMC4254833/
- 儿童在线任务的施测结构描述：https://pmc.ncbi.nlm.nih.gov/articles/PMC9817474/

**Huisurvey 转化**：自有、文化适宜的日常场景图片；多轮学习后用点击顺序排序（兼容触屏与键盘，不强制拖放）。服务端计算 adjacent-pair、position 与 learning gain；科研档延迟结果缺失时保留 null。

**刺激策略**：原创插画或明确可商用资产；每套故事记录图片、正确顺序、内容审核和 stimulusSetVersion。

**不可声称**：NIH PSM 等价值、广义情景记忆诊断或使用 NIH 年龄常模。

### 3.6 `pairedassociate`

**用途**：图形—位置或图形—图形配对学习，补充序列记忆以外的视觉学习证据。

**主要来源**：

- 儿童平板化 Pair Test 的效度和可靠性：https://pmc.ncbi.nlm.nih.gov/articles/PMC8062426/
- 12 岁儿童视觉 Paired Associates Learning 的任务结构：https://pmc.ncbi.nlm.nih.gov/articles/PMC5847423/
- 远程儿童图像配对任务可行性：https://pmc.ncbi.nlm.nih.gov/articles/PMC10203931/

**Huisurvey 转化**：使用自有抽象图形与位置，不复制 CANTAB 的界面、图案、阶段或评分名。按轮记录正确数、错误数、learning slope 和 trials-to-criterion。

**刺激策略**：内部几何/图标；图形须通过可辨识度 pilot，不含语义线索时明确标注 nonverbal set。

**不可声称**：CANTAB PAL 等价值、海马功能结论或临床记忆分类。

### 3.7 `matrix`

**用途**：抽象规则归纳和流体推理任务表现。

**主要来源**：

- MaRs-IB 开放矩阵项目及青少年数据：https://pmc.ncbi.nlm.nih.gov/articles/PMC6837216/
- Open Matrices Item Bank 开发与验证：https://pmc.ncbi.nlm.nih.gov/articles/PMC9326670/
- ICAR public-domain 项目说明：https://icar-project.com/attachments/download/60/Intelligence%202014.pdf

**Huisurvey 转化**：优先使用内部 item generator；若采用 MaRs-IB，必须确认非商业许可与本项目使用场景兼容，不能因“open access”直接进入商业 PUBLISHED seed。题目记录 ruleFamily、difficulty、唯一解证明和 review 状态。

**刺激策略**：内部生成优先；两名内容审查者独立解题，冲突 item 不发布。

**不可声称**：Raven、IQ、一般智力或 MaRs-IB 常模；MaRs-IB 作者也明确其项目不应在进一步验证前视作规范化智力测量。

### 3.8 `mentalrotation`

**用途**：在不同角度和镜像干扰下的视空间旋转判断。

**主要来源**：

- 儿童 mental rotation 与 perspective taking 任务的可靠性比较：https://pmc.ncbi.nlm.nih.gov/articles/PMC10455310/
- ICAR 的 spatial rotation 公共范式背景：https://icar-project.com/attachments/download/60/Intelligence%202014.pdf

**Huisurvey 转化**：自有非语言几何对象；平衡角度、same/mirror、方向和正确键。年龄过低时可能接近猜测，因此 practice 理解门和 K7–K12 pilot 是发布条件。

**刺激策略**：内部 Canvas/SVG 生成；保留 object family、angle、mirror 和 generatorVersion。

**不可声称**：完整空间智力、导航能力或 ICAR 等价值。

### 3.9 `tower`

**用途**：look-ahead、最短路径效率、首步计划时间和规则遵守。

**主要来源**：

- 健康青少年 Tower of London 发展研究：https://pmc.ncbi.nlm.nih.gov/articles/PMC4203700/
- 儿童 Tower/执行任务重测与练习效应：https://pmc.ncbi.nlm.nih.gov/articles/PMC3105625/
- 儿童 Paired Associates/Tower-style planning 的任务描述：https://pmc.ncbi.nlm.nih.gov/articles/PMC5847423/

**Huisurvey 转化**：内部生成状态空间、目标状态和最短路径；服务端逐步重放 move。将 solved/minimum moves、excess moves、first-move latency、rule violations 分开，不混成“计划总分”。

**刺激策略**：自有圆盘/容器图形和题库；每题由求解器在 seed 阶段确认可解、最短步数和难度标签。

**不可声称**：商业 Tower of London/Stockings of Cambridge 等价值；重复测试必须提示练习效应。

### 3.10 PR3 刺激实现记录（待 pilot）

| testType | stimulusSetVersion | sourceType | 实现与当前状态 |
|---|---|---|---|
| `patterncompare` | `geometric-v1.0.0` | internal-generated | 圆/方/三角、填充、标记数和带方向标记的旋转组合；seed 决定每个试次，same/different 成对平衡；config 保持 DRAFT |
| `flanker` | `arrows-v1.0.0` | internal-generated | Unicode/CSS 箭头；每四试次精确平衡 congruence、目标方向和正确键；config 保持 DRAFT |
| `cardsort` | `geometric-cards-v1.0.0` | internal-generated | 红/蓝与圆/星的双线索卡片，颜色同时有文字标签；switch 试次使用两规则冲突刺激；config 保持 DRAFT |

以上三套刺激不含第三方图片。进入 PUBLISHED 前仍须完成第 6 节要求的 K7–K12 内容、可访问性和 pilot 审查；当前记录不等于发布许可。

### 3.11 PR4 刺激实现记录（待 pilot）

| testType | stimulusSetVersion | sourceType | 实现与当前状态 |
|---|---|---|---|
| `digitbackward` | `digits-v1.0.0` | internal-generated | Session seed 生成不重复数字序列，并排除明显连续升降序；服务端验证完全倒序；config 保持 DRAFT |
| `picturesequence` | `daily-scenes-v1.0.0` | internal-generated | 三套各 15 项的校内日常场景卡；使用内部 SVG 图形与文字双编码，正确故事顺序由 seed 选择；config 保持 DRAFT |
| `pairedassociate` | `nonverbal-pairs-v1.0.0` | internal-generated | 18 个内部抽象符号与位置网格，seed 冻结项目—位置映射；不复制 CANTAB 图案或布局；config 保持 DRAFT |

三套实现目前只完成工程一致性验证。`daily-scenes-v1.0.0` 尚需 K7–K12 学生对场景顺序的可理解性与文化内容审核；`nonverbal-pairs-v1.0.0` 尚需符号可辨识度、色觉无关性和设备尺寸 pilot。审核前均不得改成 PUBLISHED 或 `recommendedForCreate`。

### 3.12 PR5 题库实现记录（待内容双审与 pilot）

| testType | stimulusSetVersion | sourceType | 实现与当前状态 |
|---|---|---|---|
| `matrix` | `matrix-generator-v1.0.0` | internal-generated | 24 个内部抽象 3×3 项目（两行完整示例、第三行缺项），覆盖 progression / alternation / combination 三个规则族与三档难度；生成器验证在这三类定义规则中只有目标规则能同时解释两行示例，每题固定四选一；config 保持 DRAFT |
| `mentalrotation` | `rotation-objects-v1.0.0` | internal-generated | 4 个内部折线对象族，平衡 same/mirror 与 0°/45°/90°/135°/180°；Session seed 选择并排序 item；config 保持 DRAFT |
| `tower` | `three-peg-tower-v1.0.0` | internal-generated | 三圆盘、三柱状态空间，内部 BFS 为每题冻结最短步数；服务端逐步重放合法/非法 move；config 保持 DRAFT |

这些题库不包含 MaRs-IB、ICAR、Raven、Tower of London 或其他商业题册内容。`matrix-generator-v1.0.0` 进入 PUBLISHED 前仍须由两名内容审查者独立确认每题唯一答案；三套题库都须完成 K7–K12 可理解性、设备交互和练习效应 pilot。本表仅证明来源与版本边界，不等于内容审核签字。

---

## 4. P1 扩展任务来源与 Gate

| testType | 主要来源 | 初始状态 | 额外 Gate |
|---|---|---|---|
| `trailmaking` | PEBL executive battery：https://pmc.ncbi.nlm.nih.gov/articles/PMC3705215/ | research-only | 鼠标/触屏设备差异与路径绘制 pilot |
| `wordlist` | 儿童纵向神经心理电池中的 list learning：https://pmc.ncbi.nlm.nih.gov/articles/PMC2602743/ | DRAFT | 自有中文词表、词频/年龄、输入与错别字规则；不复制 CVLT/RAVLT |
| `lexicaldecision` | 中文词汇判断与词频/字长研究：https://pmc.ncbi.nlm.nih.gov/articles/PMC4841330/ | DRAFT | 自有词库、词频、字长、地区差异、伪词生成与许可审核 |
| `emotionrecognition` | NIH Toolbox Emotion Battery 总体方法背景：https://pmc.ncbi.nlm.nih.gov/articles/PMC3982906/；东亚面孔表达资料：https://pmc.ncbi.nlm.nih.gov/articles/PMC9658752/ | DRAFT | 合成面孔资产、文化/年龄/类别平衡、跨文化表达限制；无 norm |
| `reversallearning` | 先作为概率学习研究范式，PR11 前补充具体儿童/青少年实现来源 | research-only | 反馈概率、阶段长度、策略/遗漏解释 pilot |
| `bart` | BART 重测研究：https://pmc.ncbi.nlm.nih.gov/articles/PMC4244869/ | research-only | 不输出好坏；不进入 K12 核心协议 |

PR11/PR12 开始前，表中仍写“补齐”的条目必须升级为具体原始研究和最终 stimulus/内容记录；否则代码可以 DRAFT 合入，但 config 不得 PUBLISHED/recommended。

### 4.1 PR12 `trailmaking`

**范式来源**：采用 Trail Making 的数字顺序与数字—字母交替结构，参考 PEBL executive battery 的开放范式实现记录：https://pmc.ncbi.nlm.nih.gov/articles/PMC3705215/。该来源只用于确认范式和实施注意事项，不复制商业题册、题目布局或计分转换。

**自制刺激策略**：`trailmaking-generated-v1.0.0` 使用内部生成的 12/24 项字母数字目标集合和固定网格位置；Session `randomSeed` 冻结每一部分的目标顺序。正式 payload 只记录目标 ID、相对时间、粗粒度 pointer/device 类别和中断状态，不保存坐标轨迹、User-Agent、屏幕指纹或设备标识。

**Pilot 要求**：至少覆盖鼠标、触屏、触控笔和键盘可访问路径；比较桌面、平板和手机上的可读性、误触、单步超时和完成率。Pilot 必须区分动作速度、设备和指针方式影响，不能把设备差异当作 motor 能力证据。

**不可声称**：不输出神经心理学 Trail Making 等价值、motor 能力结论、执行功能诊断、年龄常模或百分位。当前 config 为 `DRAFT`、`referenceMode: none`、`recommendedForCreate: false`；只有设备/年龄带 pilot、可访问性、重测和内容审查通过后才能创建新的 PUBLISHED configVersion。

### 4.2 PR12 `reversallearning`

**范式来源**：采用固定 acquisition/reversal 两阶段的概率反馈学习范式；阶段长度、反馈概率和连续正确 criterion 作为协议参数冻结，首版不运行时自适应停止。任务名和指标仅描述本次选择、反馈、准确性、遗漏与反转成本，不宣称等价于任何商业神经心理电池。

**自制刺激策略**：`reversal-symbols-v1.0.0` 使用内部生成的两种非语言符号和左右位置。服务端按 Session seed 重建每个 trial 的位置、潜在正确选项和反馈 roll；客户端只提交 `choice`、`rtMs` 和 `interrupted`，不提交阶段、正确答案或反馈结论。

**Pilot 要求**：分别在青少年和成人样本检查 acquisition/reversal 的有效试次比例、反馈概率理解、遗漏、恒定选择、criterion 达成率、左右位置偏好、设备输入延迟和中断恢复。Pilot 方案在开始前应记录两段 criterion 的预期达标率和允许的不足比例；若大量样本因固定 criterion 进入 `insufficient`，应作为协议/pilot 结果复核，不把它误判为实现缺陷。criterion 未达到时指标必须保持 `null`，不得改写为零或解释为人格特征。

**不可声称**：不输出人格、冲动性、风险偏好、学习能力等级、诊断、IQ、年龄常模或百分位；`reversalCost` 只表示本任务两阶段准确性差异。当前 config 为 `DRAFT`、`referenceMode: none`、`recommendedForCreate: false`，不进入 Domain mapping、Evidence、Recommendation 或综合分析协议。

### 4.3 PR12 `bart`

**范式来源**：参考 BART 的重测和信度研究记录：https://pmc.ncbi.nlm.nih.gov/articles/PMC4244869/。工程实现使用虚拟泵压计数，不产生真实货币、奖品或课程奖励，也不复制商业 BART 的刺激素材、奖励规则或常模。

**自制刺激策略**：`bart-generated-v1.0.0` 使用内部生成的 balloon 序列和 seed 冻结的爆破阈值。服务端根据阈值验证 cashout/explosion 一致性；未完成 balloon 只计遗漏，不推断爆破。首版阈值范围为 `1..maxPumps`，因此 0 泵现金化是合法的未泵压行为，不表示爆破或异常。正式 payload 只保存泵压数、完成、现金化和中断状态。

**Pilot 要求**：覆盖青少年和成人、鼠标/触屏/键盘可操作路径，检查动画节奏、超时、现金化理解、连续泵压模式、设备误触和 outcome 恢复。Pilot 只能评估协议可用性、数据完整性和重测特征，不能把指标转换为风险分层。

**不可声称**：所有 BART 指标均为 `descriptive`；报告只描述泵压、爆破、现金化、遗漏和中断，不显示“任务表现指数”，不输出“风险高/低”“好/坏”、冲动性等级、人格判断、临床结论或处分建议。当前 config 为 `DRAFT`、`referenceMode: none`、`recommendedForCreate: false`，不进入任何已发布 ReportPackage 或综合分析。

### 4.4 PR13 `wordlist`

**范式来源**：参考儿童纵向神经心理电池中的 list-learning 结构：https://pmc.ncbi.nlm.nih.gov/articles/PMC2602743/。该来源只用于确认学习轮次、即时/延迟回忆的范式边界；本实现不复制 CVLT、RAVLT 或其他商业词表、指导语和常模。

**自有刺激与版本**：`chinese-wordlist-v1.0.0` 是仓库内自有中文词库，当前实现位置为 `server-version/backend/src/modules/cognitive/pr13-stimuli.ts`，前端以同版本的本地确定性镜像重放。体验、标准、科研 profile 分别使用 8/12/15 词和 2/3/5 轮；科研版延迟等待初始值为 60 秒。词条按短、具体、日常可理解方向建立，不声明代表任何年龄常模或语言地区人群。`wordlist-normalization-v1.0.0` 仅执行 Unicode NFKC、空白/标点清理和英文字母大小写归一，不做繁简转换、同义词匹配或未经 pilot 证明的模糊纠错。

**Pilot 要求**：分别检查青少年和成人对指导语、键盘自由输入、中文输入法、标点/空白、错别字规则和延迟阶段的理解；记录空回忆、侵入词、重复输入、输入法差异、设备中断和延迟等待完成率。Pilot 必须覆盖键盘可访问性和不同中文输入环境，不把输入速度直接解释为记忆能力。

**不可声称**：不输出记忆能力等级、临床记忆结论、IQ、年龄常模、百分位、学习障碍或语言能力诊断。当前 config 为 `DRAFT`、`referenceMode: none`、`recommendedForCreate: false`，延迟阶段不完整时延迟指标保持 `null`，不伪造为零。

### 4.5 PR13 `lexicaldecision`

**范式来源**：参考中文词汇判断与词频/字长效应研究：https://pmc.ncbi.nlm.nih.gov/articles/PMC4841330/。该来源用于词汇判断范式、词长与词频带的研究背景，不把本任务当作原研究的复现，也不复制其刺激、常模或评分阈值。

**自有词库与伪词策略**：`zh-lexical-v1.0.0` 维护在 `server-version/backend/src/modules/cognitive/pr13-stimuli.ts`，包含 2/3 字和 high/medium/low 六个分组，每组当前冻结 30 个真词，共 180 个真词。伪词由 `zh-pseudoword-generator-v1.0.0` 在构建阶段使用内部字符池生成，并以 `server-version/backend/src/modules/cognitive/pr13-lexical-bank.ts` 和前端镜像 `server-version/frontend/src/modules/cognitive/tasks/shared/pr13LexicalBank.ts` 的 checked-in manifest 冻结为 180 个条目；运行时只按 Session seed 从冻结 bank 取样，不再动态生成。词频带是内部粗粒度标签，不是外部标准化频率分数；前端不保存或提交真实词文本以外的权威正确答案，服务端复核 stimulus ID、词长、词频带和生成器版本。

**许可与审查**：词库为项目自有内部数据，伪词为项目自有生成结果；当前不引入第三方词表文件。checked-in manifest 已锁定版本和条目，当前内容审查状态仍为 DRAFT/待双人复核；进入 PUBLISHED 前须完成中文地区/年龄可理解性、字长和频率带双人复核，排除专名、歧义词、禁用词和可能被误认为真词的伪词，并在不同键盘/触屏设备上检查 RT floor、输入延迟和遗漏率。审查人、日期和禁用词清单须写入本版本发布审查记录。

**不可声称**：不输出阅读能力、词汇量、语言障碍、智力、年龄常模或百分位结论。`dPrime`、词频带正确率和真词/伪词反应时差只描述当前冻结任务中的响应。当前 config 为 `DRAFT`、`referenceMode: none`、`recommendedForCreate: false`，不进入 Domain mapping、Evidence、Recommendation 或 ReportPackage。

### 4.6 PR13 `emotionrecognition`

**范式与文化背景来源**：任务采用六类基本情绪分类的研究范式背景，参考 NIH Toolbox Emotion Battery：https://pmc.ncbi.nlm.nih.gov/articles/PMC3982906/；东亚面孔表达数据库研究：https://pmc.ncbi.nlm.nih.gov/articles/PMC9658752/；跨文化情绪表达差异研究：https://pmc.ncbi.nlm.nih.gov/articles/PMC3358835/。这些资料只用于范式、内容和文化限制审查，不能当作本项目常模或发布依据。

**自有 AI 生成资产**：`emotion-faces-ai-zh-v1.0.0` 位于 `server-version/frontend/src/assets/emotion-faces-ai-zh-v1.0.0/`，由 20 组虚构、合成、无真实人物对应的亚洲呈现成人身份组成，每组含 `happy`、`sad`、`angry`、`fear`、`disgust`、`surprise` 六类，共 120 个内部 stimulus ID。资产采用 Codex ImageGen 生成流程；生成记录批次为 `pr13-emotion-faces-zh-v1.0.0-batch-01`，统一提示约束为“fictional synthetic adult Asian-presenting identity sheet、六类表情、每组身份保持一致、无真实人物、无文字水印、灰色背景和白色分隔”，具体模型版本由生成服务记录，未将运行时远程 URL 或模型依赖写入产品。当前五个本地 contact sheet 的 SHA-256 为：

| 文件 | SHA-256 |
|---|---|
| `sheet-01.png` | `15973efd8b60c540840c96219f0d2bcb3719e3b2a143c6b6e24d99c6a542dd8d` |
| `sheet-02.png` | `17d2cf7358145cc07c8241bc5ef2e05307c1ed782374c11036b91f9ac3589f04` |
| `sheet-03.png` | `1f3d8368497eade4f835aa10726243bb56ce685fe82317c15a366c881b5b98ea` |
| `sheet-04.png` | `1d5c1da07b65fe075b85283778c6957e97d9b0491412cf6d9a195b65df863b43` |
| `sheet-05.png` | `c387523b3d9d80255ffc2634eefb63c7c9bcd2e214c75d0fc3b9f52aefac1ebe` |

资产为本项目内部生成和内部持有的 DRAFT 资源；不保存或推断参与者族群、身份或面部特征。发布前必须完成生成资产内容审查、年龄可理解性、六类类别平衡、色觉/可访问性、跨文化表达限制和设备尺寸 pilot，并明确记录生成模型、提示词批次、审查人和日期。

**不可声称**：不输出情绪识别能力、共情能力、人格、文化能力、临床状态、智力、年龄常模或百分位结论。报告只描述参与者对当前六类合成面孔的分类响应；当前 config 为 `DRAFT`、`referenceMode: none`、`recommendedForCreate: false`，不进入任何综合分析协议。

---

## 5. 明确排除或延期

### Dot Probe

9,600 人、36 个版本的研究没有发现可重复的非零威胁偏向信度，因此不进入 PUBLISHED 个人报告：

- https://pmc.ncbi.nlm.nih.gov/articles/PMC11949442/

### Emotional Stroop

与已有 Stroop 机制重叠，同时引入情绪词语的年龄、文化和内容风险。只保留未来研究候选，不在 Round 2 核心/扩展 Gate 中承诺。

### IGT

时长、反馈学习、策略变化和解释复杂度较高；Round 2 先用 reversallearning/BART 覆盖研究场景，IGT 延期。

### 语义/音位流畅性

远程实现若用语音，需要新增录音、同意、转写、保留和删除链；若用打字又受输入速度污染。为避免本轮引入一套与核心目标无关的音频隐私工程，延期处理。

---

## 6. 发布审查记录模板

每个 `stimulusSetVersion` 在 PR13 前必须有一行：

| 字段 | 内容 |
|---|---|
| testType | 任务 key |
| stimulusSetVersion | 不可变版本 |
| sourceType | internal-generated / original-illustration / licensed-third-party |
| sourceLocation | 仓库路径或许可证页面 |
| license | 明确许可文本/内部所有权 |
| ageScope | 实际 pilot 年龄/年级，不靠猜测 |
| contentReview | 审查人、日期、结论 |
| psychReview | 构念/指标/不可声称内容审查 |
| accessibilityReview | 色觉、字体、触屏/键盘、指导语 |
| pilotEvidence | 试次完成率、practice 通过率、时长、floor/ceiling |
| publishDecision | DRAFT / PUBLISHED / RETIRED，含原因 |

没有完整记录的刺激集保持 DRAFT。审核记录不是常模，也不得用于产生 percentile。
