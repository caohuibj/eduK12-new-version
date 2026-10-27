# 下一候选提报：延迟选择

2026-10-27；DOT已确认唯一归属，现为待用户单项图审设计，未批准实现、未接入。没有新增runner、序列、计分器或共享标签。当前信息采样修订31ace660411d8fcaeab9917947a133973d744ce4保持独立可回读，既有四项WIP保留。

## 唯一提名与科学问题

建议稳定任务key：`delay-choice`，沿用本领域旧初稿命名；共享路线图proposalId=`discounting`只是同一个研究备选的旧登记名，不另计一个项目，不写注册表。

职业行为科研：收益增加多少、是否从今天开始等待、等待间隔多长，怎样影响本次较晚选项的选择比例。可交叉引用成人时间权衡研究；儿童钱／时间理解与适用性未核，不另复制儿童版本。不是职业匹配、耐心、自控、道德或诊断结论。

和已有任务区别：BART操纵爆破风险；气球努力操纵按压负荷和成功概率；Horizon操纵收益学习、信息不对称和未来探索机会；反转学习操纵反馈规则；信息采样操纵揭证据与采样成本。此项只比较明示金额和获得时间，没有风险、执行负荷、反馈学习或揭格步骤。两个选项都是假想点数，不实际付款或真的等待数周。

## 当前源码去重与占用

固定远端快照：

| 分支 | 实读HEAD | 额外实际内容候选／归属 |
| --- | --- | --- |
| cognitive-next-three-core-20261026 | 072b2900d4295c7d741d5e55c9ce6cfbbf6f58d2 | 24旧＋11原候选之外已有hearts-flowers；保留原线程 |
| cognitive/domain-child-learning-20261027 | 5db79eb8cfbbe97d05f048d50fd8bed3a1794391 | number-series；DCCS仅储备，不侵占 |
| cognitive/domain-clinical-research-20261027 | 4b3351509088683cf91e82c7bc8eb87a5333d2d2 | sart；后续PVT与AX-CPT保留该领域 |
| cognitive/domain-emotion-ei-20261027 | 215e9bbd96769064723b38d8f594c6b07c03fa4f | voice-emotion-cues，实际六类语音判断 |
| cognitive/domain-occupational-20261027 | 31ace660411d8fcaeab9917947a133973d744ce4 | information-sampling；知觉信心、单方分配、信任互惠仍是原WIP |
| main | 7e6d7da4a01e4a42b410cf2dbdcfa76f11759fdc | 只读，不以内容候选存在推断main接入 |

重读认知主线24个真实任务semantics（排除fake）和11个原候选protocol；35个定义文件blob均与此前实读a0130ea6603d7e37fd4f900d8694b5b7d490c51e一致。BART、反转学习、努力及Horizon前端组件也比对旧blob并重读交互；新增四领域协议/说明按各自HEAD核对。五分支当前树没有delay-choice/discount实现路径；并非只信路线图早期“未开发”文案。这里只做源码去重，没有执行或验收任何旧测验，也没有把不同profile／版本另计项目。远端未推送的他人下一方案不能从树中确认；DOT随后明确本项仅归职业科研，其他领域新候选为serial-reaction-learning、pvt、emotion-situation-understanding，不与本项重复。

## 固定来源与许可

