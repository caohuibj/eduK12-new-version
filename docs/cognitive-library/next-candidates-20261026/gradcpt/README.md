# gradCPT：300/100张内容开发候选

2026-10-27（Asia/Tokyo）。用户明确同意将练习简化为8张、7/8通过，实用版减至100张；科研版300张保持。原Notion第46节12张练习/150张短版方案保留历史，以本次明确批准取代。已完成独立内容定义、候选界面、后台权威计分和公开报告；按一个skip-ci commit推送原分支/PR360。不接入、不导入、不启动最终集中测试。

## 冻结协议与两个真实profile

- research：300张、268城市/32山景；沿上游固定picsInput_300imgs_32nogo.txt，800ms渐变，核心240秒。对应2024官方Overview的300张/4分钟版本，不是2015论文299次身份。
- experience：100张、90城市/10山景，800ms，核心80秒。seed重放；精确类别打乱，城市9个完整图片袋、山景1个图片袋，避免相邻相同照片。不是截取150张或上游默认shuffle原序列，不假装与长版等值。山景比例10%与长版约10.67%离散差异保留。
- 两版相同原始照片、图框、按钮、单张节奏与教学。前后各800ms scrambled过渡另记，不进正式分母，故呈现总计划为302/102个slot；核心4分钟/80秒不包含该1.6秒边界。正式不逐张反馈或插休息。
- 原PNG均309×256 px，CSS图框310×256沿已审草图；不裁切/重调灰度对比，不自动小屏1.5倍。源图有原本圆域/背景。中性界面和固定大按钮，图框不继承入口主题。原屏幕任意触控到固定按钮、空格限定、保持/多指/50ms重复输入处理均是明示项目输入变化，非原版设备等效。
- 一个fresh pointerdown或Space/focus Enter keydown算一次，先松开才能再计；重复keydown/多指不叠加，同一轮最后有效输入与时钟原件保留。事件间50ms去抖沿上游规则明确冻结，不是能力或RT筛除阈值。不上报逐帧HTTP、不加预检/clock probe/fps白名单。

## 教学与练习

完整中英指导含城市按、山景不按两例、松开规则、渐变说明、预计时间及限制。8张练习：前4张1600ms、后4张800ms，各3城市/1山景，总6城市2山景；每张独立演示并以前后scrambled过渡收束，随后反馈、参与者自行点下一张。较慢/类别比例/分张反馈均属项目较易教学，不混入正式连续任务。

只要求至少7/8正确，无额外山景分项条件；“一直按”最多6/8不会通过。失败后完整重呈说明和例子再试，最多3轮；每轮计划事先冻结，原件按practice:round:index保留。理解阈值是项目规则，不是能力等级。8次实际操作图片，边界图不是额外作答题。

## 归属、统计与报告

保留TMB assignTrial的0.4/0.6/0.8透明度边界、前后已有回应/go-no-go分支和code4双事件顺序校正语义。该小文件明确LGPL适配，不把整个TMB库装进React。代码4在derived assignment中交换两个真实eventIndex的图片归属，原事件时序/按下/松开永不改写。实际paint opacity由客户端保存，后台校验归属事件与最近真实paint相符，再重算；不按每800ms硬切断所有晚反应。

连续序列一次有界本机采集：slot实际起止、paint日志（上限120000）、输入原事件（上限8192）、完整plan、终止原因。晚回调只推进一个实际阶段，不补造未呈现图片；正常一帧误差不触发排除、重测、回算或报告修正。未完成/溢出不能宣称complete。正式trialEnvelope为一个连续capture，finalSubmission.maxTrials=1，这是内容计算合同，不是把全帧原件写进业务DB的授权。

只有真实完整呈现且下一过渡归属窗口结束的图片进入有效分母；中断时尚可能改变归属的图片保留原件但不推断漏按。正常完整呈现中没按，可以是真实城市遗漏/山景正确拒绝，不能用“无反应串”自动判技术无效。没有valid image则invalid，真实中断或不完整则limited，完整真实执行则interpretable。低正确率、单一策略、正常一帧误差不自动无效。

主屏按实际城市遗漏/有效城市、山景误按/有效山景、正确城市中位RT描述，带解释、一般可行建议与限制。展开mean、sample SD（至少2次）、CV、d′及criterion；缺失null不补0，负d′/criterion保留，不做0–100注意力总分。城市为signal，H=city hit率、F=mountain false alarm率，仅率0/1用0.5/N和1−0.5/N校正；d′=Φ⁻¹(H)−Φ⁻¹(F)，criterion=−(Φ⁻¹(H)+Φ⁻¹(F))/2。与上游正确拒绝/遗漏构造率时criterion符号不同，不能混称。同龄排名、ADHD、脑年龄、学习/职业预测均不提供。短版10山景，完整执行时一次误按改变10个百分点，明确单次短测的分辨率限制。

