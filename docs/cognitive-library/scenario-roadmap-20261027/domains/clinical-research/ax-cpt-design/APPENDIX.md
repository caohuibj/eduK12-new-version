# AX-CPT 图审附录 · proposal-r1

本文件是待用户图审的设计，不能作为开发或产品接入授权。独占本领域`ax-cpt-design/`，不改SART/PVT、六个原WIP、共享注册或其他领域。

## 固定来源与本次实际核验

1. [Cohen等1999，DOI 10.1037/0021-843X.108.1.120，作者实验室公开PDF](https://bpb-us-e2.wpmucdn.com/sites.wustl.edu/dist/1/1008/files/2017/10/1999CohenJAP.pdf)：本次读取Methods并人工核看印刷页123。PDF SHA256 `7ba6371be015593fb4fe4410bb46c767a209044b8299c0df95d7f18968ed6fd0`。原机构链接首次502／503；其公开CDN同一论文成功，不曾绕过挑战或权限。
2. [Experiment Factory固定源码](https://github.com/expfactory/expfactory-experiments/blob/49b8123f18b26d94dfc010bb8a6ec7458b265e2e/ax_cpt/experiment.js)，commit `49b8123f18b26d94dfc010bb8a6ec7458b265e2e`，源码blob `2a32b59456caf8d3957a12c301e768384415145e`；[LICENSE](https://github.com/expfactory/expfactory-experiments/blob/49b8123f18b26d94dfc010bb8a6ec7458b265e2e/LICENSE) blob `7ef17fe706ce88195e18473069d561dd4910a5ee`，MIT，Vanessa Sochat／Stanford University 2016。临时下载文件重算Git blob吻合，并读取条件、时序、响应键和实际组装路径；没有运行旧jsPsych/PsychoPy。

原文与参考代码分开：论文任务只对AX作目标回应，四种组合频率70/10/10/10，400次，混合1000／5000ms延迟，刺激显示250ms、响应窗口1秒，带声音反馈。参考代码改为双按钮，三段40对，每段28/4/4/4；首字母显示300ms但线索阶段5200ms，第二字母显示300ms／响应窗口1300ms，其后等待1000ms＋post500ms，显式参数静态相加每对8秒。参考说明同时出现M/Z和left/down，不宜直接给用户。本项目参照代码的双选择长线索结构，不冒称复刻1999原版或400次混合延迟实验；8秒是名义设计参数，不是旧插件实测。

## 代码／图片／题库／译文许可

| 部分 | 已核权利及限制 | 本图处理 |
| --- | --- | --- |
| 参考代码 | 上述固定根MIT许可；若复制实质代码须带版权和许可，不把MIT自动扩展到第三方图片、字体或论文 | 本轮仅参考方法，没有复制或分发上游源码；未来获批后优先独立实现，若改编则保留MIT归属 |
| 原论文和原图 | 1999论文明示APA版权；机构公开阅读不代表允许公开分发PDF／原图 | 只链接、给DOI／页码／方法概述。PDF和核看转图仅在/tmp，不入Git |
| 界面／刺激图片 | 本图HTML/CSS、字母框、箭头与PNG是项目原创；无外部照片、图标、标志、音频或字体文件 | 可按本项目设计交付；不替整个仓库设置新许可证，不冒称作者批准本变式 |
| 题库 | 无临床题库复制。拟仅用A、X及代码中非目标字母集合`BCDEFGHIJLMNOPQRSTUVWZ`作为项目符号材料 | 字母角色与条件有明确定义，不把字母列表当受许可的临床题本或标准化中文材料 |
| 中英说明 | 项目原创教学，不复制上游指导语，不是认证译本 | 与图一起审阅；中文理解、字母熟悉度与年龄适用性未核 |

## 唯一归属与当前去重

本领域原清单已保留AX-CPT；当前五棵实际代码树均未见`ax-cpt`／`ax_cpt`任务路径：core `072b2900d4295c7d741d5e55c9ce6cfbbf6f58d2`，clinical `5f5ffdee8c4d8bea25952e1aad4e926cedbbb816`，child-learning `d6d2c98122a0d3e6fdbdc63cc93779f8c3c32eed`，emotion-ei `fa022584f10bb109514b31023dfec781a21262ed`，occupational `855dda345831efee0e814bf39f6b8d6abad5e5d2`。

此前24＋11任务[108源文件实读索引](../read-basis.json)与当前core的blob逐一比对均未变；不是历史PASS当当前验收。CPT-X只以当前X判目标；PVT单目标回应；SART／gradCPT有持续辨别与不按；N-back保留前项以做匹配但无同样AX高频上下文结构。本项补“相同末字母X，依首字母A／非A选不同按钮”。其他领域序列学习、延迟选择、情绪情境理解及心与花原owner保留，不接管MOT／ANT暂停WIP。新记忆任务不在本次范围。

## 单项科学问题及两profile提案

科学问题：在AX高频背景下，先前线索是否改变当前判断；分别观察A后非X、非A后X等较少出现条件中的首答、未答与用时。不能从一次任务断言某人是“主动／被动控制型”，更不能推断ADHD、记忆障碍、精神疾病或脑区功能。

research120对＝AX84／AY12／BX12／BY12，分3段，每段40对＝28/4/4/4；experience40对＝28/4/4/4，单段。每40对包含四条件；拟顺序在各段内受约束随机排列，每连续20对均14/2/2/2，控制稀有条件并保留高AX比例。两版同界面与每对时序，短版只减少段数。没有生成随机序列或运行代码，实际生成算法／seed／manifest须获开发批准后实现和冻结，不用概念清单冒充已生成计划。

正式单对时序提案：

- 首字母300ms，然后空白4900ms；从首字母起始到第二字母起始共5200ms。首字母阶段不答，屏幕不留下首字母供回看。
- 第二字母300ms，随后空白1000ms仍可作答；首答窗口为第二字母实际呈现起始后的[0,1300)ms。所有条件都选择一个按钮，回应不提前结束窗口，正式无逐题正误反馈。
- 再空白1500ms进入下一对，名义总长8000ms。research正式16分钟，experience正式5分20秒；全流程分别预算18–22／7–10分钟。research每40对后可按需休息并主动继续；休息不进入测量窗口，较长休息／重练会超出预算。

布局提案：深色中央字母区域280px高，字母80px、白色、系统UI字体；下方固定两个大按钮。左“A后X / A then X”，右“其他组合 / Other pair”。手机／平板同结构；电脑←对应左、→对应右。只有第二字母阶段收正式答案；首字母／等待期输入单列为提前输入，不代答下一阶段；持键／重复事件不能成为新首答。没有阅读速度门槛、自动惩罚等待或时序预检／逐帧探测／一帧误差阻断。

非A／非X示例用B、F，但实际非目标字母会变化。AY和BX只是研究条件代码，Y意为非X、B意为非A，不教受试记住某四对字面组合。拟非目标集合与参考代码一致，排除A/X/K/Y，不把不可见的角色码混入屏幕提示。

## 完整中英教学及简练练习

中文提案：

“每次会先后出现两个字母。第1个字母只看并记住，先不要选；等第2个字母出现后，再选一个按钮。只有第1个是A、并且第2个是X时，选左边‘A后X’；其他所有组合都选右边‘其他组合’。电脑可用←／→。每一对都要选一次，每次按后抬起。作答时，第1个字母不会留在屏幕上。

四个例子：A→X选‘A后X’；A→F选‘其他组合’；B→X也选‘其他组合’；B→F仍选‘其他组合’。箭头表示先后出现，不是同时显示。B/F只是例子，实际还会有其他字母。只看到X并不一定选左边，要结合前面的字母。

第2个字母消失后的短暂空白里仍可回答；下一对开始后不补答上一对。每对只记录第2个字母出现后的第一次新按下，后面再按不能改答案。首字母／等待期按下会单独记录，不算这一对的正式选择；请先抬起，再等第2个字母后重新按。

先练4对，四种情况各1对。练习字母更久、作答时间更宽，有逐对反馈，没有速度合格线。四种都正确回应、没有提前按且完整做完后进入正式。若按错、未答、提前按或未完成，会先完整重呈说明及四例，再练一组；最多两组，可结束，练习不计正式结果。

实用版40对，正式约5分20秒，含首次说明和练习预计7–10分钟；科研版120对，正式约16分钟、全程18–22分钟。阅读、重练和休息可能更久。需要时可结束本次；未观察完的测量窗口不猜成未答或正确。结果只描述本次，不判断疾病、IQ或工作适任。”

English proposal:

“Two letters appear in sequence. Look at the first letter and remember it without choosing yet. After the second letter appears, choose one button. Choose A then X only when the first letter was A and the second is X. Choose Other pair for every other combination. On a computer use the left arrow for A then X and the right arrow for Other pair. Answer once on every pair and release after pressing. The first letter is not left on screen while you answer.

Examples: A followed by X → A then X; A followed by F → Other pair; B followed by X → Other pair; B followed by F → Other pair. These examples are sequential, not simultaneous. B and F are examples of other letters, which will vary. Seeing X alone does not determine the answer; remember the preceding letter.

You can still answer during the brief blank after the second letter disappears. Do not make up an answer to an earlier pair when the next pair begins. Only the first new press after the second letter counts; another press cannot correct it. A press during the first letter or waiting period is recorded separately, not as the pair’s answer. Release and wait for the second letter before responding again.

Practise four pairs, one of each kind. Practice letters stay visible longer, the response window is wider and feedback follows each pair. There is no speed pass mark. Complete all four with the correct choice and without an early press before assessment. An error, nonresponse, early press or incomplete practice brings back these complete instructions and all four examples before one retry. There are at most two groups and you may end. Practice records are separate.

The practical version has 40 pairs and takes about 5 minutes 20 seconds before instructions and practice; allow 7–10 minutes overall. The research version has 120 pairs, about 16 minutes formally and 18–22 minutes overall. Reading, retries or breaks may take longer. You may end this attempt whenever needed. An incomplete measurement window is not guessed as a nonresponse or a correct choice. Results describe this attempt, not a diagnosis, IQ or fitness for work.”

练习参数提案：4对为AX／AY／BX／BY各1，顺序拟在组内变化，但不生成序列。首字母800ms＋空白4400ms，仍保留5200ms线索阶段；第二字母800ms＋空白2200ms可答，共3000ms响应窗口；反馈1000ms。完整4对无提前输入且四类各正确1次，才继续。任何错误／未答／提前输入／中断先重呈完整说明与四例，再试最多1组；安全结束不是能力不合格。没有额外8题练习、注意检查、阅读计时门槛或无限循环。

## 首答、分母、公式与边界

设条件K∈{AX,AY,BX,BY}，nK仅计该条件完整线索与第二字母响应窗口。cK为正确首答、wK为错误首答、oK为完整窗口无首答，满足cK+wK+oK=nK。练习、未执行与中断的测量窗口不入正式nK。若在间隔期间结束，已完整测量的窗口可保留；总体按真实结束原因和完成进度标为有限记录，不因完整原件尚未归档冒称存储成功。

- 正确率=cK/nK；错误率=(wK+oK)/nK；未答率=oK/nK，nK=0均null。没有答错／未答在nK>0时可为真实0，不能把没执行填0。四类分别呈现，不能靠AX多掩盖稀有条件缺失。
- 正式首答是第二字母出现后半开窗口内第一次新按下。先错再对仍按首错；触摸、鼠标兼容重复、持键和repeat不产生第二个答案。首阶段／间隔提前输入单列，不进入响应RT，也不借此自动判能力无效。
- RT=t首答−t第二字母实际呈现；真0保留，不设100ms等“过快”分类。内部条件RT仅取正确首答的中位数，正确首答数为0则null；错误首答的实际时间仍保留原件，不伪造为超时。完整1300ms无首答为遗漏、RT=null，不补1300。
- 内部有符号条件差：Δerror=100×[(wAY+oAY)/nAY−(wBX+oBX)/nBX]（百分点）；ΔRT=medianRT_AY−medianRT_BX（毫秒）。任一必要分母／RT缺失则null，负值不裁0，真0不标缺失。短版每稀有条件4对，不由这些差推稳定“主动控制风格”。
- 未完整呈现首字母或第二字母／作答窗口即中断，则该测量窗口不猜对错／遗漏，保留已经记录的实际事件并注明中断。退出、隐藏、异常结束不静默补齐或重放；响应窗口边界或更晚的按下不补上一对。未开始与中断分开。
- 本提案不冻结context d′、PBI、A-cue bias或临床阈值，相关模型不输出。无0–100能力分、常模、IQ、诊断、同龄排名或岗位匹配预测；这些函数也尚未实现。

## 报告：真实次数＋解释＋建议＋限制

图中仅为40对完整记录的合成例子：AX27对正确／28，AY3／4，BX2／4，BY4／4；错误首答分别1/1/1/0，未答0/0/1/0，总正确36、错误3、未答1。未生成作答数据，不称真实研究结果或scorer输出。

拟公开文案：“谢谢你完成这段判断。A后X的28对中，你正确回应27对；其他字母后X的4对中正确2对，其中1对没有回应。不同组合中都可能出现按错或未答，次数较少，不能说明这些情况的原因。下次可以先重看四个例子、减少旁边打断，需要时在段间休息。本次没有临床或同龄参照，字母熟悉度、手部操作与设备都可能影响记录。”

English: “Thank you for completing these judgements. You responded correctly to 27 of 28 A–X pairs. Of four pairs where another letter preceded X, two were correct and one had no response. Errors or nonresponses in different combinations do not establish their causes, particularly with few observations. Before another task, review the four examples, reduce interruptions and rest between blocks when needed. There are no clinical or age norms here; letter familiarity, hand movements and devices can affect the record.”

正文、可选图片与下载拟共用同一公开投影：interpretable为条件与记录可核的本次次数；limited只展示完整可解释条件和实际进度，受影响条件留空并解释；invalid无可解释测量窗口／身份不可核时仅给原因与下一步，不出表现数字、图或下载表现字段。内部RT差、模型与审计指标不进入公开投影；状态不按表现差或遗漏多自动判无效。四类有缺失时不显示为0/0或100%。

## 版本、标签与交付限制

协议proposal-r1、参数解释proposal-r1、报告proposal-r1分开标识；本次只是设计快照。获批准后用既有snapshot/context/digest冻结实际profile、参数、seed／计划、教学language、材料与报告文案的组合，再逐项开发；新组合不重算旧报告。报告保存与完整原件归档分别确认，不新增server/schema/权限/COS/CI机制。

18维映射见[tags.research.json](tags.research.json)，词表固定`22721e5c63dd78819e8c58921adf20157cdaa08c`。只用既有attention／executive_control等稳定key；没有准确AX-CPT范式、上下文保持或字母刺激值就留空，不把ANT的alerting当本项标签。不宣称标签后台筛选已连接。年龄／儿童适用、中文、难度、设备等效与短版效度均未核。

只生成本HTML的原创静态PNG并核对布局，无脚本、序列、计时或响应采集；不启动运行器或计分。沿此前Notion简短介绍和仓内图稿风格，未声称取得Notion原图二进制。独立领域分支`[skip ci]`提交推送供读图；不改共享README、注册表、其他领域或平台，不合并部署。用户批准本设计前不开发。
