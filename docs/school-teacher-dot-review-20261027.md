# PR357 dot-local independent review and corrections

Original PR head: `02da0f1e442a375c7c4bf27f9c32d08e0c9b14d0`.
Latest main incorporated without conflicts: `04a8d994207d7b831b874d4be4f5c31640466458`.
Original School and Teacher ancestry retained. No Codex conversation, production
connection, deployment, historical-data cleanup or new permission grant.

## Confirmed review findings

### P1: resolved class identity was not used for whole-file deduplication

A textual grade and default grade ID can denote the same parent. The original
validator keyed their different representations; the structural insert helper
serialized transactions but did not check existing same-level names.

Real isolated PostgreSQL 17.11 and HTTP regression reproduced three failures on
original implementation: 2-row and 101-row alias files were accepted (HTTP200
instead of400), and two concurrent same-parent creates both succeeded.

Correction:
- Resolve class parents in the owning school before inserting a whole-file job
  and when matching its original source; reject duplicate resolved parent/name.
- Keep the original input and digest unchanged for resumable matching.
- Under the existing organization advisory transaction lock, recheck same kind,
  parent and trimmed name before the shared structural insert. Conflict is409.
- The roster HTTP adapter preserves the domain error/status instead of returning500.
- Do not add a unique index over unknown historical duplicate data or silently
  merge/delete history. Tests preserve two synthetic legacy duplicates unchanged.

Three regression targets passed after correction. The strengthened concurrency
case additionally verifies the exact UNIT_NAME_EXISTS error and rollback of both
writes in one duplicate batch. These are local targeted results, not final CI.

### P2: large-file quota must be disclosed, not silently widened

The existing execution plan explicitly retains40 writes/IP/900s. A5000-row file
requires50 batches. Keep this safety contract and explicit continuation; add an
upfront UI explanation, including shared-network consumption and preserved progress.

A real PostgreSQL + Redis + HTTP test processed5000 staff rows across50 batches:
40 commits succeed, the next returns429 with Retry-After; another authorized user
on the same IP is also refused. The test expires only the isolated Redis window
instead of waiting15minutes, explicitly resumes with a new token, rejects the old
token and completes the remaining10 batches. Previous40 receipts stay unchanged;
no accounts or product grants are auto-created. The production middleware/Lua and
quota values are real, but this is controlled synthetic testing, not production.
The new upfront-message UI assertion also passed. No quota expansion.

## Remaining qualification scope

This is not pure UI: original PR includes2 migrations/6 SQL-owned tables, personnel
identity/activation, formal submission protection and shared FORM/Scale/Survey/SJT
consumers. Key call chains, transaction boundaries, source matching and direct
shared consumers were statically reviewed; this is not a claim of exhaustive
line-by-line security proof.

Final qualification must bind the complete merged candidate and cover affected
backend/frontend tests, current types/builds, isolated migration upgrade/restore,
selected browser consumers and existing security checks. No unrelated media/load
or full-platform experience suites. Current changed-test inventory is17backend
(including8PG integration files) and63frontend, plus directly affected unchanged
consumers to be enumerated before CI. Historical local phase counts remain at
their original inputs; the old summary is not signed final CI evidence.

Local debugging results retain their failures and filtered cases. New-target
counts must not double-count the strengthened concurrency rerun. Do not claim
scientific-content approval, manual expert-page approval or production deployment.
The user now authorizes corrections/push and PR357 CI, superseding the original
submission-only restriction, but PR357 merge is not performed by this record.

## Bounded history projection

Independent review found that listing20 jobs fetched every part/error of each
job, although the history UI needs only counts and identity. A single5000-row
error task can otherwise dominate the list payload. The list now returns only
summary fields and one grouped part-count query for the selected page; full
errors and receipts remain behind the existing authorized detail endpoint.
Selection fetches details explicitly and discards responses after a school/API
scope change. No change to mutation permissions or immutable receipts.

Real PostgreSQL verifies a5000-error fixture has a list response below1500bytes
while detail still returns all50parts/5000errors. Three targeted UI cases verify
history selection, completed receipt loading and late-response isolation using
summary-only fixtures. This is a bounded payload/consumer proof, not a whole-site
capacity or production latency benchmark.


## 四入口共同链路补齐（2026-10-27，第二片）

用户明确将 PR355/356 的可复用优化扩展到 Survey、Training、School、Teacher，重点是作答→报告反馈→数据存储，而非复制一套引擎。

- School Scale、Teacher Scale 与 Teacher 私有 FORM 的 attempt 读取接入既有 `view=current-unit`；两端 Scale FINAL 接入既有 `response=receipt`。不新增 API，不更换身份域，不随回执泄露答案或报告。
- 共用 FINAL 已有持久化确认、submissionId/payloadHash 幂等及确认后清理本地草稿；本片复用而不重写。Teacher 报告仍经独立授权按需读取，完成状态不等于报告开放许可。
- 真实 HTTP 检查发现整合 main 后，已开始的精确教育量表被普通 Training 采集守卫拒绝。底层服务对照也失败，不能归因于 receipt-only 查询本身。保留原失败记录，未删除断言。
- 精确教育来源按原冻结完成约定处理：只有数据库中真实 Run、assignment、父测评、当前 epoch 的物化 child、精确来源与冻结策略全部吻合才允许完成。复用既有教育来源身份核验；无客户端跳过参数。新 START、无匹配 child、错误 item、普通来源仍受原停用检查。Teacher 的入口身份核验同步区分新 START 与已有精确 child，当前用户/组织/同意/报告授权不放宽。
- 实际 PostgreSQL + HTTP 验证覆盖 School/Teacher 私有来源当前单元读取、外人拒绝、新 START 停用拒绝、已有 FINAL、无报告正文的回执、同键重放及权威结果快照。公共库来源另用原真实 PG 直接服务检查，不能冒称其 HTTP 已验收。

尚未完成：组织资源不直接支持普通问卷 whole ACK/worker 路线；不能仅打开 Training 的开关。报告开放、关系评估结果投影、认知/SJT、冷/热资源基线仍须按具体消费者核查。没有证明四入口所有性能指标相同或全部优化完成。当前局部结果不等于正式 CI 或可合并资格。

### 报告读取复用（第三片）

教育个人报告此前分别从同一事实源读取 canonical FINAL 和展示结果。现接入已有 `createStoredScaleFactsReader`，在同一次已授权事务中复用读取/解码；两种视图仍独立重建，分数、质量、反馈与 canonical 的一致性断言保留。没有跨用户或跨请求缓存，不重新计分，不修改报告开放策略、旧答案或存储格式，也不从 COS 重算报告。

本地：个人报告服务 5 项通过；真实 PG 中 School/Teacher 各自的紧凑事实格式、历史完整格式均通过反馈、固定版本配图、作者修改后旧报告保持及访问撤销检查；另两项观察者 NONE 权限检查通过。执行后只读数据库确认紧凑库确有 2 个 SFF1 完成结果，完整库确有 2 个 FULL 结果。上述是 4 个场景按两种适用格式执行的 6 次检查，不宣称新增 6 个独立业务场景。没有做压力测试或声称具体延迟降幅。
