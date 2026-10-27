# 图形关系匹配：设计 R2 附录

主审入口是 [单张原创图＋简短中英介绍](README.md)。用户要求提高难度并覆盖三个人群版本。本文件只解释新的提案，不是实现、有效度证明或接入记录。R1仅有两图形same／different的正式条件已被本次方案替代。

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
- patterncompare 的实际代码比较单个图案的shape／fill／marks／rotation是否相同；本项允许形状整体替换，比较多个位置的等价成组结构，不是照原样图案找不同。
- SRT 是重复位置序列中连续反应的变化；本项每题三卡一直可见，不记忆序列、不用连续速度操纵。picturesequence／Corsi 是看后回报顺序，pairedassociate 是图形位置配对，均不提供同一关系二选一结构。
- 临床SART／PVT／AX-CPT、职业信息采样／信心／delay-choice、EI情绪识别及emotion-situation-understanding仍归原领域；MOT／ANT暂停WIP和心与花原归属不动。

R1前已实际核对共享分支、儿童本分支及三个领域当时最新远端；未发现其他拥有者的相同候选。R2仅修订本项自有设计目录，没有将它重新计为另一新项目。24旧项目前端目录相对已审 `a0130ea6603d7e37fd4f900d8694b5b7d490c51e` 在这五个快照均无变化，沿用原逐项代码审读并重读近邻 matrix／cardsort／lexicaldecision，不重跑旧测试、不把旧PASS当当前验收。远端未推送WIP不能由此穷尽，当前只占儿童领域的这一个设计提案。

## 难度依据与新增许可边界

