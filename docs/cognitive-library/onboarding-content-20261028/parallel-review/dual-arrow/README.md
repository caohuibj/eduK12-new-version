# 双箭头独立复核与练习中断修复

冻结基线 `a67f425269283d8281379fdf8234f9fd6b0acebc`，分支
`review/cog-dual-20261028`。本轮所有新 Node 执行显式使用
`/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node`；没有安装依赖或改lock。

## 发现和实际修复

原 `DualSession.captureDone/stop` 对练习中断同样设置整次 `aborted`；原件保存确认后
只到“本次练习已结束”，无法经完整说明开始获准的新练习组。完整三轮但答错已有
说明重练路径，未完成练习却遗漏此路径。真实React新例首轮1通过、1失败，失败
确实显示了结束页；正式中断不复播的对照通过。保留
[原失败JSON](practice-original.json)及[原日志](practice-original.log)。

只修改本工具 `session.ts`、`DualArrowTask.tsx`、`DualInstructions.tsx`：

- 同一有效context/realm内，练习中断后先保留原件并取得匹配本机回执，再显示
  “这轮练习尚未完成”；不把中断计成错误率，下一步必须重读完整说明和三例。
- 只有从完整说明页才能开启新的三轮组；新组使用新的round，原试次不重放，
  `nextPractice`不能绕过。仍最多三组，耗尽时如实写“已尝试3组”。
- 中英文同步解释未完成与未通过后的操作。刺激、方向、两通道输入、时序、
  60/300正式次数、3轮练习及3/3通过规则均不变，报告文本/计分/版本不变。
- 主动结束、pagehide、dispose/身份变化、未确认保存仍停止。保存失败只重试同件；
  正式中断仍封存实际前缀，不能清除formal aborted或重播正式试次。

修后原两个新目标2/2通过；再把第一目标补齐第三组上限，并增加终止/保存失败边界，
只执行这两个受影响目标，2通过、1过滤。三个不同目标都已有实际通过结果，不能
把分次执行累计成五项或把有过滤的最终调用写成整文件3/3新执行。
[修后两例](practice-fixed.json)、[边界续验](practice-boundaries.json)保留各自身份。
最终直接类型闭包63份源码、0诊断；因追加边界改变测试输入，保留初次类型记录，
最终仅重查变化闭包，见[最终类型](direct-types.json)。未跑旧60/300全套。

## 可审阅界面与真实结构原件

[中文未完成提示](screens/interrupted-zh-phone.png)、[中文完整说明重呈](screens/reread-zh-phone.png)、
[英文未完成提示](screens/interrupted-en-phone.png)、[英文完整说明重呈](screens/reread-en-phone.png)。
均为实际组件、合成内存端口、390px浏览器预览，有明确未发布标注；两语言实际
保存key依次为 `practice:0:0`、`practice:1:0`，无横向溢出或页面异常，
详见[browser-practice.json](browser-practice.json)。不是物理设备/完整产品或耐久存储验收。

首次浏览器调用在启动前因外层文件沙箱把Chromium SUID helper owner映射成nobody、
Crash Reports只读而退出1，没有产生页面结果；原[失败](browser-practice-failure.json)
与[日志](browser-practice.log)保留。随后同脚本在额外权限的独立临时浏览器进程退出0，
保留Chromium sandbox、只访问loopback并删除临时profile/构建目录；没有修改系统/
应用安全设置、文件owner或权限。最终日志为[browser-practice-final.log](browser-practice-final.log)。

[原始输入](representative-inputs.json)是6种独立合成scorer记录，使用实际冻结plan、
DualCapture/reducer、envelope、权威scorer及public projector；不是允许正式中断后
续曝的session旅程。[公开输出](public-reports.json)与[独立核算](audit-receipt.json)：

| 情境 | 实际结果 |
| --- | --- |
| 早按、held同指针、错误首答、尝试改答、3次repeat、第二指 | 早按1/held1/answered1，repeat只汇总3；蓝错误首答锁住，红第二指正确，蓝正确RT为null |
| 恰在半开截止时刻按 | 反应窗先关闭；两通道各缺答1，RT为null，不是0 |
| 蓝单任务误按红，再在onset答蓝 | 红inactive1不进分母；蓝正确，真实RT为0 |
| 双任务只答蓝后中断，反应窗未闭合 | invalid、valid0，原始蓝回应保留，不把未闭合窗补成答错或成功 |
| 两通道首答已齐、反馈未结束时中断 | limited、valid1；已结束反应窗保留，蓝真实RT为0 |
| 覆盖三模式所需的21轮连续前缀 | 各实际要求分母独立核算；蓝正确中位0ms、双−单−300ms；红双−单+500ms；两通道正确率差均约−0.1，不裁零 |

21轮是10轮每块的原计划连续前缀，首次覆盖三模式所需的最短前缀；不是改题量。
逐通道answered/correct/missed/中位数另从原件独立算出，再与公开结果逐项比较。

## 消费者和复用边界

沿最新batch-3记录读取本工具 backend package/protocol/schema/analysis/scorer/report/
metadata/participant presentation、生成脚本，以及 frontend contracts/capture/session/
instructions/arrows/task/report/NativeDualRunner。既有native registry/config factory、
冻结保存报告、shared port路径沿主线；没有改共享core/archive/registry。
原创SVG/冻结几何不依赖外部刺激路径；说明三规则对应实际蓝1/2、红9/0及双指输入。
`references:[]`是指标参照适用绑定，不凭文献来源创建个人常模。

任务报告仍只消费public projector；正文/唯一小图/数据表共用三态gate，invalid不显示
表现，limited用实际要求回应的完整窗口分母，漏答在正确率分母内；无独立下载路径。
报告、CognitiveReportVisual、generated report/protocol及DualArrows与第二批类型输入
相同，[复用对照](presentation-reuse.json)可读；旧三态报告截图/断言保留原身份，
不重拍或重复跑。旧实现22个源码输入16个相同，6个差异明确列于
[历史输入对照](historical-input-comparison.json)，不把旧suite冒称覆盖当前练习修复。

运行方式均已记录于[执行回执](execution-receipt.json)：

- 新专属 `practice-interruption.test.tsx`：原退出1；修后两例退出0；追加边界过滤执行退出0。
- `audit-records.cjs`：退出0；`dual-content.cjs --check`：退出0。
- `check-types.cjs`：最终退出0；`preview-practice.cjs`：原退出1，隔离进程最终退出0。

无CI、Ready、push、合并、部署、schema/凭据/权限修改；未做生产/COS/API回溯重算、
预检、密集探测或物理时序重测。没有待用户设计确认项，没有denied/uncertain操作；
剩余为统筹独立审核、集成和后续工具分配。
