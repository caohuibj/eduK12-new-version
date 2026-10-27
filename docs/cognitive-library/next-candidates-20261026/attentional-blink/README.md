# 注意闪瞬：双目标字母辨认内容候选

2026-10-27（Asia/Tokyo）。用户明确“确认，开始实施”，批准Notion第48节200/50轮、6次较易练习和草图。现已完成独立内容定义、原生候选React界面、后台权威计分与受限公开报告；一个skip-ci commit推送原分支/PR360。产品接入、导入和最终集中测试继续等待用户通知。

## 冻结双profile与测量协议

- research200正式：T1索引6/7/8/9/10（第7–11位）×T2 lag1/2/5/8/10，25条件各8轮、各lag40。重复数对照Holcombe固定源码，不宣称项目已验证或自动满足科研发表要求。
- experience50正式：同25条件各2轮、各lag10。两版同界面、图片区域/文字/输入和单题时序，只减总重复及累积负担，不承诺长短版等值或稳定个体精度。
- 每串26个A–Z无重复打乱，两个目标字母不同；完整seed计划包括条件顺序、字母流和目标位置，可重放。研究版每50轮休息（3次），短版无固定中场休息，可随时结束。
- 正式100ms预等待＋800ms注视，名义SOA133ms（letter80ms＋blank53ms）。客户端以实际letter onset为本轮SOA起点，一次回调只推进一个真实阶段，不跳过字母补造曝光；实际onset/offset/paint/cue留原件。正常单帧误差不加预检、clock probe、fps白名单、研究重测、额外采样或报告修正。
- 300×300 CSS px区域、#262626暗灰底、白字/白环；Liberation Sans 2.1.5原字体随包固定，字号40px，圆环半径96px/线宽2px。注视为同固定字体24px的ASCII加号。仅目标letter阶段有环，两个环同样式，不用颜色/序号泄露顺序。
- 原脚本物理视角2.5°字/6°环，以及按60Hz floor的约66.7ms letter＋50ms blank=116.7ms SOA，不是本项目CSS或133ms名义时序的等价身份。原随机按帧注视、键盘自动收2字符也与本项目固定注视/显式确认有差异。没有复制PsychoPy运行时、噪声阶梯或许可未核音频。

## 教学、练习与输入

完整中英说明、慢速K/P例子，明确先看、结束后按顺序回答，介绍触控/鼠标/键盘、编辑、没记住、确认、时间及限制。6轮较易练习：每串12字母，T1索引2/3/4、lag4/6各3，250ms SOA/150ms letter，逐轮反馈。至少5/6轮两个精确字母及顺序均正确；失败先完整重呈说明与例子，再开始下一轮，最多3轮。各轮原件独立，阈值是项目理解规则，不是能力等级或原文献练习标准。

字母流期间输入不形成答案；结束后才出现26键面板、两个无预填的回答框。点第一字母后自动到第二框，可回选任一框修改/清除。A–Z、Backspace、Enter及焦点按钮支持键盘；重复keydown不连填，真实按键/输入方式保留。触控使用主指完整按下/松开按钮，辅助技术的按钮激活另记assistive，不假报触控或键盘。没有答题超时，响应页不持续记录重复rAF以免把正常长思考误判为日志溢出。

“没记住”保留值null但handled=true，是明确作答的错误；未碰的空框handled=false，不能确认或伪报完成。两个相同字母误报允许保留，不自动纠错。原事件/编辑序列和确认时刻保留，由后端重放得到答案；未完整呈现或没确认的轮次不进有效分母。

## 权威计分、报告与三层身份

后端精确验证真实v2快照、engine/scorer/config/protocol、configHash/protocolSignature、seed计划、连续试次身份/时钟、每个实际letter/blank/target cue、作答事件和最终答案；不接受任意client review或伪造完整序列。相对位置偏差以被报告字母的真实位置减目标位置计算，保留有符号值；不在流中的练习错误或没记住留null，不把±3近似当精确正确。

报告主指标按lag显示“两个均精确正确 / 第一个精确正确”，即T2|T1；同时显示T1正确/有效轮数，展开全部轮次T2正确/有效分母，两者不混用。分母0则条件率null；明确忘记与未完成分别统计，不把缺失补0。没有完整有效轮次为invalid；真实中断/轮次不完整或部分lag无T1分母为limited，保留可解释部分；完整执行且各lag有条件分母为interpretable。低正确率、反向差异和普通一帧误差不是技术失败规则。

受限公开投影和候选报告共用三态校验，invalid不显示表现；不绕过gate读内部metrics。正文为本次发现、真实次数/分母、解释、一般可用建议及限制；无装饰雷达图、0–100总分、同龄排名、稳定闪瞬大小、学习障碍/临床或职业预测。短版每lag只有10轮，条件化后更少，明说分辨率局限。未来下载须复用同投影/gate，本轮没有绕道新增下载接口。

