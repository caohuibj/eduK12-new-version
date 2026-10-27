# PVT 图审附录 · 设计修订 0.1.1

2026-10-27。`pvt` 唯一归属 clinical-research，DOT 已确认；用户已认可界面图并要求练习缩为3次，随后讨论实用版120秒；用户明确要求暂不开发。120秒是本次修订方案，不声称取得开发授权。只含原创静态资料，无 runner、随机序列生成器、计分代码或测试入口。本次只修订设计，不启动开发。

## 来源与核验范围

主要方法来源：[Basner, Mollicone & Dinges (2011), DOI 10.1016/j.actaastro.2011.07.015，作者实验室公开全文](https://www.med.upenn.edu/uep/assets/user-content/documents/Basner2011-ValidityandsensitivityofabriefPVT.pdf)。已读印刷页 950–952 的 §§2.1–2.4，并转图人工核看页951；本地 PDF SHA256 `0ca4776d8de0f18527ea7225a6ed40c80f2255bec0933049eb9047847b00ea1c`。此前 PMC 挑战未被绕过，此次从作者机构合法公开入口补核。

原文核得：10分钟版随机等待2–10秒、PVT-B为3分钟及1–4秒，等待含1秒反应时间反馈；30秒无回应给信号并按30秒计入。无刺激按下或RT<100ms归提前按，RT≥500ms归lapse；355ms是PVT-B另作分析的阈值。原文不充分规定每次提前按后的等待重启、末次等待／已出现目标的时间终点细节，不能冒称这些已复刻。原实验是受控睡眠研究，不能给本项目临床效度背书。引言亦提醒已有部分2分钟版本对睡眠不足不够敏感，因此120秒项目版不用于确认疲劳影响。

补充核验：[Basner & Dinges (2011), DOI 10.1093/sleep/34.5.581](https://pubmed.ncbi.nlm.nih.gov/21532951/)的摘要支持将逐次RT倒数平均作为研究指标，未将中位RT当唯一警觉指标；此条只声称读摘要。[Matsangas et al. (2017), DOI 10.3758/s13428-016-0821-2](https://faculty.nps.edu/nlshattuck/docs/Matsangas%20et%20al%20%282017%29%20-%20Preliminary%20validation%20study%20of%20the%203-min%20wrist-worn%20psychomotor%20vigilance%20test.pdf)已读Methods与Table1，另确认设备与等待规则不可互换；不外推其设备验证。

## 分项权利与公开分发

| 部分 | 固定来源／权利判断 | 本设计处理 |
| --- | --- | --- |
| 参考源码 | [marsja/psychomotor_vigilance_task@053e76820b404eeba3a6ac10f09679c1a56042c2](https://github.com/marsja/psychomotor_vigilance_task/tree/053e76820b404eeba3a6ac10f09679c1a56042c2)，README blob `1eee318cb80e406e3c404e6d3df6e8f8972defef`；仅明确科研／学生使用并需致谢，未核得通用修改再分发许可，不能称MIT | 不复制或分发该源码；若将来获开发批准，依公开文献独立实现 |
| 论文／原图 | 2011 PDF明示Elsevier保留版权；公开可读不等于可随包分发。2017文献不据机构公开副本推定额外分发权 | 只放链接、DOI、页码与本设计的方法概述；原PDF及转图仅在/tmp核看，不入Git |
| 界面／刺激图片 | 本项目新编HTML/CSS与几何空心圆、实心圆；无外部照片、标志、截图、音频或字体文件 | PNG由本HTML渲染，作为本仓原创设计资料交付；不把第三方素材改标为本项目许可，不新设整个仓库许可证 |
| 题库 | 无外部题库，无词表或临床试题复制 | 使用单一原创几何目标，不借题库授权 |
| 中英说明／译文 | 本项目新编，非原版指导语复制或认证翻译 | 连同设计文档公开审阅；不称中文理解或跨文化效度已验证 |

## 两个profile与单次规则

research正式时间600000ms，experience正式时间120000ms。两者使用同一界面与规则；本两分钟版是项目变式，名称不用PVT-B；目标更少，对注意波动的描述更有限，用于简短观察，科研版仍保留600秒，不主张两分钟敏感性已验证。目标次数由持续时间与真实行为产生，无固定目标数，未知次数不填0。上述全流程11–13／3–5分钟为预算，阅读和最多一次重练可能延长。

拟以毫秒粒度均匀抽取闭区间[2000,10000]的等待；“均匀／毫秒粒度”是项目参数提案，原论文只明确随机范围。等待从上一目标回应、超时或等待期提前按的结束事件开始计算，其中前1000ms为中性反馈，不另叠加一秒。第一段等待无前题反馈，同范围。尚无种子、随机清单或生成代码；未来批准后再冻结实际计划，不能预填“已生成”。

刺激提案为空心圆等待、同位置白色实心圆出现；直径88 CSS像素，中央深色观察区，固定大回应区。深色与实心变化共同提示，无颜色辨认要求，无动态毫秒计数器、进度条或倒计时；结束入口持续可见。图审图是手机说明与平板任务的静态排列，不是正在运行的任务。

看见实心圆后尽快新按回应区／空格；鼠标、触控、键盘沿同一个首次按下语义。第一次新的按下为唯一首答；松开不是首答；持键、系统repeat、兼容鼠标事件或同一次触摸不产生第二个回应。观察区不另当第二个按钮。设备延迟、手部动作、中文理解与时间分辨能力均未验证，不增加时序预检、逐帧探测或一帧阻断。

## 完整教学与练习

**中文首屏全文提案：**

请看中央的圆。只有空心圆时，先等一等；圆变成白色实心后，尽快按一次“回应”，然后抬起。电脑也可用空格键。每次等待长短不同，请不要猜时间，也不要一直按着。

例子：空心圆 → 继续等；白色实心圆 → 按一下并抬起。若提前按，屏幕会提醒等目标出现；下一次重新等待。按后会短暂显示“已记录”，不显示奖励或速度等级。目标出现后30秒仍未回应，会提示本次未答，再继续。需要停下时，可以选择“结束本次”。

先练3次，没有速度合格线。3次都在目标出现后按过一次，就能进入正式；提前按或未完成时，会先重新显示这段说明与例子，再练一次。最多两组，仍未完成可以结束。练习记录与正式记录分开。

正式科研版持续10分钟，实用版持续2分钟，目标次数不固定。到时间时屏幕会停止：正在等待不会算漏答；刚出现但还没观察完的目标会单独注明。请按实际看到的目标回应，不用追求某种分数。

**English instruction proposal:**

Watch the circle in the centre. Wait while it is an outline. When it becomes a solid white circle, press Respond once as quickly as you can, then release. On a computer you may use the space bar. The wait changes each time. Do not guess when the target will appear or keep the button held down.

Example: outline circle → wait; solid white circle → press once and release. An early press brings a reminder to wait, followed by a new wait. After a response, a short Recorded message appears; there is no reward or speed grade. If a target receives no response for 30 seconds, a No response recorded message appears before the next wait. Choose End this attempt whenever you need to stop.

Practise three targets first. There is no speed pass mark. Respond after each of the three targets to continue. An early press or incomplete practice brings back these instructions and examples before one retry. There are at most two practice groups; you can finish without starting the main task. Practice records are separate.

The research version lasts ten minutes and the practical version two minutes. The number of targets varies. At the time limit, the display stops. An unfinished wait is not a missed target. A target that has just appeared and could not be fully observed is listed separately. Respond to what you actually see rather than aiming for a score.

**练习参数提案：**每组3个目标，等待各为3／5／3秒，慢节奏中性反馈2秒且包含在下一等待中；练习无100ms判定线、不要求快，只须无提前按并在三个目标后各新按一次。每目标仍有30秒无回应上限；提前按、无回应、主动退出或未完成不算练习通过，重新显示完整说明与例子。最多两组，不无限重试，不把教学通过率解释为能力；没有另写示例生成器。

## 提前按、未答、终点和中断：项目边界决定

以下均为待图审项目规则，未声称原论文明确规定，也未实现。

| 实际情况 | 记录与下一步 |
| --- | --- |
| 等待期第一次新按下 | 记一次等待提前按，RT=null，因为目标尚未出现。显示“等圆变实心后再按”1000ms；从这次事件重新抽取2–10秒等待，包含反馈。反馈内按下不再累计，不让一串按键刷新或拖长反馈。松开后、反馈结束的等待期间下一次新按下才可成为新的提前按事件 |
| 目标出现后的首答 | 以目标出现到首个新按下的实际差为RT。0≤RT<100ms记“目标后过早首答”，保留真实RT（含0），不算有效速度样本；100≤RT<30000ms为有效RT。首答结束该目标，后续按下不能替换首答；反馈1000ms期间不采为下一题首答 |
| 目标出现后30秒仍无首答 | 仅在完整观察满30000ms时记timeout未答，RT=null；另保留观察满30秒这一事实。显示中性未答提示1000ms后按原等待规则继续，无声音。与原文把它代入30秒RT不同，不能混用原论文指标 |
| 达到正式时限T，仍在等待 | 结束等待、不出现新目标、不算未答。未执行目标不进任何目标分母；等待提前按事件保留真实次数 |
| 达到T，目标已出现但未结束 | 将此目标列为scheduled-end-censored，RT=null，保留实际观察时长；不算timeout、正确或错误，不进完整目标分母，不延时补答 |
| 目标的30秒窗口与T恰好同时结束 | 完整观察30秒则timeout成立；若不足则仅时限截断。输入仅在目标窗口与正式窗口交集的半开区间内接受；恰在目标30秒边界或T的按下不能成为迟到首答。事件的实际时间决定归属，不凭异步处理先后改写 |
| 主动结束、页面离开／隐藏或异常停止 | 结束本次，不自动续跑或补齐时间；标明原因与实际观察时长。正在看的目标记interrupted而非timeout；等待没有目标则不增加目标分母。已有完整记录可以有限描述，不冒称完成600／120秒；尚未开始与中断分开 |
| 目标出现时仍持键／触摸 | 不把旧按住状态当新首答，不暂停或重置正式时间；必须释放后新的按下才回应。不能在结束时补造一次首答 |

## 研究指标、条件分母与缺失

这是公式设计，不是scorer实现。令A为正式已出现目标数，V为有有效首答目标数，F为目标后RT<100ms的目标数，O为完整30秒无首答数，C为正常时限截断数，I为意外／主动中断目标数。各目标只归一类，A=V+F+O+C+I，完整观察目标D=V+F+O。等待期提前按W是事件次数，可能多于目标数，不拿W/A伪造概率。练习和正式各算各的，不合并分母；无No-Go条件，No-Go指标为null而非0。

- 内部响应速度：S=(1/V)×Σ(1000/RT_ms)，仅有效首答，单位s⁻¹；这是原文逐次倒数再平均的公式，不能改成1000/平均RT。项目排除了timeout代值，因此属于修改后的有效首答描述，不能冒充原文相同分析集。V=0时S=null。
- 内部较慢首答数L=有效首答中RT≥500ms的数量；比例L/V，V=0为null；不采用355ms，不与临床阈值或常模比较。O单列，不能把未按加进L或伪成RT=30000。
- 未答比例O/D；目标后过早首答比例F/D；D=0则各为null。正常时限截断C与中断I不进D，但分别公开说明实际数量，不藏掉部分观察。有效首答为0与无数据不能混同；O=0在D>0且观察完整时是真实0。
- 内部时间进程差：按目标出现时刻分前后半段（T/2），每半段用自己的有效样本数；ΔS=S后半−S前半，保留正负号，两半任一无样本则null。仅可作探索性描述，不对实用版输出稳定趋势判断，不把个体差异归因睡眠或ADHD。
- 不计算0–100能力总分、IQ、诊断、同龄排名或岗位预测。内部速度、阈值比例与半段差不直接投射公开个人报告；不把有限样本包装成精度已验证。

## 报告正文、图片和下载同一三态

拟由相同公开投影供正文、图及下载使用；没有真实保存或后台接通。公开只用可追溯的目标、回应、提前按、未答及截断次数、实际时长，并解释其范围。没有个人测量数据时，不制造结果。图中仅用如下合成例子审阅排版（次数不是本版预期次数）：120秒；A=27、V=25、F=1、O=0、C=1、I=0、W=2，因此D=26。该数字不是生成器、scorer输出或参与者数据。

- interpretable：到达正式预算，结束原因和记录可核，完整观察目标分母有数据；正常终点截断已明确剔除并披露。允许描述这些实际次数；V=0只让响应速度为null，不因表现差将整份结果判无效。
- limited：中断或部分记录，但有完整可解释目标。只显示这些目标的受支持次数和实际时长，明确未完成原profile；隐藏全程结论与受影响指标，不推断原因。
- invalid：没有可解释目标分母、来源／首答无法核实等。正文只给原因及下一步，不给表现数字、表现图或下载中的表现字段；真实未开始不写已完成。该状态不表示疾病或认知能力差。

**合成公开文案：**“谢谢你完成这段等待。本次完整观察了26次目标，其中25次记录到目标出现后的回应，1次按得过早；另有1次目标在时间到时尚未观察完。等待时还提前按了2次，完整观察中没有30秒未答。下次可以先确认空心／实心的区别，减少旁边打断，需要时安排休息。这些是本次记录，不能说明注意波动的原因；手部操作和设备也会影响结果。”

English: “Thank you for completing this period of waiting. Of 26 fully observed targets, 25 had a response after onset and one had a response too early after onset. One further target was cut short by the time limit. There were two presses during waiting and no 30-second timeouts among fully observed targets. Before another task, review the outline/solid example, reduce interruptions and take a break when needed. These observations do not identify the cause of attention changes; hand movements and the device also matter.”

## 版本、标签与领域去重

协议、参数解释、报告文案分别拟以0.1.0起版；本文件为设计快照，不冒称已有运行冻结组合。开发获批后才用既有context/digest机制冻结实际profile、参数、种子／计划、教学language、解释及文案版本；实际组合随原件保留，修改出新版，不重算旧报告。不增加平台schema、服务器、权限或COS机制；报告保存与完整原件归档分别报告成功。

18维稳定key仍来自 `22721e5c63dd78819e8c58921adf20157cdaa08c:docs/cognitive-library/candidate-tags-20261026/taxonomy.json`，映射见[tags.research.json](tags.research.json)。没有精确PVT范式／几何刺激值就留空；`alerting`是ANT警觉线索效应，不能挪用。年龄、儿童、中文效度、设备等效与难度未核。标签只用于方案归类，没有声称后台筛选已接通。

当前main `7e6d7da4a01e4a42b410cf2dbdcfa76f11759fdc`，core `072b2900d4295c7d741d5e55c9ce6cfbbf6f58d2`。既有[24＋11去重源索引](../read-basis.json)108份实读源码blob与该core逐一比对均未变：reaction短等待固定次数；CPT-X稀有X回应；SART频繁按除3外数字；gradCPT含场景辨别；ANT线索与干扰；SST晚到停止信号。PVT拟补随机长等待、按时间停止的单一回应场景，不复制上述抑制／辨别任务，不新增一般学习记忆游戏。

最新已占用：core心与花（原owner保留）；child-learning `5db79eb8cfbbe97d05f048d50fd8bed3a1794391`数字规律；emotion-ei `215e9bbd96769064723b38d8f594c6b07c03fa4f`声音情绪线索；occupational `31ace660411d8fcaeab9917947a133973d744ce4`信息采样；本分支 `4b3351509088683cf91e82c7bc8eb87a5333d2d2` SART。四领域这些树未见PVT路径。DOT进一步确认 serial-reaction-learning、delay-choice、emotion-situation-understanding由其他领域保留，不取用。历史PASS不当当前验收，当前仅源文件去重核验。

## 静态交付边界

沿本领域既有Notion简短介绍与仓内静态图风格；此前只读到Notion图片引用，没有其图片二进制，未冒称看到或复刻原图。本图完全原创，保留原WIP而不覆盖历史。只进行本HTML静态排版和交付字节核对，不运行实际测试，不新安装依赖，不增CI。提交仅本目录、`[skip ci]`、独立领域分支；原界面已获用户认可；此轮仅按用户方向更新参数，用户明确要求开发暂停，不自行启动。
