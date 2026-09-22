# PR4 development evidence

Base: `199662df3304f29b0fee74e316a2f10a1a8faa9a`.
Status: C4-01 complete; C4-02 raw-diff and aggregate hardening implemented.
Bundle classification/validators/workflow integration and C4-03–05 remain pending.
No PR4 push, GitHub PR or remote canary has been performed.

## Local verification, 2026-09-23

Command from repository root:

```sh
node --test .github/scripts/content-scope.test.mjs .github/scripts/browser-asset-filter.test.mjs .github/scripts/ci-timing-report.test.mjs .github/scripts/api-response.test.mjs
```

13 tests pass, zero skipped/failed (Node v25.2.1, macOS). Log:
`/tmp/c4-routing-tests.log`. No application runtime or schema changed, so this
checkpoint does not claim an application full regression run.

New tests use real temporary Git repositories to verify regular additions and
modifications, deletions, both sides of moves, executable bits, symlink replacement,
missing base objects and complete diffs exceeding 300 paths. The deliberate
nonexistent-base test emits `fatal: bad object` and asserts that the classifier
throws; this is expected failure injection. Malformed raw records and missing or
invalid aggregate routing outputs are also rejected. Existing selected-job
failure/cancelled/skipped/missing assertions remain passing.

Bundle paths explicitly remain on the platform route until the mandatory content
validators and PostgreSQL smoke are integrated. A regression test fixes that
intermediate guarantee; replace it with positive Bundle routing tests only when
those checks are connected. CI itself will take the full route in a ready PR.

`git diff --check` passes. No remote CI reduction or canary success is claimed.