[Experiment Factory discount_titrate/experiment.js](https://github.com/expfactory/expfactory-experiments/blob/49b8123f18b26d94dfc010bb8a6ec7458b265e2e/discount_titrate/experiment.js)：commit `49b8123f18b26d94dfc010bb8a6ec7458b265e2e`；blob `84bbe4c3553a6cca64d596bd1aa5a33fdaad254e`；SHA256 `d9d7d20b111d4a407ff7806023d8af89d4b0172665d1383ac812c82b6ea61de8`；11929字节。此次从官方raw重新下载，并核Git blob及旧本地副本一致，未执行源码。

[同提交LICENSE](https://github.com/expfactory/expfactory-experiments/blob/49b8123f18b26d94dfc010bb8a6ec7458b265e2e/LICENSE)：MIT；blob `7ef17fe706ce88195e18473069d561dd4910a5ee`；SHA256 `aa4ae580fda10274025d5b8de586822deb3c6c60d459c3b3ae646c87557993aa`；1102字节。若取用代码或实质部分，保留完整2016 Vanessa Sochat／Stanford版权及许可通知。原rnorm另注明外部代码来源，本项目不取用该helper、旧jsPsych或其依赖。

原始实现：预先组成36题＝9个金额倍率（1.01/1.05/1.10/1.15/1.20/1.25/1.30/1.50/1.75）×4个延迟对（今天→2周、今天→4周、2周→4周、2周→6周）；较小金额正态20±10、裁到5–40，较大金额四舍五入至分。单个练习后将36题随机排序，Q/P键首选；不是根据回答自适应滴定。说明承诺随机抽一道题兑现未来奖金，本项目不复制此承诺，也不继承上游credit_var的用时／遗漏阈值。

代码、图片、题库、译文分别处置：根MIT仅作为取用软件／文档的通知依据；没有单独取得原图片、字体、品牌、受限题库或现成译文的公开分发授权，不引入这些材料。拟独立设计几何金额卡、公开数字条件和原创中英说明；翻译等效性未核。当前只保存原创方案及来源引用；未复制源码、第三方图片、完整源指导语、题库或运行时。

## 拟双profile与负担：尚未冻结

| 项目 | research | experience |
| --- | --- | --- |
| 正式选择 | 72＝36条件×2重复 | 36＝36条件×1重复 |
| 条件 | 相同9倍率×4延迟对 | 保留全部条件 |
| 总时长预算 | 约6–10分钟 | 约4–7分钟 |

两版同界面、无答题倒计时。估时依据为每题约3–5秒＋约0.5秒过渡，加教学／练习约2–3分钟；不是已实测耗时、时间上限或短版效度。重练另预留1–2分钟；可休息或结束。金额／时间理解负担中等，动作负担较低。

提案把较小金额固定为20.00假想点，较大金额依同9倍率为20.20–35.00点，减少随机金额这个额外因素；四个延迟对写明均从今天起算0/14/28/42天。固定基准、假想激励、增加重复及触屏卡片均是本项目变式，不称原研究等效。左右位置拟平衡并随将来版本冻结，具体图稿展示后才定。两卡在手机及平板都完整显示金额、日期和“假想／不付款”，不靠颜色区别选项。

完整中英说明及例子在正式和练习前呈现。中文核心：“两边都是假想奖励，不会实际付款。请比较数量和获得时间，选你更愿意要的一边。没有正确答案，也不要求总选较多或较早。首次有效选择结束本题。” English: “Both rewards are hypothetical; no payment will be made. Compare the amount and when it would be received, then choose the option you prefer. There is no correct choice and no requirement to choose more or sooner. Your first valid choice ends the item.” 例：今天20点／两周后25点；任一均合法，不用红绿反馈评价偏好。

拟2题简短操作练习＋2道理解题，分别覆盖“金额／哪一天获得”和“假想、无实际付款”。完成两次操作并理解题全对才继续，不按偏好、收益、速度或一致性过关。失败或未完成先重呈全部说明与例子再练，最多3组，可退出。不把练习选择混入正式统计。

## 未来可解释记录的边界

首个有效选项激活锁定答案；无默认选择。逐题保留金额、两日期、条件、版本、教学语言、首次输入、选择及实际软件用时；不生成时序精度门禁。已呈现无回答是遗漏；未呈现另列；中断不补答、不中断已有有效回答。较早选择可编码0、较晚1；无回答为null，0不是0能力或答错。

条件j晚选比例Pj=Lj/Vj，Lj为该条件真实有效较晚选择数，Vj为真实有效二选一总数；Vj=0则null。所有选择包括全选早／晚都合法。跨条件差明确写Pa−Pb，保留符号；只在预定条件覆盖可比时呈现，缺条件不补0。不估k、AUC、IQ、常模、诊断、自控或岗位匹配，也不把少量重复称稳定个体参数。比例是描述定义，不冒充已完成的心理折扣模型估计。

将来报告要给真实选择数、条件覆盖、普通中英解释、建议“把收益与等待条件一起写清再比较”和简短限制。三态同时控制正文／小图／下载：完整可核记录可描述本次；不完整仅描述实际覆盖、抑制缺分母比较；无可解释记录不生成表现图或下载。协议、参数解释、报告呈现分别版本，冻结实际组合，不重算旧报告。

18维沿现有key；当前可映射cognitive_domain=decision_learning、intended_use=research_protocol_selection。时间偏好/延迟范式没有精确受控值处留空，不新造key或把风险／努力标签套上。没有后台标签接通声明。

DOT已确认唯一归属；当前原创界面图＋简短实施介绍见delay-choice-review.png与delay-choice-brief.md，具体条件／预算见delay-choice-appendix.md。体验版按每题3–5秒＋0.5秒过渡及教学2–3分钟计算为4.1–6.3分钟，修正旧初稿约4–6为约4–7分钟。只按授权推送本项设计资料，不把既有总览图、本提案或归属确认当开发批准，不触发CI、共享集成或产品接入。
