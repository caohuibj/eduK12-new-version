# Training Cognitive published-wave quota correction

Base: main `c64329c40d49d7df215a123dec0ec434e83e5c65`.

Default maxAttempts=1 counted completed T1 against T2 because both use the same root/course wrapper. Valid published tracked Cognitive leaves now keep the original root maximum separately per wave. The existing source/user advisory transaction lock remains; all statuses, parents and epochs within a wave count. Ordinary and untracked entries retain global source-copy accounting. No quota value, grant, scientific configuration or historical result is changed.

Admission verifies server-loaded SELF parent, live published wave, original frozen plan and selected leaf, exact attempt binding/publication hash and actual Cognitive profile identity. Probability-variant preflight reads the same verified published leaf scope; actual START still requires its real parent. Composite edits are limited to quota admission and probability preflight, outside the group-source/course-report slice owned by the other developer.

## Execution and scope

Primary execution: this isolated cloud worktree, existing installed dependencies and explicitly selected loopback `eduk12_test`. Backend `tsc --noEmit --pretty false` exited 0 (original empty log retained in the task checkpoint). Two real PostgreSQL contracts passed, one each for QUESTIONNAIRE and ASSESSMENT_BUNDLE. Each reuses one course wrapper for T1/T2, tests the read-only preflight, rejects no-scope/ordinary admission and another respondent, then rejects T2 retry under a new parent/epoch. Fixture transactions deliberately roll back. This tests actual relational quota queries and locking, not the trial engine, scientific FINAL or an end-to-end browser journey. No migration/dependencies/frontend changes. The previous 37 observations were not repeated.

`pg-final.json`: 2 passed, 0 failed, 0 skipped. Failure history is retained: `pg-first.json` initially obscured the underlying fixture exception; `pg-diagnostic.json` identifies the ordinary fixture violating personal_tracking_complete; `pg-after-fixture.json` identifies an attempted synthetic update blocked by the existing immutable Training binding trigger. The ordinary fixture now uses SQL NULL for absent plan; the test does not mutate a frozen binding. Production constraints were not weakened.

No formal CI, merge or deployment is claimed. Prepare only affected official checks under existing routing; local type/PG results are not automatically official evidence. No full revalidation is justified by this patch.
