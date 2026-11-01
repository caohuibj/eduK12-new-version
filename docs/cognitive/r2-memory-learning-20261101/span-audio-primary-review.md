# R2：sentencecheck / seqlearn / letternumseries / visualwm / auditoryrt / auditorynback 范式与模式核查

核查时间：2026-10-31。源码基线与实际 HEAD 均为 `b42393cffe1c4364c1fc5568b656ed612fc60849`，仓库 本次独立报告分支。任务开始时工作树干净，下列runner观察取自当时读取的基线流程；报告完成时，报告文案工作已修改介绍组件接入及task-package并新增participant-presentation-r2，本项只读审核没有把这些后续变更视为已复核。只读源码与公开一手网页；未修改源码、安装依赖、连接数据库或运行大测试。下文是代码推导及来源核对，不是实际被试测量、计时实测或心理测量学验证。没有复制受限试题、原版量表条目或完整受保护施测材料。

## 先处理的实质发现

1. **sentencecheck 的真伪与否定完全混淆。** 当前 `trueRatio=negationRatio=.5`；生成器先建立相同的两组布尔数组，然后对两组施加相同的交换，因此每题 `negated===statementTrue`。所有否定句都相符，所有肯定句都不相符；单看“不是”即可全对。所谓 `negationPenaltyMs` 同时混入真伪条件，不能反馈为否定加工代价。证据：frontend `tasks/sentencecheck/prng.ts:58`（同步交换位于 62–65）。这适用于体验、standard、科研三个档位。
2. **visualwm 练习与正式首题重复。** 练习和正式都调用 `visualwmTrial(randomSeed, trialIndex)`，开始正式不改变种子或 trialIndex，因而新会话中练习刺激/答案在正式第 1 题重复。其 `medianRtMs` 实际纳入错误反应，质量定义却称“正确有效 RT”。证据：frontend `tasks/visualwm/VisualwmTask.tsx:29`、`:113`；backend `scoring/visualwm.v1.ts:47`、`:58`；backend `tasks/visualwm/definitions.ts:40`。
3. **letternumseries 是视觉、固定长度、按钮重排的自编项目变式。** 不应称 WAIS/WISC 原测验、听觉测验、记忆广度或具备原版常模；`definitions.ts:51` 仍有“听呈现时”的错误提示。中断整题从准确率分母剔除，当前前端又强制填满，因此“空回忆”旗标不等于漏答保护。
4. **seqlearn 的科研档依然仅 1 个 10 试次随机块。** 科研效应比较 B6 随机块与 B9+B10 模式块；体验比较 B3 与 B2+B4。其随机块与模式块时点不匹配；不能把差值直接解释成稳定的隐性学习能力。`stimulusMs=1200` 配置未被实际 runner 使用，真正限时由 `timeoutMs=1500` 控制。
5. **auditoryrt 同时出现视觉声音图标。** 不能保证所测响应纯由听觉触发。RT 从播放调用附近的 `performance.now()` 起算，音频延迟仅留痕、不校正；响应允许到 1500ms，但后端只把 150–1000ms 纳入有效 RT。
6. **auditorynback 的 30% 不是固定目标数。** 每个可比较位置以 .3 概率生成目标，并禁止连续第 3 个目标；体验只有 10 个可评分位置，目标≥6的质量门槛通常达不到。模式只增加音数，未增加 n、音集难度或校准设备。

以上六项 `scientific.ts:9` 均为 `PILOT`，`claimScope=null`、`protocolApplicability=""`、`knownLimitations=[]`、`evidence=[]`。六项 seed 均为 DRAFT，engine/config `1.0.1`、scoring `1.0.0`、report `1.0.1`、`referenceMode:'none'`，定义中 `referenceEligibleMetricKeys=[]`、`showProductIndex:false`。论文只能说明范式家族与特定研究做法，不能替这个项目版本补上信度、效度、诊断效能或常模。

## 共同计数、时间与数据边界

各任务 `package.ts:9` 使用 `fixedCountFinalSubmission('totalTrials')`；各 scorer 要求正好 N 笔、trialIndex 连续 0..N−1，否则拒绝计分。不能把缺少整笔 trial 的未完成会话当成完整低分记录，也不能把未完成自动补为错误。以下“缺失处理”指已存在 trial 内的 null/中断字段处理。

