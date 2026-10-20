# 本地验收状态与证据索引

状态（2026-10-20 08:23 UTC）：本轮已冻结范围内可执行的本地静态、
类型、定向合同与隔离数据库/HTTP 验收已收口通过；真实浏览器、
管理员强认证签发、正式 CI、合并和生产仍未完成。
本页补充 [阶段验收矩阵](../acceptance-matrix.md)，不改写历史失败或阶段记录。
仅记录隔离合成环境的实际证据，不代表正式 CI、合并或生产资格。
连接验收的文件摘要、脚本 SHA、退出码及失败历史见
[连接验收记录](20261020-connected-acceptance.md)及
[脱敏执行索引](20261020-connected-acceptance-ledger.json)。

## 已确认的窄范围结果

| 项目 | 精确输入 / 证据标识 | 结果与限制 |
| --- | --- | --- |
| 后端 strict no-emit types | `c1174758b108fac1dab136a414f6b4fb7b3bc570`；`measurement-final-backend-types-c117.log` | 执行结果通过。空输出是正常编译器输出，须结合原执行退出状态，不凭空日志推断成功。 |
| 前端 app / Cognitive types | 同一 `c1174758`；`measurement-final-frontend-app-types-c117.log`、`measurement-final-frontend-cognitive-types-c117.log` | 两项通过；不是浏览器或构建证明。 |
| 后端受影响类型复验 | 上述隔离候选叠加 `703cfb542fb4bba0aa6627abfe58b2b97d155bbb` 的精确六个业务文件；`measurement-final-backend-types-703-overlay.log` | 通过；不能自动覆盖之后的 owner expiry 修复。 |
| 后端最终组合类型 | `c1174758` + `703cfb54` 六文件 + `a274b6c4` / `a3653e30` / `b94adefc` 十文件；`backend-final-repair-types-inputs.json` | strict types exit 0，无诊断；输入摘要见连接验收记录。 |
| 前端静态路由盘点 | `c1174758`；`measurement-final-frontend-inventory-c117.log` | 145 条路由与盘点一致。 |
| session/auth 检查程序静态合同 | `c1174758`；`measurement-final-session-auth-c117.log` | 6 个 session gates、2 个 syntax-only gates；3 个检查程序合同通过。没有启动真实浏览器或完成登录。 |
| 隔离 runtime/schema 与基础竞争 | 连接验收记录的 `connected-results.json` / 初始 `status.json` | 8/8 通过，0 skipped；201 份迁移台账、受限角色 233 表/1 sequence 检查与对应输入见脱敏索引。 |
| source authority 服务级竞争 | `f76932ec`；执行标识 `8c590d7a` | 原有 5 项实际通过结果保留；仅复验 queued user/held writer 与 static late expiry 两项，2 executed / 0 failed / 5 filtered，9.03 秒。filtered 不是本次重新通过，也不抹除原执行证据。 |
| 正式参考真实事务 / HTTP | 测试提交 `835c76f13b5cbe8dc08437c81688075e762c3ecc`；测试 SHA-256 `ad682622c30669090de3586d93eb3f2cec1e1a95689c74585abb134b428b5d3c`；运行输入为上述 `c1174758` + `703cfb54` 六文件 | 5/5 通过，0 failed / 0 skipped，12.01 秒。实际新建五份事前同意的合成 FINAL，未补旧同意或重算旧答案。 |
| Cognitive / 已安装 SJT 真实 FINAL 消费链 | 测试提交 `80b4d83b`；执行标识 `6e197800`，exit 0 | Cognitive 复用原 FINAL 补精确冻结 wrapper 映射；SJT 实际 START/native FINAL/UUID 重放、单份事实及 receipt 报告通过。后续 guard 修复单列，不重做已接受 FINAL。 |
| private owner 锁后到期修复定向合同 | `b94adefc`，八个业务文件与三个测试文件 | 38 个不同定向合同通过：6 expiry、23 consumption、3 legacy context、6 actual UNIFIED。静态独审通过；真实 PG B-lock 及统一类型另有独立证据。 |
| School / Teacher 实际 PostgreSQL 消费 | 上述索引的 `registered-resource-longitudinal`（`c1174758`）、`huiteacherPersonalScale`（`1f06ccab`） | 各 1/1 通过；限定现有消费通道，不代表新增编制器或跨入口私有报告披露。 |
| Training 作者、五份 FINAL、参考与独立解释 | 上述索引的 seed / author / final 0–4 / reference / reinterpret | 各阶段 exit 0；这五份原 FINAL 与正式参考专门新建的五份事前同意 FINAL 必须区分。 |
| Training reference context | 脚本 `2b72ad0f`；上述索引的 `reference_context` 及 before-fix 检查点 | 最终 exit 0；先前成功的 rollback/same-body 检查由原记录保留，checkpoint 恢复后的末两项文件不代替完整过程。 |
| 两项补丁独立静态审阅 | `a3653e309eb490dd8857f74c92a78de02cf3fec7`、`a274b6c4598b63fa4664d5f02d7a9990374bf890` | 均通过。前者限定精确 Cognitive wrapper 证明且不扩大 metric ceiling；后者只映射严格 typed error，unknown 保留 generic 400。非运行时复验。 |
| 无 context 时直接 runner HTTP 拒绝 | `a274b6c4`；执行标识 `62d2898a` | 仅对原 attempt 重试 GET，精确返回 `STALE_ATTEMPT` 409；context/reference 仍 null，answers/facts 仍 0，child 保持 IN_PROGRESS，没有新 FINAL。 |
| private owner 锁后到期真实 PG 回归 | `b94adefc`；执行标识 `0dccd404` | 1/1 通过，0 skipped，8.75 秒；实际后续 B release 行锁等待跨过 owner 到期后拒绝，parent/binding/child 全部回滚，fixture 到期设置在 finally 恢复。 |
| Cognitive 声明式 guard / 独立解释闭环 | 修复 `a3653e30`；脚本 `09e7a2c7`；执行标识 `b4e50ffb`，exit 0 | 同一 FINAL 的 exact-wrapper guard 有/无 core 两次读回通过；显式历史报告/artifact 经 cookie/CSRF CREATE、重放、GET、导出通过。原 parent/child/raw/两 assignment 的 hash 不变，无新 START/FINAL。 |
| reference / FINAL 消费有限独审 | 原审阅 `ed30bb31`；修复 `b94adefcdffc0f9788f82b0e27c3384be0cbd185` 八个业务 blob | owner expiry 阻塞修复并复审通过，含 terminal Run COMPOSITE fence。本限定 integration 范围无剩余静态阻塞，不是全仓库批准。 |

