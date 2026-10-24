# Training / Survey 核心流程优化：第一阶段收口

2026-10-24。基准 main `31d9e4cb`，产品候选截至 `3e903730`，可运行诊断脚本 `4cf3799d`。均仅独立性能分支备份，未合并、未部署；不代表全平台 CI 资格。

## 保留的实现

| 提交 | 实际改变 | 验证边界 |
| --- | --- | --- |
| `d0c2a935` | Shared SJT assignment 只派生一次；Survey 不构造随后丢弃的 response DTO | 14 局部合同、BE types；权限/flow prefix 与第二提交事务仍检查 |
| `d82871d2` | Form facts V2/V3 读取只 strict parse 一次，唯一键与 canonical 大小预算不变 | 18 合同、BE types；原六型基线的 legacy V1 forms 不覆盖此收益 |
| `b85a9980` | 当前状态子记录只取 id/compositeItemId，所有行与排序保留 | 局部合同/types；真实 SQL 94→92、242→236、400→390，报告不变 |
| `79609915` | 同请求 FINAL 响应复用 exact id/epoch/hash/cipher 对应的已验证 runtime | 8 合同/types、两型配对；不复用并发赢家结果或动态授权 |
| `cb325f1e` | 真实 Composite 页面显式请求 receipt-only，默认 API 仍给原 detail | 29 定点、BE/FE types、真实认证 HTTP；默认/重放、非法 query、原件与报告不变 |
| `3e903730` | receipt-only 锁内 reread 不再选择只为 detail 使用的 runtime cipher | 首次提交真实 SQL 核验，19 SQL/257B ACK 不变，观察 DB 接收 52,428→34,215B；默认首交保留该列 |
| `4cf3799d` | 六文件手动运行的第七片诊断脚本 | 最终仓库路径已实际运行；仅隔离 loopback perf_test，非完整六型 benchmark/CI |

`ebf6ca4e` 的 lazy callback/允许 detail 双 fresh 读取属于保留的探索历史，已由 `cb325f1e` 删除。最终没有 callback 传递层、额外披露双读或新 detailUnavailable 状态。所有原始失败与修正重验保留在本地证据中，未将失败改写为成功。

## 性能结论与限制

- 前两片确实减少重复纯计算，但六型端到端对照未建立稳定总耗时收益；typed V2/V3 未命中，不归因给它。
- 第三片确定降低查询与数据库字节，但 mixed 暖态时间/CPU 反向，不称整体提速。
- 第四片在本次 40/300 暖态目标 POST 中 CPU 下降，冷态并不一致；不外推生产容量或所有负载。
- 第五片 300 暖态反向，且默认 detail 多一次 fresh 读取，最终已用更简单的显式响应需求替代。
- 第六/七片主要证明不做页面不用的 detail、默认兼容及明确数据库列/字节减少，不做新的总体时延承诺。认证宿主真实 HTTP 与匿名/前端合同分开，不冒称真实浏览器覆盖。
- 逐单元服务器 durable 保存、同编号丢响应重试、恢复 GET、动态反馈开放及必要两入口差异都未取消。

## 未采纳的父图聚合实验

本地独立分支 `experiment/training-state-parent-reader-20261024`，提交 `0e33073b5a3ddedb549dd51b4f54543270a04b62`。该分支保存 reader、旧 Prisma oracle、6 个 PG 合同与设计；产品性能分支没有接入或保留未使用的生产模块。

方法：固定同一 RepeatableRead 快照旧新整对象深等；空/缺失、日期与非 UTC 会话、JSON null/数组/字符串、form/context 排序、跨 definition 关系、历史 child 与相同 startedAt 均覆盖。Scale/Cognitive 原 Prisma 关系读取保留，不为了单 SQL 改变历史 child 首选语义。原有无序/并列首选歧义是后续独立 correctness 问题，本轮未改变。

真实合成背景包括 420 父、420 定义、3,125 items、251 sections、1,805 assessment（量表作答）行、126 SJT。各相关集合受当前父/定义 FK 限定，无集合乘积。父/定义使用主键，items 使用 bitmap 索引，SJT 使用索引；251 行 sections 被优化器选为一次顺序扫描，不能宣称全部 index scan。单 raw 部分 EXPLAIN 约 0.5–0.8 ms，不等于完整 read/API 耗时。

最后固定 300/mixed 两型各 5 对、每方案每对 20 次纯读、各 5 次预热，交替顺序，400 次整对象严格一致：

| 每次读均值 | 300 原→实验 | mixed 原→实验 |
| --- | --- | --- |
| SQL | 8→4 | 9→4 |
| Node CPU ms | 4.642→3.311 | 5.356→3.266 |
| wall ms | 5.857→4.252 | 7.020→4.670 |
| DB 接收字节 | 10,390→12,938 (+24.5%) | 21,143→29,754 (+40.7%) |

两型五批 Node CPU/wall 均下降，确有局部收益。PG CPU 100 Hz 量化结果约 0.8→0.8 / 1.1→1.2 ms/read，不能作精确因果结论。未执行完整 GET/并发接入验证。

决定：本轮综合暂不采纳，不称“无收益”。节省约 1–2 ms Node CPU/read 同时明显增加字节，并引入手写字段/日期映射维护层；不再追加 GET 实验、压缩框架或为少 SQL 强推产品。实验本地保留，原产品源码不变。

## 下一阶段：先定义命令内事实边界，再写代码

目标不是 FINAL 后无条件调用整个 GET，而是让一次服务器命令只确定一次当前进度与冻结投放计划，并把已验证的同事务事实传给必须的执行步骤。

1. 从实际 `getAttemptState → getUnifiedCompositeAttemptState → ensure*AdmissionAtDelivery` 和最后单元 `finalizeCompositeAttemptIfReady` 列出输入/读写所有者。已存在的 child runtime WeakMap、preloadedParent header、snapshot progress 复用不再当新机会；只列真实重复取数或重复解析。
2. 将纯计划选择和 DTO 投影与有副作用的准入/推进明确分开。私有命令上下文仅携 attempt/epoch、冻结 identity、已验证 scope、当前 headers；不得跨请求、跨事务或代替第二事务 fresh guard。不能凭 compiled hash 认定整份个体 snapshot 相同。
3. 优先让现逐单元 FINAL 的 prepare/score/transaction writer 消费同一有效输入，保每次提交的原件、科学事实、完成 snapshot 同事务提交。已有 writer/receipt 复用，不新增双 raw、第二队列、后台协议或 whole flag。
4. 若再提供 submit-and-advance，保存 receipt 和后置 continuation 必须是两个明确结果：提交成功后 DTO/下一任务读取失败只能要求当前 GET 恢复，不能回报未保存或自动重 POST。服务端与客户端都核 receipt attempt/epoch；重启后不得把新 epoch 状态附给旧 receipt。
5. 在改前冻结回归矩阵：相同/变化 payload 重试、并发赢家、丢响应、撤回/换码/停止、epoch 漂移、context 先冻结、flow/variant 路径、未开放反馈、终态修复。保 UI 逐单元已保存提示与断线恢复；若提交 ACK 要等待更多工作，单列 commit→ACK 与最后单元 ACK，而非只看总耗时。

这一阶段先出最小具体调用图及可删重复工作清单，独审后实施。不改变自动保存粒度，不触另一 Survey 权限/版本管理工作，不把上述设计算已实现。新工作台访问优化排在共同提交主链之后。