公开投影与候选报告共用三态校验，invalid不展示表现。真实v2快照绑定configHash/protocolSignature、seed及精确identity，不接收任意client review。engine/scorer/config、profile/metric/quality/report及presentation均各自真实初版0.1.0；protocol gradcpt/0.1.0/0.1.0，随机化grad-tmb300-or-fnv1a-xorshift32-90-10-v1，assignmentVersion tmb-opacity-event-attribution-v1。沿既有count/ms/map，不改schema、不加假standard或能力分。

## 保存合同与后续接入建议清单

候选端口先耐久确认真实作答身份、完整冻结计划、realm且fresh，再开始。练习每张、正式整段capture结束后本机保存；失败在await前同步保留原件，停止呈现，重试同一摘要，不重曝。上下文/语言/端口变化、关页或失焦保留旧身份记录，不能把旧时钟移到新realm续答。最终声明绑定记录摘要/真实终止原因，只有finalSaved=true且匹配身份/摘要/分母的报告回执才展示。

当前prepare/persist/finalize只有合同和合成内存替身，不冒称真实IndexedDB/HTTP/服务器保存。报告已保存与完整COS原件已归档分开，不因报告回执清掉原件，也不保证关页后后台上传。

集中接入阶段建议（本轮未做）：
1. registry/入口/精确profile seed、真实session/epoch映射本任务context。
2. 复用已有耐久本机设施接prepare/persist，原件独立COS；DB/core只保存报告需要的轻量选择/归属/参数，不把整份frame log放DB。
3. 最终权威scorer及受限公开报告投影接入现有保存/读取流程，同一冻结gate用于未来下载。
4. 标签持久化/过滤/搜索按实际消费者适配，保留18维稳定key。

未更改native-registry/task-resource/native-runners/seed/shared core/DB/COS/权限/依赖/CI或运行服务，无导入、激活、合并或部署。

## 来源、许可与标签

沿固定研究快照22721e5c63dd78819e8c58921adf20157cdaa08c的attention-gradcpt-tmb。主代理亲读manybrainsproject/TestMyBrainCodeRepo固定ec09ea0d35779bb39997131313dfd1380ee34922：Apr24主源码6420387ca2fe9e7449d6dc200b293ef1b482f442、CSS2a41448224a6c1b7550bc7ae362edb5940fc4929、README243aa94eaadd13a656616db49447220256935ec5、Overview7be0b9cad9c7e6c4a43dc2f336079b2571e83f81、序列文件2dbe296924caedce2bc41b15df79e61a5080fcce。

Overview明确“TMB GradCPT City/Mountain Images” by Esterman & DeGutis，CC-BY-SA4.0。21张（10城市10山景1scrambled）原件与摘要已取回核对；不重新制作视觉材料。[ATTRIBUTION.md](ATTRIBUTION.md)含完整署名、来源、使用/适配说明及LGPL/GPL许可路径。source-data/assignment及生成副本按LGPL-3.0保留，未统一改MIT。素材许可与科学效度分轴，开放许可不证明中文、手机或目标人群效度。

metadata.ts保留18维稳定历史研究词条；当时authorization_pending/overview未读等不改写历史，当前rights/input单列。认知域attention/executive_control，过程sustained_monitoring/response_withholding；场景科研、自我观察、学习/工作持续任务交流均保留证据边界，年龄/难度/中文/人群/设备适用性未知为null。后台标签存储和搜索未接通。

## 最小检查、时间与证据

仅6个不同运行目标：后端3（双profile与教学计划、边界归属/已知统计、真实中断/篡改拒绝/报告gate），前端3（真实paint和输入、8练习＋100正式软件时钟流程/回执重试、React/jsdom触控/失败重呈/写失败不重曝）。首轮运行因短序列整表拒绝采样耗尽而均失败，类型另有递归函数缺返回类型诊断；修为直接类别/图片袋构造并补类型后，只复查受影响的同6目标与类型闭包，全部通过，不重复计作12项。最终实际后端3入口/52源码、前端app配置4入口/64源码零诊断。原始失败/修复原件及源码摘要见implementation/。

主代理亲读协议、归属校正、capture/session、scorer和报告。检查使用软件时钟、jsdom、模拟图片加载器及内存端口，不是真实浏览器硬件、图片decode、IndexedDB、HTTP/COS或最终集成验收。原图片文件字节/尺寸已核，但不冒称实际设备呈现。未重跑旧任务、完整App、research300浏览器旅程或CI。

预计科研版6–9分钟、实用版3–5分钟，含首次说明/练习和边界，重练每轮另0.5–2分钟，自主阅读无硬上限。设计估计非实测，认知消耗主要为连续监控/抑制，短版只减少累积负担，不虚构稳定个体精度。

[当前参数静态设计](review.png)不是实际组件截图；原12练习/150短版提案保留于review-proposal.png及Notion第46节。本次用户明确批准8练习/100短版，不需因普通工程修复重复图审。
