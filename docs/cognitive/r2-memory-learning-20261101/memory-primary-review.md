# R2：五项记忆任务来源／模式检查表（只读审核）

审核日期：2026-10-31。仓库 本次独立报告分支；核查 HEAD/base 均为 `b42393cffe1c4364c1fc5568b656ed612fc60849`。以下为源码静态核对及公开网页实际检索，不是浏览器实测、受试者计时或线上数据库配置审计。未改源码、评分、公共 generated；未运行测试。

统一路径简写：`B=server-version/backend/src/modules/cognitive`，`F=server-version/frontend/src/modules/cognitive/tasks`。五项均已读 `B/tasks/<key>/{definitions,seeds,scientific,governance,package,semantics}.ts`、对应前端 runner/registry、后端 scorer/config/trial schema、实际随机生成函数。`scientific.ts` 均为 PILOT、`claimScope:null`、`protocolApplicability:''`、`evidence:[]`；seed 均 DRAFT 且 `referenceMode:none`。公开来源只能解释范式及差异，不能替代本版本的信效度、常模、版权授权或适用人群验证。

## 1. digitbackward（数字倒背）

- [x] 模式：体验 `startSpan=2,maxSpan=4`，最多3级×2=6正式试次；研究 `2..8`，最多7级×2=14试次；标准 seed 为 `2..7`，最多12试次。每级固定2题，两题全错即停止；不是每个人都完成最大试次数。最早在广度2两题后停止。没有独立 block 或休息块。
- [x] 练习：4道固定三位数序列，至少3/4全序列倒背正确才进正式；不达标整批重练，无重练次数上限。练习可看输入并退格；正式只显示已输入数量，不回显数字、不能退格，必须填满才可手动提交。
- [x] 时序：准备800ms；每数字800ms显示、200ms间隔；最后数字后直接进入回忆，无额外200ms；正式回忆30s后提交已填内容（`timedOut=true`）。数字来自0–9不放回洗牌，按seed、试次、广度确定；仅完全连续升／降序且长度>2时调整次序，不是排除所有相邻连续数字。
- [x] 计分：全序列严格等于反转答案才算正确；`maxSpan`为至少有1题正确的最高级；`totalCorrectTrials`为全序列正确题数；`sequenceDistance`是逐位置不一致数（含漏项）的每题均值，**不是编辑距离**。内部score=`maxSpan/maxSpan配置×100`，不是正确率或常模。缺少完整两题级、提前停止于非终止级或终止后继续均拒绝评分。切屏标记中断但未从指标剔除；`timedOut`本身不进入scorer的interrupted计数。完成不足2级时`insufficientCompletedLevels=true`，不把最早停止后的广度包装为稳定能力。
- [x] 一手来源：[Woods et al., *Improving digit span assessment of short-term verbal memory*](https://pmc.ncbi.nlm.nih.gov/articles/PMC2978794/)，2011，DOI **10.1080/13803395.2010.493149**。原实验使用听觉随机数字、1秒/数字、反向口头报告、14题及表现自适应上下阶梯；不同于本实现视觉数字、手动输入、每级2题及双错停止。倒序回忆与随机数字的一般思路相符，**不是该实验或Wechsler复刻**。另实际查阅[Millisecond作者技术手册：Visual Digit Span Test — Backward](https://www.millisecond.com/library/v7/digitspan/digitspan_visual/digitspanvisual_chinese/digitspanvisual_backward_chinese.manual)，其公开实现同样是14题上下阶梯，不能拿来证明本版练习门槛或停测规则已验证。均只取流程事实，未复制题目。
- [x] 估时推导（秒）：每正式题固定准备/呈现为 `0.8+(L−1)×1+0.8=L+0.6`。体验走满固定21.6s，研究走满78.4s；最早停止固定5.2s。练习固定呈现/准备14.4s另加不限时输入、反馈按钮。总时长=`练习/说明/反馈总耗时P + Σ(L+0.6+正式回忆耗时r)`；正常每题`r≤30s`，走满正式部分分别≤201.6s／498.4s，不含网络等待和练习重试。现metadata体验2–3min、研究6–9min是未见实测校准的预算。
- [ ] 报告应固定解释：自编视觉数字倒背；最高成功广度和正确题数分开读；体验/研究不能横向按score比较（上限分母不同）；来源不支持年龄等级或“完整工作记忆”。

证据位置：`F/digitbackward/DigitbackwardTask.tsx:8,54,85,153`；`B/scoring/digitbackward.v1.ts:25`；`B/randomization.ts:313`。

## 2. picturesequence（图片序列学习）

- [x] 模式：体验6项×2学习轮＝2条正式round记录；研究15项×3学习轮＋30s等待后1延迟轮＝4条；标准12项×3轮，无延迟。**一条trial记录是一整轮排序，不是一张图片**；体验有12个正式排序位置，研究60个（含延迟）。没有独立block。
- [x] 练习：4轮、每轮3项，整轮全对至少3/4才放行；练习学习阶段自定速，失败整批重练，无次数上限。
- [x] 呈现/随机：正式将整组自制SVG图形、文字场景及序号**同时展示**`itemCount×900ms`；不是逐图呈现。seed只在3个15项story bank中选一个，再取前N项，**目标顺序不洗牌**；各bank用同一行动标签序列、不同story编号/色调。回忆候选卡片用seed按阶段/试次洗牌，点选组成序列，可移除重排。60s无活动守卫依赖response状态，每次选/移除后重新计时，不能写成“整轮限时60s”。研究30s等待无其他任务，无重复学习展示。
- [x] 分母/缺失：每轮相邻正确对数÷`N−1`；正确位置数÷`N`，未填位置仍在分母。headline取**最后学习轮**，不是跨轮平均或总和；`learningGain=末轮相邻比例−首轮相邻比例`；`delayedRetention=延迟相邻比例−末轮相邻比例`，是比例差而非保留百分比/比值。允许只保留所有学习轮而缺延迟记录；延迟缺席、切屏或未排满均为null并标记`delayedStageIncomplete`。即时切屏试次仍参与数值；`interpretable`只受即时不完整／重复错误排序影响，不能当作所有质量问题均无。
- [x] 一手来源：[Bauer et al., *III. NIH Toolbox Cognition Battery (CB): Measuring Episodic Memory*](https://pmc.ncbi.nlm.nih.gov/articles/PMC3950959/)，2013，DOI **10.1111/mono.12033**。该验证版以主题相关但无固有顺序的图片，逐图展示（2.2s并配语音、1.5s移动），三轮同序列；原始得分累计三轮正确相邻对。当前相邻对的局部判定与之相符；整组呈现、文字/序号、固定行动顺序、练习、最后轮比例和新增30s延迟均不同。**仅为序列学习范式对照，不能继承NIH PSM名称、信效度或常模。**
- [x] 估时（秒）：体验正式固定`2×6×0.9=10.8`；研究`3×15×0.9+30=70.5`。总=`P+固定部分+Σ各轮排序耗时`（研究4个回忆轮）；P含自定速练习、说明、反馈。由于可移除重选、计时重置，整体无固定上限。现metadata体验3–5min、研究13–17min，不能从固定计时直接推出。
- [ ] 报告需写明整组学习、最终轮、比例差和短延迟；不能把learningGain叫通用学习速度，不能把负delayedRetention直接解释为衰退或临床遗忘。

证据位置：`F/picturesequence/PicturesequenceTask.tsx:11,48,60,84,96,156,161`；`B/randomization.ts:326`；`B/scoring/picturesequence.v1.ts:15,35,51`。

## 3. pairedassociate（图形—位置配对学习）

- [x] 模式：体验6对×2学习轮＝2条round记录／12次位置选择；研究18对×4学习轮＋30s等待＋1延迟轮＝5条记录／90次位置选择；标准12对×3轮，无延迟。整轮记录trial，不是每对一条trial；没有另设block。
- [x] 练习：4轮每轮2图形/4位置，整轮2对都对才算该轮正确，至少3/4轮才放行；学习自定速，失败整批重练，不限次数。
- [x] 时序/随机：每个正式学习轮整板同时展示12s，体验、研究均相同；图形ID固定，seed只洗牌图形对应的位置，各轮保持同一配对和同一提问顺序。回忆逐图点击位置，无错误反馈或按错项重学；90s无活动守卫随responses变化重置，不能说整轮只许90s；研究30s等待后再问一轮，不再展示配对。
- [x] 计分：每轮正确数÷固定pairCount，超时未答项目用null补齐仍计入分母；`immediateAccuracy`取最后即时轮；`learningSlope=(末轮准确率−首轮准确率)/(学习轮数−1)`，**不是回归斜率**；`trialsToCriterion`仅事后查首个准确率≥0.8的学习轮（体验至少5/6、研究至少15/18），未达到为null，**不是自适应到达标准后停止**。学习轮固定全跑。延迟记录缺席、切屏或任一位置null则`delayedAccuracy=null`；即时中断仍计入数值。`interpretable`只检查即时每轮≥50%遗漏和恒定位置回答，独立保留中断及延迟缺失旗标。
- [x] 官方来源：[Cambridge Cognition, *7 tests for assessing cognition in early Alzheimer’s disease*, section 2 PAL](https://cambridgecognition.com/7-tests-for-assessing-cognition-in-early-alzheimers-disease/)，2018，无DOI。厂商描述逐个随机打开盒子呈现图形，随后逐图回忆位置，错误会再呈现，难度逐渐增加。原任务与本版均是图形—位置联结回忆，但本版整板展示、固定难度/轮次/阈值/短延迟均不相同。
- [x] 补充一手研究：[Ashford et al., *Unsupervised Online Paired Associates Learning Task from CANTAB in the Brain Health Registry*](https://pmc.ncbi.nlm.nih.gov/articles/PMC10879687/)，2024期刊卷期（2023在线），DOI **10.14283/jpad.2023.117**。该BHR版本按2/4/6/8/12对递增，至多4次尝试，整级全对后进级；常报首次尝试记忆分与校正错误数。本版不含该进级/终止机制，≥0.8阈值和learningSlope不能引用该文当作已验证指标。研究对象成人，不可外推本版K12。
- [x] 估时（秒）：体验正式固定`2×12=24`；研究`4×12+30=78`；总=`P+固定部分+Σ位置选择/提交耗时`。研究需要90次选择，且回忆无活动守卫不是整轮硬上限。现metadata体验3–5min、研究16–21min，无实测校准证据。
- [ ] 报告把“达到标准所需轮次”限定为“本任务中首次达到80%的学习轮次”；学习斜率明确首末差/间隔；不能称CANTAB PAL复刻、海马功能、临床记忆水平或人口等级。

证据位置：`F/pairedassociate/PairedassociateTask.tsx:8,33,55,79,97,118,123`；`B/randomization.ts:340`；`B/scoring/pairedassociate.v1.ts:13,34,38`。

## 4. wordlist（中文词表自由回忆）

- [x] 模式：体验8词×2即时学习/回忆轮，无延迟＝2条正式记录；研究15词×5即时轮＋60s等待＋1延迟回忆＝6条；标准12词×3即时轮，无延迟。每条trial是一整轮回忆，体验16个即时目标机会、研究75个即时＋15个延迟机会。没有干扰表、识别/再认或额外block。
- [x] 练习：4轮同一组4词；每轮至少回忆3个不同目标词算过关，至少3/4轮过关才进正式；失败重练整批、不限次数。练习每词800ms，呈现结束另120ms才进入自定速练习回忆。
- [x] 随机/时序：seed从5个内部中文词表选1，再取前N词；各即时轮对同一目标集合分别洗牌。每词800ms连续显示、最后多120ms；正式回忆上限60s且不会因输入重置。研究等待60s后仅回忆，无再次学习。seed中的`inactivityGuardMs=120000`未被该runner读取；不能报作实际2min回忆限时。每轮最多64条输入，只计已“加入”的词，输入框未加入草稿不提交。
- [x] 分母/缺失：NFKC、小写化、去标点/符号/空白，精确匹配；无繁简、同义词或模糊纠错。每轮不同正确目标词数÷N；重复命中不重复加分，侵入/重复另计。`immediateAccuracy`是末即时轮；增益是首末比例差；累计正确跨全部即时轮。`omissionRate`分母为`N×即时轮数`，仅延迟有效时再加N；延迟空回忆或中断则null，不能当0。**60s自动提交会写interrupted=true，即使已有输入，延迟指标仍null**；即时超时仍保留数值但总体`interpretable=false`。研究若整条延迟记录不存在，scorer要求exactly6 stages而拒绝评分（不同于图片/配对scorer允许缺延迟记录）；null适用于存在但不完整的延迟阶段。中位回忆时长合并即时及延迟已记录阶段，非单纯输入速度。
- [x] 官方范式来源：[NIH Toolbox, *Rey Auditory Verbal Learning Test*](https://nihtoolbox.org/test/rey-auditory-verbal-learning-test/)，官网当前描述，无DOI：15个无关词、3轮学习自由回忆、5–25分钟后再回忆，施测员管理，列英语/西语。当前重复学习+即时/延迟自由回忆思路相符；内部中文刺激、键盘输入/归一化、2或5轮、60s等待、800ms视觉呈现均不同。**该页面不是经典所有RAVLT版本的统一协议，也不是本中文词库的验证来源；不把本任务写成CVLT/RAVLT中文复刻。**
- [x] 估时（秒）：体验正式固定`2×(8×0.8+0.12)=13.04`；研究`5×(15×0.8+0.12)+60=120.6`。加正式回忆耗时，正常全阶段运行分别≤133.04s／480.6s，再加P（说明、4轮练习、反馈；练习仅固定呈现部分13.28s）。网络等待和练习重试不在上限内。现metadata体验3–5min、研究10–14min是预算而非观测。
- [ ] 报告必须说“本次中文词表键盘回忆”；区分末轮正确率和各轮累计；中文输入能力、词频/教育暴露及空/超时延迟处理需可见；不能据此断言学习障碍、临床状态、年龄排名。

证据位置：`F/wordlist/WordlistTask.tsx:26,71,88,97,116,150,171,224`；`F/shared/pr13Stimuli.ts:23`；`B/scoring/wordlist.v1.ts:20,46,74,82`。

## 5. runningspan（运行记忆广度）

- [x] 模式：体验8题，研究20题，标准12题；三档均列表长度7–11、回忆末3个、显示500ms/空隙250ms；研究只增加题数。没有额外block/休息块。
- [x] 练习：只有1题固定5字母序列，显示答案和位置正确数；**没有成绩门槛**，看过反馈即可进正式。前端`blocked`分支存在但当前流程未进入；不能描述为4题/3题过关。
- [x] 随机/时序：seed确定的独立均匀长度7–11和15字母池抽样，尝试避免相邻重复，不平衡各长度的精确频数；非相邻字母可重复。实现有初始position=−1的750ms空白，再每项500+250ms，列表结束后额外250ms，故每正式题进入回忆前固定`0.75N+1`秒。回忆不限时，允许0–3个输入、撤销/清空后提交，界面没有中间空位/跳位操作；不把回忆时长解读为加工速度。
- [x] 分母：只对未中断试次的**实际已填位置**累计正确数/分母；未填的剩余位置不进分母，窗口内字母放错位置属错误但不算侵入，目标末尾窗口外字母才算侵入。该口径已正确写入`participant-presentation.ts:14`，应保留。全部未填使accuracy/intrusion为null；但若全部试次中断，会被循环跳过、`emptyRecall=false`，出现指标null且`interpretable=true`的边界；报告需看缺失和中断，不得只依赖interpretable。scorer检查题数、连续index、长度范围与response≤3，但未重算seed序列；不同于另外四项的冻结seed核对，不应宣称此处做了等量随机回放验证。
- [x] 一手论文：[Bunting, Cowan & Saults, *How Does Running Memory Span Work?*](https://pmc.ncbi.nlm.nih.gov/articles/PMC1559727/)，2006，DOI **10.1080/17470210600848402**。支持不可预知结束后回忆末尾项目、按串行位置计正确的一般范式；实验1是听觉数字、12/14/16/18/20长度、每项0.25或1秒、探测回忆1–7项、6练习＋70正式题，均不同于本版视觉字母/7–11/固定3项/750ms步长/8或20题。论文还讨论主动复述更新与被动保持后提取两种策略，**不能把本版得分当纯更新机制量测**。
- [ ] 书目需核正：现`governance.ts`写“Bunting (2003) J Exp Psychol Learn Mem Cognit”；所检得直接相关一手原文是上述2006 QJEP。未找到足以验证现2003书目的准确题名/DOI，不应原样当作已核实引用。`participant-presentation.ts:82`“唯一的办法…就是工作记忆的更新”应弱化为可能采用持续更新策略，保留机制不确定性。
- [x] 估时（秒）：体验正式固定范围`8×6.25..8×9.25=50..74`，独立均匀长度假设下期望62；研究`125..185`，期望155。总=`P+Σ(0.75N+1+不限时回忆r)`；1题练习固定4.75s包含在P内。现metadata体验3–4min、研究8–11min不等于实际固定呈现时长，需另含人工作答/说明假设。
- [ ] 报告优先同时显示正确位置总数、已填位置准确率、侵入、缺失/中断，避免只凭高准确率推断“记住了最后3个”。不把空缺当0，也不把null指标的内部score=0当有效低表现。

证据位置：`F/runningspan/RunningspanTask.tsx:40,72,89,102,108`；`F/runningspan/prng.ts:40`；`B/scoring/runningspan.v1.ts:21,54,67,80`；`B/tasks/runningspan/participant-presentation.ts:14,82`。

## 估时使用方式（明确是假设，不是实测）

优先展示上述公式及“含练习、因回答速度/重练而变”。若要提供一个可复算的规划例：假设**每项P=90s（只过一批练习，含说明/反馈）**；倒背及运行广度每正式题回忆8s；另三项每正式回忆轮30s，且倒背走满上限，则：

| 工具 | 体验规划算式/时间 | 研究规划算式/时间 |
| --- | --- | --- |
| digitbackward | 90+21.6+6×8=159.6s（2分40秒） | 90+78.4+14×8=280.4s（4分40秒） |
| picturesequence | 90+10.8+2×30=160.8s（2分41秒） | 90+70.5+4×30=280.5s（4分41秒） |
| pairedassociate | 90+24+2×30=174s（2分54秒） | 90+78+5×30=318s（5分18秒） |
| wordlist | 90+13.04+2×30=163.04s（2分43秒） | 90+120.6+6×30=390.6s（6分31秒） |
| runningspan | 90+62+8×8=216s（3分36秒） | 90+155+20×8=405s（6分45秒） |

这些单一情景只证明分钟数应如何拆解，**不证明现metadata区间错误，也不构成新的对外承诺区间**。正式产品估时需绑定实际档位与计时口径并后续校准；不能将论文的施测时间移植到不同实现。五项均不能凭“research”标签、增加题量或公开范式文献，宣称本自编版本已具备标准协议等值、年龄常模、信效度或临床解释。
