# Compact assessment facts candidate — 2026-10-16

Scope: database retains one compact original and one immutable result authority per assessment/epoch. Shared definitions and public report fragments are keyed by full immutable content digests. COS is backup only; no runtime COS dependency or archival queue. No historical business import/backfill in this iteration.

The additive migration introduces assessment_public_templates and assessment_result_facts. Standalone originals live on the immutable fact row; whole originals remain on the durable receipt once, protected by a deferred foreign key and source-column immutability trigger. Current assessment fields and canonical/normal report payloads become small references. Reconstructed full results are integrity-checked against the original scorer digest; original response types, collected timings/change counts and presence are preserved. No regrading on report GET.

New writes are opt-in via ASSESSMENT_COMPACT_FACTS_ENABLED=true. Readers always support old and new formats. AES-256-GCM authenticates format, codec, key identity, declared plaintext size and digest; decompression is bounded at 8 MiB, public fragments at 2 MiB. Missing/corrupt source fails closed and leaves durable answers available for recovery.

Validation so far: 34 focused codec/facts/template equivalence cases, 4 native isolated-PostgreSQL cases (atomic original/result, replay, lost lease, old epoch, failed transaction, whole receipt cleanup guard, ordinary reads without raw queries, Questionnaire collection), 60 affected legacy cases and scoped backend semantic pass. Source/code evidence is server-local phase11. Sample representation sizes are preliminary; full lifecycle storage/WAL/CPU measurements remain required before performance claims.

Rollback: first disable ASSESSMENT_COMPACT_FACTS_ENABLED on all five processes and keep this dual-format reader plus additive tables and encryption key. Do not mount an older reader that does not understand ekc1/SFF1/SCF2 after new data has been written. Historical data is not rewritten or deleted. A future older-binary rollback would require an explicit, separately verified materialization step; feature rollback uses the compatible reader.

No frontend build, quota/pool/process count change, official image switch, merge or GitHub push is included in this candidate preparation. Existing source build/cache and previous unaffected scientific evidence are reused; this is not a formal CI qualification claim.
