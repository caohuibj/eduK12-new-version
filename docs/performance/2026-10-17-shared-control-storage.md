# Shared frozen control plans and compact report reads

This change follows the unique-primary-facts policy: raw answers remain one durable encrypted database business copy; scientific definitions and report branches are immutable shared versions; individual results are persisted once. COS preparation remains backup-only. No old business data is imported during optimization.

## Frozen scope

- Share immutable admission, slot and whole-validation plans. Persist common personal frozen context once per distinct parent/epoch/context, with authenticated small unit references.
- Preserve exact subject/respondent identity, policy differences, submission fingerprints, original ownership, epoch and worker lease checks. A caller still compares the reconstructed admission hash and parent binding.
- Authenticate versioned binary references with AES-GCM, full SHA-256 references, declared decoded length and bounded decompression. Legacy encrypted JSON and compact fields remain readable independently of new-write flags.
- Cache only immutable scientific content globally, with byte/entry bounds. Personal context reuse is invocation-local (32 records); transaction-local caches never prove that an aborted append committed.
- Shared Cognitive compiled runtime excludes the per-attempt freeze time. Per-attempt references retain that time. One compatible Cognitive result snapshot is compressed before encryption; its full report fields are preserved.
- Scale facts v2 omit reconstructable duplicated canonical binding/hash packages. Ordinary report reads omit unused item scores and canonical source restoration. Explicit full export/reanalysis reconstructs the exact complete view.
- Compose aggregate reports directly from committed facts. Mixed SCALE/COGNITIVE report manifests reference authoritative Cognitive result ciphertext by full digest, parent, epoch and session ID, instead of persisting another complete aggregate copy.
- READY report reads check current authorization/disclosure, read persisted facts and shared templates, and do not score, read COS or enqueue another report.

## Retention and compatibility

Shared rules and templates are fixed per immutable content version, not divided by people in the storage ledger. Personal frozen bindings are private, authenticated, immutable database rows and participate in the backup point. Inline legacy admission remains the fallback for standalone units or unusually large private context. Different frozen contexts legitimately retain distinct bindings.

Cognitive raw trials/submissions remain authoritative existing records. This change does not invent uncollected click histories and does not claim the SCALE raw-answer packet includes all background or Cognitive facts. The compatible Cognitive snapshot still contains its unique required display fields; it is not claimed to have reached a theoretical storage minimum.

Additive migrations 159 and 160 create the binding table/sequence and accept Cognitive artifact format 2. The unchanged Prisma schema after migration 160 reuses generated client 159. Runtime grants and durability settings require explicit verification before candidate activation.

## Rollback

Before any new-format write, the saved 75d0af3 overlay is a binary rollback. After new-format writes, retain the dual reader, new shared rows, encryption identity and migrations. Disable `ASSESSMENT_SHARED_CONTROL_ENABLED` to restore legacy writes and legacy report assembly while continuing to read the new records; do not mount reader 75d0af3 over records it cannot decode. Keep `ASSESSMENT_COMPACT_FACTS_ENABLED` enabled for this primary comparison. A new-read/write-off recovery check is required.

No migration drops old fields or deletes authoritative facts. New bindings reject updates and deletion while their owning parent remains. A verified backup must contain original facts, result facts, bindings, public templates and both shared runtime artifact versions from the same database point.

## Verification and measurement

Server-only isolated native PostgreSQL checks cover atomic receipt/idempotency, partial-task lease recovery, old/new exact results, swapped binding rejection, immutable records, aborted transactions and new-write-off reads. Scientific golden fixtures check every score, norm/quality and complete canonical result. Existing unchanged artifact-cache and resource-guard evidence is reused by matching inputs.

Measure the same final candidate with compact facts always on and shared-control writes off/on, three balanced pairs of 60 new SCALE questionnaires with five warmups per case. Record preparation, accepted submission through READY, and subsequent GET separately, using total API/report/PostgreSQL cgroup CPU, observer/idle costs, field bytes, WAL and physical packing as separate accounting classes. Add a small mixed questionnaire equality and cost sample. Common implementation improvements present in both modes are not attributed to the format flag.

Only after net benefit is shown, run focused target capacity acceptance with actual client receipts, four entrypoints and login, separately reporting normal delivery and recovery. Preserve persistent asynchronous receipt/retry independently of submission-priority scheduling. Compare bounded yielding on/off with balanced short cases before a single target peak; do not restore the fixed 500 ms claim interval.

Experimental server evidence is not formal CI qualification. No frontend rebuild, old-data import, formal-image change or merge is included. GitHub may receive the reviewable branch only after debugging, under the user's authorization.

## Profile-driven correction before capacity acceptance

