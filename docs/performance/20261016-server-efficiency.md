# Server efficiency candidate, 2026-10-16

Status: implementation candidate; capacity numbers are pending measurement.

The release keeps durable asynchronous reports. The shared-runtime writer stores immutable scientific content once per exact content/version/reference binding and retains each attempt's timestamp, hash, admission, ownership and epoch. No authoritative answer, result or audit record is removed. Cognitive and situational formats remain compatible.

New shared artifacts use authenticated, versioned gzip-before-encryption with a 2 MiB decompression limit. Readers always support legacy inline snapshots. The writer is opt-in through ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED; compiled reuse uses ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED. Both can be disabled without removing the compatible reader.

Caches have entry and conservative byte budgets. They retain scientific content, not personal authorization. New artifacts and participant rows use the same transaction connection. Only independent committed observations may suppress later appends. Cold appends serialize their small metadata writes to prevent different questionnaire orders forming a lock cycle; ordinary cached versions do not use this lock.

ASSESSMENT_RESOURCE_PROTECTION_ENABLED guards only new starts and new report claims. In-flight reports finish, saved receipts remain recoverable, and normal claims have no added fixed delay. Memory protection stops new starts below 700 MiB available, narrows report concurrency below 768 MiB and pauses new claims below 512 MiB. Sustained 95% host CPU pauses background claims until <=85%. Missing/stale telemetry narrows concurrency and cannot permanently strand jobs. These are protection thresholds, not certified capacity.

The UI distinguishes local sealed answers, server-confirmed saves and report readiness. It shows elapsed confirmation/wait time and preserves confirmed state during transient report reads. Readiness polling always respects Retry-After.

Rollback: disable new shared writes and resource protection if needed; retain the compatible reader and additive table. Before restoring the older binary, stop writers/drain reports and run scripts/rollback-shared-runtime.ts first in plan mode, then --apply --writers-stopped with writes disabled. It reconstructs legacy snapshots under ciphertext+epoch compare-and-swap, never changes answers/scores, and retains artifacts. Restore/import of historical data is deferred until this candidate is finalized and requires the artifact table alongside referring attempts, followed by process restart to clear caches.

Validation and benchmarks run primarily on the server using new synthetic records. Existing unchanged checks are reused. No historical-data reconciliation is required per iteration. GitHub publication is authorized after debugging; merge and formal-image switch remain separate.

## Measured incremental costs

Runtime code candidate: `6d906832e51c09878f35502dfe9b866f358b22b5`. Three paired batches of 30 new attempts each, order OFF/ON, ON/OFF, OFF/ON, with five warm-up attempts and all five processes recreated before each condition. Both conditions retain compressed reports, the same images, quotas, pools, three workers and durable queue; resource protection is OFF for this cost comparison. OFF disables only new shared persistence and compiled reuse. All work runs on the server; the Mac controls SSH.

| Per person, eight-scale benchmark | OFF median | ON median | Change |
| --- | ---: | ---: | ---: |
| Retained field storage after report read | 637,466 B | 337,077 B | -47.12% |
| Field storage after creation/definition delivery | 356,305 B | 55,937 B | -84.30% |
| Lifecycle WAL generation | 826,229 B | 423,456 B | -48.75% |
| Lifecycle cgroup batch CPU | 0.5511 s | 0.4816 s | -12.60% |

The three paired CPU changes are -18.86%, -12.60%, -13.14%. These are batch amortized CPU seconds, not exact single-task timings. Idle and fixed questionnaire copy/publish stages are recorded separately. API, report-process and PostgreSQL CPU/memory are recorded separately in `phase10/cost-ledger-cases.json`.

| Stage CPU per person, median | OFF | ON |
| --- | ---: | ---: |
| Create attempt and deliver definition | 0.3443 s | 0.2934 s |
| Receive / score / persist results / generate report pipeline | 0.1849 s | 0.1523 s |
| Participant report GET | 0.02766 s | 0.02760 s |

Stage medians do not add to a median lifecycle total. Receive, scoring and report generation overlap, so their CPU cannot be separated precisely from these cgroup windows. Their stored columns, pipeline wall phases, database in-flight time and queue waiting remain distinct. No stage duration is inferred by subtracting two percentiles. Report-process CPU in the concurrent receive/score/report window changes from 0.1300 to 0.1085 s per person; report GET CPU has no established improvement.

Per-person runtime snapshot fields shrink from 305,406 B to 5,040 B. Eight shared artifacts add a fixed 90,554 B of field storage once for these exact definitions and reference versions, alongside existing shared source definitions. This cost is not counted as zero, repeated per participant or attributed to report generation. Preparation WAL falls from about 487 KB to 88 KB per person; receive/score/report WAL remains about 339 KB versus 334 KB. Most WAL reduction therefore comes from preparation.

Ninety paired complete reports, 720 scale units and 2,430 scores compare equal. Only record/item identifiers, wall timestamps, actual elapsed times and the attempt-specific context digest are excluded; scientific content, dimensions, methods, text and source versions remain compared. Two new mixed WHO5/SWLS5/CPT participants pass native API creation, submit, scoring, report generation and readback. This does not certify every possible questionnaire combination.