新增方法依据：Richland, Morrison & Holyoak (2006), *Children’s development of analogical reasoning: Insights from scene analogy problems*, DOI **10.1016/j.jecp.2006.02.002**。已读 [作者大学实验室提供的全文](https://sites.lifesci.ucla.edu/psych-reasoninglab/wp-content/uploads/sites/273/2021/04/Richland-Morrison-Holyoak2006.pdf) 的摘要、方法及相关讨论；下载PDF SHA256 **`531e51caa982fa958e646ef85d6ec6fcf889ede2450462315913c66496944632`**。该研究分别操纵需整合的关系与外形干扰，为两个难度方向提供方法依据；**不提供本项目2／4／6／8位置变式的标定**。

该文注明 ©2006 Elsevier、all rights reserved。只引用方法思想，不复制场景图片、原题、原指导语、译文或代码，也不把作者网页可读当作再分发许可。用于先期核对的作者托管会议稿同样不作为可复制题库。原2023论文CC BY4.0只覆盖其相应内容，不能替2006素材授权。本包图像／示例／说明依旧原创，无外来场景或受限题库。额外检索到的 iScience 论文全文API500、出版社403，未取得可依赖的全文，不以其片段支持本设计。

## 原方法与R2的实质变化

2023原方法采用两图形same／different的三卡关系匹配，mixed8／16题、成人摆卡、孩子指选，没有预先教学，另有末尾catch；不等同本项。R2保留“标准卡＋两候选、指选”的交互家族，改成**已教学的多位置成组关系应用**。学前版2位置基础题仍是same／different，其余条件均为原创多位置扩展。不能将其称为经典RMTS、韦氏或瑞文的等价版，更不能把2006的实景关系结果当成这套几何刺激已经有效。

三个population版本由研究分组明确指定，每版各有research／experience，合计**六个分别冻结组合**。参考年龄只帮助沟通，不自动依生日路由，不新增年龄权限、服务器或schema机制。无经过验证的年龄界限、难度等级、中文／照读／触屏／长短版等值；青少年／成人合并标签也不意味着所有年龄有同等难度。

### 唯一答案规则

把每张卡中的位置按行读取。两张卡关系相同，当且仅当：对任意两位置i、j，上方这两位置用同一种图形，下方相应两位置也用同一种图形；上方不同，下方也必须不同。可写为 **`E_X(i,j) = [X_i = X_j]`，正确选项满足所有i、j的 `E_option = E_standard`**。这是项目对成组关系的明确规则，不称为文献中的标准心理计分公式。

图形身份可以整体替换，位置顺序不能换。每题两候选恰好一张完全满足该规则，另一张至少破坏一个成组关系。4位置及以上，三卡采用相同的“每种形状各出现两次”频数结构，两个选项相同种类数／重复次数，避免只数种类、重复量或选某个固定图形。2位置基础题例外：same与different本就包含不同重复次数，只作学前基础条件。

以下是**静态审阅示例**，字母只标识图形身份，不要求参与者认识字母，不是已生成的正式题库或序列：

|示例|标准位置关系|正确替换|错误关系（下列为外形线索冲突示例）|错误原因|
|---|---|---|---|---|
|2位置|`A A`|`C C`|`A B`|标准两位置相同，错误卡不同|
|4位置|`A A B B`|`B B A A`|`A B A B`|标准成组为1–2、3–4，错误卡为1–3、2–4|
|6位置|`A B C A C B`|`A C B A B C`|`A B C A B C`|标准2–6、3–5相同，错误卡2–5、3–6相同|
|8位置|`A B C A D C B D`|`D B C D A C B A`|`A B C D A C B D`|错误卡仍满足部分成组，却破坏1–4和5–8|

网格分别为2位置一行两格、4位置两行两格、6位置两行三格、8位置两行四格。同一道题三卡网格相同，逐行对应。整张候选卡接受首次点选，不要求精准点某个小符号。形状保持清晰、尺寸足够、同一固定朝向，无动态掩蔽、噪声或缩短时限；候选不足以清晰摆放时应扩大卡片，不能压小图形制造难度。形状库排除“菱形就是旋转方形”等等价歧义，不以朝向／模糊轮廓作为关系判断捷径。

### 四格条件与六组合

每个人群版均采用 `complexity ∈ {basic, complex}` × `surfaceCue ∈ {congruent, conflict}`。这些名称表示客观结构操纵，不能当作已经标定的易／难等级。早先草图“无／有外形诱饵”已替换：只让错误项复用标准图形会留下“总选新图形”的捷径，不能满足本次加难目的。

- 4位置以上，标准、正确卡、错误卡复用相同图形词汇，每种形状各两次。两候选有相同图形种类、全局数量和重复次数，不能靠新旧图形或计数决定正确。
- 用 `M(option)=Σ_i [standard_i = option_i]` 仅在设计附录核对**对应位置外形重合数**。congruent格满足 `M(correct)>M(wrong)`，conflict格满足 `M(correct)<M(wrong)`；平手不塞进这两格。这个M是刺激控制量，不是参与者能力分或公开指标。
- 两种cue格同样多，所以固定选“最像”或“最不像”都不能覆盖全部条件。正式bank还须改变正确重标记方式及M值，不能让正确项恒为某个M值、固定形状／位置或某行局部模板；本图不是全部题目的生成规则。当前没有生成正式bank。
- 2位置是学前基础例外：same标准只有一种形状，different需要两种；不能同时强称全局词汇／重复次数完全相同。仍把外形重合有利／误导与same／different平衡，不能把“全是新图形”固定当正确策略。
- 例：4位置标准AABB，正确AABB相对错误ABAB为congruent；正确BBAA相对ABAB为conflict。6位置标准ABCACB，正确ACBABC：相对错误BCACBA为congruent（M为2对0），相对错误ABCABC为conflict（2对4）。8位置标准ABCADCBD，正确DBCDACBA：相对错误BACDBACD为congruent（4对2），相对错误ABCDACBD为conflict（4对6）。所有正确项都保持完整的成组关系，错误项破坏关系。

2006原研究对照为无外形干扰；本项目使用方向平衡的congruent／conflict作为原创刺激控制，不宣称复刻其操纵。2023原方法排除标准与候选共用形状；R2也已明确改变这点。

|版本|basic／complex位置数|research四格条件|experience四格条件|估时research／experience|
|---|---|---|---|---|
|preschool，学前参考4–6岁|2／4|每格4＝16题，每格正确左2／右2|每格2＝8题，每格正确左1／右1|5–9／3–6分钟|
|primary，小学参考6–12岁|4／6|每格4＝16题，每格正确左2／右2|每格2＝8题，每格正确左1／右1|6–10／4–6分钟|
|adolescent-adult，青少年／成人|6／8|每格4＝16题，每格正确左2／右2|每格2＝8题，每格正确左1／右1|7–12／4–7分钟|

每组8题包含每格2题，研究版两组、体验版一组；短版不删高复杂或诱饵格。学前2位置格同时覆盖same／different，短版每格各一，两格合计左右也与关系平衡；不把它当三版本共用的主分类。正式不显示外形线索方向标签；孩子需要依指导语核对成组关系，不能从条件名称推答案。具体正式bank尚未编制。版本内的实际组合、形状／布局、材料身份及顺序须批准后冻结，不能临时按作答表现换难度或跨版拼接。

估时按学前每题约12–25秒、小学15–30秒、青少年／成人20–35秒，加约1.5–2.5分钟初次教学／例子／简单练习与通常短休息估计。全部未实测，也不是截止时间；练习重试、较长核对或休息可更久。关系更复杂后不再沿用R1统一体验3–5分钟的预算。提高复杂度和诱饵仅是控制天花板风险的提案，是否真正没有天花板需要目标人群的真实分布；本轮不伪造通过率、不新增实证招募或开发门禁。

## 各版教学、例子与简单练习

通用指导语：“先看上方卡片，看看哪些位置放的是同一种图形。下方选一张：图形可以换，相同位置的成组关系要对应。请把几个位置一起看，慢慢核对，不用抢答。两张候选可以用同样的图形；外形更像的卡不一定关系也对应。点选会提交，不能改答。可以先跳过，也可以随时结束。每八题后可以休息。”

English: “Look at the upper card and notice which positions contain the same shape. Choose one lower card: the shapes may change, but the grouping of corresponding positions must match. Check the positions together and take your time. The alternatives may use the same shapes; greater surface similarity does not always mean the groups match. Your first choice submits the answer and cannot be changed. You may skip an item, rest after eight items, or stop.”

每版在正式前有完整中英说明、该版basic与complex各一个明确例子；学前从2位置的same／different开始，再示范4位置，不能只教两图形就开始4位置正式题。小学完整讲4与6位置，青少年／成人讲6与8位置。示例可用视觉标记逐步指出同组位置，正式题不保留答案线或高亮。成人可逐字读说明，不提示或代选正式题；实际照读状态与language未来随context保留。

每版练习仍只有4题、四格各一，采用连续成组等更直观布局而非正式较复杂的交错布局，逐题解释所有关键对应关系。练习同时讲清：外形更像标准的卡可能对，也可能成组不对；需要核对关系。4/4首答正确继续；失败或未完成均重呈全部说明与本版两个例子，再练，最多3轮，可结束。未通过不是能力结论，不生成正式零分。正式首次选择或明确跳过生效，不能只收正确点击；不即时反馈对错，不用练习题作正式题。

## 原件、条件分母与有符号计算提案

当前没有实现或实际原件。未来需保留population版本、profile、每题位置数／成组结构／外形线索方向／正确侧、实际首响应／跳过／中断、软件onset与首答时间、材料和三层版本。两候选都接受第一有效响应，后续点击不能改写；未执行与当前中断不补错答。实际教学language／照读状态随本次context冻结。

- 四格 `c=(complexity,surfaceCue)` 的机会数 `N_c`＝该格有首个有效选择或明确跳过的次数。完整research每格4，experience每格2；计划／呈现／选择／跳过／中断／未执行分别保留，不补满缺失分母。
- `A_c=C_c/N_c` 为机会正确率，跳过单列并计入机会分母，不称为已选择错误；若另研究仅选择准确率，须另用实际选择数作分母。分母0为null；真实0正确／非零机会保留0。
- `T_c`＝该格首答正确且时间有效的**中位软件用时**。没有正确用时为null，不补0；真实软件0可保留但不称生理零反应。辅助时间是项目新增记录，不继承摆卡研究的计时效度。
- 同版本内，`ΔA_complexity=(A_complex,congruent+A_complex,conflict)/2−(A_basic,congruent+A_basic,conflict)/2`；`ΔA_surface=(A_basic,conflict+A_complex,conflict)/2−(A_basic,congruent+A_complex,congruent)/2`。两个因素按格等权，明确不是按缺失多少变权。时间差将A换为T，表示格中位数的等权差，不冒称合并样本中位数。任一需要的格null，则相应差为null；保留正、负、真实0，不裁成“能力分”。这些差值仅供研究描述，小分母不支持稳定个体推断。

三版材料、关系数量及负担不同，原始正确数／时间／差值**不能直接作跨年龄排名或能力增长曲线**。只有同一冻结版本和profile的实际记录才使用该组合解释，不混为一个总分或重算旧报告。

## 三态公开投影与完整中英报告模板

interpretable仅指完整计划、无中断且有真实选答，足够描述本次事实；有选答但未完成／中断为limited；无实际选择或资料不足以可靠对应为invalid。全部跳过时内部正确数虽是真0，公开为invalid，不显示“零能力”。资料身份／首答不可靠时不得生成表面完整表现。不拿二选一50%机会水平给单人贴“通过”标签。

正文、可选至多一张EDUK12.TOP图片和下载同步按三态控制；limited／invalid没有表现数值、表现图片或数值下载。内部格差值、筛选标记与研究指标不进通用公开报告；不生成0–100能力转换、IQ、常模、诊断、岗位预测或跨年龄名次。

- interpretable：“谢谢你认真完成。这次是{versionName}的{profileName}，你选对{correct}/{opportunities}题，明确跳过{skipped}题。基础位置条件选对{basicCorrect}/{basicN}，较多位置条件选对{complexCorrect}/{complexN}。这是先学规则后完成这组题的记录。可以先找哪些位置是一组，再把两张候选卡都核对一遍。题量少、教学、干扰图形与触屏都会影响表现；这不是智力、年龄水平或与其他版本的比较。” / “Thank you for completing the {versionName}, {profileName} activity. You chose the matching grouping on {correct}/{opportunities} items and explicitly skipped {skipped}. Fewer-position items: {basicCorrect}/{basicN}; more-position items: {complexCorrect}/{complexN}. This describes this set after instruction. Identify the position groups, then check both alternatives. The small item count, teaching, distracting shapes and touchscreen affect performance. This is not intelligence, an age level, or a comparison with another version.”
- limited：“谢谢你已经付出的努力。这次尚未完整完成或发生中断，先不解释表现。可以休息后重看本版说明与例子，再决定是否完整体验。” / “Thank you for your effort. This session was incomplete or interrupted, so we will not interpret performance. Rest and review this version’s instructions and examples before deciding whether to try a complete activity.”
- invalid：“这次资料不足以生成可靠反馈，没有表现结果。这不代表你的能力；准备好后可以重新开始。” / “There is not enough information for reliable feedback, so no performance result is shown. This does not reflect your ability; you may start again when ready.”

## 三层版本、稳定标签与交付边界

设计标识分别升级：`relational-match-to-sample-protocol-proposal-r2`、`relational-match-to-sample-interpretation-proposal-r2`、`relational-match-to-sample-report-proposal-r2`。批准后按population×profile冻结六种实际组合，同时绑定bank／实际材料与顺序、参数、网格／输入／教学来源和版本。R1未开发的历史不倒写为三版；旧报告不得因新解释重算。当前仍没有实际运行tuple。

18维／131值保持固定 `22721e5c63dd78819e8c58921adf20157cdaa08c`、taxonomy blob `f28a14159348d3cebbfa04a3675b126307dd9e43`。cognitive_domain／target_process／paradigm／stimulus_form无准确多位置关系匹配值，留空；input_upstream无代码取用留空，input_proposed沿`not_frozen`。key_metric沿`condition_accuracy`／`condition_rt`，intended_use沿`research_protocol_selection`；许可相关维度不捏造匹配值，依分轴事实说明。implementation_strategy沿`literature_reimplementation`，maturity沿`source_research_only`；evidence_limitations沿`protocol_variant_unvalidated`／`cultural_language_burden`／`protocol_version_decision`，baseline_relation沿`protocol_variant`，research_priority沿`priority_finalize`，rule_type沿`theoretical_reference`／`project_provisional`。人群版本是本项材料区分，不新增共享年龄标签或后台路由。

本轮仅修订本设计目录的四个材料文件，不写runner、正式序列、题库生成或计分实现，不修改数列／SRT源码、共享README／注册、其他领域、权限／COS／服务器／schema／依赖／CI，不跑应用测试、不合并部署。用户认可操作并要求三个版本，是本次图审的任务范围；具体加难刺激与六组合仍需图审确认后才开发。
