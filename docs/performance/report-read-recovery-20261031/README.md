# O11: recover authenticated report reads in place

Base: `f941e745d1c4148bd2e692a1c6e75af847d93fa5`.

The authenticated QuestionnaireResult and ScaleResult pages previously offered
only a return-to-list action after their report GET failed. A transient failure
left no way to retry the current report in place; QuestionnaireResult also
discarded the actual read error. The public questionnaire result already has a
retry action and is not changed by this patch.

Both authenticated pages now expose an explicit `重试读取报告` action that repeats
only the existing GET. Loading hides the retry control while the read is pending.
The current effect cleanup still rejects late responses after record switches;
the retry revision participates in that same effect. Existing read authorization,
report DTO/interpretation, zero/null rendering and Training course return paths
are retained. No start, submit, generation, consent, scoring, API/backend or
permission implementation changes. No automatic retry or new framework.

## Scope and evidence

Only two production files and one new focused test file change. Existing report
tests remain byte-identical. This candidate is independent of Draft435/436/444
and the Group/Long feature files, and does not qualify or integrate those drafts.

- Before the fix, the two selected transport-recovery cases failed because the
  retry button did not exist: `baseline.json`, 2 failed, 6 filtered. Full original
  reporter/log/exit and input receipts are retained.
- After the fix, `candidate.json`: **13 passed**, 2 filtered. These are 8 new
  cases (transport recovery/no duplicate read, denied envelope/course return,
  stale success after retry/navigation, stale error after retry/navigation; each
  in both pages) plus 5 affected existing success/identity/failure cases.
  The two public-only cases were not rerun.
- Each recovery assertion observes the same current-record GET path; mutation
  spies reject POST/PATCH/PUT/DELETE and remain unused. Denied reads stay denied;
  retry does not manufacture a report or trigger submission.
- Frontend app types ran once on the frozen product inputs: exit0, about44.7s.
  Changed-file ESLint exit0, with one existing ScaleResult fast-refresh warning
  on its unchanged named helper export. No lint rule or threshold changed.
- Final receipt source/fixture/config/lock hashes were rechecked after those
  executions and still match. Original invocation HEAD is the main base with
  uncommitted, explicitly hashed candidate files; it is not relabeled as a later
  local or connector commit. Documentation-only publication does not rerun them.

The first shell command had an incorrect relative log destination. Redirection
failed before Vitest ran; it produced no assertion result. The actual recorded
baseline invocation then used an absolute destination. This setup error remains
disclosed in baseline-execution.json.

## Environment and limitations

Node24.21.0 satisfies the current declared engine. Existing frontend/backend
dependency installations are reused through worktree-local symlinks. All present
frontend package versions match current lock, no non-optional package is missing,
and the installed follow-redirects is1.16.1, matching the frontend lock. Absent optional packages are enumerated
in environment.json. This is not a fresh installation/security audit or a full
installed dependency-byte attestation. Actual Node hash and selected tool/package
versions are retained. The reused sibling backend installation has
follow-redirects1.16.1 while its separate backend lock specifies1.16.2. No backend
runtime is exercised here; this boundary is disclosed and no whole-repository
locked runtime qualification is claimed. Do not conflate the two lock files.

These are real React components in jsdom with synthetic API results, not browser
rendering, live authorization/backend, production timing or concurrency evidence.
No production/performance saving is claimed for a recovery control. No backend
tests, database/FINAL lifecycle, full frontend suite, native browser, build,
formal CI, Ready, GitHub APPROVE, auto-merge, merge or deployment were executed.
Keep this a Draft while the two report feature lines retain priority. Final
merge qualification is pending and must use actual final-input gaps only.
