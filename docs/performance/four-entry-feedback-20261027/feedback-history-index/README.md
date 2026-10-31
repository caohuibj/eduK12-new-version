# Feedback original-evidence index for root review

Comparison baseline: `85e9ee0c66ada6a2b0550b9e11f3e31b96ab62ce`, tree `a2ba0fb7bd278165a4adbd44013f2a72f526285f`. This index is added on the feedback branch after `b48dc7462`; the integration branch and business files are not changed or merged here. No tests, PG, builds or CI were run. Reading Git objects, parsing original reports and hashing/decompressing recorded artifacts are inventory operations, not new execution evidence or qualification.

[originals.json](originals.json) contains original commands/check metadata, all known exits, report/log paths with SHA256/Git blob IDs, **28 feedback test invocations and 494 case rows**. Rows retain original names, file, pass/fail/pending statuses and failure messages. These include repeated and filtered/skipped cases; 494 is not a unique-pass count. Non-test checks and missing-command information remain alongside the original index references. Original raw files were not rewritten; all claimed feedback raw-file hashes match their bytes at the comparison baseline.

| Original group | Input and result boundary |
|---|---|
| `education-feedback-evidence` | Node24.19; original per-command exits include failures. Its 110 latest-case union is an inventory, not one successful final-tree run. No per-invocation complete source closure is recorded; bundle commit9555 cannot be assigned to every earlier run. |
| `education-feedback-wiring-evidence` | Node24.19; prepared accepted FINAL facts, real own-report SQL/auth. PG3 remains whole-invocation exit1 with School PASS/Teacher FAIL; Teacher-only PG4 exit0 does not rewrite PG3. Recorded after-execution source observations: 59 paths, 18 differ from baseline85. |
| `education-feedback-distribution-evidence` | Node24.19; 39 consumer contracts plus separate synthetic prepared-FINAL PG reads. PG1 remains exit1 (Teacher PASS/School missing campus HMAC); School-only PG2 exit0. Source observations: 19 paths, 6 differ. |
| `education-feedback-form-tx-evidence` | Node24.19; 36 consumers and real single-connection PG report reads, 2 PASS/exit0. FINAL/source preparation remains synthetic. Source observations: 11 paths, 2 differ. |
| `feedback-policy-consumer-evidence` | **47 contracts at892c55996, Node24.19**, exit0; types exit0. Auth/source boundaries are mocked; pure timing evaluator is real. Recorded closure has 9 paths; only `assessment-resource.contract.ts` differs at85 (root's three-line optional policy addition). These observations do not establish the complete current dependency closure or engines qualification. |

The wiring index retains shared PG1/2/3 command and JSON-reporter recipes, rather than an independently captured argv/environment manifest for each invocation. `frontend-wiring-1` has no exact original command retained; this index leaves it missing. Earlier bundle anchors and after-execution hashes are not backdated invocation-start manifests. Installed dependency byte manifests and signatures are absent; no missing provenance is manufactured.

## Separate runtime phase4 evidence

The originating runtime thread's [phase4 README at baseline85](https://github.com/caohuibj/eduK12-new-version/blob/85e9ee0c66ada6a2b0550b9e11f3e31b96ab62ce/docs/performance/four-entry-feedback-20261027/teacher-runtime-evidence/phase4/README.md), final/initial execution records, input manifests and archives are referenced with their hashes in `externalPhase4`. This feedback index verifies archive/decompressed bytes and lists reported cases; it does **not** sign for that thread's execution provenance or accept its qualification.

- `pg-report-policy-r4`: recorded Node24.21, real HTTP/restricted-PG producer→START→FINAL→report, **8 PASS, exit0** at c7caab. Original eight complete case names are indexed.
- `pg-report-school-policy-r5`: **2 PASS / 8 filtered, exit0** at cd6739; adds School FUTURE/DUE. It is not a ten-case successful invocation. No combination with the 47 mocked-boundary contracts or earlier seeded-FINAL PG counts is valid.
- Both raw/archive hash pairs match their originating manifest. Earlier phase4 failures remain in the referenced `initial-executions.json` and original archives; they are not relabeled explicit-policy successes.
- Against baseline85, r4's recorded file subset differs in its journey test and `assessment-resource.service.ts`. r5 records only its journey test file, which matches; that one-file match is not a full closure. The runtime's broader `reviewed-baseline-identity.json` closure differs at `backend/src/modules` now. These are current differences for root review, not an automatic new-test requirement or a statement that the earlier assertions failed.

## Reuse boundary

Original successful assertions, unchanged report/test/source bytes and the recorded input comparisons can support root's limited historical review without rerunning them. Failure records remain useful diagnostics. Node24.19 observations cannot be called engines-qualified current CI success. Changed or incompletely captured source/dependency/config/environment inputs cannot receive automatic final-tree equivalence from this index. The phase4 Node24.21 real journeys have their own owner, inputs and limits; root reviews those originals independently.

No formal acceptance, new gate, CI skip authorization, browser/password-login/Redis proof, or final all-platform qualification is granted here. The JSON marks every group and external invocation `automaticQualification:false`.
