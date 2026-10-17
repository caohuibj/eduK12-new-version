# Survey efficiency acceptance — 2026-10-17

## Scope and source identities
Cloud-only, synthetic accounts/fixtures, PostgreSQL 17 and Redis 8, UTC, restricted API database role. No CI, PR, deployment or production use. Real browser/device timing remains deferred by the user.

Two distinct comparisons:
1. Existing Form + Scale + SJT-v1: original `bbc7057e2b2bf6d0279fba7517753b72e78eefeb` versus final efficiency candidate. The reused baseline compiled artifact is source-equivalent: e857ce5→bbc7057 changes only documentation; five compiled hotspot and six source hashes were checked (`baseline-reuse.json`). Final ABBA uses the exact same immutable ordinary publication, answers, and fixed two-FINAL analytics cohort.
2. New SJT-v2/cognitive paths: completed extension `ed48a2955ec7da970863e0fae318a909f3464e81` versus final efficiency candidate, equivalent bounded synthetic fixtures in separate sequential runs. There is no claim that the pre-extension baseline supported cognitive tasks.

Final candidate source is bound by `build-source-hashes.json`; commit/tree binding is supplied separately. `before/` is ed48 plus its old-path ABBA; `final/` is accepted candidate plus its old-path ABBA. `after/` is explicitly superseded by the ordinary-working-set refinement, not selected for favorable numbers. The initially incomplete pagination probe is preserved as `harness-invalid-pagination/`, never counted as passing.

## Changes
- Public/linked disclosure reads project only frozen measurementNotice, rather than transferring the complete private compiled snapshot; current visibility filters remain.
- Cognitive task reuses its already verified locator, but unchanged lock-time current credential/consent/window/withdrawal checks still execute.
- Latest/restart/view paths reuse narrow receipt metadata; parent references and preceding cognitive slots use bounded metadata batches. No raw/result ciphertext is read merely to construct receipts.
- Cognitive metrics analytics loads at most eight exact parent groups sequentially (four refs each), with 256 KiB/child, 1 MiB/parent and 8 MiB active chunk preflight. Ordinary-only publications retain one live decrypted parent. Raw exports keep the existing single-parent path. Final source/ownership/revision/signature fences remain.
- Request-local frozen projection/metric indexes and trial pseudonym reuse avoid repeated parse/hash work; SJT indexes preserve duplicate-channel ambiguity rejection.
- Cognitive ordinary-prefix validation does not call scorers. All original choice/trajectory/completeness checks remain; only parent FINAL creates authoritative ordinary scores. The helper exposes only normalized answers/missingness.

## Bounded observations
SQL counts below are observed Prisma SQL events, including transaction control. ORM bytes mean JSON-serialized returned objects, not PostgreSQL wire bytes. CPU/RSS include instrumentation and a 2 ms sampler. Four ordinary observations per variant and one new chain/cohort are insufficient for latency, capacity, stable memory, or broad no-regression claims. All observations are retained. Final before/final comparison has no identified startup DELETE contamination; superseded after has one /info sample containing two startup DELETE events and remains preserved without filtering.

### Old paths: bbc7057 → final candidate
| Stage | SQL events | Returned JSON bytes | HTTP response bytes |
|---|---:|---:|---:|
| info | 4 → 4 | 514 → 539 | 533 → 533 |
| task | 8 → 8 | 14438 → 14438 | 2021 → 2095 |
| FINAL | 22 → 22 | 28974 → 28974 | 467 → 467 |
| replay | 18 → 18 | 29086 → 29086 | 262 → 262 |
| General | 9 → 9 | 14634 → 14634 | 251 → 251 |
| two-parent analytics | 28 → 28 | 59149 → 59149 | 5610 → 5610 |

The 25-byte info object increase is the projected nullable notice field; no full definition is transferred. Task response adds 74 bytes of extension metadata. Ordinary stored result units and fixed-cohort analytics are equal; task byte identity is not claimed. Analytics CPU medians 30.926→28.475 ms and process RSS peaks 344.035→342.324 MiB are observations only. Other endpoints include mixed CPU directions (task 9.509→10.122 ms; General 6.736→7.082 ms). All endpoint CPU/RSS/bytes/counts are in summary.json.

### New paths: ed48a295 → final candidate
- One-cognitive task: SQL 27→19, returned JSON 23723→15811 bytes; response unchanged at 756 bytes.
- Four-child parent FINAL: SQL 33→27; returned JSON 328848→63593, returned ciphertext 272944→11768 bytes. Response 467 bytes unchanged. Hash checks remain 55.
- Four-parent metrics analytics: SQL 48→33, hash calls 99→60. Ciphertext bytes remain 51216; narrow exact-scope metadata adds 814 returned JSON bytes (83659→84473), an explicit bounded tradeoff. HTTP response stays 6372 bytes.
- One-parent vs four-parent metrics source reads now both use 33 SQL events within the eight-parent chunk. The nine-parent unit contract verifies 8+1 batches and two fetches, preserving per-parent/active limits and failing corruption/revision drift.
- 120-trial export creation: canonicalHash calls 163→27, SQL remains41; authoritative result/raw verification is retained. Four-slot480-trial export takes three bounded pages; each final page uses81 hash calls, versus204/350/360 before. All480 unique trial identities and each child’s0–119 sequence checked.
- Every measured read/replay/export scorer count is zero; every fresh child FINAL invokes the authoritative cognitive scorer once. Prefix kernel spies separately verify zero scoring while rejecting invalid choices and preserving refusal.

These are structural work reductions. CPU is not uniformly lower: one120-trial export observed48.249→53.943ms; four-parent analytics38.182→40.478ms. No latency speedup claim is made.

## Verification and artifact lineage
91 unique scoped tests passed:27 newly added efficiency regressions and64 existing affected tests. Groups:23 final/SJT contracts,26 measurement/export contracts,40 cognitive contracts/real PG (including14 PG cases),2 linked visibility PG. The26-test group was rerun after the ordinary batch1 refinement and is not double-counted.

Both accepted before and final probes pass19 assertions and100 labeled HTTP requests each, including consent equality, exact old result/analytics equality, wrong credential, forged reference, changed submission ID, nonowner export, withdrawal replay/read denial, revoked ticket, audit retention, no rescore, and signed pagination. These200 requests are not unit-test counts and synthetic120-trial scoring is not browser timing validation.

Two efficiency candidate compiles:30.366s first candidate, then28.884s final candidate after narrowing ordinary working set. Earlier candidate is retained as superseded. No frontend changes/build or full-product suites were needed. All owned service harnesses report stopped.

Remaining limitations from the extension are unchanged: real browser rendering/input/timing deferred; no automatic abandoned local draft TTL purge; server retention review does not silently hard-delete data; lost final restart admission without sealed FINAL fails closed. No further optimization is inferred from the bounded samples.
