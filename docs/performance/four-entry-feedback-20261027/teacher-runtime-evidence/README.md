# Teacher runtime local evidence

This file preserves phase-one history. The subsequent actual integration and
PostgreSQL results are recorded separately in [phase two](phase2/README.md).
Phase-one limitations below describe that earlier snapshot.

These are diagnostic local executions on the independent cloud node, Node
24.21.0, Vitest 4.1.11, backend TypeScript 5.9.3 and frontend TypeScript 5.6.3.
They are not signed CI evidence, formal
merge qualification or end-to-end proof. Existing install state was retained;
no dependency/lock/schema/source-authority changes were made by this worker.
Commands below run from `server-version/backend` or `server-version/frontend`.
`NODE` denotes `/workspace/eduk12-cloud/tools/node_modules/node/bin/node`.
The initial shell's default Node 24.19.0 was only inspected; checks use NODE.

Implementation commit `bad260a01406cae83e736ae7f6c3f7437e003b24` is the source
snapshot. A later documentation-only commit contains this evidence. Except the
final frozen-product type invocation, intermediate inputs were edited between
checks and not recorded as contemporaneous complete byte manifests. Final
hashes in the machine-readable index identify the delivered files; they are
not backdated manifests or permission to reuse these checks in CI.

Tables below use each logical original `.log` name. Nonempty logs are stored as
`.log.gz` with deterministic gzip (mtime 0); decode with `gzip -dc FILE.log.gz`.
`checks.json` records both original-byte and archive SHA-256. Decompression was
checked byte-for-byte. Empty compiler/lint logs remain empty `.log` files with
the actual exit recorded separately. The full Git whitespace check initially
exited 2 on raw stdout's trailing spaces/blank lines; lossless packing preserves
that original output without rewriting it. Raw copies also remain in this cloud
node's `/tmp/pr363-teacher-runtime-original-evidence`.

## Backend

|Log|Command after NODE|Exit / observed result|
|---|---|---|
|`backend-http-initial.transcript.log`|`node_modules/vitest/vitest.mjs run src/__tests__/huiteacher/assessment-runtime.routes.test.ts --reporter=verbose`|outer pipeline 1; 12 pass / 1 fail|
|`backend-http-targeted-recheck.log`|same file, `-t 'forwards one-shot Cognitive FINAL\|uses root NEW_USE' --reporter=verbose`|0; 2 pass / 12 filtered|
|`backend-frozen-child-recheck.log`|same file, `-t 'reads the exact\|rejects foreign\|requires independent\|keeps shared consent\|forwards one-shot\|projects SJT\|uses root NEW_USE\|rejects stale frozen' --reporter=verbose`|0; 8 pass / 7 filtered|
|`backend-auth-scope-and-single-family.log`|same file, `-t 'does not intercept\|accepts only a Teacher\|supports a dedicated' --reporter=verbose`|0; 4 pass / 14 filtered|
|`backend-types-initial.log`|`node_modules/typescript/bin/tsc --noEmit`|0; before frozen-slot guard addition|
|`backend-types-frozen-child.log`|same type command|2; slot possibly undefined (TS18048)|
|`backend-types-final.log`|same type command|0; final backend production inputs|
|`backend-postgres-query.log`|`node_modules/vitest/vitest.mjs run src/__tests__/huiteacher/assessment-runtime.query.postgres.integration.test.ts --reporter=verbose`|1; actual PG query failed, schema missing `organizations.product_domain`|

The initial HTTP failure was the test request helper parsing the intentionally
unmounted trial-stream route's HTML 404 as JSON. The parser was fixed, then only
the failed case and the new root-reader contract case ran. Initial tee failed
because its directory preparation used the wrong working directory; its log is
an explicitly labelled tool-output transcription, not an original reporter.
The original failed tool output remains in the worker transcript.

The frozen-slot addition prompted the eight related cases, including real
AES-GCM encrypted plan decoding and tampered epoch/hash/runtime rejection.
The auth scope/single-family addition ran four related cases only. There are
18 distinct HTTP contract cases with an observed pass across these invocations;
there is no final all-18 fresh invocation. Queries, grants and canonical engines
are synthetic fixtures. Actual Express authentication, cookie/JWT audience
selection, parsers, SQL construction and frozen-plan validation are exercised.

