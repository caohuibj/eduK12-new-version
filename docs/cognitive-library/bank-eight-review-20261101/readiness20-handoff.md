# 给母线D：#477原20项的前端宿主缺口

这是既有消费者的实际阻断，不是因文档不够详细新增门禁。本八项分支未修改原20项任务文件；此说明交D单独收口。

## 精确证据

- 固定来源#477 `605a3a5f5a03e23da442f0e17a6fb9486870e8dd` 的 `frontend/src/modules/cognitive/core/readiness.ts` 仅有25个旧精确身份，profile helper固定engineVersion=1.0.0。resolver按`${testType}/${engineVersion}`查表，未知值没有fallback。
- 既有 `frontend/src/modules/cognitive/pages/CognitiveRunner.tsx:287–295` 的READY分支执行 `if (!resolvedEntry || !readinessProfile)`，显示“该测评类型或版本暂不支持，请联系老师处理。”，没有开始按钮。该页面与#477相比无差异，本轮未增加该判断。
- 对#477 `install-selection.json` 的全部20项实际加载 `resolveRunner` 与 `resolveCognitiveReadinessProfile`：**20/20 runner存在，20/20 readiness为空**，engine均1.0.1。它们在这个READY消费者中同因阻断；不把它扩称所有可能独立宿主或四入口都已实测失败。
- 用实际CognitiveRunner组件、合成READY状态加载numberline/1.0.1：实际显示上述不支持文案，开始按钮不存在。两个定向缺陷复现断言通过；这里的“2 PASS”表示成功复现阻断，不是20项功能通过。未连接API、DB或生产。

原始探针和JSON结果保留私有环境；一次性复现文件已从源码树移走，避免把“20项必须保持不支持”变成未来CI断言。D修复后无需反向维持该缺陷。

## 为什么此前20项onboarding通过

`backend/src/scripts/cognitive-onboarding-check.ts:207–221` 的readiness阶段调用后端 `evaluateCognitiveProductReadiness(definition, seed.config)`；它验证任务定义与配置。前端acceptance通过 `runAcceptance`执行任务DOM suites，组件直接挂载在合成宿主。两条路径均不调用前端宿主的 `resolveCognitiveReadinessProfile`，所以后端合同与直接组件用例可以通过，同时真实READY页面无法开始。此前记录明确是UI-only/合同证据，不能升级为实际页面/HTTP全链完成。

## 最小收口建议

给这20个精确版本补真实的输入/阶段恢复声明，保留既有未知版本拒绝及restart-required；不是补新审批或科研资格。可复用本分支已公开的registry可选readiness字段和从generated runners投影显式声明的resolver，避免另维护一份任务资格表；D应按各任务实际输入能力声明，不能机械复制八项四选一任务的能力。后续只验证受该接线影响的宿主准备，不重复20项已覆盖的计分、题库或整套DOM。

本轮只读过的main快照为6cc6704a51a13fccebeb026d8a6e37efc1ac7938，其中上述表与消费者仍相同；最终main集成由D读取当时实际版本。未对原20项实施修复。
