# PR356 dot-local pause checkpoint (2026-10-25)

This is a progress backup, not a qualified release. No CI, merge or deployment is requested.

## Identity and integration
- Repository: caohuibj/eduK12-new-version; existing PR356 remote branch: fix/runtime-time-and-validation-20261025.
- Dot local branch: work/dot-356-integrated-20261025; parent a3ee1f46c5c61e22545409034a5a90a8328da7ad.
- Prior remote checkpoint d0a05871d9d79672fd5fa882a23f99167bb5a87b has the same tree as that local parent: 0b0f951f2dc18991c62bde2f21696440d88e1292.
- Preserves original UTC grant-window / development entry fixes, frozen PR355 cf08b04 prerequisite, dot self-authored onboarding, version workflow 936fd14f and library management fa0e6b40 completed checkpoints.
- Includes local license-retirement work as a backup. The equivalent adapted patch has already been integrated into PR355 local 7d8329f4. After PR355 lands, reconcile that implementation instead of reapplying this backup blindly.

## This backup
Includes the tracked license-retirement edits and six isolated Training vertical test / storage helper / read-only probe files previously untracked. No credentials, private environment files, database dumps, runtime logs, dependencies or generated client are included. Test IDs in the read-only probe refer only to synthetic disposable records on the original dot host; they are not portable evidence that another database exists.

## Verification boundaries
- License-related focused pure/mock tests and types passed earlier against their recorded source; not full integrated CI or fresh final-tree browser/build qualification.
- Earlier Training vertical run saved an authoritative FINAL, replayed it, and reached parent COMPLETED through the normal authorized GET progression. Do not confuse the earlier pre-GET IN_PROGRESS observation with a proven product defect.
- V2 vertical run progressed through FINAL/replay/completion but failed a test expecting a compact facts row. Default storage was INLINE_ENCRYPTED and legitimately had zero such rows. This was not a demonstrated lost answer.
- A subsequent READ ONLY probe verified the saved V2 synthetic attempt: COMPLETED, INLINE_ENCRYPTED, four answers, one metric, one child, one snapshot, internal interpretation READY. The helper distinguishes canonical definition hash from legacy measurement hash. This read-only success is not a fresh full vertical suite pass.
- A prior teacher report returned UNAVAILABLE under its frozen policy, and outsider access returned 403. These are not evidence that all configured P/R report modes passed on V2.
- The latest full vertical driver has NOT been rerun successfully from a new empty schema after its fixture corrections. Its query observer has NOT produced a measured SQL baseline. Opt-in-skipped tests must not be called passed.
- Existing 11 Survey binding fixture tests passed against the integrated baseline after upstream fixture alignment, not as proof of real database ACL behavior.
- No benchmark in this checkpoint establishes production latency or concurrent capacity.

## Resume rules
Read AGENTS.md and docs/release/README.md. Preserve all current commits and local work. Do not reset/clean or operate another task, Mac or production. Confirm source, lock, generated Prisma client and runtime identity before testing. Never copy credentials into source or use owner credentials as the running application.

PR355 must be reconciled before qualifying PR356. Retain its latest decisions: optional bibliographic license reference rather than approval gate; explicit per-entry admission; official entry administrator distribution versus precise ordinary delegation; prohibition blocks new START, already-admitted attempts complete under frozen rules; credential/data ownership/withdrawal/consent/input integrity/idempotency remain. Do not restore legacy online/current issuer checks on already-admitted collections.

Do not import an entire old branch blindly. Existing standard-combination-source COLLECTION still checks ONLINE and excludes revoked state; adapt it to the final PR355 lifecycle. Existing precise-use migration requires authority_grant_id; adapt official entry-admin evidence versus ordinary delegated evidence without simply dropping identity invariants. Keep actual entry admission separate from global ONLINE.

## Scope after PR355
Latest user boundary: PR355 finishes started work and any unfinished prerequisite required for its changed existing functions to be safe and complete. Other unstarted new functionality/optimization belongs in PR356. Exact residual ownership must be read from the final PR355 scope record, not guessed from this checkpoint.

Preserve completed library classification/search/pagination and version workflow code; finish and validate remaining Training exact C/P/R consumers against final PR355 rules. Bibliographic reference/hash separation, unified cross-project scope authorization or other unfinished governance items are only taken over if PR355 explicitly hands them off. No new approval system or data access expansion by inference.

Core optimization plan:
1. Freeze a new matched Training/Survey baseline after PR355 integration. Separate ordinary FORM+SCALE, long scale questionnaires, mixed native SJT/cognitive/package workloads and optional save/recovery/replay branches. Report process-first and warmed samples separately.
2. Return already-authorized immediate participant feedback from the same calculated result only after successful commit, avoiding an unnecessary first report request and full FINAL decryption. Preserve delayed disclosure and replay authorization; no second score database or queue.
3. Reuse verified immutable facts/parsed definitions within the applicable request/transaction. Measure actual duplicate queries/parses/hashes, do not claim existing reuse as newly implemented. No cross-request authorization caching.
4. Move stable item/option indexes and execution preparation earlier only where profiled. Bound caches and temporary allocations; avoid a new scoring engine.
5. Conditional, nonblocking: reduce per-person rendered report prose using exact C/P/R and renderer version plus necessary normalized facts/band markers. One authoritative result, atomic bindings, readable old format. A SQL view alone cannot project inside an encrypted FINAL.
6. Conditional, nonblocking: measure skipping gzip for small control records; do not globally enable a new storage mode merely to exercise it.

## Evidence and acceptance
Preserve original failure logs and baselines outside Git as appropriate. Record exact SHA/tree and dirty diff identity, executed commands, PASS/FAIL/BLOCKED/NOTRUN, numeric results and measurement limits. Use matching workload before/after; no p95/capacity claims from a few samples. Distinguish query count, query duration, DB protocol bytes, database CPU, logical cipher bytes, physical pages and WAL. Unmeasured fields stay unmeasured.

Final correctness includes same answers/scores/bands and allowed feedback; duplicate requests do not double-write or rescore; failed transactions do not return success; delayed report, cross-user rejection, withdrawal, new-entry prohibition and admitted completion remain correct. Report/read/export use the same facts. Only affected evidence is invalidated; no endless full-CI retries.

CI activation requires independent parent review of the fixed candidate and applicable checklist, then explicit clearance. Backup commits use [skip ci] after inspecting actual triggers. No force push, new PR, merge, production deployment or data deletion is authorized by this handoff.

## Roadmap
- https://app.notion.com/p/403d27635a388157aa34c83821491347
- CI checklist: https://app.notion.com/p/404d27635a388186ac80de3593da05a5

Private original-host runtime prerequisites are intentionally not uploaded. A fresh executor must provision its own permitted isolated test setup and generated clients; local file paths or test database names are not transferable credentials.
