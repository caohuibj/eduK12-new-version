# Gate-C 收口（V3.2 开新需求前）

SUT：隔离候选 `e932298`，`127.0.0.1:3313`。  
信封：整机 4C4G；PG 1.5 CPU / 1.5 GiB；Redis 0.25 CPU / 256 MiB；Node heap 1 GiB；Prisma pool 10；`BACKGROUND_WORKERS_ENABLED=false`。  
k6：open-loop arrival-rate，每档 20s，先 10s @ 25 rps warmup。Scale 线（standalone / first-child / last-submit / last-GET / mixed）。未跑 Cognitive/Form 的 k6 线。

原始结果：`/tmp/eduK12-gate-c-4c4g/results/summary.json`。不入库。

## 有效档位

warmup + 25 + 50 + 75 约消耗 3250 条夹具。每条线 COUNT=4000，因此 **r100 在 UNIT 线上因 `gate_a_fixture_exhausted` 无效**，不是容量结论。last-GET r100 夹具未耗尽，是有效饱和读数。

HTTP 失败率在所有发出的请求上为 0（`http_req_failed` 0%）。r100 UNIT 的 checks 失败来自夹具耗尽，不是 5xx。

### C1 UNIT submit（standalone / first-child）

| 线 | 档 | 达成 rps | p95 ms | med ms | HTTP fail | drop |
|---|---|---:|---:|---:|---:|---:|
| standalone | 25 | 25.00 | 40 | 22 | 0 | 0 |
| standalone | 50 | 50.00 | 156 | 18 | 0 | 0 |
| standalone | 75 | 72.40 | 760 | 43 | 0 | 0 |
| first-child | 25 | 25.00 | 43 | 30 | 0 | 0 |
| first-child | 50 | 49.98 | 116 | 24 | 0 | 0 |
| first-child | 75 | 73.12 | 1074 | 156 | 0 | 5 |

UNIT 路径 top phase 仍是 `final_submit_admission` + transaction wait。75 rps 零失败，p95 进入队列放大；与 Gate-B「50–75 operational」一致。UNIT 路由上没有 `aggregate.*` phase。

### C2 last-submit vs last-GET

last-submit（末子 UNIT，不 finalize）：

| 档 | 达成 rps | p95 ms | med ms | HTTP fail | drop |
|---|---:|---:|---:|---:|---:|
| warm 25 | 25.00 | 45 | 29 | 0 | 0 |
| 25 | 25.00 | 2925 | 37 | 0 | 0 |
| 50 | 49.99 | 851 | 27 | 0 | 0 |
| 75 | 71.40 | 1312 | 160 | 0 | 19 |

r25 last-submit 的 **中位数仍是 37 ms**，p95 被长尾拉高；后续 50/75 恢复。不把它当 25 rps 容量失败，也不据此改代码。

last-GET（权威 finalize / read-repair）：

| 档 | 达成 rps | p95 ms | med ms | HTTP fail | drop |
|---|---:|---:|---:|---:|---:|
| 25 | 24.98 | 169 | 50 | 0 | 0 |
| 50 | 40.58 | 4608 | 2605 | 0 | 105 |
| 75 | 41.04 | 9673 | 6955 | 0 | 536 |
| 100 | 40.83 | 10102 | 7972 | 0 | 1009 |

last-GET 从 50 rps 起饱和在约 **41 rps**。phase 是 `aggregate.probe_ms` / `load_ms` / `persist_ms` / `decrypt_ms` 同量级抬升，符合「每请求不同 parent 的首次同步 finalize、pool=10」。这是 V32-4 设计内的聚合成本，不是 UNIT 回退。

### C3 mixed

混合夹具含 UNIT submit 与 GET finalize。

| 档 | 达成 rps | p95 ms | med ms | HTTP fail | drop |
|---|---:|---:|---:|---:|---:|
| 25 | 25.03 | 78 | 20 | 0 | 0 |
| 50 | 50.00 | 201 | 15 | 0 | 0 |
| 75 | 74.86 | 744 | 47 | 0 | 0 |

mixed r75 分路由（metrics-delta）：

| 路由 | n | response avg ms |
|---|---:|---:|
| UNIT `.../scales/:id/submit` | 1040 | 61 |
| GET `/api/questionnaires/assessments/:id` | 460 | 242 |

mixed 75 的合成 p95（744 ms）与 standalone 75（760 ms）同量级。UNIT submit 平均 61 ms，**没有被同机 finalize 拖到失败或低于 standalone**。V32-4「UNIT 不调用 finalize」在 4C4G mixed 75 上成立。

mixed r100 与其它 UNIT r100 一样夹具耗尽，忽略。

## 开新需求前的优化结论

**不另开 V3.2 优化 PR。**

| 候选 | 结论 |
|---|---|
| 扩大 Prisma pool | 否。用户已冻结；Gate-C 未证明 mixed 50–75 UNIT 被 pool 拖死 |
| Bounded admission / 429 | 否。75 rps UNIT 零失败；admission 不是第一瓶颈 |
| last-child 探活改回 submit | 否。UNIT 已脱离 finalize |
| Bull / HTTP 202 / FINALIZING | 否。last-child 保持 GET/complete 同步 |
| 重跑 r100 | 否。75 档已足够做收口判断；r100 只证明夹具太小 |
| Cognitive/Form k6 | 本 Gate-C 未跑。admission 已在 PR45 落地；不阻塞 Bundle 开工 |

last-GET ~41 rps 饱和是已知聚合成本。产品侧已完成的 GET 应走幂等短路径；那是后续观测项，不是现在改池或改提交边界的理由。
