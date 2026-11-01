# 47项认知候选：报告与模式核对汇总

这是独立报告Draft PR。**47项已落实新版正文、日常例子、行动建议和模式说明；没有声称47项已完成标准复刻、心理测量验证或可发布验收。** 每项的证据、题数/练习、时长估计和文献差异见分组打卡。

## 精确来源与审阅基线

- 20项候选 #477：`605a3a5f5a03e23da442f0e17a6fb9486870e8dd`。
- 四项修订 #480：`b42393cffe1c4364c1fc5568b656ed612fc60849`。
- 八题库 #481：`4e003a24c51c50bfd8abbfd123cc8c02b9575745`。#478实际是管理员入库界面，不属于本报告基线。
- Timecopy首次payload保存修复：`7c4718a379c9d00622adf1de42c6bb1fca5b7277`；迷宫独立练习核心修订：`7332a07b21952007e9ed7d661a136916dde855d5`。
- 原候选内容、原477的timecopy/cancellation修复及R2三个已核新核心组合成审阅基线 `reports/cognitive-47-source-base-20261101`，head `5e5771a2a63b531a7346ea2fbb520ac9433d1cbb`。本轮新增的maze/matrix独立练习、R1版本化反转和数轴NP及其精确readiness直接包含在报告/模式PR差异中。没有修改原PR分支；核心PR进入main后应重定位本PR基线。
- R1交接：`b08fd18add73da2be6ac55d5afc7110964417f24`，限定文字续修`e62bae38fb170e15ab76a635c59c2bdf3654dabd`，后续统一交接`efdf1664d176587d4977f6a8f8199221dce2b587`已纳入；R2：`7fc8405a11ced478a0326cb069c5c9f504d0f6d0`，`dfd39d67caa06ac8a29de352ac92e17a5bce6dce`的中性序列开场已采纳；三新核心`9aab433370641c4a0fe64d3b87386df3799beceb`已获源码有界GO，已按各新C/S选择自身R3；R3只取报告增量：`42ad96c5ab5f96568d3e0edf2cbe17e8b13fb947`；R4：`b39d66b9f1166429d0007e165a7d52e15cf6c5fc`。

## 本次实际改动

所有当前推荐C/S身份各新增一个 `*-report3` DRAFT配置，reportVersion、presentationVersion与reportReading.version均为3.0.0，referenceMode=none。原配置、原呈现值与冻结报告保留；无reportVersion或旧配置继续使用原呈现，新配置显式选择R3。迷宫、matrix、R1和R2旧C/S的先前未发布R3草稿也保留为兼容地址，不增加工具种数。

各组工厂式报告文案已在原task-owned声明中物化，按既有manifest生成机制注册。旧呈现排在前面，R3按报告版本选择；兼容文件仅转出这些声明，不再作为注册入口。无需数据库迁移、重算历史或新报告平台。新开场文案也只由R3配置选择；timecopy保存修复与迷宫C1.1行为均保留。

本轮另有必要模式修订：maze C1.1独立3×3练习、matrix C/P1.1独立4练习，旧版保留，正式序列及scorer不变。maze、matrix、反转和NP四个新C1.1补齐既有task-owned readiness声明，保留restart-required及未知版本拒绝；不是新增门禁。R2三新C的原任务声明仍由D按G1成果接入，无默认兜底。

冻结时新R的标题、显示单位、质量标签和正文指标单独保存；纯报告改动不改scorer或正式参数。模式修订另以新身份记录：反转C1.1修截止/首次答案锁定与研究练习，仍固定一次反转；数轴NP C/S1.1为单范围六点；R2三个新C分别隔离练习、交叉真假否定及固定目标机会。两项原schema（readingcomp/proofread）将reportVersion锁死1.1.0，因此只把允许集合改为1.1.0/3.0.0；题库、参考模式none、时序、试次数与评分限制均未放宽。

修正了语义流畅性每轮词数原被当成百分比的显示（R3为count，保留2.5等小数）、迷宫均值/重复格子的真实标签、词汇判断用时包含有效错误作答及遗漏包含无效用时的定义。分享的有效零、超时/其他未答与缺失null保持分开；移除了把trustgame推成一般公平态度的残留。短BART、分享与模拟分配不推断稳定风险、道德或人格。

