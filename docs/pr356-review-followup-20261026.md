# PR356 新一轮 review 核验与修复

收到补充 review 时最新远端为 `22e471747274263f37c60d3e87398735a3845168`，它只增加 CI 控制，业务源码与 `48516ef5900cf9f711ea3cc852ac148cd221d7f8` 一致。Actions 仍为 0；没有把未运行说成通过或失败。原 CI 激活授权保留，但先修复本轮成立的问题，再更新精确候选与失效范围。

| 问题 | 实际调用链与判断 | 修复/验证 |
|---|---|---|
| Survey 默认逐题缺指导语 | 成立；PublicApp 将单位转换为 timedScaleUnits 时丢弃 instruction，SurveyTimedScale 也未显示；TaskForm 的显示不覆盖该分支 | 将公开冻结 unit 的原文本传入逐题组件并以 note 展示。真实 PublicApp 恢复→逐题→FINAL 新用例修复前 1 FAIL（找不到 note），修复后 1 PASS；其余 52 个过滤项没有冒认通过。FINAL 答案不增加指导语字段 |
| Training 整卷/当前单元重读实时指导语 | 成立；whole definition 与 current-unit DTO 均读取 Scale 行，绕过已冻结 runtime | 两处优先使用 runtime.instruction（包括显式 null）；仅旧快照缺字段时兼容实时行。真实 receipt 用例增加修改行后分别重读整卷与 current-unit 的断言，留在当前源码的新完整隔离运行中执行，当前不宣称已跑 |
| 成人同一 reference set 跨学校分层 | 成立；生产纯函数在 ORIGINAL/TIME_MATCHED/LATER_REFERENCE 的同集负例均复现错误可解释状态 | 将完整精确身份/阶段谓词应用到 resolver 可见的全部 entries，并传入 measurementHash；不修改原集合。新增 3 例修复前 3 FAIL，修复后受影响组 12/12（含合规成人正例） |
| School/Teacher 误套 Training 新准入 | 需区分共享发布/旧 Questionnaire 与 organization resource 的新 child 准入，不能拿 Training 策略替代各入口原授权 | 正在核对并修复受影响调用点 |
| 已入场作答再次检查当前准入 | 非组合独立作答的 FINAL 会重查当前 Training entry；组合的已入场豁免不能覆盖它 | 正在区分新 START/restart 与已有 epoch 的 collection |

原始本地报告保存在 `/workspace/scratch/pr356-review-followup`。这些是开发证据；不是正式 CI、全部功能验收、合并或上线。
