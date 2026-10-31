# O11: keep public questionnaire report reads in their current scope

Base: `f941e745d1c4148bd2e692a1c6e75af847d93fa5`.

The public questionnaire result component reused its state when the URL token or
sessionId changed. Its report GET had no effect cleanup, so an older success
could replace the new report, an older error could discard it, and an older
finally could clear the new request's loading state.

The report read now belongs to a local effect with cancellation cleanup keyed
by token, sessionId and explicit retry revision. Starting that read clears the
previous report. Late success, error and loading completion publish only while
that effect is current. The existing retry action selects a new read revision.
No shared cache, global request layer or automatic retry is added.

The public capability client and resume-token lookup are byte-identical to main:
each current read still requires the matching stored capability, uses the same
report GET and bearer, and omits cookies. Missing session/capability still offers
the original entry recovery, without report retry or any new request. DTO,
frozen interpretation, image callback and backend authorization are unchanged.

## Evidence

- Actual new regression baseline:2 FAIL,5 filtered. Separately changing only
  sessionId or only token reproduces an old response replacing the current h1.
  Original raw report/log/exit and input hashes remain in baseline files.
- Final candidate:10 PASS,2 filtered. Seven new cases cover both identity axes
  for stale success and failure, earlier completion while the current read is
  pending, missing current capability, and existing same-session manual retry.
  Three existing public-result rendering/missing-session/missing-capability
  cases are selected; the two unrelated authenticated-only cases are filtered.
- New tests render the actual page and use the actual capability client and
  sessionStorage resume helpers. Only fetch is synthetic. Assertions observe
  current GET paths, correct per-request synthetic bearer and credentials=omit.
  They do not connect to a server or provision any real capability/credential.
- On this independent candidate, frontend app types ran once, exit0,45.5s;
  changed-file lint exit0 with no warnings. All recorded source/test/config/lock
  hashes match after execution. No product file changed after these results.
- The unchanged dependency environment inventory from Draft445 is referenced
  by exact file SHA in environment-reuse.json. Same installation and frontend
  lock were checked;445 application test/types results are not reused as current
  public-page execution. Node24.21.0, reused dependencies, no fresh install/audit
  or complete installed-byte attestation. Frontend follow-redirects1.16.1 matches
  its frontend lock; the reused sibling backend1.16.1 versus backend lock1.16.2
  boundary remains disclosed. No backend runtime qualification is claimed.

Only one production page, one new focused test file and synthetic evidence/docs
change. This draft is independent of445's two authenticated report pages and of
435/436/444 and the Group/Long feature changes. Original execution receipts bind
the explicitly hashed worktree inputs on base main, not a relabeled later head.

These are synthetic React/jsdom race and transport-contract observations, not
native-browser, server authorization, production isolation, latency or capacity
qualification. No full frontend suite, backend/DB/FINAL lifecycle, browser, build,
formal CI activation, Ready, auto-merge, GitHub APPROVE, merge or deployment.
Keep Draft and preserve the report feature lines' merge priority. Final combined
qualification remains pending; only affected final-input gaps should be filled.