## 当前身份与体验长度

下表列当前推荐C/S的profile参数。新增C与旧版的改变见模式修订记录；同C/P新旧R的参数保持一致。数轴NP是另外显式选择的研究适配身份，不自动替代原推荐数轴；八配置见[np-configurations.json](np-configurations.json)。练习、条件平衡、时序、随机、指标分母与研究文献的逐项比较见对应分组文档。元数据用时与新的流程估计均非用户实测，不能当作可靠性证据。

| 组 | 工具 | 当前C / 计分 | 新配置（R均3.0.0） | 体验profile参数 | 研究profile参数 |
|---|---|---|---|---|---|
| R1 | arithverify | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":12}` | `{"totalTrials":60}` |
| R1 | cancellation | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":1}` | `{"totalTrials":4}` |
| R1 | cardsort | 1.0.0 / 1.0.0 | `1.0.0-report3` | `{"totalTrials":24,"blockCount":2}` | `{"totalTrials":144,"blockCount":6}` |
| R1 | flanker | 1.0.0 / 1.0.0 | `1.0.0-report3` | `{"totalTrials":24}` | `{"totalTrials":160}` |
| R1 | numberline | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":8}` | `{"totalTrials":40}` |
| R1 | patterncompare | 1.0.0 / 1.0.0 | `1.0.0-report3` | `{"durationSec":30}` | `{"durationSec":90}` |
| R1 | reversallearning | 1.1.0 / 1.0.0 | `1.1.0-report3` | `{"totalTrials":40,"acquisitionTrials":20,"reversalTrials":20}` | `{"totalTrials":240,"acquisitionTrials":120,"reversalTrials":120,"trialTimeoutMs":2000,"practiceTrialCount":30,"practiceAcquisitionOnly":true}` |
| R1 | sizecongruity | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":16}` | `{"totalTrials":96}` |
| R1 | symbolmatch | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":16}` | `{"totalTrials":80}` |
| R1 | trailmaking | 1.0.0 / 1.0.0 | `1.0.0-report3` | `{"form":"A","partAItemCount":12,"partBItemCount":0}` | `{"form":"AB","partAItemCount":24,"partBItemCount":24}` |
| R1 | ufov | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":8}` | `{"totalTrials":24}` |
| R2 | auditorynback | 1.1.0 / 1.1.0 | `1.1.0-report3` | `{"totalTrials":22}` | `{"totalTrials":60}` |
| R2 | auditoryrt | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":8}` | `{"totalTrials":48}` |
| R2 | digitbackward | 1.0.0 / 1.0.0 | `1.0.0-report3` | `{"startSpan":2,"maxSpan":4}` | `{"startSpan":2,"maxSpan":8}` |
| R2 | letternumseries | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":6}` | `{"totalTrials":16}` |
| R2 | pairedassociate | 1.0.0 / 1.0.0 | `1.0.0-report3` | `{"pairCount":6,"learningRounds":2,"delayedEnabled":false,"delayedDelayMs":0}` | `{"pairCount":18,"learningRounds":4,"delayedEnabled":true,"delayedDelayMs":30000}` |
| R2 | picturesequence | 1.0.0 / 1.0.0 | `1.0.0-report3` | `{"itemCount":6,"learningRounds":2,"delayedEnabled":false,"delayedDelayMs":0}` | `{"itemCount":15,"learningRounds":3,"delayedEnabled":true,"delayedDelayMs":30000}` |
| R2 | runningspan | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":8}` | `{"totalTrials":20}` |
| R2 | sentencecheck | 1.1.0 / 1.1.0 | `1.1.0-report3` | `{"totalTrials":12}` | `{"totalTrials":60}` |
| R2 | seqlearn | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":40,"randomBlockIndices":[3]}` | `{"totalTrials":100,"randomBlockIndices":[6]}` |
| R2 | visualwm | 1.1.0 / 1.0.0 | `1.1.0-report3` | `{"totalTrials":8}` | `{"totalTrials":24}` |
| R2 | wordlist | 1.0.0 / 1.0.0 | `1.0.0-report3` | `{"listLength":8,"learningRounds":2,"delayedEnabled":false}` | `{"listLength":15,"learningRounds":5,"delayedEnabled":true}` |
| R3 | cogest | 1.1.0 / 1.1.0 | `1.1.0-report3` | `{"totalTrials":18}` | `{"totalTrials":36}` |
| R3 | embeddedfigures | 1.1.0 / 1.1.0 | `1.1.0-report3` | `{"totalTrials":6}` | `{"totalTrials":16}` |
| R3 | icarmatrix | 2.1.0 / 1.1.0 | `2.1.0-report3` | `{"totalTrials":4}` | `{"totalTrials":7}` |
| R3 | lineangle | 2.0.0 / 2.0.0 | `2.0.0-report3` | `{"totalTrials":12}` | `{"totalTrials":60}` |
| R3 | logicdeduce | 2.0.0 / 2.0.0 | `2.0.0-report3` | `{"totalTrials":18}` | `{"totalTrials":36}` |
| R3 | matrix | 1.1.0 / 1.0.0 | `1.1.0-report3` | `{"itemCount":6}` | `{"itemCount":24}` |
| R3 | mentalrotation | 1.0.0 / 1.0.0 | `1.0.0-report3` | `{"totalTrials":12}` | `{"totalTrials":80}` |
| R3 | proofread | 1.1.0 / 1.1.0 | `1.1.0-report3` | `{"totalTrials":18}` | `{"totalTrials":36}` |
| R3 | readingcomp | 1.1.0 / 1.1.0 | `1.1.0-report3` | `{"totalTrials":18}` | `{"totalTrials":36}` |
| R3 | seriescomplete | 1.1.0 / 1.1.0 | `1.1.0-report3` | `{"totalTrials":18}` | `{"totalTrials":36}` |
| R3 | tower | 1.0.0 / 1.0.0 | `1.0.0-report3` | `{"problemCount":4}` | `{"problemCount":18}` |
| R3 | wordanalogy | 1.1.0 / 1.1.0 | `1.1.0-report3` | `{"totalTrials":18}` | `{"totalTrials":36}` |
| R3 | wordmeaning | 1.1.0 / 1.1.0 | `1.1.0-report3` | `{"totalTrials":18}` | `{"totalTrials":36}` |
| R3 | wordproblem | 2.0.0 / 2.0.0 | `2.0.0-report3` | `{"totalTrials":18}` | `{"totalTrials":36}` |
| R4 | lexicaldecision | 1.0.0 / 1.0.0 | `1.0.0-report3` | `{"totalTrials":40}` | `{"totalTrials":200}` |
| R4 | emotionrecognition | 1.0.0 / 1.0.0 | `1.0.0-report3` | `{"totalTrials":24}` | `{"totalTrials":120}` |
| R4 | bart | 1.0.0 / 1.1.0 | `1.1.0-report3` | `{"balloonCount":10}` | `{"balloonCount":50}` |
| R4 | delaydiscount | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"bisectionSteps":3}` | `{"bisectionSteps":7}` |
| R4 | gamblingdeck | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":40}` | `{"totalTrials":100}` |
| R4 | timecopy | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":6}` | `{"totalTrials":20}` |
| R4 | semanticfluency | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":2}` | `{"totalTrials":8}` |
| R4 | trustgame | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"offers":[50,20,80,10]}` | `{"offers":[50,20,80,10,40,30,60,20,50,10,70,30]}` |
| R4 | pursuitrotor | 1.0.1 / 1.0.0 | `1.0.1-report3` | `{"totalTrials":2}` | `{"totalTrials":8}` |
| R4 | maze | 1.1.0 / 1.0.1 | `1.1.0-report3` | `{"totalTrials":2}` | `{"totalTrials":8}` |
| R4 | sharegame | 2.0.0 / 2.0.0 | `2.0.0-report3` | `{"endowments":[20,50,100]}` | `{"endowments":[20,50,100,20,50,100,50,100]}` |

完整身份与既有三模式元数据：[identities.json](identities.json)。具体题量不是统一18题，也不能仅凭FINAL条数上界推断有效观察量；例如类别、条件、目标机会与自适应停止会改变指标的实际分母。

## 分组记录

- [R1：比较、注意与控制11项](../../cognitive-intake/r1/report-and-mode-review.md)。
- [R2：记忆、学习与听觉11项](../r2-memory-learning-20261101/README.md)。
- [R3：推理与题库14项](../../development/cognitive-report-modes-r3-20261101.md)。
- [R4：决策、社会与其他11项](../../development/cognitive-report-r4-mode-review-20261101.md)。
- [迷宫独立练习的源码事实、一手实现参照与验证](../../../server-version/backend/src/modules/cognitive/tasks/maze/INDEPENDENT-PRACTICE.md)。

分组文档记录的是交接时版本与局部证据；最终当前R和显式配置选择以本页及identities.json为准。部分文献只取得作者/出版社一手摘要，已在单项记录注明，未把缺失的原练习、时序或随机方案捏造为一致。自编词语、阅读、估算和七题项目矩阵按实际目的审查，不借标准工具名背书。

## 已核证据与边界

后续R3增量：`fd35f4ad194f078c51ce61939a79c3d2784c8e10`修订tower合法移动/首次尝试和ICAR解释；`bf869a8007c9ed1911e9a4c1776ad6fa831694f6`隔离matrix练习，已纳入。相同正式题池/评分复用原作者有界证据，仅复核matrix新身份绑定及这三项报告，未重跑全14或47项。

- Node24.21.0：47种当前任务、体验/研究共94个配置冻结通过；逐值核对全部旧呈现与旧seed均保留；剥离report元数据后，R3与**同C/P基础草稿**两模式参数一致；这不表示跨旧C和独立练习新C的训练条件相同。
- 对每份冻结报告检查普通合成值、真实数值零与全null三种投影，共282份；无缺失补零、未解析占位符或缺失图表补值，单任务报告不生成0–100产品指数。语义流畅性每轮词数按count显示。此为报告投影契约检查，未重复执行47套scorer，也不是施测结果或可靠性验证。
- 前端认知闭包与后端profile-freeze依赖闭包类型检查；manifest与依赖检查通过（最终659模块）。初始94个注册声明符合data-only；保留77429c的cancellation生成器常量引用后，该seed文件本身属于可执行依赖模块，不称全部最终94个都纯数据，也没有放宽data-only检查。这个含C执行/schema/冻结逻辑的PR不走纯内容路线。
- 不重跑全47浏览器呈现。仅抽查flanker、auditorynback、wordmeaning、icarmatrix、lexicaldecision、semanticfluency、sharegame、maze的两模式新配置，经实际registry runner开场和CognitiveV2ReportCard共32个视图：生活例子可见，无页面异常或390px横向溢出。数字为明确标注的合成示例。既有各组同输入局部证据继续保留，未转述为整体验收。
- 迷宫独立核心修订已另有4个定向DOM用例、两模式预算冻结与真实练习→首题浏览器证据。Timecopy保存修复复用原作者精确提交证据，合并仅添加R3介绍，不覆盖其保存路径。
- 没有运行全CI、安装/发布、数据库写入、生产、实际被试研究、完整47次施测HTTP持久化或原生设备验收。

## 尚未收口的真实核心/模式问题

这些问题由原作者独立处理，不把“已经写明差异”称为研究对齐完成，也不要求自编变式先取得临床常模。未收到最终修复head前，相关记录保持待核；本报告PR继续Draft。

| 项目 | 当前状态与影响 |
|---|---|
| cancellation | 已纳入`77429c347f3e338bc04058d7bda35bcec5ac2b27`精确修复；基础草稿与新R3均引用同一生成器刺激常量，未放宽scorer白名单。R3两模式绑定/零/null投影增量通过，原生成→评分证据复用该提交。 |
| reversallearning | 已纳入efdf166统一交接：C1.1的绝对deadline与首次payload仅重试保存修复、统一负反馈及研究30练习/正式2秒。仍固定一次反转、正确选择默认80%奖励/错误选择0；原研究九次按表现反转未实现，不称复刻。 |
| numberline | NP C/S1.1已实现：单范围六个原A/B选点、0–100/0–1000及预定4/30秒各自冻结，共八基础配置及八R3配置。没有PN、混合范围或自动双session，不判定个人线性/对数类型。旧数轴仍保留原推荐身份。 |
| sentencecheck / visualwm / auditorynback | 核心9aab433已获源码有界GO并纳入来源基线。新R3分别绑定句图C/S1.1、视觉C1.1/S1.0及听觉C/S1.1；听觉体验22音、20次可比较机会（6匹配/14非匹配）。等待D接入G1原task readiness后，三个新声明才可经实际入口启动，不加fallback。 |
| seqlearn | 已按dfd39d6移除新R开场中的序列/随机区组暗示，保留中性四按钮操作说明；报告作为作答后解读，不把例子移到施测前提示规律。 |
| matrix / mentalrotation / tower | matrix已有确证反例，已纳入独立4练习的新C/P1.1、S1.0；正式6/16/24与scorer不变。mentalrotation原协议允许重复刺激，不因重复判缺陷；tower四个一步练习与正式无重合，撤回先前误判。tower用时明确为首次移动尝试（可能违规），不称纯计划时长。 |
| maze | 已在独立C1.1修订隔离3×3练习；旧C1.0.1保留重复首图的历史条件，不改写旧报告。短体验2图仍不足以给稳定能力结论。 |

后续只接收对应增量、检查受影响接线与文案，不据此重跑各组全测试或新增平台门禁。

## 后续限定增量证据

- R3：当前matrix/tower/icarmatrix共6个冻结、18个零/null/普通值投影通过；仅8个新增视图，已实际显示matrix C1.1独立练习。旧14组及全47渲染未重跑。
- R1 e62：仅6个修改过的报告共12冻结/36投影通过；新增合并字段用例1 PASS，原16例未重跑。
- cancellation：仅2冻结/6投影通过；生成器常量依赖原样保留，未为纯数据检查改回容易漂移的标签。
- 新matrix/maze readiness：两个精确版本先失败于undefined，补声明后2 PASS；未来1.1.1仍拒绝。未放开续答或其它身份。
- 新matrix并入最终477/480/481上下文后，两侧相关类型闭包实际0诊断；未修改pr13-stimuli.ts，不把早期R3上下文的TS2322当作当前失败，也不声称全后端Prisma/业务类型验收通过。

三新R2核心9aab433由D纳入原20收口，本分支已按新C/S选择自身新R；仍待D的G1精确启动声明。R1统一交接和R2核心源码审查均不等于整体验收。以上边界保持具体，不新增常模或临床门禁。

- 最新R1/R2绑定增量：7项14冻结/42投影通过；八NP配置另16冻结/48投影通过。前端11定向用例（4精确readiness、6句图fixture、1声音流程）通过；后端3报告用例通过、16未改用例跳过。R2两处测试类型边界最小修订在来源基线`5e5771a2a63b531a7346ea2fbb520ac9433d1cbb`：沿用既有ES2021，不使用Array.at；合法句图fixture经真实trial schema解析，保留后续篡改拒绝断言。
- R1合成时保留NP共享线段控件的导出、仅端点选项及原默认刻度，未漏入旧版覆盖；最终前端认知/后端冻结闭包类型均0诊断。反转/NP组件业务与已核交接相同，仅增加精确启动声明；未重跑作者完整业务测试。
- [R4迷宫真实刺激与lexicaldecision/emotionrecognition/trustgame字段增量证据](r4-increment-evidence.md)。emotion遗漏说明提交`6a0f7e81831b5a35aa006e8c6fac13ccc78d440e`；另两项在`05cd705f39ea40c69b99edbcea71441993d70f81`。

- 最新实际浏览器增量：三新R2的两模式报告共6视图，NP两模式分别中性练习→首正式目标并提交一份本地回调payload，共8视图。实际看到仅端点的线段、六题进度和目标数字；练习提交数0，首正式targetNumber/非null位置及用时对应，390px无溢出/页面异常。没有把临时预览壳当完整入口或HTTP持久化，R2仍待D启动声明。最初预览壳导入/语法错误已修正并保留失败日志，未改产品源码掩盖。
