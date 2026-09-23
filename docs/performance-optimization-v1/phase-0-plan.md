# Huisurvey Phase 0：现有资源并发测试与第一轮性能优化

**状态：IN_PROGRESS**  
**起点：PERF-01 / PR #165 已完成测量基础，等待最终审查/合并**  
**正式容量：CAP-2C4G / CAP-4C4G 均未开始**

## 1. 目标

Phase 0 不购买或长期占用新的专用性能服务器。先使用已有 GitHub 资源，把 Scale、Cognitive、Situational 三类 Assessment 第一次完整放入真实 HTTP + PostgreSQL 的并发环境中。

Phase 0 必须完成：

- 三类 Runtime 的单类并发曲线；
- fresh/replay/retry/drop/durable accounting；
- CPU / RSS / ELU / DB / gate / aggregate 画像；
- mixed workload；
- burst 与故障恢复；
- 媒体与入口保护中不依赖正式服务器的部分；
- 对已证实的重复 CPU/DB、锁竞争、gate 占用、retry amplification 等问题实施低风险优化；
- 每个保留优化完成 BASE vs HEAD 同机 A/B。

Phase 0 的完成状态是：

```text
CODE_READY = YES
MEASURED = YES
CAP-2C4G = NOT_STARTED
CAP-4C4G = NOT_STARTED
```

Phase 0 不回答“2C4G/4C4G 正式支持多少人”。

## 2. 现有资源分工

| 资源 | Phase 0 职责 | 正式 Capacity |
|---|---|---|
| GitHub-hosted Actions | deterministic tests、低负载 HTTP smoke、artifact、自动化 accounting | 否 |
| Mac self-hosted `eduk12-mac-ci` | backend/PG、profiling、受控 A/B；性能运行时不得并行普通 CI | 否 |
| Windows self-hosted `eduk12-win-ci` | frontend/browser/Docker；可作为与 target 物理隔离的 load generator | 否 |
| GitHub Codespaces | 手工 profiling、A/B、参数实验、exploratory stress | 否 |
| 后续独立 2C4G target | Phase 1 正式 CAP-2C4G | 是 |
| 后续独立 4C4G target | Phase 2 正式 CAP-4C4G | 是 |

任何 Phase 0 run 的 manifest 都必须保持 `qualifiedLoadGenerator=false` / `PERF_CAPACITY_QUALIFIED=0`，除非未来在正式 Capacity workflow 中满足整机和外置负载机要求。

## 3. 已完成起点

PR #165 已经完成 PERF-01 的 P1-C01～P1-C05：

- 14 条 FINAL route inventory；
- 16 个 fresh HTTP/policy-domain 基线样本；
- PostgreSQL SQL/model/phase/response-byte baseline；
- 29 个 Cognitive registry entries / 87 个 golden cases；
- SJT 10/30/60 + branching fixture；
- Scale typical/max-legal fixture；
- START / RESUME / protected media journey；
- lost-response + retry/replay accounting；
- shared-host capacity disqualification；
- Full Gate 通过。

因此 Phase 0 不重新造 measurement harness，而是在 `server-version/perf/current-main-v1/` 上继续。

## 4. 当前可用 workload

Fresh FINAL groups 已覆盖：

- Scale：`scaleTypicalSteady`、`scaleMaxLegalSteady`；
- Cognitive：nback/cpt 的 experience/standard/research（以 registry 实际支持 profile 为准），例如 `cognitiveNbackStandardSteady`；
- SJT：`sjtLinear10Steady`、`sjtLinear30Steady`、`sjtLinear60Steady`、branch full/early；
- authenticated/public questionnaire/composite 路由；
- relational / organization policy-domain samples；
- `mixedSteady`；
- journey：SJT START / RESUME / protected media。

每次 fresh run 必须重新生成足够的未完成 fixture。runner 会拒绝 pre-completed child、fixture exhaustion、first-attempt replay 和 durable accounting 不一致。

## 5. Phase 0 执行顺序

### P0-01 — Measurement preflight

状态：PERF-01 #165 已基本完成。

