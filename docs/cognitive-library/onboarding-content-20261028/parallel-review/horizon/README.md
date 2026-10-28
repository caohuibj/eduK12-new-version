# Horizon 独立复核，2026-10-28

冻结基线 `fdc72a9739df7cafc2b238ae45f7d976b3c985f2`；工作区
`/workspace/cognitive-review-horizon`；分支 `review/cog-horizon-20261028`。
此提交只保存独立复核与可重现原件，没有为了产生修改而改变已经正确的测量或文案。

## 一个明确疏漏，已交统筹修共享层

真实调用 `projectNativeContentReport`，输入 Horizon 的冻结 score/config/profile 和
未知 `presentationVersion:'next'`，当前成功返回外层 `next`、内部任务报告 `0.1.0`；
`isNativePublicReportSnapshot` 也返回 `true`。因此当前保存/读取消费者没有排除这个
未知呈现组合。原始复现保存在 [audit-records.log](audit-records.log) 和
[audit-receipt.json](audit-receipt.json) 的 `identityFinding`。

具体位置：

- `server-version/backend/src/modules/cognitive/content-candidates/native-registry/public-report.ts`：
  `projectNativeContentReport` 仅检查外层 presentationVersion 非空，未核对其合法冻结身份。
- `server-version/frontend/src/modules/cognitive/core/native-public-report.ts`：
  `isNativePublicReportSnapshot` 的绑定字段列表不包含呈现身份。
- `server-version/frontend/src/modules/cognitive/tasks/horizon-exploration/NativeHorizonRunner.tsx`：
  `NativeContentReport` 消费上述共享 guard，任务自己的 guard 只能验证内部 `0.1.0`。

精确期望是 Horizon 当前 generic participant presentation 和 native task presentation
均为 `0.1.0`，未知 `next` 不能成为其合法保存组合。不能直接要求所有工具的两种
presentationVersion 数字相等：空间任务的 generic formatter 已合法升为 `0.1.1`，
native task presentation 仍为 `0.1.0`。建议共享修复明确区分、核验这两种身份；
不得借此重算旧报告或禁止合法的既有空间组合。按分工没有改共享文件，统筹已接手。
本分支状态为 **pending parent shared fix**，不是被拒绝或结果不确定。

复现命令实际退出 `0`，表示复现与核算脚本完成，**不表示这个版本绑定缺陷已修复**：

```sh
node docs/cognitive-library/onboarding-content-20261028/parallel-review/horizon/audit-records.cjs
```

## 少量真实结构记录核算

[完整输入](representative-inputs.json) 是明确标为合成的四个独立 scorer 输入，
使用真实冻结 plan、前端 `HorizonCapture`/reducer、后端权威 scorer 和公开 projector。
不是允许已停止 session 续做的运行器旅程，也没有重跑旧 40/320 全套。
[公开输出](public-reports.json) 没有直接拿 research metrics 代替公开投影。

| 输入 | 实际结果 |
| --- | --- |
| 无记录 | invalid，首选 0，比例差 null |
| 4 次指定选择后停止 | invalid；4 次真实选择和174点仍在原件，首选 0、完成局 0 |
| 首自由选择后、反馈尚未结束即停止 | limited；5 次选择、首选 1、完成局 0，已做首选没有被抹掉 |
| 12 局前缀，末局首选后停止 | limited；收到12、完成11、有效首选12、实际选择105、实际点数5027 |

最后一组不等信息短条件为 `1/1`，长条件为 `0/5`，长减短比例差为 `-1`
（−100 个百分点）。相等信息两组的 less-sampled 字段均保持 null。
全部实际按下均恰在 ready 时间，114 个真实 `rtMs:0` 跨三个有输入的独立例子完整保留，
不会被当作缺失；首选的已见均值与 A−B 有符号差逐行用原始四次历史独立核算。
后续自由选择没有混入首选比例；收益没有被判为正确答案；全部自由偏好均允许。

## 实际消费者与可复用证据

已读取根 AGENTS、release 规则、onboarding README/report-visibility 原始 JSON、
scenario-roadmap，以及设计/资源/报告/当前计时原则；本工作区及源库未发现
`.agents/skills`。实际核对路径为 package/schema/protocol/metadata/presentation →
native definitions/config seeds → scorer/replay/public projector → contracts/capture/session →
HorizonInstructions/HorizonTask/HorizonReport/NativeHorizonRunner → shared native snapshot/port。

- 双 profile 为精确 40/320 局，5/10 总步与1/6自由步分别存储；每臂按本臂已消费次数
  取奖励，不偷跳全局队列。使用自产几何与整数奖励，无缺失外部刺激资源。
- 中英文说明实际给出操作、何时作答、两个完整例子、25次练习和结束/保存确认；
  练习中断后只能经完整说明页开始新组三局，最多三组。流程完成而非偏好决定通过。
- `references:[]` 的类型是 `ReferenceApplicability[]`（指标常模/参照适用绑定），
  不是论文 citation 数组；不把文献来源错误填成个人常模。来源及限制保留既有README。
- 报告只消费 task public projector，valid/limited 保留真实分母，invalid隐藏表现正文、
  细项和图。图仍使用同一分支 gate；当前没有独立下载路径，不能声称下载已经验证。
- 对照原实现 `verification.json`，29个代码/配置输入中25个完全一致。
  差异仅 package可见层/配置类型、说明完成提示、报告图表消费者和投影生成脚本，
  不把旧测试冒称覆盖新共享消费者。详见 [输入对照](historical-input-comparison.json)。
- 对照第二批直接类型原始receipt，Horizon说明/报告、generated protocol/analysis/report
  和 CognitiveReportVisual 六个 TS 消费者全部相同，见 [呈现复用对照](presentation-reuse.json)。
  既有八张 Horizon组件截图及三态图表断言保留原身份；没有重拍相同输入。
  `batch-2/evidence/browser-reading-union.json` 的原调用退出1、后续缺项调用退出0，
  不改写原命令为通过；Horizon截图本身属于原成功的56个场景。
- `node server-version/scripts/cognitive/horizon-content.cjs --check` 本次实际退出0，
  stdout 为 `Horizon pure protocol/review/report match backend source`，证明生成端一致。

未修改刺激、测量布局、时序、输入、题量、计分、报告文字/版本、权限、schema或凭据；
未做物理设备、四入口、API/数据库/COS重验，未新增预检、密集探测、重测或报告门禁。
没有 CI、push、Ready、合并、部署。本次新增原始核算与缺陷复现均为本地审阅证据。
