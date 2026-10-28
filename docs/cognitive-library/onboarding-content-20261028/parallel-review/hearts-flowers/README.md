# 心与花独立复核：首响应身份纠错

基线 `a67f425269283d8281379fdf8234f9fd6b0acebc`；分支
`review/cog-hearts-flowers-20261028`；所有新Node执行显式使用
`/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node`。

## 实际修复

原reducer只检查键盘key对应哪一侧，未检查token是否为实际UI固定生成的
`'key:'+key`。初始held已包含该键时，原件可把同一键的down改成另一个token，
绕过held并进入有效首响应。两个独立反例分别覆盖Arrow键和focused Space键，
权威scorer修前均未拒绝；合法控制通过。保留
[原始2失败/1通过](keyboard-original.json)及[原日志](keyboard-original.log)。

只在任务protocol加入键盘token与key精确一致性检查，并同步generated protocol。
真实UI的全局Arrow和聚焦Space/Enter/NumpadEnter原本均使用此映射，因此输入方式、
刺激、布局、时序、题量、计分公式、参照/报告身份都不变。原后端纯合成helper的两处
`response:1`键盘占位改成实际UI token；没有修改touch/assistive或重跑原57/32整套。
修后新专属后端3/3通过：[keyboard-fixed.json](keyboard-fixed.json)。其中合法控制
覆盖四种键名、真实0ms及先释放held再按下的2ms，均保留正确RT。

新增实际React兼容检查只各做第一道练习，确认Arrow和focused NumpadEnter记录
正确key/token、释放后held为空、仅保存 `practice:0:0`，没有正式FINAL；
[两项通过](keyboard-ui.json)。新测试初次类型检查发现快照类型过宽及getByRole不支持
`exact`选项，原3条诊断保留于[frontend-types-original.json](frontend-types-original.json)。
仅按任务协议收窄快照类型、移除运行时未消费的选项，最终frontend71、backend50份
源码闭包均0诊断。实际快照摘要相同、改动及query实现绑定在
[类型修复复用证明](ui-type-reuse-proof.json)，没有重复相同UI观察。

## 独立原件核算与练习核对

[完整输入](representative-inputs.json)、[公开输出](public-reports.json)、
[独立核算/源哈希](audit-receipt.json)。6种独立合成输入通过实际capture/envelope/
权威scorer/public projector；另外从原始回应独立计算有效分母、正确/错误/漏答及
逐输入算术平均，不直接把内部research map当作公开展示。

| 记录 | 核对结果 |
| --- | --- |
| 早按/held/3次repeat/错误首答/尝试改答 | 首个错误回应锁定；repeat只汇总；无正确RT为null |
| onset时assistive正确激活 | 正确RT为真实0ms，保留assistive输入 |
| 恰在半开截止时按 | 先关闭窗口，记录真正漏答；准确率0，RT为null |
| 窗口未闭合时中断 | valid0、invalid，public groups/differences为null |
| 首答后空屏阶段中断 | valid1、limited，已闭合窗口与正确100ms保留 |
| 20题连续前缀，涵盖单规则和混合首题/重复/切换 | 心同侧/花对侧按实际规则评分；touch切换−重复为−200ms，其余无成对用时输入为null；混合首题单列 |

20题是该固定seed首次覆盖switch和repeat所需的连续前缀，不改32题计划。
错误和完整漏答进入准确率分母；正确用时只用正确首响应，输入分层不混合。

**未复制Dual练习修复。** 该任务已有正确的 `practiceInterrupted` /
`practiceNeedsReview` 状态路径：确认原件后重呈全部说明，不能直接下一题或伪通过，
新组round递增，最多三组。新的少量独立核对保存
[三个中断练习原件](practice-records.json)：`practice:0:0`、`practice:1:0`、
`practice:2:0`，0次FINAL、上限后不能再练。原session/Task/教学四例一字未改。

## 已交统筹的共享接线疏漏，pending

原`IMPLEMENTATION.md`规定FINAL适配器将claim.termination传给scoreHF第二参数。
当前基线的native port只把claim封存到原件，通用appendEnvelope/complete及
`unified-final-submit.service.ts`的scorer调用不携带此声明。最后一题raw完整、但本机
保存回执前失焦时，HFSession可以封存`aborted`，完整32个窗口仍应保留且报告limited。

最小[完整旧raw＋aborted声明片段](completion-claim-regression.json)供统筹集成回归：
使用第二批已有32条完整合成输入，仅把旧键盘token占位规范为真实映射，原文件不动；
无刺激/回答/时钟变化。实际native definition的一参数scorer调用给interpretable/32有效，
显式 `scoreHF(input,'aborted')` 给limited/32有效。这个调用对照加基线真实接线源码，
证明缺的是声明传递；不是一次新的HTTP/DB旅程，也不是要求旧无声明输入改变行为。

统筹已接手通过既有sealed raw.claim向FINAL传可选nativeCompletion并冻结入core/hash；
旧无字段保持原身份，不读COS回算。此分支**没有修改共享core/archive/registry**；
该共享集成及对应回归仍由统筹处理，状态pending，不是denied或uncertain。

## 证据复用及边界

已读最新batch-3、已批准设计、实际backend package/schema/protocol/analysis/scorer/
report/metadata/presentation，以及前端contracts/capture/session/Task/Shape/instructions/
report/NativeHFRunner、实际native scorer/原件封存调用。几何为原创SVG，无外部刺激路径；
教学中英文四例与实际correctSide一致。references为空是无个人参照适用绑定，不造常模。
三态正文/唯一图/表格仍只读public projector；invalid完全无表现组，无独立下载路径。

[复用对照](reuse-evidence.json)：第二批HFReport/CognitiveReportVisual完全相同；
第三批11个本工具前端来源中仅generated protocol变化。沿用既有中英报告、手机/200%
截图和8练习＋1正式完整/1中断的真实HTTP/DB/IndexedDB/归档重试结果，不重复全产品流程。
旧browser receipt保留raw摘要、数量和API/截图；此checkout未见独立完整HF浏览器raw
JSON，不将摘要冒称本次字节级原件回读。新两条UI检查直接证明当前producer合法token。

所有真实命令、退出、原失败、依赖/工具/源码摘要见[执行回执](execution-receipt.json)。
本地新增后端专属3目标、前端2目标、6种核算及3组练习核对；无旧整套重跑、无新截图
（无可见界面变化）、无新常模/曝光/一帧门禁、无CI/Ready/push/合并/部署/生产或COS操作。
