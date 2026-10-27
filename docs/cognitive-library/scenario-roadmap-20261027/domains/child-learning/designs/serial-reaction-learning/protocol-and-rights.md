# 来源与协议附录：serial-reaction-learning design R1

此文件用于审核设计，全部工程行为、参数和报告规则均为**提案**，没有可执行实现或实际冻结组合。主审入口是 [单张图片与中英简短介绍](README.md)。

## 来源、固定对象与分轴许可

|对象|已核事实、限制及本项目取用边界|
|---|---|
|完整协议方法|Hodel AS, Markant JC, Van Den Heuvel SE, Cirilli-Raether JM, Thomas KM (2014), *Developmental differences in effects of task pacing on implicit sequence learning*, [DOI 10.3389/fpsyg.2014.00153](https://doi.org/10.3389/fpsyg.2014.00153)。已读出版社全文、Figure 1 和 Data preprocessing。文章注明 CC BY，未在当前许可段注明版本号；不补猜版本。引用或改编文字须署名、引原文并说明改动。|
|方法历史|Nissen & Bullemer (1987), [DOI 10.1016/0010-0285(87)90002-8](https://doi.org/10.1016/0010-0285(87)90002-8)。仅作历史出处；本节点全文访问 403，未据此声称原始细节已读或已获材料再分发权。儿童既有研究 Thomas & Nelson (2001), DOI 10.1006/jecp.2000.2613，仅核书目，不继承年龄效度。|
|源码|jsPsych 固定 commit [`5887b4a50f71fe4b93254754956ea488b0a0c16e`](https://github.com/jspsych/jsPsych/tree/5887b4a50f71fe4b93254754956ea488b0a0c16e)，tree `e858c511dd3f30c61cf64a1596f13ea9d55db153`。`packages/plugin-serial-reaction-time-mouse/package.json` 为 2.2.0、MIT；[根 license.txt](https://github.com/jspsych/jsPsych/blob/5887b4a50f71fe4b93254754956ea488b0a0c16e/license.txt) 版权 Joshua R. de Leeuw，复制实质代码须保留版权／许可。本轮不复制源码、不安装插件。|
|源码适配边界|该插件不是完整序列研究协议。`allow_nontarget_responses` 默认 false，只监听目标格会漏掉错答；固定源码使用 `mousedown`，不能据此宣称完整触屏等值。拟独立实现四格有效响应都记录，首次错误保留，并单独记纠正；此处仅描述设计。|
|图片／声音|原研究使用 Sesame Street 角色与背景，角色素材的独立分发权未核，**不取用、不上传**。本图由 ImageGen 依项目描述生成原创几何界面，不含商业角色、外部字体文件、照片或音频；它是静态概念图，不是软件实测截图。未额外声明 CC0／MIT 或对第三方作独立授权。|
|刺激／题库|无商业题库。拟参考论文已公开的两种十位置序列及对照约束，署名并说明改造；本轮没有编排、生成或发布可执行试次序列。论文 CC BY 不扩大到角色素材或其他受限测验题库；没有 ICAR／韦氏／瑞文材料。|
|中英文|本包指导语、例子与说明为项目自编，不复制商业译本；未验证翻译等值。新增项目材料未另授开源许可，不能将可在 GitHub 审阅等同于第三方可自由再分发。|

固定上游字节 SHA256：`license.txt` = `412c203cb08996fa95525ad0a98a79985f844a7d23b9bef31a6eb2b864600fc9`；mouse `package.json` = `cbcb1c255ed14f4b8e02550a9b074cf593a2d41d3173db76867fe04b34dc76ff`；mouse `src/index.ts` = `507ab900afd09a973ef4d51d34431809a349e5469fa68a70d0fc1437df596c45`。完整论文 XML 从 Europe PMC 只读核对，未将原文／原图纳入本仓库交付。

## 原协议与短版完整条件

采用上述论文 **Experiment 1 self-paced** 条件作为主要方法参照，不混用 fixed-paced 或 Experiment 2 的反馈条件。原研究样本为四岁儿童与成人，屏幕四象限图像加独立四按钮盒，按到正确位置后进入 500 ms response-to-stimulus interval。原研究记首按正确率与正确试次反应时。儿童先做一或两组 36 次练习，正式五轮，每轮可休息。以下手机／平板、练习和短版属于改造，不继承其人群结论。

原 Figure 1 每轮为五组“6R＋10S”，最后再 4R，共 84 次。R 是无固定顺序对照，S 是同一个十位置重复序列；参与者只接触两种候选序列之一。R 不连续重复位置，整体匹配对应 S 的位置概率。论文对如何在每个六次小段精确实现不等位置概率没有给出可直接复用的生成器；六次无法精确表达十位置序列中 0.3／0.2 的概率，不能把“六次各位置均衡”误写为原协议。

本设计的明确操作化提案：同一次会话选 A 或 B 一种论文序列，长短版采用相同选择规则并保留身份；每轮五个 6R 合计 30 次，按所选完整十位置序列的位置比例匹配（概率 0.3 的位置各 9 次、概率 0.2 的位置各 6 次）。收尾 4R 各位置一次，仅负责收尾、另列，不硬称全部 34R 与 50S 频率精确相等。目标跨小段边界也不立即重复；后续实现须在这些固定约束下选择对照顺序并留存，不能用独立均匀抽样替代。本段是对原文欠缺生成细节的**项目补充约束**，不是已核得的上游算法；当前没有生成序列或冻结刺激组合。

分析按论文预处理：每个 10S 的前两次因上下文尚不足而计为 R，得到每组 8R＋8S；最后 4R 保留原件但排除核心条件比较。**84 次呈现不等于 84 次分析。**“呈现来源 S/R”和“分析类别 S/R/收尾排除”须分开保留，不能按输出需要重贴标签。

需要保留的科学限制：按此原始分类方式，重分类后的分析 R／S 并不自动位置频率相等；匹配的是呈现来源层面的非收尾 R 与完整 S。触屏各位置动作成本可能不同，因此原始时间差不能解释成纯粹的序列知识。当前不擅自换序列、改分析类别或追加复杂校正模型来掩盖这个限制；两版均保留并明确说明。

|profile 提案|完整轮数|实际呈现|呈现来源 S／R|分析 S／R|收尾排除|
|---|---:|---:|---:|---:|---:|
|research|5|420|250／170|200／200|20|
|experience|3|252|150／102|120／120|12|

每轮上述结构相同、每轮分析两类各 40 次。短版不删 R、不只保留最容易的 S、不缩短某条件，也不把前 252 次任意截断为短版。两版采用同一界面、说明、练习、输入和 500 ms 间隔；正式不显示条件切换或是否首答正确，不提示记忆重复顺序。拟用四格与 ★、同一手操作；布局由原按钮盒改成触屏，运动距离与输入等值未验证。两版没有正式反应倒计时；可结束，轮间可休息，额外休息／纠正会延长估时。

时间预算是假设每次首答约 0.5–1.0 秒，加 0.5 秒间隔后，正式约 research 7–10.5 分钟、experience 4.2–6.3 分钟，再加初次说明／练习／短休息得到主简介范围；不是实测结果或完成期限。重复练习、更多错答、慢速回应均可能超过范围。

## 完整指导语、示例与练习提案

**中文参与者说明：**“这项活动想看看连续点选时表现怎样变化。屏幕上有四个固定方格，每次一格会出现 ★。看清后尽快点 ★ 所在的方格，尽量点准。比如 ★ 在右上格，就点右上格。点错时也会记录，★ 会留在原位；再点到它，才会进入下一次。点对后会短暂空一下，再出现下一个目标。不要提前猜，请用同一只手、保持舒服的姿势。你不用复述顺序。先做四次简单练习，正式每轮后可以休息；随时可以结束。结束不会被记成做错剩余题目。我们只描述这次记录，不能据此判断智力或作诊断。”

**English participant instructions:** “This activity looks at how performance changes during repeated tapping. There are four fixed squares. A star appears in one square at a time. When you see it, tap that square as quickly and accurately as you can. For example, if the star is in the upper-right square, tap the upper-right square. An incorrect tap is recorded and the star stays there. Tap its square to continue. After a correct tap there is a short blank interval before the next target. Please do not guess ahead. Use the same hand and a comfortable posture. You do not have to recite an order. First there are four simple practice trials. You can rest between runs or stop at any time. Stopping does not mark the remaining trials as wrong. We describe this session only; it cannot determine intelligence or a diagnosis.”

例子用单个右上 ★，不暴露正式十位置序列。练习四次，每格一次，正常目标保留／纠正规则，逐题简短解释，不记入正式数据或表现反馈。首答 4/4 正确才进入；练习失败／未完成均重呈以上完整说明和例子，再练，最多三轮。三轮未完成退出说明，不伪造正式完成或零分。这是理解操作的项目暂定规则，不是科学效度筛选。原研究练习 36 次改为四次，是本次待审的重要改造。

## 原件、首响应、分母与公式提案

1. 每次目标出现后，四个有效格的首次触点立即保留：位置、首答正确性、相对目标出现的首答时间。触屏格之外、预先触摸、多触点的取用规则需在获批实现前明确，不能把未识别输入算成正确。★ 仍在时后续纠正另记，完成所需用时单列；**首次错误不改写、首答时间不改成纠正时间**。
2. 原论文记首按准确率／正确试次 RT；本项目核心 RT 只纳入**首次响应即正确**的试次，不用纠正成功的最终时间伪装首答正确 RT。后续纠正记录只解释任务过程，不加入主要 RT 比较。
3. 条件准确率 = 该分析条件首答正确数 ÷ 该条件实际呈现且有首答的次数。同时保留该条件计划数、实际呈现数、无首答／中断数，不能只报一个掩盖缺失的比例。完整一轮该分母应为每类 40；被排除的收尾四次不混入条件分母，但保留其真实响应。报告总首答计数使用全部正式呈现（包括收尾），不含教学／练习；条件均值／差值使用上述 80 次分析分类，两种口径不可混淆。
4. 对完整轮 j，`meanRT(R,j)`、`meanRT(S,j)` 分别为对应分析类别首答正确且有效 RT 的算术平均。`Δj = meanRT(R,j) − meanRT(S,j)`（ms）；总体 `Δ = (Σ Δj) / J`，完整轮等权，J 是该冻结 profile 的全部计划轮数（5 或 3），不悄悄只选表现较好的轮。每个均值必须同时保留真实有效次数。若任一必需条件没有 RT，差值为 null；不补零或填充样本。
5. 正差仅表示这次记录中 S 比 R 快，负差表示 S 较慢，真实 0 表示两均值相同。速度必须结合首答准确率解释；负差／0 不改成失败，也不裁成正分。均值为真实 0 时保留 0；没有响应、未呈现、无法计算是 null，不是 0 ms、0% 或零能力。
6. 自定步速没有固定反应截止，因此不发明“超时错答”。主动结束时区分当前已呈现但未答、已错答尚未纠正、已完成、后续未执行；这些不标为成功或都记为错误。原件保留全部状态和排除原因。

论文主要群体分析还使用个体内 z-normalized RT 差，四岁 self-paced 数据采用高于个体正确 RT 均值 2.5 SD 的排除；这些是原研究方法，**本提案不继承为个体公开评分或自动剪除规则**。本项目暂提原始 ms 有符号差，不把未修剪原始均值称为论文完全复刻；所有长 RT 原样保留并说明易受走神等影响。论文未给本项目触屏、学龄儿童或短版的常模／可靠性，也不能借用其显著性或样本排除来验证个人。

## 报告三态、语言和版本提案

`interpretable` 仅指本次资料足以进行约定的描述，不是个人能力效度认定。拟要求完整 profile／练习流程、来源和首答记录可对应、每轮两类首答准确率均至少 80%、每类有正确 RT。80% 是**保守的项目暂定呈现规则**，不是年龄常模、诊断截点或已验证效度门槛；不混同论文儿童样本的不同排除条件，开发前须和其余解释规则一起冻结。资料真实但未完成／中断／低准确时为 `limited`；身份、来源、首答与条件无法可靠对应，或完全没有可用正式资料时为 `invalid`。不能通过只删除坏轮升级状态。

三态一致控制正文、可选图片及下载：只有 interpretable 可显示真实首答情况和有符号 ms 描述；limited 不显示表现数值或生成表现图片，下载只有状态与原因；invalid 同样不展示或下载表现数值。内部筛选率、检查标记和研究质量字段不进公众报告。任何图片最多一张并标 EDUK12.TOP，当前图审没有报告图片和虚构数据。后台分析描述不等于公开投影；本包没有接后台或保存机制。

中英报告文案设计不留待未来补写，但当前只有模板，**没有运行数据**，不填示例数字：

- interpretable：“谢谢你认真完成。你在这次活动中首答点准了 {correct}/{answered} 次。重复顺序的平均首答反应时间为 {S} ms，对照为 {R} ms，差值（对照减重复）为 {signed_delta} ms。{正差：这次重复顺序下稍快；负差：这次重复顺序下稍慢；零差：这次两类平均时间相同}。这只是本次点选中的差别，姿势、熟练和疲劳也会影响结果。你可以回想什么时候最容易看清、点准，活动后让手休息一下。它不能证明隐性学习能力或智力高低。” / “Thank you for completing the activity. Your first tap was correct on {correct}/{answered} answered trials. Mean first-response time was {S} ms for repeated-order trials and {R} ms for control trials; control minus repeated was {signed_delta} ms. {positive: Repeated-order trials were faster in this session; negative: Repeated-order trials were slower in this session; zero: The two mean times were equal}. This describes this tapping session only. Posture, familiarity and fatigue also matter. Think about what helped you see and tap accurately, then give your hand a rest. This does not establish implicit-learning ability or intelligence.”
- limited：“谢谢你已经付出的努力。这次{未完成／中断／有较多首答点错}，先不解释表现差别。可以休息后重新看说明，再决定是否完整体验；本次没有表现评分。” / “Thank you for the effort you have made. This session {was incomplete / was interrupted / contained many incorrect first taps}, so we will not interpret performance differences. Rest and review the instructions before deciding whether to try a complete session. No performance score is shown.”
- invalid：“这次记录不足以可靠解释，所以没有生成表现结果。这不代表你的能力。准备好后可以重新开始。” / “The record cannot support a reliable description, so no performance result was generated. This does not reflect your ability. You may start again when ready.”

协议 `serial-reaction-learning-protocol-proposal-r1`、解释 `serial-reaction-learning-interpretation-proposal-r1`、报告 `serial-reaction-learning-report-proposal-r1` 分开版本。批准后实际组合还须绑定 profile、十位置序列选择及匹配对照约束、实际参数、输入、指导语 language 与材料身份，不能重算旧报告。本包只列设计标识，没有实际运行 tuple。

## 去重、归属、标签与交付范围

去重基于 24 旧项目、11 既有候选和四领域实际文件；reaction 无重复顺序操纵，picturesequence／Corsi 是顺序回报，pairedassociate 是显式映射学习，reversallearning 是奖赏反馈反转；均不提供本项的连续位置重复／对照比较。不另做泛化的“重复学习”项目，不复制已有实现。临床 SART/PVT/AX-CPT、职业 delay-choice／信息采样／信心、EI emotion-situation-understanding、原心与花归属不变。DOT 已确认本项归儿童学习。

18 维／131 值继续按固定 `22721e5c63dd78819e8c58921adf20157cdaa08c` 的词表读取，blob `f28a14159348d3cebbfa04a3675b126307dd9e43`。现有认知领域 `decision_learning` 可作宽领域映射提案；target_process 没有序列学习，留空，不借 `reward_transition_learning`。可沿用 `condition_accuracy`／`condition_rt`，输入 `not_frozen`、成熟度 `source_research_only`、策略 `literature_reimplementation` 和证据限制 `protocol_variant_unvalidated` 等原 key；本设计没有写共享注册或声称后台标签接通。其余没有精确匹配的维度留空，不新增／改名受控 key。

只新增本子目录设计材料；旧数列代码保持独立可回读。不开发运行器、试次序列、计分、后台、存储或产品接入，不改权限／COS／依赖／CI，不做时序预检／逐帧探测，不触发合并部署。审核的是一张图和简短介绍，附录只供来源与规则核对。