日志标识用于对照原执行记录，不是公开下载地址。此页不复制凭据、
原始答案、数据库内容或私有运行环境信息；未建立应用 CI 接纳链的
本地证据不得直接替代正式门禁。
连接验收报告与索引提交为 `bca05a2a`。本轮服务已正常退出，
`cleanupVerified=true`；保留隔离 cluster 和证据，未删除源事实。

正式参考检查涵盖真实 Training 来源、独立复核、精确审核 hash/能力、
幂等与数据库拒绝、普通 cookie/CSRF HTTP 边界，以及实际 advisory-lock
等待跨过发布者 grant 到期后的拒绝/回滚。科学能力来自明确标记的
合成 fixture，不是管理员 WebAuthn 签发验收；五份合成样本的通过不
证明科学常模有效。

## 仍未完成或不在本次通过范围

| 项目 | 当前状态 | 完成所需证据 |
| --- | --- | --- |
| 真实浏览器 | 未完成，按要求暂缓新交互 | 管理员强认证签发、页面交互、恢复/下载及相应访问控制的真实浏览器证据。 |
| 正式 CI / merge | 未完成 | 经审阅的精确候选、实际所选正式门禁与合并结果；不得以本页代替。 |
| 生产 | 未执行 | 另行授权及精确产物/版本、就绪、受影响短流程与回退记录。 |
| 其他数据模式与功能范围 | 不因本轮通过而扩张 | 当前实际 Scale 为 inline encrypted canonical snapshot，未开启 compact facts；人口映射、参与者模板/参考披露及其他未实现功能仍按原范围单列。 |

合成样本验证证明工程协议及拒绝边界，不证明常模的科学有效性、
代表性或适用性，也不授予真实样本生产访问权限。旧记录缺失的
测量/参考身份不补造；参与者可见内容不因研究者报告通过而扩大。