engine/scorer/config、profileDefinition/metricDefinition/qualityDefinition/reportDefinition/presentation均各自真实初版0.1.0；protocol attentional-blink/0.1.0/0.1.0，随机化blink-fnv1a-utf16-xorshift32-balanced-v1，练习blink-easier-six-v1。沿既有count/ratio/map与真实v2快照，不新建schema字段、不造standard别名或能力总分。

## 保存合同与系统微调建议

候选prepareLocalAttempt要求先耐久确认真实context/full manifest/realm且fresh，再呈现；每轮结束后本机保存，await前同步保留待写原件。失败停止呈现、重试同一recordDigest，不重放刺激；每轮练习key隔离，正式draft.round和key使用真实冻结plan.round=0，不沿用重练轮号。刷新/跨realm不能续曝，过期实例不能继续处理作答/最终保存；旧端口只完成其原件保留。

最终声明冻结真实完成/终止原因、正式/练习数量和记录摘要；只有匹配身份/分母/最终摘要且finalSaved=true的报告回执才展示。报告保存与完整原件归档分开，不凭报告回执清除原件，不承诺关页后后台上传。当前只有端口合同、合成内存替身，未声称真实IndexedDB、HTTP/core或COS耐久/归档完成。

集中接入阶段的最小建议清单，本轮未做：
1. registry/入口、精确profile seed及真实session/epoch到context映射。
2. 复用现有本机耐久prepare/persist与最终core/report端口，正式round=0、重练历史和记录身份保持一致。
3. core仅保存冻结参数/关键答案、必要归属与报告；完整stream/paint/actions等原件独立COS，复用已有私有资产/幂等机制。
4. 受限报告投影用于读取/未来下载；标签按实际后台消费者接持久化/过滤/搜索。

未改native registry/task-resource/native-runners/seed/shared core/schema/权限/依赖/CI/运行服务，没有导入、合并、激活或部署。

## 来源、字体许可与18维标签

沿研究快照22721e5c63dd78819e8c58921adf20157cdaa08c的attention-blink-holcombe。主代理已亲读alexholcombe/attentional-blink固定cabc4e5857b2adbd2112344b43db989dfd4e818f的AB.py（blobcd5ff82d86a502d89b92b1906f696328802098d0）和README（110fe7ba7259264545601744a39f772f8ccb96a9）。采用双目标环形提示思路，不混称Raymond1992白T1＋X检测版，也不移植其常模/效度。独立TypeScript与SVG，不复制上游MIT执行代码；来源许可不替代本项目效度验证。

字体为云端Debian fonts-liberation提供的原始LiberationSans-Regular.ttf，内部Version 2.1.5，SHA256 bade59d822652f76e6941aa87b40a87c13d1cc70db98ededb5011127efafd1d3，SIL-OFL-1.1；未修改或依赖用户Mac文件。候选开始前校验字节、加载FontFace，不静默fallback。许可及来源见[ATTRIBUTION.md](ATTRIBUTION.md)，二进制与FONT-LICENSE.txt同目录提供；后续产品打包须一并保留字体许可，不重新命名为私有素材。

metadata.ts保留18维稳定历史研究词条；当时source_research_only/authorization_pending等不改写成当时已开发，当前状态/输入/字体另列。场景科研、自我观察、学习/信息呈现交流不证明诊断、选拔或个体预测效度。年龄、人群、难度、中文、字母熟悉度和设备等效未知保留null；后台标签持久化/搜索未接通。

## 最小检查、时间与证据边界

仅6个不同运行目标：后端3（200/50平衡计划及练习、已知条件分母/精确顺序/有符号偏差、未执行/篡改/报告gate），前端3（实际阶段/早按与重复/明确null及无答题时限、6练习及50正式/真实scorer回执/最终重试、React/jsdom触控/失败重呈/原件保存失败不重曝）。首轮6项全通过，类型也无诊断。

独审额外发现重练后正式draft.round会继承练习轮号，改为真实plan.round后，仅复查受影响的同一个前端完整流程：先失败6练习、第二轮通过6练习，再50正式，确认正式key全部test:0:index；另2个前端目标复用首轮未受影响结果，不计为第7目标。后端未变，不重跑。最终实际后端3入口/50源码、前端app配置4入口/60源码零诊断；类型输入摘要和必要运行原件在implementation/。

检查用软件时钟、jsdom、模拟字体加载器和合成内存端口，不是实际FontFace/浏览器时序、真机、IndexedDB、HTTP、COS或最终验收。没有跑旧任务、完整App、research200浏览器旅程或CI。主代理亲读协议、capture/session、权威review/scorer和公开报告，开发自查不等于上线验收。

科研版预计25–40分钟，实用版8–12分钟；正式每轮固定约4.36秒＋两字母确认假设2–5秒，另含首次说明/6练习及科研3次短休息，重练另1–2分钟。设计估计非实测或硬上限，阅读/回答自主，字母熟悉度与快速辨认负担需要如实说明。

[批准草图](review.png)及preview.html是静态设计，不是实际组件截图；Notion第48节保留方案历史，本项得到明确批准后实施，没有新加测验或未经批准改变目标设计。
