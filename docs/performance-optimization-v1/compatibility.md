# Compatibility corpus

Status: NOT_STARTED. P1-C03 will pin stable current-main inputs and expected decoded outcomes. The following contracts must be covered before any hot-path change:

- Same submission ID and payload is a replay; different payload conflicts; stale epoch cannot write.
- Scale/Cognitive/SJT/Form score, quality, reference, branch trajectory and decoded report semantics stay equal.
- Frozen Cognitive report data drives historical reports; current registry edits do not rewrite them.
- Parent/child binding, raw submission and UnitSnapshot stay unique and atomic.
- Current principal, organization/consent, result visibility, recovery token, CSRF and public privacy gates remain effective.
- SJT committed-child replay can resume parent finalization after interruption (the one intended recovery correction).

Golden inputs must use fixed clock/seed and compare decoded semantics and hashes, never randomized ciphertext bytes. Test IDs and credentials belong to isolated fixtures.
