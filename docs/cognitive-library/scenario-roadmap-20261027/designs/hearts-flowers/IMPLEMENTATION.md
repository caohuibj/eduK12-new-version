# 心与花内容候选交付（2026-10-27）

仅内容候选；等待主代理实读及DOT独立复核。未提交、推送、注册、接入或发布。

## 固定内容

真实初始engine/scoring/config/profile/metric/quality/report/presentation均0.1.0。research为12/12/33=57，experience（实用版）为8/8/16=32。两版同刺激、输入、正式2500ms半开回应窗口及回应即移除、1000ms实际空屏。教学练习8题（2/2/4），3500ms回应、逐题解释；7/8才通过，最多3组。未完成或未通过重呈全部中英说明与四例；组号、试次号保留，旧组不覆盖。包含教学/练习预计6–9与4–6分钟，为设计估计，非实测。

心同侧、花对侧；正确侧只由图形身份×位置计算。沿批准preview的原创SVG路径/圆花瓣、心#da5c71/花#7357aa、stage#fbfdff、205px高、78px图形、25%/75%中心位置和固定左右大按区。图形不是按钮。stage宽度响应式、最大600 CSS px，不声称物理几何校准。四入口日后应复用此实现，本次没有四入口消费者验收。

正式混合首题transition=null。科研其后32题图形×位置×切换/重复八格各4次；有向Euler边HH/HF/FF/FH各8。实用混合16题每图形×位置4次，首题后切换8、重复7（起始图形自环3，另图形自环4，cross各4）。完整seed与formal+3 practice manifest准备时冻结并核hash；正式round=0，练习recordKey为practice:round:index。

独立TS和原创SVG/中英文，无外部代码、图像、题库、字体或新增依赖。触屏、几何、教学与混合条件平衡是项目变式；不叫原版复刻。Camerota等DOI 10.1037/pas0000725 Methods实际已读，12/12/33、2500/1000与最多3组是来源事实；旧稿在线/卷期年份断言撤下，当前书目日期未核。不采用原研究小于200ms、回应75%或正确50%的分析剔除。

metadata提供人类可读标签提案、多场景、难度和两个profile；没有新增或重命名既有18维稳定key，没有后台持久搜索。年龄、中文理解、设备等值及实际照护协助信息未知保留null。

## 计分、输入和报告

权威scorer校验快照/配置/hash/完整协议/真实版本/seed计划，逐事件重放核state、包络、序列和单调时钟，不接收客户端correct或RT结论。fresh首个回应属于[onset,onset+deadline)，held/repeat不代答；输入按keyboard/touch/mouse/pen/assistive保留。键盘←→、聚焦按钮Space/Enter与辅助技术原子激活分别标注。跨空屏、保存和块屏跟踪held token；新试次保留初始held快照，释放后才可新回应。事件最多256，重复down聚合计数；无逐帧日志/请求、预检、一帧门禁或延迟纠正。

有实际onset及已闭合回应窗口才进valid。错答和真正漏答进入准确率分母；漏答RT=null。未执行或未闭合窗口保留raw但不算漏答或成功。回应窗口已结束、其后空屏中断保留已有窗口且limited。零有效invalid；部分有效或中断limited；完整interpretable。完整零正确、零正确用时或完整真实漏答不因低表现变为technical-invalid，也不会关闭真实准确率。

正文首屏三行heartOnly/flowerOnly/mixed；展开mixedSwitch/mixedRepeat/mixedFirst分割混合，first不进switch/repeat分母。正确反应算术平均为sumCorrectMs/correctRTCount，分输入保留；同输入switch−repeat有符号，任侧无正确用时为null。没有跨输入总RT或能力分。未执行条件valid=0显示“尚无该条件记录”，准确率null。唯一公开projectHFReport投影供正文/未来下载/图片共用；invalid groups/differences为null，组件不直接读内部metrics。没有常模、ADHD判断、同龄排名、职业预测、雷达或0–100总分。

## 保存合同与尚未接入的边界

prepareLocalAttempt端口必须先耐久冻结真实context/session-epoch key、snapshot、seed、完整formal+3 practice manifest、语言/设备一次快照及realm（timeOrigin/pageInstanceId），拒绝旧曝露身份；刷新不续曝。只有fresh与binding digest一致才开始。每题结束在await前同步复制raw并冻结record digest；persistLocalDraft确认同一recordKey/digest后才继续下一题。失败只重试原件，停止后续曝露。正式中断FINAL保留actual formal/practice counts、终止原因及全部recordDigests。

FINAL适配器必须核封存claim/实际记录一致，将claim.termination传入scoreHF的可选第二参数；aborted只能降低解释状态，不能制造有效试次。completed不能超越raw实际完整执行。回执只有finalSaved/context/finalPayloadDigest/reportDigest/版本/config/protocol/profile/received count均一致才显示报告。report保存与完整原件COS归档分别确认；不清草稿，不保证关页后台上传。宿主context/ports/language改变或卸载先停止旧曝露、推进与FINAL；同步构造中断raw后，仅调用constructor捕获的原本机raw端口一次，不调用新宿主端口或旧core/FINAL。已有在途本机写不重复。异步写未获确认或失败时状态未知、仅保留待保存的pending内存，不声称跨关闭耐久保存；关页可能中断写入，不能保证后台完成。宿主须允许原attempt本机原件保留，并拒绝过期core/FINAL写。

测试只用明确的内存fixture，不声称真实IndexedDB。真实耐久适配器、API鉴权/幂等/DB事务、COS归档/回读/导出、四入口、真实设备与中文理解验证均未实施。共享core/schema/入口/权限/依赖/CI未改；不引用暂停ANT/MOT候选。

## 检查和原始结果

执行于云端4核16GiB、Node24.21.0、已有锁定node_modules。只使用实际backend tsconfig和frontend tsconfig.app的受影响import闭包，不做全量App/构建/浏览器/DB/COS/CI。原命令、exit、inputSHA、源码清单和原始Vitest/类型输出见[evidence/index.json](evidence/index.json)。

类型首轮保留Object.fromEntries断言与前端Array.at不受实际lib支持的真实失败；第一次局部修正仍留下空数组never[]诊断，第二次使用明确五输入times对象后backend49、frontend58源闭包均zero diagnostics。此后测试fixture隔离与证据输出、捕捉溢出单一条件和dispose本机原件保留修正的类型复用边界另列index，不把原失败改成通过。

后台定向用64个seed独立数57/32条件/首题、正式与3×8练习；已知正确数据验证+400ms键盘与−400ms触屏差、首题分离、完整零正确/漏答、null、三态、哈希/计划/state/时钟篡改与空屏中断。前端验证实际React刺激出现/移除、触控输入、失败8题重呈全文、原件保存重试；完整32正式session走本候选权威scorer和回执gate。首轮连接case之后复用同key内存fixture导致附带中断练习断言失败，修正为独立fixture后仅续验该case，保留原失败和其余已过case。捕捉输入上限路径发现潜在递归，改为日志满时不再追加timeout，仅定向续验捕捉case。主代理复核指出dispose只留内存可能丢失原件，改为disposed后仅调用原本机raw端口一次，并仅续验生命周期case（原/新端口隔离、在途不重复、失败保留未知），不重跑其他case。结果均为合成内容自查，不能冒充独立DOT审计或真实产品准入。