继续要求 route parity、fixture validator、report-run self tests、isolated PG、current-head artifact 和环境 manifest。

### P0-02 — Scale exploratory

测试 typical/max-legal Scale、standalone/questionnaire/composite、auth/public。关注 DB round trips、post-submit child/binding reread、reference work、privacy projection、UNIT/Aggregate 和 retry amplification。

### P0-03 — Cognitive exploratory

至少测试 nback standard、cpt standard 和可用的 research/heavy profile。关注 snapshot/config/runtime parse/hash、authoritative scorer CPU、allocation/RSS、frozen report DB/decrypt 和 UNIT gate。

### P0-04 — SJT exploratory

至少测试 linear 10/30/60、branching、standalone/embedded 和 protected media journey。关注 response validation index rebuild、UNIT 等待 Aggregate、wide reread、fresh encrypt->decrypt 和 post-submit binding reread。

### P0-05 — Mixed

单类画像完成后再 mixed。至少执行 mixedSteady、Cognitive-heavy、SJT media + START/RESUME/FINAL overlap。

### P0-06 — Burst / fault / recovery

覆盖 100/300/500 simultaneous（generator 不足时明确标 UNQUALIFIED）、same-idempotent/different-payload、parent restart、lost response、connection interruption、Aggregate busy 和 client retry/replay。

### P0-07 — First optimization round

只有运行证据或确定性结构证据支持时才修改业务热路径。优先原 PERF-02 的 request-local、易回滚优化；不得提前引入 worker farm、multi-API、Redis lock、PgBouncer、全局 runtime cache 或异步 FINAL。

### P0-08 — BASE vs HEAD A/B

每个保留优化必须同机、同 DB shape、同 fixture 分布执行 A->B / B->A / A->B，并输出 KEEP / REVERT / INCONCLUSIVE。

## 6. 负载分层

自动 CI smoke 不承担速度门槛。首个代表组使用 Scale typical、Cognitive nback standard、SJT linear 30，从 5 req/s × 5 s 开始，只验证小并发 fresh accounting、真实 PostgreSQL 和 harness。

Codespaces 或保留的 self-hosted 测试窗口再逐档提高 10 -> 25 -> 50 -> 75 -> 100...，接近拐点后按原计划延长窗口确认。连续两个明确过载点后停止。

每个 fresh runner 至少需要：

```text
steady fixtures >= offered rate * steady seconds + 1
```

fixture seeding、WAL 和磁盘成本必须与被测 steady window 分离。

## 7. Codespaces

仓库提供最小 `.devcontainer/devcontainer.json`，固定 Node 20、Docker-in-Docker、k6、2 CPU / 8 GB minimum host requirement 和 API/frontend ports。

Codespaces 只作为 `CS-2C` / `CS-4C` 等实际 machine type 的实验环境，不得命名为正式 CAP profile。适合 Node profiler、heap/allocation、ELU、SQL/Prisma inspection、k6 调试和 admission 参数实验。

## 8. GitHub Actions

`.github/workflows/perf-phase0-smoke.yml` 提供 GitHub-hosted 自动 smoke：

- disposable PostgreSQL + Redis；
- current-main fresh fixture；
-真实 backend + k6；
- Scale/Cognitive/SJT 三个代表 group；
- durable accounting；
- artifact。

它只 gate correctness/accounting，不添加不稳定的毫秒阈值。更高压力、mixed、burst 和 profiler 通过后续受控测试窗口执行，不占用普通 PR Full Gate。

## 9. Phase 0 退出条件

必须同时满足：

- Scale/Cognitive/SJT 都有单类并发画像；
- mixed 已执行；
- fault/recovery 已执行；
- 已知低风险热点已有 KEEP/REVERT/INCONCLUSIVE；
- 所有保留优化有 A/B；
- 无评分、hash、冻结、权限、幂等、归属或持久化回归；
- current candidate 达到 CODE_READY + MEASURED。

之后进入 Phase 1 CAP-2C4G；可暂停一段时间后进入 Phase 2 CAP-4C4G。只有两个正式 profile 都 VERIFIED 后，顶层状态才是 CAPACITY_VERIFIED。
