# 有限原生 v2 接入计划（未实施）

HOLD直接零改注册；GO仅source-only草案。legacy必需numeric score无单位，空条件null又与number冲突；不得偷换成毫秒、填0/NaN或强制类型转换。

## 可复用结果路径

以下均相对server-version/：

- backend/src/modules/cognitive/v2/types.ts：metrics+quality+audit，无通用score，支持ms/signed及null。
- cognitive/v2/report.ts：方向/单位/值完整，负毫秒不截断，null缺失。
- cognitive/completion.service.ts及v2/result-snapshot.ts：v2写resultSnapshotEncrypted，scoreEncrypted=null。
- frontend/src/modules/cognitive/pages/CognitiveResult.tsx：v2进入CognitiveV2ReportCard，不进legacy /100。
- backend/src/modules/cognitive/export.service.ts：v2不输出A_score，metrics.csv携带单位。
- backend/src/modules/composite/composite-export.service.ts：v2无generic score列。
- backend/src/modules/composite/composite-analysis-snapshot.service.ts：v2只需metrics/quality而非legacy score。

上述省略前缀的cognitive路径同属backend/src/modules/。

## 必需有限接线

v2/registry.ts的list/get全部由legacy RegistryEntry适配，scorer仍调用entry.score；结果类型可用不代表原生注册可用。

1. cognitive/task-package.types.ts与任务manifest增加显式原生v2分支，旧executionEntries不变。
2. scripts/cognitive/manifests.cjs及生成入口支持原生定义，不能只手改generated。
3. v2/registry.ts按testType/engineVersion/scoringVersion精确解析，跨两类重复identity拒绝，未知版本不回退。
4. cognitive.registry.ts相关元数据、catalog.service.ts、assignment.service.ts及profile冻结接受新分支，不要求假legacy scorer。若无法保持旧任务不变，则继续source-only，不扩大框架。
5. 新任务DRAFT、referenceEligible=false、references为空。不改既有科学结论、发布状态或综合分析规则。

Flanker只能参考基础组织方式，不沿用4练习、触屏、RTfloor参与准确率、中位主效应、启发式质量阈值或60/40的0–100分。

## 后续定向检查，本轮不运行

- 新实现映射/符号符合已审oracle，错误键不改变条件。
- 首键/repeat、0/1999/2000ms、技术无效、空分母/条件null。
- seed/顺序/版本冻结，精确注册和重复/未知版本拒绝。
- 持久化重读负值/null，无假score；报告及CSV/JSON/composite无/100、零填补或单位错位。
- 旧任务registry/scorer/report/export不变，不重复未受影响检查。

本包未实现接线或注册，未运行任务/CI、未merge。source-only材料不能称为可执行导入。