Field bytes are kept separate from heap, TOAST and index allocation, dead tuples and reusable free pages. Some index allocations do not grow because existing pages are reused; this does not make indexes free. WAL is write amplification, not retained database space. Three small batches are not a long-term disk-growth measurement. Raw snapshots and relation-allocation deltas remain in the ledger directories.

Observation uses requested 5 Hz cgroup/host sampling and roughly 1 Hz SQL snapshots, with actual timestamps retained. Cost cases recorded 112–123 fast samples and 23–25 database samples, no observer errors and no sampled lock waits. Observer thread CPU was 0.23–0.28 s per case, excluding CLI children and database work; the latter is included in PostgreSQL cgroup counters. PostgreSQL autovacuum appeared in one OFF and one ON case. No fabricated overhead subtraction is applied.

The current short CPU profile includes attempt creation, report processing and reads on one actual API and one actual report process, with all two APIs and three report processes running. Profiles succeeded for both processes. Remaining sampled work includes JSON fingerprinting/validation, frozen slot parsing, result serialization/encryption, Prisma responses and GC; sampled wall weights are not precise CPU timers and inclusive frames overlap. Compression is a small remaining sampled component. Profiles are diagnostic and excluded from capacity measurements.

## Measurement and release scope

The initial cold OFF scheduling case is screening evidence. Three primary warm-cache pairs use conditions (ON2, OFF7), (ON3, OFF4), (OFF5, ON6); one pair spans intervening batches. Inputs and resources remain matched, and actual arrivals are reported. These are small 300-person conditions, not three repetitions of the 3,200-person target. A practical selection rule is recorded before completion of primary results: retain yielding only for a material, consistent receipt improvement with no material regression in complete feedback, READY time, queue area, CPU or other-user availability; otherwise prefer OFF.

Test-driver changes are separately attributed: current Retry-After floors and bounded read retries; bounded result-only export with integrity checks; append-only synthetic preparation checkpoints. API requests, answer generation and concurrency in the preparation prefix are byte-identical. All preparation ends before measured submission windows. Tool efficiency is not counted as server speedup.

No repeated historical-data reconciliation, restore or backfill is part of this iteration. The encrypted historical backup was authenticated once before removing 11,841 attributable synthetic attempts; the user confirmed no real data in that 48-hour window, and selected questionnaire parents were checked for synthetic ownership. Historical import remains deferred. New shared-format data must be backed up/restored with its artifact table; old inline data remains readable.

Affected semantic checks, backend/frontend tests, PostgreSQL shared-artifact rollback/retry/order cases, one-time builds and native smoke pass. Evidence is experimental server evidence, not formal CI qualification. One Redis-dependent test remained skipped in a broader run; unchanged live readiness-notification evidence is reused, and this is not represented as a new pass. Unchanged components are not rebuilt or retested. The published review tree preserves upstream file modes and all untouched upstream files.

## 让路取舍与故障恢复实测

同一候选、相同配额/连接池/进程数、资源保护开启。三组暖缓存小对照均为每条件 300 份；条件 2 与 7 跨批次配对，其余相邻。首次冷缓存 OFF 条件 1 仅作筛选。

| 条件 | 模式 | 客户端回执 P95 | 全部 READY | 队列面积 job·s | 最长提交到 READY | 正常完整报告 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 7 | OFF | 2.570 s | 14.22 s | 1856 | 9.20 s | 300/300 |
| 2 | ON | 2.293 s | 14.95 s | 1992 | 9.73 s | 300/300 |
| 4 | OFF | 2.586 s | 14.86 s | 1939 | 9.39 s | 300/300 |
| 3 | ON | 2.216 s | 13.96 s | 1767 | 8.85 s | 300/300 |
| 5 | OFF | 2.423 s | 15.36 s | 2083 | 9.82 s | 300/300 |
| 6 | ON | 1.831 s | 14.64 s | 1842 | 9.96 s | 300/300 |

开启/关闭的配对中位比：客户端回执 0.857、完整反馈 0.926、全部 READY 0.954、队列面积 0.911、批次 CPU 0.965。三对客户端回执 P95 均改善至少 10%；一对全部 READY 慢 5.19%、队列面积增加 7.30%，另一对登录 P95 上升 63.6%（每条件仅 8 次，均成功）。这些代价与样本局限不能隐藏。调度 CPU 的小幅差异包含观测及空闲尾段，不能解释为精确单任务 CPU 节省。

预先记录的实际收益规则得到满足，候选暂保留有界让路与独立关闭开关。它只在繁忙时暂缓领取新报告，在途报告照常完成，低负载立即领取；不采用隔日生成。小对照不能证明 3,200 份主负载下一定同样受益，目标大批只做选定策略的一轮验收。持久异步队列在 OFF/ON 均保留，可靠性收益不归因于让路。

故障恢复：先停三报告进程，两份整卷取得 ACCEPTED 且数据库存在完整答案；再停止两 API，使用相同镜像/配额/连接池重建这五个进程。两份均自动恢复评分及完整报告；原提交 ID 重试安全，已完成任务的答案密文和报告密文均未改写。此验证覆盖进程重启，不代表单机磁盘灾难的零 RPO。
