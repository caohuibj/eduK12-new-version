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

---

## 4. P1 扩展任务来源与 Gate

| testType | 主要来源 | 初始状态 | 额外 Gate |
|---|---|---|---|
| `trailmaking` | PEBL executive battery：https://pmc.ncbi.nlm.nih.gov/articles/PMC3705215/ | research-only | 鼠标/触屏设备差异与路径绘制 pilot |
| `wordlist` | 儿童纵向神经心理电池中的 list learning：https://pmc.ncbi.nlm.nih.gov/articles/PMC2602743/ | DRAFT | 自有中文词表、词频/年龄、输入与错别字规则；不复制 CVLT/RAVLT |
| `lexicaldecision` | 作为常见语言加工范式收录；具体中文词库来源在 PR12 前补齐 | DRAFT | 词频、字长、地区差异、伪词生成与许可审核 |
| `emotionrecognition` | NIH Toolbox Emotion Battery 总体方法背景：https://pmc.ncbi.nlm.nih.gov/articles/PMC3982906/ | DRAFT | 肖像/绘图许可、文化/年龄/类别平衡；无 norm |
| `reversallearning` | 先作为概率学习研究范式，PR11 前补充具体儿童/青少年实现来源 | research-only | 反馈概率、阶段长度、策略/遗漏解释 pilot |
| `bart` | BART 重测研究：https://pmc.ncbi.nlm.nih.gov/articles/PMC4244869/ | research-only | 不输出好坏；不进入 K12 核心协议 |

PR11/PR12 开始前，表中仍写“补齐”的条目必须升级为具体原始研究和最终 stimulus/内容记录；否则代码可以 DRAFT 合入，但 config 不得 PUBLISHED/recommended。

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
