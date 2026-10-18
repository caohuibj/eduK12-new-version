# Training 重建进度与恢复入口

更新时间：2026-10-18 12:21 UTC。本文是当前进度索引，不替代各阶段原始证据，也不构成 CI 或生产部署资格。

## 恢复原则

- 恢复分支：`recovery/training-rebuild-20261018`。按 [恢复手册](restore-from-github.md) 获取远端最新 head，不用 main 代替尚未合并的开发成果。
- 最新已核验远端检查点为第 32 次：`e3e3a26c21f537a1184fbebbea23dec6d7efd296`，tree `d29dbf7f863fced14b77f0ed9f432073a92bc943`。这是 C14/C15 开发中检查点，不是整批验收版本。
- 每次备份均核对远端 SHA/tree；当前没有本分支 PR，没有触发 CI。不得将本地记录冒充 GitHub 正式门禁。
- 远端备份包含源码及脱敏证据，不包含私钥、连接凭据、私有数据库、node_modules 或未提交修改。旧丢失工作目录的未推送成果仍不视为已找回。
- 测试服务按隔离批次启动并清理；代码已备份不等于某个 API、数据库或浏览器服务仍在线。

## 已完成的阶段验收

“阶段验收”仅覆盖相应文档明确记录的源码审查、组件、API、数据库和必要并发正确性。它不等于完整浏览器验收、全平台回归或压力性能合格。不同阶段重复测试不累加为唯一测试数量；HTTP 请求数不当作测试用例数。

| 单元 | 已验证范围 | 可恢复检查点 | 证据入口 |
| --- | --- | --- | --- |
| C01 | 基线、恢复范围及合同 | `a9d61311` | [合同](acceptance.md) |
| C02 | 隔离环境、真实迁移、合成素材及最小 Form 链 | `ab0d4972` | [基线](c02-baseline.json) |
| C03 | typed Form 事实源、旧格式兼容及真实链 | `06856f1c` | [说明](c03-form-facts.md) |
| C04 | 基础高级题型编制、作答、恢复与边界 | `90170d82` | [说明](c04-basic-authoring.md) |
| C05 | 结构化题型及真实 API 组合 | `3755092c` | [说明](c05-structured-authoring.md) |
| C06 | Form V3 条件、拒答及任务资格消费 | `d3775439` | [说明](c06-form-policy.md)、[消费者](c06-consumer-satisfaction.md) |
| C07 | typed 报告、原队列 CSV/ZIP；不支持的 typed SAV 明确拒绝 | `8768fe80` | [说明](c07-typed-export.md) |
| C08 | 有界 Scale CSV 导入、签名预览、CAS 及审核记录 | `37a30f03` | [说明](c08-scale-import.md) |
| C09 | 显式 Scale 计时、独立披露权限、compact/shared 链及 Survey 回归 | `7eb26ead` | [说明](c09-scale-timing.md) |
| C10 | 认知新准入开关、历史恢复、暂停提示及 C09 整合 | `085fddd9` | [说明](c10-cognitive-switch.md) |
| C11 | 上传 SJT 独立审核、课程/匿名链、冻结恢复及摘要导出 | `8f4a5288` | [说明](c11-sjt-course.md) |
| C12 | 在线多情境/多选、人工数值 golden、版本化 FINAL 与任务资格 | `8a29c8a8` | [说明](c12-online-sjt.md) |
| C13 | 精确课程分发/改编授权、图片、共同保留/删除锁、升级与非空恢复 | `75fb1ef1` | [说明](c13-sjt-permissions.md) |

保留的明确限制：C10 未单独验证 OFF worker 处理新 FINAL 的实验；C12 新匿名组合链尚待整体验证；C13 新受控发布仅支持单一真实 Training 课程，跨代图片许可不自动继承。详细限制以各阶段证据为准。

## 当前 C14/C15：尚未验收

- 已实现单一任务的分组配置、权重抽取、持久化分配、selected-only scope、稳定键复制、分层完成/状态摘要与 CSV/ZIP 溯源。没有另建可独立访问的私卷 CompositeAssessment 或第二套计分 runtime。
- 171 迁移的旧表投影、nullable 默认及受限角色已验证；非空分配恢复仍待当前真实链完成。
- 源码 review 已收敛全部候选实际冻结校验、抽前媒体/配额、旧匿名兼容、已接受 FINAL 禁 restart、批量报告重复读取及有界 full preview。
- 新报告定向验证已经使用目标 Node 24.21.0 补齐；原 24.19 日志明确降为诊断，不能混作同输入资格。
- HTTP03 已实际接受 Form、Scale、120 试次 Go/No-Go、SJT 的 FINAL 与重放，随后异步聚合暴露真实 `DEFINITION_MISMATCH`：finalizer 仍要求未分配的 union 表单区段事实。不能把已收到 ACK 写成父任务已经完成。
- 当前正在修复 finalizer 和相关 partial graph/whole/cache 元数据读取。原已接受事实、分数、hash、epoch 保留；从停机副本续处理，不要求重交答案、不放宽完整性校验。
- 全部失败轮次保留。修复后的原事实恢复、compact/shared/whole 优化通路、报告/导出及非空新格式恢复通过后，才可更新本节资格。

## 后续单元

C16 配对分析、C17 质量与长宽表、C18 匿名治理、C19 跨工具路径、C20 材料组与配额、C21 同 IP 短窗口、C22 延迟反馈、C23 checkpoint/本地草稿、C24 界面、C25 整合及正式浏览器、C26 实际性能，仍按 [合同](acceptance.md) 执行。

目前查询/锁/响应字节等局部诊断不代表完整 CPU、RSS、数据库压力或吞吐收益。C26 会区分普通问卷与分卷全部候选校验的不同语义成本，保留同输入的优化前后实测。

## 已知测试环境约束

- 固定 Node 24.21.0；不要以全局 Node 24.19 或未固定 npx 的记录代替目标资格。
- 既有数据库禁止修改 course_type/organization_id。新测试课程应直接创建正确类型，不修改旧 LEGACY 课程或禁用触发器。
- 需要 UUID 的 HTTP 接口必须使用合法合成 UUID 账号；管理员使用正式管理认证路径。
- `pg_blocking_pids` 的绑定 PID 显式转换为 `int`。观察脚本失败不能改写为业务并发通过。
- 相同输入已成功阶段复用，修复只重验失败或受影响项；原失败 aggregate 保留，分项成功与补验清晰分列。