The first three same-version pairs (d99b451) measured 55.1 to 38.6 KB/person but a median +4.1% lifecycle CPU, so capacity acceptance was held. A 20-second API/report CPU sample located repeated scientific definition validation and artifact serialization at attempt creation. The correction reuses an immutable validated definition keyed by the full actual database JSON, and reuses prepared/scientific hash inputs only when deeply frozen. Database JSON is the boundary contract for this helper; ordinary untrusted definition validation remains unchanged. Weak aliases refer to bounded cache keys and cannot retain evicted compiled entries. Current access, operational pause, policy/age checks, exact live reference bindings and attempt-specific hashes still execute.

Two real mixed-questionnaire reports produced exactly identical participant, teacher and researcher views from the old/new builders. Repeated READY reads left the persistent job ciphertext and updated time unchanged. Initial diagnostic Docker copy failures concerned the running tmpfs only; internal file reads recovered the completed proof and are not server-performance improvements.

## Complete-package comparison boundary

The first cost toggle left the newly added frozen JSON memoization enabled in both groups. That measured only the incremental reference/storage path, not the full CPU effect of this change. Revision 2 makes the same existing write-off switch also select the exact prior strict JSON encoder (source fe20fa7). Enabled production behavior is unchanged from revision 1. This is a correction of feature rollback/comparison coverage, not a new production speedup; do not count it twice. Both paths retain identical strict JSON bytes/errors, and the old unchanged scientific compile caches stay enabled.

## Request-scoped mixed-path correction

The final package cost sample reduced eight-scale fields to approximately 38.6 KB and median lifecycle CPU by 3.8%, but a 20-person mixed sample initially used +7.9% API-dominated CPU. The read views remained exactly equal and Cognitive shared artifacts were confirmed 20 references to one actual version. A separate mixed API profile exposed repeated Prisma responses and frozen-binding verification. Assessment routers now reuse a deeply immutable private binding only within one HTTP request, including asynchronous continuations; a native concurrent-request check proves one read per request and no cross-request personal cache. Current authentication, ownership, epoch and lease checks still run. The prior 300-person OFF pressure case is screening evidence only; final scheduling comparisons use the final candidate.

## Final candidate acceptance (2026-10-17)

Runtime application input is `ae02552c23444c6de750baba410fb941c662ce61`. Final request-context native checks pass 7/7, portable Cognitive storage fixtures pass 3/3, and affected semantic compilation passes. Pure-scale and mixed reports retain exactly equal participant, teacher and researcher views; repeated READY reads do not change the job ciphertext or timestamp. Two persisted answer packets survive a restart of all five processes and original-submission-ID retries without rewriting completed data. Experimental server evidence remains **not formal CI qualification**.

Same-final-candidate pure confirmation (60 fresh attempts per side): retained fields 55,150.9 -> 38,510.37 bytes/person (-30.17%); lifecycle API/report/PG batch CPU 0.36802475 -> 0.36634760 seconds/person (approximately flat); WAL 440,654.5 -> 230,535.2 bytes/person, checkpoint/background-sensitive. Creation CPU falls 4.8%, while submission/score/READY pipeline CPU rises 8.1% and report-read CPU rises 4.2% in that pair. Do not claim a proven broad report-CPU speedup. Prior three-pair package evidence on the preceding request-context version had median -3.8% CPU and is labelled as prior evidence, not three current-candidate repetitions.

Three current mixed pairs (20 fresh attempts/side) retain approximately 74.5 -> 25.1 KB/person (-66.35%). CPU ON/OFF ratios are 1.0349, 0.9738 and 0.9714, median -2.62%, with one regression. One shared Cognitive artifact actually serves 20 identical configurations; zero duplicate CognitiveTrial rows were added in this new raw-submission path.

The 38.51 KB scale ledger contains: relationship IDs/full digests/state/times 13.174 KB, background facts/frozen display 1.420 KB, immutable/private control references 5.789 KB, answer/result references 1.248 KB, report manifest 1.735 KB, unique whole-answer/timing packet 3.775 KB, and compact score facts 11.370 KB. Shared definitions/templates are separate fixed version costs. The conditional 29-34 KB budget has not been reached; this is not claimed to be a theoretical minimum. Existing independent-unit entrypoints and indexed ownership bindings still justify retained small relationship records.

Reuse the unchanged-format isolated physical packing proof: empty fixed allocation 933,888 bytes per mode; incremental packed heap/TOAST/index approximately 86,016 -> 65,399 bytes/person for 60 attributable attempts. Dead/free space and index allocation stay separate; global database size and WAL are never divided into retained personal storage. Ten thousand similar questionnaires imply approximately 0.385 GB personal fields or 0.654 GB packed table/index growth, plus fixed versions, update/free-space headroom, WAL and backup/recovery space. Existing production files do not instantly shrink.

### Scheduling decision

