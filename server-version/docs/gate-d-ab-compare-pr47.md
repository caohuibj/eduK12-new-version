# Gate-D 压力测试结果｜PR #47 vs `main`

**状态**：已推到 PR 分支 · **尚未 merge**（overload / burst hardening；生产默认调参前仍待 open-loop eventual-success gate）  
**写入**：2026-09-03 03:07 PT（跑数）· 文档整理稍后补强  
**架构师意见（历史）**：burst insurance 达标可继续推进；成功写库口径 steady 50/75 与 real-client jitter 仍为可选后续，**不视为已批准用本表直接合入生产默认调参**。

---

## 1. 对照双方

| 侧 | Git | 说明 |
|---|---|---|
| **A（基线）** | `803ac87` (`origin/main`，Merge PR #46) | 无 UNIT submit admission |
| **B（候选）** | `1b6df8b` (`perf/v32-capacity-reconciliation-hardening` / [PR #47](https://github.com/caohuibj/eduK12-new-version/pull/47)) | BoundedAdmissionGate + UNIT/Aggregate admission + reconcile-once 等 |

## 2. 测试信封

| 项 | 值 |
|---|---|
| 计划 | `server-version/docs/gate-d-capacity-plan.md` |
| k6 | v0.54.0 · `EXPECTED_STATUSES=200,409,503` |
| DB / Redis | 隔离 `eduk12-gate47-pg` / `eduk12-gate47-redis`（未动 shared `ptool-*`；未 `compose down -v`） |
| Prisma pool | **10**（默认未改） |
| Workers | `BACKGROUND_WORKERS_ENABLED=false` |
| 端口 | A `:3301` · B `:3300`（跑 A 时停 B） |
| 夹具 | scale **800** / formSection **200** / cognitive **150** / mixed **650**（A 新鲜 · B 重种） |
| 公平口径 | **A 新鲜夹具 vs B 重种夹具** |
| UNIT admission（B） | permits **8** / queue **16** / wait **500 ms** → `ASSESSMENT_SUBMIT_BUSY` |

---

## 3. 主表：A 新鲜 vs B 重种

| Scenario | Side | 请求数 | RPS | p95 | med | `final_submit_busy` (503) | checks |
|---|---|---:|---:|---:|---:|---:|---|
| Single-concurrency（1 VU · 30s · scale） | **A main** | 4092 | 136.4 | 11.97 ms | 6.10 ms | **0** | 100% |
| Single-concurrency（1 VU · 30s · scale） | **B reseed** | 3966 | 132.2 | 12.23 ms | 6.32 ms | **0** | 100% |
| Independent capacity（MAX_VUS=75 · scale） | **A main** | 41536 | 415.4 | 194.85 ms | 73.62 ms | **0** | 100% |
| Independent capacity（MAX_VUS=75 · scale） | **B reseed** | 54669 | 546.7 | 215.26 ms | 55.91 ms | **29367** | 100% |
| Classroom burst（BURST_PEAK=250 · mixed） | **A main** | 8030 | 422.6 | **872.82 ms** | 372.94 ms | **0** | 100% |
| Classroom burst（BURST_PEAK=250 · mixed） | **B reseed** | 18301 | 962.9 | **214.36 ms** | 126.34 ms | **17080** | 100% |
| Mixed load（50 VU · 30s · mixed） | **A main** | 13507 | 449.3 | 254.57 ms | 83.92 ms | **0** | 100% |
| Mixed load（50 VU · 30s · mixed） | **B reseed** | 26340 | 875.9 | 249.62 ms | 29.29 ms | **23008** | 100% |

### 读表要点

1. **低载（1 VU）**：B ≈ A，busy=0 → 门禁在稳态几乎零负担。  
2. **课堂突发**：B 的 p95 **872 → 214 ms**（约 **4×**）；高压以可控 503 快拒为主，跑后 gate 归零。  
3. **高 VU / Mixed「更高 RPS」不能当成功写库吞吐**：B 大量是 `ASSESSMENT_SUBMIT_BUSY` 快拒；A 的 RPS 更接近「被接受的工作量」。  
4. 本轮 **未单独钉死** open-loop「仅 50 / 仅 75 rps」；independent-capacity 会经过 target 100 再落到 MAX_VUS=75。

---

## 4. Busy / Admission 归因

| Metric | A main | B reseed（本轮增量） |
|---|---|---|
| `ptool_bounded_admission_rejections_total{gate="unit_submit",reason="queue_full"}` | **无此系列** | **+70587** |
| `ptool_bounded_admission_rejections_total{gate="unit_submit",reason="timeout"}` | **无此系列** | **+168** |
| k6 `final_submit_busy`（capacity+burst+mixed 合计） | **0** | 29367+17080+23008 = **69455** |
| `COMPLETION_BUSY` / aggregate 拒绝 | ≈0 | ≈0 |

几乎全部 intentional 503 来自 **UNIT** `ASSESSMENT_SUBMIT_BUSY`。本轮夹具以 FINAL submit 波为主，Aggregate 门禁几乎未触发属预期。

---

## 5. B 原始夹具跑（参考）

| Scenario | 请求数 | RPS | p95 | med | 503busy | checks |
|---|---:|---:|---:|---:|---:|---|
| Single-concurrency | 4054 | 135.1 | 11.99 ms | 6.17 ms | 0 | 100% |
| Independent capacity | 57833 | 578.3 | 197.68 ms | 55.14 ms | 31404 | 100% |
| Classroom burst | 18061 | 950.3 | 218.41 ms | 118.8 ms | 16997 | 100% |
| Mixed load | 26282 | 874.1 | 252.61 ms | 30.58 ms | 22971 | 100% |

---

## 6. 正确性侧（本轮跑数时）

| 检查 | 结果 |
|---|---|
| `tsc --noEmit` | 过 |
| Backend 相关单测 | 过 |
| Frontend FinalDraft capacity retry + completionRetry | 7 过 |

---

## 7. 架构解读

| 目标 | 是否达到 |
|---|---|
| Burst insurance（突发延迟 / 快拒溢出） | **是** — classroom burst p95 大幅下降 |
| 稳态低载无回退 | **是** — 1 VU busy=0 |
| 用「含 503 的总 RPS」证明容量提升 | **否，也不该** |
| 成功写库口径 steady 50/75 | **本轮未钉** — 可选后续 |
| Real-client FinalDraft jitter 突发 | **本轮未跑** — 可选后续 |

**结论：本轮 Gate-D 证明的是 overload protection / fast-fail（突发延迟下降 + 可控 503），不是 `479c504` 头上的 successful-finalization 吞吐提升。**  
PR #47 应继续作为 **overload / burst hardening** 推进；在补上 open-loop eventual-success gate 之前，**不要把本表当成生产默认调参 / 合入依据的完整验证**。

---

## 8. 相关路径

- 本文件：`server-version/docs/gate-d-ab-compare-pr47.md`
- 计划：`server-version/docs/gate-d-capacity-plan.md`
- 脚本：`server-version/perf/`
- 跑机产物：`/tmp/eduk12-gate47-test-results/`（未入库）

---

## 9. Post-review fix notes / scope of the tables

Historical A/B measured code SHA **`1b6df8b`**. The capacity tables above remain valid as a record of that run and prove **overload protection / fast-fail**, **not** a successful-finalization throughput improvement for current head **`479c504`** (or later).

Subsequent commits on this PR branch (UNIT-scope permit release, capacity-retry floor/backoff wording, docs, additive `bundleBridgeHash` provenance, etc.) mean these capacity tables are **not** a full validation of the current head. Do **not** destroy or rewrite the architect tables in §§3–7; treat them as historical evidence for `1b6df8b`.

Follow-up fixes after review (same PR, not yet Gate-D / open-loop re-run):

- Frontend: narrow `api.submitFinal` outside the capacity-retry closure (`useCognitiveSession`).
- Frontend capacity retry: treat `Retry-After` as a **minimum floor**, apply **floor-preserving jittered exponential backoff**, safety-cap at 30s (no longer concentrates all retries near 1s when Retry-After=1). Algorithm unchanged; comments/docs only renamed away from misleading "full jitter".
- Backend: UNIT admission wraps only unit persist/score; parent aggregate finalization runs **after** the UNIT permit is released (Scale / Cognitive / Form). Aggregate keeps its own `withAggregateFinalizationAdmission`.
- Backend regression: Scale Bundle bridge `canonicalHash(ScaleResultV2)` failed when optional `itemScores[].answeredAt` was `undefined`; scoring now omits undefined optionals.
- Backend provenance: when `bundleBridge` is present, envelopes also carry additive `bundleBridgeHash` (core `resultHash` unchanged).
