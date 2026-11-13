# Arrival-rate remediation from #720–#723 review (2026-11-13)

## Evidence and boundary

- [#723 150/200 VU ABBA](https://drive.google.com/file/d/1rw-LwabieeACczwiLxJECC5OHxwudAyz/view): 150/150 and 200/200 in all four A/B rounds; 200 VU candidate E2E p50 36.4–38.0s vs main 39.5–40.9s. 200 VU submit p50 regresses 5–9%.
- [#723 50 arrivals/s × 30s, observed to 120s](https://drive.google.com/file/d/1ebF7y2dnMTy793RIr2HnWJu0hreMD0-1/view): only 171/1,500 complete, 757 failed, 572 in flight at cutoff. In the recorded run API pool was 25, START admission 30, Whole Submit default 32; /available alone had 323 deadline/read failures.
- [#721 fixed-branch snapshot](https://drive.google.com/file/d/1ToKLGWPaaeQ1JkVnvdgOFGtxMultOF3Z/view): contains the 30s PUBLISHED+ARCHIVED shared template superset and live per-user filtering. Its EXEC-START-POST fresh memory projection was *not* included in the earlier Phase 3 comparison; this is an unverified gain, not a confirmed E2E uplift.
- [#722 Part 3 ABBA](https://drive.google.com/file/d/10kmVyFaQ5HkNyr9P6cCIWxe-1VP_BQCr/view): B used Worker 12 and other simultaneous optimizations. A vs B is not a Worker-only causal experiment.

## Changes in this PR

1. **Shared /available template superset, one cold query per process**: cache `PUBLISHED+ARCHIVED` template metadata (summary and detail separately) for 30s in the bounded process-local cache, and coalesce same-key cold misses with `singleFlight`. Reuse the revised #721 course filtering, not the defective #720 variant.
2. **Fresh per-student filtering on each request**: current active/approved membership, attempt history, archived-visibility rule, and cognitive history remain per-request. Never cache participant DTOs or credentials.
3. **Opt-out**: `COMPOSITE_AVAILABLE_CACHE_ENABLED=false` bypasses the shared template cache with no business logic branch change.
4. **One-instance capacity recipe in `.env.example`**: pool 40, START 20/100/5s, Whole Submit 12/100/5s, Worker 12 as *commented experiment overrides*, not production defaults. Verify aggregate connection budget across API+Worker instances, and note `DATABASE_URL connection_limit` wins over `PRISMA_CONNECTION_POOL_SIZE`.

This is a narrow first PR. It intentionally does not change START's transaction semantics, update strategy, report-status authorization, gate defaults or Worker defaults. The goal is to reduce catalog read amplification before evaluating more invasive optimizations. The shared template cache is eventually consistent for publication-list display for up to 30s; START still authoritatively checks current publication state.

## Evaluation of remaining proposals

| Proposal | Decision | Reason / acceptance evidence |
|---|---|---|
| #721 fresh-START post-gate in-memory projection | **Promising; separate gated implementation** | Can eliminate redundant post-gate reads, but changes when first-unit admission is persisted. Preserve trainingTiming, FLOW, variant, inline and resume fallbacks. Need DTO equivalence, 200 VU A/B, and zero duplicate/missing admissions. Earlier #721 Phase 3 did not test the final implementation. |
| #720 processScaleFreezeCache and compiledHash runtime cache | **Do not cherry-pick unchanged** | Cache compiled immutable artifacts only, keyed by full source/version identity; never reuse per-attempt encrypted ciphertext, and keep live admission/deployment verification. Benchmark freeze/compile CPU. |
| #720 per-user eligibility memo | **Reject as implemented** | Pre-transaction membership cannot authorize inside a concurrent transactional admission. |
| #721 30s ACTIVE scale deployment cache | **Reject as implemented** | Replacing current tx-authoritative deployment read with a TTL entry can admit a retired deployment; emergency-stop-only rechecks are not equivalent. |
| #722 report-status cache over #723 single joined query | **Algebra valid, zero-query hit not necessarily valid** | On misses Q=1, so Q=1-h on a hit-first design; however zero-query hits cannot recheck current owner, epoch or terminal state. Five-second PENDING cache can delay READY despite worker invalidation across processes. |
| #722 Worker 12 | **Experiment only** | Worker 12 B results are confounded by other PR #722 changes and the container's env override may dominate the code default. Count dedicated Worker pool connections before testing. |
| #720 in-gate preloadedParent for Whole START | **Separate from catalog fix** | Fresh-creation-only fast path; does not help /available overload and needs exact DTO verification. |
| #722 sealedWholeReceiptCache | **Separate retry optimization** | Good for genuine *already accepted* replay; zero benefit for first-time submits that account for most of the arrival test. |
| START gate 30 vs pool 25 | **Change experimental deployment values now, not global default** | A 25-connection pool oversubscribed by independent START/Submit gates causes contention, but increasing pool alone does not guarantee throughput. The proposed 25–30s gate wait grows queued in-flight requests during persistent overload; this PR documents a shorter 5s overload profile instead. |

## Minimal qualification

- Unit: existing `available-projection.test.ts` including summary, cognitive and Archived behavior, plus new shared-cache isolation and 20 concurrent first-hit tests.
- Normal TypeScript/backend CI on the PR HEAD. Do not skip CI.
- Quick deployment A/B: catalog GET timeouts, Prisma pool wait/busy, final success rate and START/Submit 503 on a 10/s or 20/s arrival run; then retry 50/s if resources permit.
- Never assume PostgreSQL `max_connections=100` equals 100 available for this API. Count the sum of every API, Worker, migration and admin connection pool on the actual hardware.

No production configuration is changed by this PR and no new throughput result is claimed.
