# Teacher variant report job projection

Work started on actual main `555f705dd272f0ee9c7ac0d80770010d2d6e9675`.
During verification A merged PR435 and main advanced to
`093d86e842da12d443301fd4a37d5d046ecb9185`. Those changes do not alter either
source/test file in this candidate. This source retains its fixed original base;
the old full-backend type result is not relabeled as an integrated-main result.

## Bounded problem and change

`getTrainingVariantReportsForTeacher` loads one authorized page of at most100
completed attempts, then reads every column of their report jobs. A generated
whole-questionnaire report retains its original encrypted answers and delivery
manifest in that job. The teacher batch reader does not consume either field.
Its materialization/binding path uses only attemptId, attemptEpoch, status,
slotSetHash, contextHash, aggregateInputHash and reportEncrypted.
The existing production caller is `questionnaire-product/service.ts:exportReports`
for a definition with frozen variant metadata.

The product change adds exactly that seven-column select to the existing one
Prisma findMany. The original WHERE, parent/epoch map, owner/relational checks,
frozen variant validation, report binding/decryption, page bound/cursor and
per-audience projection remain. No cache, index, worker scheduling change,
retention change, credential, feature flag or new validation platform.

The worker claim path was examined first and left unchanged: its answer envelope
is actually consumed directly by the processor. No fictitious duplicate body
read or speculative idle-poll fix is included. This slice improves the report
batch reader, not the report scheduler.

Product/test files have zero intersection with the fetched full changed-file
lists for435/436/444/445/447/448/449. `ownership.json` preserves source heads,
file lists and intersections; it does not promise future ownership cannot drift.
A/motherDOT retains integration, CI registration and merge order.

## Actual measurements

The real service function was called in two synthetic Vitest cases. Prisma and
source rows are mocked there, while actual owner, frozen-variant and cached
report binding/projection code runs. The test records the actual baseline and
candidate findMany arguments and resulting reports. Its mock honors `select`
rather than returning an unchanged wide fixture for both versions.

Those recorded arguments were replayed with actual Prisma against a new
PostgreSQL16.15 database with all271 current migrations. Two explicitly synthetic
READY job rows use the real encrypted report strings from the service fixture
and separately encrypted illustrative12/218-response-code bodies/manifests.
They are persistence/query fixtures, not genuine participant FINAL receipts or
scientific validation. No START/FINAL/scoring/lifecycle suite is rerun.

| Actual query result | Baseline | Candidate |
|---|---:|---:|
| Rows | 2 | 2 |
| Fields per row | 25 | 7 |
| Returned result encoded as JSON, bytes | 114035 | 4719 |
| Queries per report-job batch | 1 | 1 |

This fixture removes109316 returned JSON bytes (95.86%). This is the Prisma
result serialized for comparison, not PostgreSQL wire/TLS bytes, HTTP response
bytes, saved database storage or an observed production payload distribution.
The two answer ciphertexts total15652bytes and validation ciphertexts92444bytes;
their persisted sums are identical after the reads. Nothing is deleted.

Required selected field values have identical SHA256
`0eb9585aa976be1371f9d966ad2497048c34357136c94101ccaa55885ce83287`
across baseline/candidate/candidate/baseline interleaving. The real service's
public report result also compares exactly equal across versions. First query
wall12.18ms includes startup effects; subsequent observations were2.91/2.29/2.79ms.
No stable latency, CPU, p95 or concurrency improvement is inferred from those
few calls. Per-call CPU/wall originals remain visible rather than discarded.

The disposable PG container had1CPU/512MiB, shared_buffers64MiB, and pool1;
Node ran on the shared cloud host. This is not a4C4G capacity qualification.
The query replay used the owner inside that disposable database. It is not
proof of full runtime-role provisioning, which is separately tracked in PR448,
nor HTTP authorization or a real teacher batch journey. Its container was
stopped and tmpfs discarded; production and saved development DBs were untouched.

## Verification and failures retained

- Preparation R1:1PASS/1FAIL/25filtered. Synthetic cached report omitted the
  selected form items; the unchanged real variant scope guard correctly refused
  it. This was a fixture error, not the product counterexample.
- Corrected baseline R2: only the failed report-read case ran,0PASS/1FAIL/
  26filtered. The actual page reports were produced; the missing seven-column
  projection assertion failed. Original service query arguments were captured.
- Candidate:2PASS/0FAIL/25filtered. Selected-group report outputs remain exact;
  wrong owner refuses before the job query, and slot-hash drift refuses before
  report publication. Both cases directly consume the changed projection.
- One existing direct consumer ran separately:1PASS/26filtered. It preserves
  selected typed snapshots, zero/nonzero values and single-batch reads for the
  synchronous report branch. Exact raw reporter/log are embedded in binding.json.
- Backend `tsc --noEmit`: exit0 in36.99s, with source/config/schema/package/lock
  hashes unchanged before/after. No frontend changes or frontend checks.
- Actual PostgreSQL setup/query replay/cleanup all exit0; the migration is setup
  for this new disposable measurement, not a replay of a prior lifecycle.

Only2distinct new cases plus1existing direct consumer are claimed; counts from
repeated phases are not added to inflate coverage. The24other tests were not
executed. The small
source change does not justify the old full report/answer/authentication matrix.
No officialCI, Ready, merge, production-image build/scan, deployment or production
access was performed. A coordinates any qualification of the eventual candidate.

Environment: Node24.21.0/Prisma5.22.0, copied saved backend dependencies. The
installed follow-redirects1.16.1 differs from current lock1.16.2. No fresh-lock
installation/audit or complete installed-byte provenance is claimed. The source
association in `binding.json` is retrospective and unsigned. Raw reporters,
fixture error, failed assertion, actual query arguments, type output and PG
measurements are losslessly compressed under `evidence/` with decoded hashes.

Final integrated access/performance comparison remains separate. Reuse this
slice if the query, field consumers and fixtures remain unchanged; production
configuration/metadata belongs to C. No wholeO12/O13 completion checkmark is
implied by this bounded report-read improvement.
