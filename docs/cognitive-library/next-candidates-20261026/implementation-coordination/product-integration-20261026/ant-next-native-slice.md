# 下一项：ANT／PANT 最小原生接入清单（2026-10-27 只读核查）

核查基线：`b4ad8b3f86ba9bb8b656aa02b4ef6a359adbf7dd`（已合并 main `83955b89`，即 PR356 之后）。本文件只记录实测差异，不实施改动、不宣称 ANT 已可施测。

## 0. 本轮实测（可复核）

- `validateTaskDefinition(antDefinition)`：**0 error、0 warning**。
- `getCognitiveTaskResource('ant','1.0.0','1.1.0')`：`kind='native'`，`configVersion='1.0.0'`，profiles 恰为 `research`、`experience`。
- 结论：Notion 第 16／19 节记录的“publication-gate 强制 standard、native 准入需平台处理”**已被 PR356 的 native 分支解除**——`publication-gate.ts:44-57` 对已注册 native 定义走“恰好 research+experience”分支，不再要求 standard 别名。
- 该结论仅指“定义能过门禁”，**不等于 ANT 已可交付**：下述 1／2／4／5／6 项仍缺。

## 1. 配置 seed（缺）

`backend/prisma/seeds/native-cognitive.ts` 当前只有 `nativeMotConfigSeed()` 与 `nativeEnumerationConfigSeed()`。
ANT 需新增同构 DRAFT 基配置（`antConfig('experience')` 作基，research/experience 由既有 profile patch 生成），**不自动发布、不建账号、不授权**。真实 tuple：engine `1.0.0` / scorer `1.1.0` / config `1.0.0`。

## 2. 准入（缺）

`task-resource.ts:73-81` 的 `assertNativeDeliverySupported` 只放行 MOT 与点数精确 tuple。
ANT 需按同一写法加入精确 tuple，**且必须在 1／4／6 就绪之后再放开**；提前放开会让半接线任务出现在 authenticated 路径上。

## 3. 定义与报告（部分已有）

`content-candidates/ant/package.ts` 已有 `antDefinition`：profiles 双版、`report.headlineMetrics=['accuracy']`、userMetrics 为各条件键、detailMetrics 含分母与排除计数、`publication.status='DRAFT'`。
缺的是**参与者呈现层**：ANT 没有 `participant presentation`，因此四个可见指标在报告里会重复同一句占位解释——与点数 F1 完全同型的问题（已在 `enumeration/participant-presentation.ts` 修过，可复用同一机制与 `metricFormats`）。

## 4. 前端运行器（缺，且需先判定复用方式）

`frontend/src/modules/cognitive/tasks/ant/` 已有 `AntTask.tsx`、`capture.ts`、`seal.ts`、`local-save.ts`、`session.ts`、`AntReportCard.tsx`、完整测试。
但 `native-runners.tsx` **没有** ANT 条目，且这套持久化是 ANT 自己的 `local-save`／`seal`，不是原生宿主合同（`CognitiveNativeHost`：`appendEnvelope`／`sealRaw`／`complete`）。

先要决定：是把现有 `seal`／`local-save` 适配到宿主合同，还是按点数的 `native-port.ts` 重写一层端口。**这是设计判断，不能顺手改成第三种保存路径**；两套并存会违反“同一产物只走一条保存链”。

## 5. 归档（缺）

`raw-archive.service.ts` 只有 MOT 分支与点数分支（`isEnumeration` 形状判别）。ANT 需要：专属 `archive-schema.ts`、`loadAuthority` 的 tuple 放行、逐轮 core 与已保存 FINAL 的一一对应。
复用既有的权限、短事务、加密、引用、幂等与回执；不套 MOT 帧字段、不重计分、不从 COS 回算报告。

## 6. 尚未闭合的设计项（不能靠编码绕过）

- ANT 的物理几何与回应区（触控双侧）冻结口径，历史记录标注为“仍有待定项”；未冻结前不应把 `touch` 输入当作与原键盘版等价。
- 288 正式／48 体验与 24 练习已获图审，但 `ANT_IDENTITY` 的 `configVersion` 仍是 `1.0.0`；若本次接线改变输入协议或几何，需按三层版本判断是否升版并拒绝旧混合 tuple。

## 7. 最小验证（接入时）

只跑新增部分：seed → 授权发布 → 双 profile 冻结 → START → 唯一 FINAL → 冻结报告 → 归档失败同包重试；外加错 tuple／错 profile 拒绝、缺答与中断原件保留。
不重跑点数与 MOT 已合格证据，不恢复全量 CI，不做时序重分析。注册 definition 不等于入库或上线。

## 8. 与点数的关系

点数本轮已落地：参与者文案、详细层可读化、练习次数单一来源。ANT 可直接复用其中两项机制（`participant presentation` 与 `metricFormats`），但**不能复用点数的 config、sequence 或 archive schema**——那是不同任务的测量合同。