The separate PG attempt used the protected generated local test connection
without printing or copying credentials. Only PostgreSQL was started. Actual
server version was `16.15 (Debian 16.15-1.pgdg12+2)`; a read-only schema probe
confirmed zero `public.organizations.product_domain` columns. No row was written,
no schema was changed and the worker-started PostgreSQL container was stopped.
This failed attempt is not a PG authorization/FINAL/race pass. Root must provide
a current isolated schema and integrated source/START/FINAL consumer before those
claims can be tested.

## Frontend

|Log|Command after NODE|Exit / observed result|
|---|---|---|
|`frontend-initial.log`|`node_modules/vitest/vitest.mjs run src/huiteacher/assessmentRuntime.client.test.ts src/huiteacher/HuiteacherMyAssessmentTasks.test.tsx --reporter=verbose`|1; 9 pass / 2 fail|
|`frontend-media-recheck.log`|`node_modules/vitest/vitest.mjs run src/huiteacher/assessmentRuntime.client.test.ts -t 'maps only the current' --reporter=verbose`|0; 2 pass / 2 filtered|
|`frontend-lifecycle-recheck.log`|`node_modules/vitest/vitest.mjs run src/huiteacher/HuiteacherMyAssessmentTasks.test.tsx -t 'runs Cognitive\|rejects a late\|does not revive' --reporter=verbose`|0; 3 pass / 4 filtered|
|`frontend-assembly.log`|`node_modules/vitest/vitest.mjs run src/huiteacher/HuiteacherAssessmentTasks.test.tsx --reporter=verbose`|1; 4 pass / 1 fail|
|`frontend-assembly-recheck.log`|same assembly file, `-t 'adds the approved runtime source' --reporter=verbose`|0; 1 pass / 4 filtered|
|`frontend-types-initial.log`|`node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`|2; incomplete test DTO / rest argument types|
|`frontend-types-recheck.log`|same type command|0; fixture types corrected|
|`frontend-types-final.log`|same type command|0; after lazy assembly; test-only dynamic-import wait edited during this interval|
|`frontend-types-frozen-product.log` + `.exit`|same type command|final frozen-product invocation; explicit exit file|
|`frontend-lint.log`|targeted `node_modules/eslint/bin/eslint.js` on client/host/inbox and new client/host tests|0; 8 warnings|
|`frontend-lint-final.log`|same five files after cleanup|0; no warnings|
|`frontend-lint-assembled.log`|same five files plus `src/huiteacher/HuiteacherAssessmentTasks.test.tsx`|0; no warnings|

The initial media failures exposed synchronous rejection versus the declared
Promise transport; loaders now reject asynchronously and also reject double
encoded path segments. Only the two affected media cases reran. Hook cleanup
was then clarified without suppressing lint, and three related lifecycle cases
reran. The assembly test initially reached its query before the actual lazy
module settled; it now explicitly waits for `vi.dynamicImportSettled()` inside
`act`, then executes the same assertions. Its one failed case reran; the four
existing passing assembly cases did not repeat.

There are 16 distinct frontend cases with observed passes across the client,
host and inbox files. The source API and runner completion signals are synthetic
UI fixtures. No real browser, visual layout, real account journey or backend
authorization result is inferred from them. No report endpoint is substituted
or a report permission copied into this runtime.

## Remaining integration evidence

- Root's exact source reader + original-issuer proof and production adapter.
- Current full schema and actual Teacher new START/restore/material/FINAL for
  Cognitive, SJT and mixed delivery; accepted FINAL durability, conflict/replay
  and concurrent revocation under the shared transaction fences.
- Current actor/persona/entitlement/consent/emergency-stop and source retirement
  behavior in the integrated PostgreSQL services, including foreign credentials,
  parent/item/session and C/P/R substitutions.
- Real Teacher browser participation and independently authorized feedback.
- Root's independent review and selected formal CI; no CI was activated here.
