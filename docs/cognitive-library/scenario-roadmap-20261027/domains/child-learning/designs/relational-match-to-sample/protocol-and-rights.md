# 图形关系匹配：设计 R1 附录

主审入口是 [单张原创图＋简短中英介绍](README.md)。本文件只解释提案，不是实现、有效度证明或接入记录。

## 来源身份与分别许可

主要方法来源：Shivaram, Shao, Simms, Hespos & Gentner (2023), *When do Children Pass the Relational-Match-To-Sample Task?*, CogSci 45, pp.2141–2148。作者所在大学的 [正式书目与 CC BY 4.0 声明](https://researchers.westernsydney.edu.au/en/publications/when-do-children-pass-the-relational-match-to-sample-task/) 和 [作者实验室全文](https://groups.psych.northwestern.edu/gentner/papers/ShivaramShaoSimmsHespos%26Gentner%282023%29WhenDoChildren.pdf) 已读取，PDF首页也有相同许可声明。

永久记录是 [eScholarship 27j6n7jm](https://escholarship.org/uc/item/27j6n7jm)。当前正式页未列本文 DOI，不编造 DOI；以永久记录及下载 PDF **SHA256 `860f44dbfebaaa15eb8939005736ee2551fcf63822a0609e56f51c70f6cce7b1`** 固定方法对象。相关先行研究 Christie & Gentner (2014) DOI **10.1111/cogs.12099** 仅为原文列出的历史参照，未冒称本节点重读全文。eScholarship正文页面遇JS验证、直接PDF返回429；未绕过，改读作者大学实验室独立公开的同题全文。原PDF／原图不纳入本交付。

|轴|本次取用与分发边界|
|---|---|
|代码|本轮没有采用外来运行器，也未核得可直接移植的完整上游源码。本提案未来拟项目独立实现；论文 CC BY 不是代码 MIT 许可，未拿论文许可代替未知脚本许可。|
|图片|本图与几何符号布局为 ImageGen 按项目描述原创的静态示意，不复制论文原图、商标、角色、照片或字体文件。未来界面拟自绘等大、单色的基础几何图形；可在本GitHub图审，不额外向第三方声明CC0／MIT或通用再分发权。|
|刺激／题库|拟自行编制图形三卡组合，不复制受限 ICAR、韦氏、瑞文或商业练习材料。论文 CC BY 4.0 方法可署名引用／改编，须标明改动；当前示例不是已完成正式题库，没有下载受限材料。|
|中英说明／译文|本包为项目自编说明、例子和报告模板，不是商业测验译本，也不是原论文指导语的等值译本；理解、跨语言和文化等值未验证。|

ICAR 当前 Scientific Use License 1 与按项目登记／禁止公开完整题库的边界保持不变，不因本项几何刺激简单就改称全部 public domain。另查言语类比综述时，Springer `10.3758/s13428-019-01312-3` 只开放预览，未读受限全文或取其题目；不把它列为已核可分发题库。

## 真正的任务缺口与领域边界

- 现有 matrix 的实际 `shared/prng.ts` 是 progression／alternation／combination 八格补全；本项是比较**两组对象内部关系是否相同**的二选一，不求矩阵缺失项。
- cardsort 的实际规则 cue 是颜色／形状及 switch／repeat；本项一直采用同一关系匹配规则，不操纵切换，不做DCCS或心与花。
- number-series 是教学后的数值规律应用；本项不用数字运算，研究几何对内关系对应。两者都涉及关系推理，不能加总成两个独立智力构念。
- SRT 是重复位置序列中连续反应的变化；本项每题三卡一直可见，不记忆序列、不用连续速度操纵。picturesequence／Corsi 是看后回报顺序，pairedassociate 是图形位置配对，均不提供同一关系二选一结构。
- 临床SART／PVT／AX-CPT、职业信息采样／信心／delay-choice、EI情绪识别及emotion-situation-understanding仍归原领域；MOT／ANT暂停WIP和心与花原归属不动。

本次实际核对共享分支、儿童本分支及三个领域最新远端；未发现本项 scorer、目录或候选占用。24旧项目前端目录相对已审 `a0130ea6603d7e37fd4f900d8694b5b7d490c51e` 在这五个快照均无变化，沿用原逐项代码审读并重读近邻 matrix／cardsort／lexicaldecision，不重跑旧测试、不把旧PASS当当前验收。远端未推送WIP不能由此穷尽，当前只占儿童领域的这一个设计提案。

## 原方法与拟改造

原文 Experiment 1 的 mixed 组使用8题，same／different各半；Experiment 2 改为卡内图形水平排列、mixed16题，每前／后8题两类各半。原施测由成人摆卡、孩子指选，标准卡与备选不共用形状，无事先教学或练习反馈，正式无对错反馈，末尾另有3道catch。本文未给浏览器源码或触屏个体常模。

本方案只用 **mixed**，不把same-only／different-only凑成另两种profile。拟采用水平两图形、上方标准卡＋下方同时可见的左右两卡；触屏首次点整张候选卡提交，无预选、无倒计时。标准先呈现、下方两卡随后一同出现，反应时从三卡全部就绪的软件时刻起算；不规定人为固定延迟或增加时序研究。正式卡片一直可见，无记忆要求。跳过和结束独立按钮。研究版每8题可休息，体验版完成一组即结束。

|profile 提案|正式题数|标准关系相同／不同|每条件正确侧左／右|估时（含说明练习）|
|---|---:|---:|---:|---|
|research|16|8／8|4／4|5–8分钟|
|experience|8|4／4|2／2|3–5分钟|

每组8题都包括4 same／4 different，每条件左右正确位置各2。短版保留完整一组，不能删掉different或只取最容易的题；两版同界面、同输入与教学。原研究的8／16题观察不证明本改造长短版等值。估时按每题约12–20秒，加约1.5–2分钟说明／练习及通常的短休息估计，未实测；不是截止时间。

图形规则明确为**形状身份**：同一卡内两形状相同为same，不同为different；大小、朝向、填充与颜色不另成隐含规则。所有图形拟统一单色、等名义尺寸、共同基线、无旋转／纹理难度，减少颜色单独作答捷径。每题一个候选为same、另一个different；两个候选的形状均不在标准卡出现，正确性取关系是否相同，避免把“找相同物体”当正确策略。只给设计示例，没有在本轮生成正式刺激组合、bank或顺序。

重要改造：原研究问**自发**关系匹配；我们明确教same／different、给例子并做练习，所以只能研究**教学后的关系应用**。自助触屏、单色图、教学与前置练习、取消事后catch／解释提问，均属改造；不继承原研究的年龄／发展阶段结论。拟用于能理解该说明的儿童非临床研究，适用年龄留null；成人可逐字读指导语，正式题不能代选或提示，未来需如实保留说明是否由成人照读，不新增家长权限机制。

## 教学与练习

完整中文说明提案：“先看上面那一对，再看下面两张卡。看看每一对里面是两个一样的图形，还是两个不同的图形。上面两个一样，就选下面两个也一样的一张；上面两个不同，就选下面两个也不同的一张。图形可以换，关系要对应。比如 `● ●` 对应 `▲ ▲`；`● ▲` 对应 `■ ★`。看清再点，不用抢答；点选会提交，不能改答。可以按‘这题先跳过’，也可以随时结束。先做四题简单练习；没通过或没做完，我们会一起重看全部说明和两个例子，再试，最多三轮。每八题后可休息。这里只描述今天这组题，不判断智力或作诊断。”

English proposal: “Look at the top pair, then the two lower cards. Check whether each pair contains two identical shapes or two different shapes. If the top pair is identical, choose an identical pair below. If the top pair is different, choose a different pair below. Shapes may change; the relation must match. For example, `● ●` matches `▲ ▲`, and `● ▲` matches `■ ★`. Look carefully; there is no race. Your first choice submits the answer and cannot be changed. You can skip an item or stop. First, try four simple practice items. If practice is failed or incomplete, review all instructions and both examples before trying again, with at most three rounds. You can rest after every eight items. We describe this activity only, not intelligence or a diagnosis.”

练习4题：same2／different2，位置左右都出现，使用最熟悉的基础图形，不提前重复正式三卡组合，逐题简短说明“这两对都是相同／不同”。4/4首答正确继续；失败或未完成均重呈**全部**说明和**两个**例子，再练，最多3轮，仍可结束，不生成正式零分。正式不即时给对错反馈，不通过练习不是能力结论。

## 记录、权威计算与报告提案

仅设计、没有scorer：每题拟保留真实计划及关系类别、正确侧、首个有效点选或明确跳过、软件onset／首答时间、完成／中断、输入及冻结材料身份。两候选都必须接受第一次有效响应，不能只收正确点击；提交后不能由后续点击改写。成人是否照读和实际教学language属于实际说明来源，未来随本次context冻结。

- 条件机会数 `N_r`＝该条件有首个有效选择或明确跳过的次数；实际计划、呈现、有选择、跳过、当前中断、后续未执行各自保留。正式全部完成时，research每类 `N=8`，experience每类 `N=4`；中断不补成错答，也不补满分母。
- 条件机会正确率 `A_r=C_r/N_r`，明确跳过计入机会分母，同时单列跳过数，不能冒称已选择错误。可选的“仅选择准确率”若用于研究须另用 `C_r/实际选择数`，不能混换分母。任何分母0则null，真实0正确／非零机会保留0。
- 正确首答软件用时 `T_r` 为该条件首答正确且时间有效试次的**中位数**；没有正确用时为null，不补0。真实软件0保留但不能称生理零反应时。用时为项目新增辅助描述，原成人摆卡研究不提供相同软件计时效度。
- 有符号差 `ΔA=A_different−A_same`、`ΔT=T_different−T_same`。正／负／真实0都保留，任一必要条件null则差值null。不能只保留正差或解释成“灵活性分数”；小条件分母尤其不稳定。

三态规则提案：完整计划、无中断且有实际选答可为interpretable，意思只是足够描述本次事实；有选答但未完整完成／中断为limited；无实际选择或资料不足以可靠对应为invalid。不借单人二选一的50%机会水平判“通过”，不从8题产生显著性、IQ或发展阶段结论。正式全部跳过时虽内部正确数是真0，但没有实际选答，公开状态为invalid，不显示“零能力”。原件身份／首答不可靠时不得生成表面完整的表现。

三态同时控制正文、可选至多一张标EDUK12.TOP的图片和下载：只有interpretable呈现实际计数、跳过及有限解释；limited／invalid不公开表现数值、不生成表现图片，下载只含状态与原因。内部质量字段、研究差值与筛选标记不进通用公共报告，不做0–100能力转换、常模或诊断。没有真实数据，不在图审图里填报告分数。

中英报告正文模板已设计，未运行：

- interpretable：“谢谢你认真完成。这次选对 {correct}/{opportunities} 题，明确跳过 {skipped} 题；‘两个一样’选对 {sameCorrect}/{sameN}，‘两个不同’选对 {differentCorrect}/{differentN}。这只是先学规则后完成这组题的记录。可以试着说说每一对里的关系，再选下一组；如果图形让你分心，先把两张卡都看一遍。题量少、练习和触屏会影响表现，不能据此判断智力或年龄水平。” / “Thank you for completing the activity. You chose the matching relation on {correct}/{opportunities} items and explicitly skipped {skipped}. Identical-pair items: {sameCorrect}/{sameN}; different-pair items: {differentCorrect}/{differentN}. This describes this set after instruction. Try describing the relation within each pair before comparing the cards. The small item count, practice and touchscreen affect performance; this does not determine intelligence or an age level.”
- limited：“谢谢你已经付出的努力。这次尚未完整完成或发生中断，先不解释表现。可以休息后重看说明，再决定是否完整体验。” / “Thank you for your effort. This session was incomplete or interrupted, so we will not interpret performance. Rest and review the instructions before deciding whether to try a complete activity.”
- invalid：“这次资料不足以生成可靠反馈，没有表现结果。这不代表你的能力；准备好后可以重新开始。” / “There is not enough information for reliable feedback, so no performance result is shown. This does not reflect your ability; you may start again when ready.”

## 版本、稳定标签及本轮边界

仅设计标识：协议 `relational-match-to-sample-protocol-proposal-r1`（教学、图形规则、profile、输入）；解释 `relational-match-to-sample-interpretation-proposal-r1`（分母、首答、三态）；报告 `relational-match-to-sample-report-proposal-r1`（中英正文／图片／下载）。批准后实际组合还须冻结正式bank、具体profile／序列与左右平衡、参数、说明language／照读方式和版本；不重算旧报告。当前没有实际运行tuple。

18维／131值仍按 `22721e5c63dd78819e8c58921adf20157cdaa08c` 的 taxonomy，blob `f28a14159348d3cebbfa04a3675b126307dd9e43`。cognitive_domain／target_process／paradigm／stimulus_form 当前无精确一般关系匹配值，留空，不借抑制或语义信心key；input_upstream无代码取用留空，input_proposed沿`not_frozen`。key_metric可沿`condition_accuracy`／`condition_rt`，intended_use沿`research_protocol_selection`；code_license／code_rights_disposition／asset_rights_disposition／asset_license_review不捏造对应值，许可用上表事实说明。implementation_strategy沿`literature_reimplementation`，maturity沿`source_research_only`；evidence_limitations沿`protocol_variant_unvalidated`／`cultural_language_burden`／`protocol_version_decision`，baseline_relation沿`protocol_variant`，research_priority沿`priority_finalize`，rule_type沿`theoretical_reference`／`project_provisional`。新标题不是新增受控key，不声称后台标签接通。

本轮仅新增此设计子目录，不修改共享README／注册表、数列／SRT源码或其他领域，不实现runner、正式序列、计分或后端接入，不增加schema／权限／COS／服务器／依赖／CI／时序门禁，不跑应用测试、不合并部署。当前只是下一项单项图审，不因前项已批准而视为本项获批。
