# Training 两处局部复用补丁（2026-10-20）

父对话在独立静态 review 后明确批准本批仅移除两处重复。业务基线仍为 `c3f9a7e77447c706f4a83a93c7429a7bcb164e94`，补丁相对已 review 的工程/测量提交 `3076110bee0ee90c6bc809a0b6845464865031e1`。原单份和 300 份测量不变，不将旧结果改写成补丁性能数据。

## 实现

1. `training-flow-scope.ts` 的私有 resolver 返回本次调用的 `{scope,candidate}`；原 `resolveTrainingFlowScope` 仍只返回原 scope，新内部 materializer 入口仅供 `composite.service.ts` 在同一 parent lock 下立即消费。candidate 已通过原有 hash、parent ID、epoch、publication、flow/slot 身份检查。没有新全局/request cache，没有调用者传入的已验证 proof，也没有给普通 scope 或对外 DTO 增加 candidate 字段。
2. `ensureTrainingFlowCurrentChildInTransaction` 使用上述已验证 candidate，删除同一锁后 parent 的第二次 candidate 解密与整包 hash。所有当前 Scale/SJT 授权、Cognitive quota、source/compiled 身份及真实 child 对冻结 slot 的检查保持原样。
3. checkpoint `access` 仅在 SAVE 时将 `frozenActiveSlotSetEncrypted` 放入锁后 parent SELECT，`validateDrafts` 直接使用它，删除原独立 carrier SELECT。初始轻量 header、GET/CLEAR 投影不增加此字段；CAS、终态、expiry、课程关闭、slot/epoch/hash 检查及事务 timeout 均保留。

产品差异仅上述三个文件。没有修改 progress 的多次 parent 读取、analysis prepare、admission、事务 timeout、依赖、schema、Compose 或任何可选开关。

## 集中定向验证

本节点 Node 24.21.0、既有依赖；API/worker 保持停止，测试使用 mock persistence，无新测评或 300 份注入，无数据库写入和导出。没有重新安装依赖、构建 runtime 镜像或覆盖原 baseline dist。

| 文件 | 通过用例数 | 对应边界 |
| --- | ---: | --- |
| `training-flow-materialization-reuse.test.ts` | 7 | 实际 `getAttemptState → locked child materializer` 路径；解密/hash 各一次、原 scope 不带 candidate、不同调用重新验证、hash/epoch/parent/publication 漂移及 owner/当前资源拒绝 |
| `training-checkpoint.contract.test.ts` | 17 | SAVE 两次 parent `findUnique`（初始 header＋锁后读取）、零额外 carrier 查询；GET/CLEAR 投影；缺 carrier/slot hash/slot epoch/envelope hash；CAS、100 次保存预算、expiry、closure、恢复过滤 |
| `training-flow-consumers.test.ts` | 19 | 真实 compiler/proof/scope 的绑定与安全报告投影 |
| `training-flow-final-admission.test.ts` | 27 | parent→child 锁顺序、锁后新事实、replay、future/skipped 与各工具准入 |
| `training-flow-finalizer.test.ts` | 25 | 同事务终态、资格、事实完整性、outbox/proof 边界 |
| `training-flow-sjt-export.test.ts` | 24 | SJT 身份、分支可见性、导出投影；这是 mock 功能用例，不是运行重型导出 |
| 合计 | **119 / 119** | 6 文件，零失败，13.338s 观察窗口 |

另一次 `tsc --noEmit --incremental false` 成功，50.517s；没有再次运行原构建中的 manifest/内容检查或无关前端检查。

操作次数证据：原源码的 candidate 解密/hash 各两处，补丁实际缺失 Scale child 的 materialization 路径各调用一次；runtime load 使用同一 tx，权限检查仍执行。该用例在授权 runtime load 边界主动停止，不冒充整条真实业务复测。checkpoint 新断言证明 SAVE 额外 carrier 查询从一到零；GET/CLEAR 没有新增该载荷。

原始结果只保存一份：`/workspace/training-load-followup-state-20261020/evidence/patch-targeted-tests.json`、`build/patch-targeted-tests-summary.json`、`build/patch-typecheck-summary.json` 及对应 log。它们是本节点定向功能/类型证据，不是官方 CI 资格。

## 交接边界

本轮没有补丁前后耗时、CPU、SQL 总量或吞吐复测，**不宣称实际提速或容量提升**。只证明指定重复操作已减少并通过上述定向回归。native API 无独立硬 CPU 配额、PG 1 核配额，以及 40s 截断的基线限制继续有效；不把它们当产品缺陷或可持续吞吐上限。

按父对话要求，以带 `[skip ci]` 的固定 HEAD 备份并创建 draft PR，供增量 review；不修改工作流、不授予合并资格、不部署。后续具体对照范围和正式 CI 仍由父对话决定。