Persistent asynchronous durability is always retained. Three balanced short-burst ON/OFF pairs (300 fresh attempts/side, OFF/ON, ON/OFF, OFF/ON) all deliver normally. Median ON/OFF ratios: ACK P95 0.782, complete feedback P95 1.009, all READY 0.915, queue area 0.852, batch CPU 0.963. The third pair regresses feedback/CPU/queue area, and aggregate CPU across all three pairs is slightly higher with ON; median improvements alone do not prove universal net benefit.

One efficient exploratory continuous pair (600 fresh attempts/side, planned 30/s for 20 seconds, same final candidate and resources) gives ON/OFF ACK P95 1.158, all READY 1.193, queue area 1.656 and batch CPU 1.047. Both modes deliver 600/600, ordinary probes 160/160 and real logins 14/14; ON improves feedback P95 and login latency in this small pair, but delays aggregate completion and increases backlog. One continuous pair is not a multi-pair sustained-load statistical claim.

**This candidate's deployment explicitly sets `ASSESSMENT_REPORT_SUBMISSION_PRIORITY_ENABLED=false`.** Keep durable saves, async jobs, wait/recovery UI, resource guards and worker limits. Retain the optional scheduler code for rollback or a separately justified use case; do not reintroduce a fixed 500 ms claim delay. The earlier short-only recommendation is superseded by this continuous counterfactual. Formal deployment must carry the same explicit OFF environment configuration; source support for the optional switch remains.

### One target acceptance and operating limits

At 5 whole submissions/s for 120 seconds, all 600 receipts and reports complete normally, with 960/960 ordinary entry probes and 84/84 real logins. Queue peak is 1; commit-to-report-start P95 is 58.7 ms and commit-to-READY P95 155.3 ms. Client ACK P95 is 1.05 s and feedback P95 2.12 s under the unchanged Mac VPN. This is the tested green reference, not an absolute maximum online-user count.

The one target dual-source plan is external 20/s for 60 seconds plus Mac 10x200 submissions. Server audit: 3200/3200 durably accepted and READY, no failed/held/pending jobs afterward. Normal client receipts are 3182 (3097 direct +85 normal receipt-query recoveries), normal complete reports 3179; another 21 recover correctly by post-pressure read-only GET and are **not normal delivery successes**. Original-ID special POST recovery targets 0. Ordinary probes are 477/480 (3 timeouts), real logins 42/42. This target fails the 100%-normal-delivery/ordinary-availability acceptance criterion despite intact saved data.

Actual Node body-complete counts in 60 seconds are external 950/1200 and Mac 1999/2000; last external body is 82.43 seconds. Mac planned-burst first-second complete bodies range 70-133, not 200. The test uses 300 synthetic accounts with fresh distinct attempts, warmed HTTP/2 lanes and pre-delivered answers; it does not qualify 3200 independent cold browsers or page assets. Normal statuses honor feedbackWaitMs/Retry-After and bounded frontend polling; no POST storm was used.

Queue peak 1589; all READY at 120.58 seconds; maximum commit-to-READY wait 54.60 seconds; approximately 26.51 READY/s over the observed backlogged interval. Last normal client feedback is 197.43 seconds. Green 5/s and the fully delivered 300-record short bursts/roughly 200 queued jobs are conservative references. Do not market the target as a safe 3200-user capacity. No deliberate crash/loss threshold was sought.

Paired request stages separately measure source-start-to-Node P95 about 20 seconds, Node-callback-to-durable-commit P95 248 ms, and commit-to-direct-ACK P95 about 18 seconds. These involve source, network/VPN, gateway and response competition; do not subtract percentiles or call them pure network latency. Peak-window mean host use is 3.61 of 4 cores, NIC TX approximately 5.57 Mbps, I/O wait about 0.72%, and no lock blockers. Preserve network conditions for this evidence. Increasing database RAM alone is not supported as a fix for tens-of-seconds client feedback.

### Resource, backup and publication boundary

Quotas, pools, process counts and base images are unchanged. There is no hard 0.5-CPU/500-MiB reservation: existing start admission, memory thresholds, lower report CPU shares, worker pause/recovery and disk floor are soft protections. No +256-MiB PG experiment was mixed into this change. Actual tests show no application/PG OOM; this is not a proof against every overload. Frontend source is identical to the already mounted candidate and all 393 artifact hashes match; it was not rebuilt.

COS is backup preparation only: no bucket creation or cloud writes. The prepared inventory includes bindings, public templates and both runtime artifact formats in one consistent encrypted database point. Original data import remains deferred. Existing failed backup/maintenance/replica units predate this final candidate; timer restoration is not proof of backup success. A fresh usable backup point and applicable formal CI remain prerequisites before reopening production, without fabricating a formal release stamp.

New-format records require the dual reader, retained migrations/shared rows/private bindings and encryption identity. Disable SHARED_CONTROL writes/assembly for rollback while retaining reads; do not mount incompatible 75d0af3 over new records or delete authoritative facts/WAL. The server candidate stays reviewable, not merged and not a formal-image release. GitHub receives the source review branch after debugging under the user's authorization.