各档位为 definitions 对 seed 的 config patch，除下面注明外不改变原配置、难度或计分法。不存在自动增加难度、阶梯法或中断规则所代表的能力上限。formal 一般只显示“已记录/正在保存”，不是逐题正确答案反馈；练习不交计分 trial。没有代码内的固定块间休息。所有时间用秒；`R` 为参与者作答/回忆时间，`S` 为持久化、渲染与重试开销，另加读说明及人工点练习反馈的时间。前端用 setTimeout/浏览器事件，不是显示器或扬声器物理起点实测。

`useCognitiveSession.ts:376` 起：FINAL_ONLY 模式等待本机 trial 写入；其他模式等待 checkpoint 入队处理后推进。不能把名义刺激+ISI直接宣称为端到端恒定节拍，更不能把保存间隙假定为固定 0ms。原 definitions 的 estimatedMinutes 是元数据估计，没有本次实测支撑。

## 1. sentencecheck：中文颜色/形状句图相符判断（自编，存在条件混淆）

**精确身份与来源。** 项目自编的单属性句图核对，不是已识别的标准中文语言推理量表。实际在线检索并阅读 Clark & Chase (1972), *On the process of comparing sentences against pictures*, Cognitive Psychology 3, 472–517，DOI [10.1016/0010-0285(72)90019-9](https://www.sciencedirect.com/science/article/pii/0010028572900199)。出版社一手摘要研究的是句子与图形空间关系的真伪判断与反应时，以比较加工阶段的理论解释为目标。该来源仅用于区别范式身份，**不作为本项目自编中文颜色/形状模板的验证证据**。没有找到能直接验证当前模板、题量与计分法的一手研究；不以其他句子测验代替。

**实际配置。** seed `tasks/sentencecheck/seeds.ts:16`：真/否定各 .5，fixation 500ms，timeout 8000ms，RT 下限 300ms。体验 12 正式题，standard 30，科研 60（definitions `:14/:20/:26`）；无块设计。形状 3 类、颜色 4 类，每题随机选择形状/颜色及问属性；随机种子+PRNG 可重建。当前否定与真伪同步洗牌使四格设计只剩“否定且真”和“肯定且假”两格；不能写成“真伪×否定均衡”。服务端验证总真题数，但没有重新按种子校验每题模板/否定比例（scorer `:48`）。

**练习与运行。** frontend `SentencecheckTask.tsx:8`、`:89`、`:113`；generator `prng.ts:93`：固定 2 题，均为相符，一题肯定、一题否定；全对才正式，最多 2 轮，仍失败则 blocked。不相符反应没有被练习成功门槛实际覆盖。练习每题 400ms fixation、没有自动超时，反馈后手动继续。正式首题 fixation .5s，之后每题 .8s（额外 .3s），限时8s，键1/2或点按。超时提交 response/rt=null；切屏设 interrupted 但不中断计时。

**分母与反馈。** backend `scoring/sentencecheck.v1.ts:41`：服务端从回显形状/颜色/问值推真假；accuracy=正确数/N，null计不正确；errorCount仅非null错误，timeoutCount另计。RT仅正确且≥300ms，未设置后端RT上限，也未剔除 interrupted。`negationPenaltyMs=否定正确RT中位−肯定正确RT中位`，任一条件没有有效RT为null。总有效正确RT≥2就 `interpretable=true`；accuracy<.5、中断只另设旗标，不会令该布尔值自动false。因此报告不能把 interpretable 当成充分的科学解释许可。当前版本至少应停止解释否定差值，并在总体正确率旁明确规则混淆限制；也不能称语法能力、智力或年龄常模。

**时长推导。** 正式 `T=.8N−.3 + Σ[min(R_i,8)] + S`，排除说明练习。体验固定等待9.3s、全部超时105.3s；科研47.7s、全部超时527.7s。示例若每题2s，正式约33.3s/167.7s，另加练习、读说明与S；这是假设推导，不是实测时长。原元数据体验2–3min、科研6–9min不能据此称已验证。

**与原范式差异。** 当前为中文单物体属性核对，而非该论文的空间关系命题；键/触屏混用、短题量、自编模板/时限、两格混淆、无本项目校准。建议报告名保留“自编句图相符判断”，不使用“标准句图推理测验”。

## 2. seqlearn：四位置序列反应时学习的短程项目变式

**一手依据。** Nissen & Bullemer (1987), *Attentional requirements of learning: Evidence from performance measures*, Cognitive Psychology 19, 1–32，DOI [10.1016/0010-0285(87)90002-8](https://www.sciencedirect.com/science/article/pii/0010028587900028)。实际网页核对到出版社一手摘要：使用重复的10试次刺激序列研究序列学习/注意，并区分表现指标与显性记忆报告。摘要不是当前项目具体块数、时限或计分法的授权/验证。本轮未获取论文完整方法，因此不把未核实的原文块数、精确按键或时间参数写作事实。

**实际配置。** `seeds.ts:16`：每块10题；固定10元素序列在模式块重复；fixation300ms，stimulusMs1200，timeout1500，RT下限150ms。体验40题/4块，随机B3，模式B1/B2/B4，共30模式试次即3次完整序列；standard60题/6块，随机B4，共50模式；科研100题/10块，随机B6，其余90模式即9次完整序列（definitions `:14/:20/:26`）。随机块每题独立均匀抽1..4，可立即重复，不匹配固定模式的频率/转移分布；前端种子可复现，后端仅校验模式块的冻结序列，不校验随机块种子位置（frontend `prng.ts:32`，backend scorer `:44`）。不在报告复制完整冻结序列。

**实际练习/限时。** `SeqlearnTask.tsx:8`、`:43`、`:102`：4个固定位置练习、每题400ms等待，错误会提示正确格子但也能继续；MAX_PRACTICE_ATTEMPTS=1，所以没有正确率通关门槛，blocked分支正常流程不可达。正式首题等待300ms，以后450ms；显示后1500ms响应窗，错答也立即推进，无纠错重按。`stimulusMs`未被runner读取，故不能报告“刺激只出现1200ms”。键1–4或点格子，无输入方式分层留痕、无显性觉察测量。

**评分。** `scoring/seqlearn.v1.ts:55`：accuracy正确/N，null计错；正确且RT≥150ms才入RT，无后端RT上限，不剔除 interrupted。randomBlockAccuracy=随机块正确数/10。earlyPattern=第1模式块；latePattern=所有模式试次最后20笔；`srtPatternAdvantageMs=随机块正确有效RT中位−latePattern正确有效RT中位`。体验late为B2+B4；standard为B5+B6；科研为B9+B10。每条件有效RT仅≥2便 interpretable，低正确率<.5、中断另外提示。科研增加的是模式练习量，随机基线仍10笔，不能笼统称所有效应估计都更稳定。正差值只表示该时点与这些块的速度差，受练习、疲劳、随机转移、显性发现、动作熟练影响；不能单凭此判定隐性学习或学习障碍。

**时长推导。** 正式 `T=.45N−.15+Σ[min(R_i,1.5)]+S`。体验固定等待17.85s、全超时77.85s；科研44.85s、全超时194.85s。若每题.5s，约37.85s/94.85s另加说明、4题练习、S。元数据2–4/7–10min没有本轮实测依据。

**相对一手研究的适用边界。** 同属10元素重复序列的SRT家族，但本项目只有每块一次序列、一个极短随机块、固定非邻接差值、1500ms硬截止、可触屏且无觉察报告，不能宣称复现原论文实验或“标准隐性学习测验”。

## 3. letternumseries：视觉字母数字重排（自编项目；不是 WAIS/WISC）

**官方身份核对。** 实际检索并阅读 Pearson 官方 [*WAIS–IV — Wechsler Adult Intelligence Scale | Fourth Edition* 产品FAQ](https://www.pearsonassessments.com/en-us/Store/Professional-Assessments/Cognitive-%26-Neuro/Wechsler-Adult-Intelligence-Scale-Fourth-Edition/p/100000392)，无DOI。公开FAQ说明 Letter–Number Sequencing 使用数字先升序、字母后字母序的应答规则，并有分阶段教学与特定评分规则。这里只使用公开的身份/规则差别，不复制样题或受限手册。该官方测验身份不授予项目使用其名称、分数或常模的等同性；未找到当前自编实现的直接验证论文，不以无关工作记忆论文背书。源代码注释“WAIS LNS结构”不能代替协议一致证据。

**实际模式。** `seeds.ts:16`：每题4字母+3数字，视觉逐个呈现700ms、间隔300ms；体验6题、standard10、科研16（definitions `:14/:20/:26`）。固定7项长度，未做升长或失败中止，不能输出广度。前端从13字母池/8数字池每题分别无放回抽取，再混排，跨题可重复；种子可复现。服务端只验证回显序列组成4+3，不按种子重建序列（scorer `:39`）。

**真实练习/反应。** `LetternumseriesTask.tsx:47`、`:96`、`:119`、`:159`：1个固定5字符练习（3字母+2数字）；先反馈字母、再反馈数字，不要求全对，无重练门槛。正式先在有限按钮池选字母升序，再选数字升序；每段必须填满才能继续，允许撤销，回忆不限时。不播放字母/数字声音，也不是口头自由回忆。首个字符前有一个空的呈现周期：presentationPosition从−1开始，仍等stimulus+ISI=1s才到0；7个字符共7s，再额外等300ms进入回忆。RT记录从最后呈现周期结束、额外300ms尚未过去时开始，因此responseDuration比可交互回忆时间多约300ms。没有自动漏答/超时通道。

**准确率不是整串全对率。** `scoring/letternumseries.v1.ts:56`：interrupted的整题跳过；剩余每题将真实字母/数字各自排序，按位置给1/0部分分。overallAccuracy=所有正确位置数/[7×未中断题数]，字母/数字分母分别4×和3×未中断数。全中断则各accuracy与medianResponseMs为null，内部score返回0，不能当真实零能力。medianResponseMs包含所有未中断题的回忆用时（不限正确与否）；空回忆指字母/数字两个响应数组都空。空率判断用 emptyResponses/N（计划数），而不是未中断题数；前端强制填满意味着正常完成时空回忆通常为0。1个未中断且非空trial也能令interpretable=true；报告必须同时暴露中断/有效题数，不能用“可解释”掩盖大量排除。

**时长推导。** 交互回忆前固定8.3s/题，所以正式 `T=8.3N+ΣR_i+S`：体验49.8s，科研132.8s，再加不限时回忆。等价若用已保存responseDuration求和则约 `T=8N+ΣresponseDuration_i+S`。练习固定呈现等待约6.3s，另加两段回忆和手动继续。不存在有限总时长上界。假设每题可交互回忆15s，正式体验139.8s、科研372.8s；仅作示例。元数据2–3/7–10min不是保证。

**与官方原测验区别/反馈边界。** 视觉呈现、先字母后数字、有限按钮选择、固定7项、位置部分计分、1题练习与中断排除都属于本项目自编协议。可描述“本次视觉重排回忆中正确的位置比例”，不可报告 WAIS/WISC分测验得分、工作记忆指数、年龄百分位、听觉记忆或广度。后端 practicalTips 的“听呈现”与真实前端不符，应在报告审查中指出。

## 4. visualwm：环形彩色方块、带线索探测的变化检测项目变式

**一手论文与官方实现核对。** Luck & Vogel (1997), *The capacity of visual working memory for features and conjunctions*, Nature 390, 279–281，DOI [10.1038/36846](https://www.nature.com/articles/36846)；作者[实验室出版物页](https://lucklab.ucdavis.edu/journal-articles-book-chapters)也列此文。实际能读到的出版社公开部分确认其特征/结合与视觉记忆对象容量问题；全文方法未开放，未把第三方博客当原文。另实际阅读 Neurobehavioral Systems 官方 [*The capacity of visual working memory for features and conjunctions* 示例实现](https://www.neurobs.com/ex_files/expt_view?id=82)及其中 [lv_boxes.sce](https://neurobs.com/ex_files/expt_view?id=82&item_id=lv_boxes.sce&tree_item_url=lv_boxes.sce)、[luck_vogel.pcl](https://neurobs.com/ex_files/expt_view?id=82&item_id=luck_vogel.pcl&tree_item_url=luck_vogel.pcl)。该厂商明确称其为facsimile而非原始实现；代码支持多种负荷、100/500ms样本、可选cue、7色以及按视角/观看距离换算尺寸。故不能把该实现的参数冒充1997原文全部方法。它可作为明确的公开可审查对照协议。

**当前配置。** seed `:16`：学习500ms、保持900ms、RT下限200ms。体验8题、standard16、科研24；setSize按trialIndex循环3/4/5/6，各档每种大小分别2/4/6题。颜色8种、学习阵列内不重复，固定圆周等角位置；改变时新色只须不同于原探测色，可以与另一位置同色；probe位置随机，change独立p=.5，不是每条件精确平衡。前端36px方块、260px画布、90px半径，无视距/视角校准。全阵列重现并给一个深框位置，只判断该位置颜色，按1/2或点按钮。没有双特征结合、容量K或d′计算（dual-contracts.ts:295宣称“K估计/dPrime”与实际scorer不符）。

**练习/时间。** `VisualwmTask.tsx:29/:38/:43/:49/:113`：1题练习、无正确率门槛；使用正式当前trialIndex刺激，因而新会话练习与正式首题同题同答案。每题400ms fixation+500ms study+900ms retention，probe不限时，仅首按记录；正式只给保存反馈。没有超时null的UI路径，虽schema允许null。

**分母差异必须明示。** `scoring/visualwm.v1.ts:42`：服务端按seed/index重建刺激并验证setSize/isChange。interrupted或response=null跳过命中/误报与RT；但accuracy=正确数/N，仍将这些题压低总体正确率。hitRate只以“未中断且已答的change题”为分母，falseAlarmRate只以“未中断且已答的same题”为分母，任一分母0则对应率null。medianRtMs收所有未中断且已答、RT≥200ms的反应，**不要求正确**，无RT上限。两个这样的反应就interpretable；lowAccuracy<.5另列。质量定义称“正确有效RT”与实际逻辑矛盾。报告可称本次变化判断正确率/命中与误报、已答反应用时，不可称正确反应RT、个体容量几项、年龄常模。

**时长推导。** 正式 `T=1.8N+ΣR_i+S`：体验固定14.4s、科研43.2s，另加不限时探测反应；练习另1.8s+R。若假设每题probe1.5s，正式26.4s/79.2s，绝非实测。元数据2–3/6–9min缺少时长样本依据。

**差异定位。** 当前只覆盖3–6项、8色、固定圆周、500ms、cue探测、很少重复且练习泄漏首题；官方示例默认包括更宽负荷/随机负荷与视角设定。应标“变化检测的项目变式”，不称标准Luck–Vogel容量测验或沿用原文的“四项”作为个体达标线。

## 5. auditoryrt：浏览器合成音简单反应时（带同步视觉线索的项目变式）

**一手与官方方法来源。** Donders (1969译文), *On the speed of mental processes*, Acta Psychologica 30, 412–431，DOI [10.1016/0001-6918(69)90065-1](https://www.sciencedirect.com/science/article/abs/pii/0001691869900651)，出版社页面核实为1868–1869原文译文；此历史出处不足以验证当前880Hz方案。更具体的一手研究：Fry (1975), *Simple reaction-times to speech and non-speech stimuli*, Cortex 11, 355–360，DOI [10.1016/S0010-9452(75)80027-X](https://pubmed.ncbi.nlm.nih.gov/1222579/)，作者摘要比较语音/非语音刺激与口头/按键响应。实际阅读厂商官方 [*Simple Auditory Reaction Time Task – Keyboard: Technical Manual*](https://www.millisecond.com/library/v7/simplereactiontime/simpleauditoryreactiontimetask/simpleauditoryreactiontimetask/simpleauditoryreactiontimetask.manual)：其自称loosely based on Fry，默认两种450ms声音、混合设计至少10练习+50正式、随机等待2.4–3.7s、可补早按题。此处是协议差别对照，**没有将厂商5分钟或原文RT数据借给本项目**。

**当前档位与运行。** `seeds.ts:17`：体验8题、standard24、科研48；统一单一880Hz正弦音120ms；前瞻期在1000–4000ms整数均匀抽样、仅拒绝与上一个完全相同；从第2题额外800ms ITI。响应窗1500ms。没有声压级/耳机声学校准；音量由参与者调节。点击开始先播放提示音，然后2题练习，固定前瞻期1200/2000ms，每轮全对才正式、最多3轮；练习无自动响应超时，练习只检查听后RT≥150ms，没有≤1000ms的正式有效标准。见 `AuditoryrtTask.tsx:9/:74/:89/:127/:136`。

**视觉与音频计时限制。** 正式ready为“+”，playTone调用后切换为🔊图标（`:95`、`:156`），所以有同步视觉提示；不能断言RT仅反映听觉检测。声音调度基于AudioContext.currentTime，但RT onset来自调用后performance.now；shared/audio.ts记录baseLatency或base+outputLatency近似值，不做实际音频起点/按键延迟校准、也不从RT扣除。仅成功创建AudioContext并非可闻性/输出状态的物理验证。数据没有实际输入方式（键/触屏）的逐事件区分。跨浏览器/声卡/键盘/触屏比较受到设备影响。

**评分与漏答。** `scoring/auditoryrt.v1.ts:42`：提前按（包括等待/ITI中按）记rt=0，或rt<150ms→anticipation；null或>1000ms→lapse；150..1000ms（含端点）才进median/mean/SD/CV。1001..1500ms虽在前端接受窗中，仍是漏失。无反应1500ms自动null；提前按结束本trial、不补题。中断trial**不从RT剔除**，只设interrupted旗标。有效数至少max(4,ceil(.5N))才interpretable：体验4，standard12，科研24；早按率≥.3、CV>.5另旗标；全trial无audioLatency才audioEnvironmentUnverified。内部score按220/700ms线性锚映射0..100，但showProductIndex=false且无参考样本，不能称人口分数或快/慢等级。SD使用总体分母n；CV用已四舍五入的mean。

**时长推导。** 在没有提前反应而完整等待每声的条件下：`T=Σforeperiod_i+.8(N−1)+Σ[min(R_i,1.5)]+S`。体验未计S的理论范围13.6–49.6s；科研85.6–301.6s；若有提前按，等待会被截断，不能套用此范围。按平均前瞻期2.5s、假设RT.3s，正式约28s/172s，另加2题练习/提示音/说明/反馈/S。元数据2–3/5–8min未经实测。

**反馈边界。** 仅描述这次设备与环境下有效试次的反应分布和早按/漏失。与Fry/官方实现的声音、题量、等待、补题、响应过滤、硬件和视觉提示均不同；不得称Donders标准分、听力诊断、纯听觉加工速度或稳定的人口排名。科研档只增加试次，不能无本地证据写“提高稳定性”已获证明（现有definitions `:27`用语过强）。

## 6. auditorynback：五纯音固定2-back、目标按键式项目变式

**实际一手方法来源。** Gao, Yan, Huang, Li & Zhang (2020), *Speech in noise perception improved by training fine auditory discrimination: far and applicable transfer of perceptual learning*, Scientific Reports 10, 19320，DOI [10.1038/s41598-020-76295-9](https://pmc.ncbi.nlm.nih.gov/articles/PMC7653913/)。实际阅读方法“Auditory working memory (WM) task”：其Tone n-back序列为40+n个音、每音2.5s、固定12目标、100ms纯音、8个频率/音集、60dB SPL；目标按键非目标不按，用d′，并有2→3-back多日训练。该直接相关纯音范式足以界定家族；不引用其训练效果替本项目作功效宣称，也不以一般n-back综述冒充本项目验证。

**当前档位与刺激。** `seeds.ts:17`：统一n=2，频率262/330/392/494/587Hz五种，stimulus500ms+ISI1500ms。体验12总音、standard40、科研60（definitions `:14/:20/:26`），前2音warmup包含在总数内，故实际分类分母机会10/38/58；不另加2音。无块分割、无n调整。`generator.ts:41`：每个可比较位置以.3概率成为目标，已连续2目标则强制非目标；非目标强制不等于n-back音，所以targetRatio是生成倾向而非精确比例，也无最少目标保障。正式序列按seed可复现；后端重建、toneIndex回显不符仅设stimulusEchoMismatch，不拒绝、不直接改interpretable。

**练习/节奏。** `AuditorynbackTask.tsx:54/:105/:149/:158`；generator `:66`：练习8音，独立练习seed，2个固定结构目标、4个可比较非目标+2warmup；每音名义2s，声音后ISI仍可按，首按计时。每音后显示对错并手动继续；全部8音正确才正式、最多3轮，否则blocked。正式每trial同样等待500+1500ms才保存，无逐题正确性提示；首按不立即推进，后续按忽略。实际相邻声音间隔还包括本机/服务器持久化和渲染，不应称已验证恒定2s SOA。AudioContext/latency边界同auditoryrt，但视觉图标只提示声音出现，不呈现音高；声音身份仍须听辨。

**计分与缺失。** `scoring/auditorynback.v1.ts:53`：前2音不进命中/误报统计，即使误按也不计falseAlarm；其回显不符和interrupted仍可旗标。之后每个目标分母matchCount、非目标分母nonmatchCount取服务端序列；不按目标是miss，不按非目标是correct rejection，不能把所有“不按”称缺失。无超时null独立类别，整个2s无按记responded=false/rt=null。interrupted不被剔除；H/FA仍纳入，命中RT只要非null即纳入，无150ms下限、没有上限质量过滤。

`hitRate=hits/matchCount`，`falseAlarmRate=falseAlarms/nonmatchCount`；d′实际用Hautus修正：`Z((hits+.5)/(matchCount+1))−Z((FA+.5)/(nonmatchCount+1))`；任一条件分母0则d′为null。raw rates仍未修正；不要把显示的raw H/FA直接代入Z认为与报告不符。命中RT中位只对hits；无hits为null。interpretable要求matchCount≥6、nonmatchCount>0、d′非null；目标漏按率≥.4、d′<0、H≥.98且FA≤.02等仅另设旗标。内部score把非负d′按4映射0..100，并非常模，前端定义隐藏该index。`floorPerformance`文案“低于随机”不能替代统计显著性证据，尤其少量目标；负d′是本次反应分离方向，不足证明未理解。

**体验档结构性受限。** 12总音只有10个比较机会，却需≥6目标；在将随机抽样理想化为独立均匀抽样、并严格应用“最多连2目标”的解析递推模型下，期望目标约2.838、P(目标≥6)≈1.547%。这只是生成机制的数学推算，**不是实际种子样本/参与者实测**；真实会话需直接数matchCount。standard/科研也不能保证目标数。不能写“体验版固定4个目标”或“30%匹配”；体验可显示原始事实和受限记录，不能反馈稳定能力或将d′跨档直接比较。

**时长推导。** 正式名义下限 `T=2N+S`：体验24s、standard80s、科研120s。练习每轮16s的声音/空档另加8次人工反馈停留，最多3轮声音等待48s；再加说明/重读/人工停留，无固定总时长。元数据2–3/6–9min不是实测。

**与一手方法差异。** 当前2-back总音数包含warmup、目标数不固定、五个低频音、500ms时长、名义2s、无声压校准、8音教学而非多序列训练，均不同于Gao等的方法。应名为“纯音2-back项目变式”，不称标准n-back、训练有效、听力/记忆诊断或已校准人口常模。

## 可供R2报告直接采用的最小边界说明

| 工具 | 反馈主事实 | 必须相邻显示的限制 | 当前不能输出的结论 |
|---|---|---|---|
| sentencecheck | 本次相符判断正确率、有效正确RT数 | 真伪/否定混淆、超时数、中断 | 否定加工代价、语言推理/诊断或年龄排名 |
| seqlearn | 随机块与最后模式块的中位RT差、各条件有效数及正确率 | 10题随机基线、比较块位置、缺觉察测量、输入方式 | 稳定隐性学习能力/学习障碍 |
| letternumseries | 未中断trial的逐位置重排正确率 | 有效trial/计划N、固定7项、视觉按钮选择、不限时 | WAIS/WISC分、听觉记忆/广度/年龄常模 |
| visualwm | 全计划N正确率、已答有效条件H/FA、已答RT | 练习复用首题、条件分母、错误RT纳入、设备颜色/尺寸 | K容量、d′（未计算）、原范式标准分 |
| auditoryrt | 150–1000ms有效RT分布、早按/漏失 | 视听同时提示、输出延迟仅留痕、有效数、中断 | 纯听觉加工、听力诊断、人口快慢等级 |
| auditorynback | 实际目标/非目标数、H/FA、修正d′、命中RT | warmup排除、体验目标不足、无校准、中断/回显不符 | 稳定记忆能力、训练效果、诊断或常模 |

本报告未把“科研”理解为已验证协议；六项科研档仅在既有项目协议内增加试次（seqlearn还移动随机块）。任何声称标准复现、稳定性提升、跨档可比性、儿童适用或常模均需另有该版本、该人群与设备条件的直接证据。
