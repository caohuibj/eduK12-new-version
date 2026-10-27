# Teacher runtime actual integration evidence

Product commit `f299f7247a37a11a1cb53d99c4ead57eb5274d11`, tree
`3f31d61e2988f026ab3ef121c658e77c9e5d2131`, independent branch
`feat/pr363-teacher-runtime`. Source pushed and read back from origin. Root
source dependency `282e9fb353d3216d33a58306db2dbf9ae3d3d04a` is normally merged,
as is its earlier foundation `f46336cc45abaa21d4b946029cda2a0dfadec654`.
Root integration was later observed at `1b3cdd171361f63f348069717294671277300541`;
it was fetched read-only, not absorbed or written by this worker.

This is unsigned local diagnostic evidence. It is not a CI success, independent
review, real-tool approval or browser end-to-end result. Intermediate inputs
changed during diagnosis and were not captured as contemporaneous complete byte
manifests; final hashes below must not be backdated onto those executions.
The final consent invocation and final backend type invocation ran at the fixed
product commit. The frontend tree remained unchanged during its final type/lint
checks. `checks.json` binds the final source and original/archive log bytes and
records each original failure. Earlier command rows reconstructed from retained
task history are explicitly marked; a reporter log alone is not an exact command
transcript. Nonempty stdout is losslessly gzip-packed with
mtime 0; empty type logs and explicit `.exit` files remain uncompressed.

## Actual database and authority boundary

A fresh loopback database `pr363_runtime_test` was created, owned by a new
non-superuser migration owner. A distinct runtime login has no SUPERUSER,
CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS, schema/database CREATE, owner role
membership or operator-table access. The exact candidate runtime table policy
was applied only in the new database. All **240** current Prisma migrations
applied successfully; matching Prisma Client **5.22.0** was generated.

`runtime-role-contract.mjs verify-current` succeeded with **267 tables**,
**1 sequence**, restricted runtime true, migration fingerprint
`25554d1bc211833c31302fad5a8093adede3e3959c1af6cfdacd21856d8111c0`.
PostgreSQL is **16.15** from the existing pinned cloud Docker image. Node
**24.21.0**, Vitest **4.1.11**, backend TypeScript **5.9.3**, frontend TypeScript
**5.6.3**. The original old test database and phase-one missing-column failure
were preserved. No table or row in that old database was modified.

The source producer fixture is explicitly synthetic: it owner-seeds local users,
original authority proofs, a source placeholder, installed real reaction/SJT
content and education delivery DRAFT→REVIEWED→PUBLISHED lifecycle rows. It uses
the shared Cognitive profile freeze and assignment C release publisher, static
SJT mapping/measurement publisher and Training content snapshot/flow identity.
It does **not** prove source authoring, independent source provenance review,
production source publication or authorization of any real tool.

The Teacher event, run, track, publication and participant START then use actual
services through the restricted runtime role. The participant HTTP app uses
actual Express, `authenticateHuiteacher`, cookie/JWT audience checks, origin
and CSRF guards, real source reader/original-issuer checks and canonical
Cognitive/SJT/Form FINAL/encrypted storage. There are **no module/service/query
mocks** in these PostgreSQL cases. No CI-only fixture environment was forged.
Redis was not initialized: NODE_ENV=test follows the existing revocation-cache
behavior. Current account/organization checks are real; Redis logout/revocation
and its production fail-closed behavior are not tested here.

The worker-started PostgreSQL container was stopped after the checks; the new
synthetic database and protected local connection record remain available for
inspection. Redis was never started. Protected URLs/passwords are outside the
repository and are not present in these logs.

## Commands and observed results

`NODE` is `/workspace/eduk12-cloud/tools/node_modules/node/bin/node`. Commands
run in `server-version/backend`, except the named frontend checks. The cloud
wrapper supplied the protected, explicitly selected URLs and captured combined
stdout/stderr and exit without printing credentials. Its equivalent portable
invocation is shown below. Each Vitest command ends in `--reporter=verbose`.

| Log stem | Command after NODE / selected case | Exit and observed result |
| --- | --- | --- |
| migrate-deploy | `node_modules/prisma/build/index.js migrate deploy`, owner URL | 0; all 240 migrations |
| prisma-generate | `node_modules/prisma/build/index.js generate` | 0; Client 5.22.0 |
| runtime-role-preflight | `scripts/runtime-role-contract.mjs verify-current`, actual runtime URL | 0; privileges and schema |
| pg-runtime-initial | integration file, first two cases | 1; 2 fail: fixture role grant preceded entitlement FK |
| pg-mixed-r2 | integration file `-t 'mixed BUNDLE'` | 1; fixture C release had config scope instead of frozen assignment scope |
| pg-mixed-r3 | same selected case | 1; **production guard** enum=text 42883; wrong session returned 500 |
| pg-mixed-r4 | same selected case | 1; fixture assignment missing shared frozen profile |
| pg-mixed-r5 | same selected case | 1; test's reversed trials invalidated schema (400) before intended conflict (409) |
| pg-mixed-sjt-r6 | mixed and dedicated SJT | 1; dedicated SJT pass; mixed test used nonexistent `formSection` DTO |
| pg-root282-runtime-r7 | all original 3 cases after root282 merge | 1; SJT pass; mixed DTO error; dedicated Cognitive old shared publication rejection |
| pg-mixed-cognitive-r8 | mixed and dedicated Cognitive | 1; dedicated Cognitive pass; mixed fixture missing public typed Form definition |
| pg-mixed-r9 | mixed only | 1; **shared typed Form** temporary undefined displayIf could not canonical-hash |
| pg-mixed-r10 | mixed only | 1; all actual FINALs completed; test hashing Prisma Date needed explicit ISO normalization |
| pg-mixed-r11 | mixed only | 0; mixed START/recovery/CG/SJT/Form FINAL, raw durability, replay/conflict and retirement |
| pg-continuation-consent-r12 | `-t 'continues an unfinished\|explicitly required SELF'` | 1; unfinished retired/closed continuation and access deny pass; consent test treated child receipt as completed parent |
| pg-consent-r13 | `-t 'explicitly required SELF'` | 0; explicit consent/withdrawal and completed-parent replay pass |
| pg-consent-f299 | same consent case after narrowing SELF adaptation to Teacher only | 0; 1 pass / 4 filtered; exact product snapshot |
| typed-form-identity | `node_modules/vitest/vitest.mjs run src/__tests__/huiteacher/typed-form-flow-identity.test.ts` | 0; 2 shared Form hash/condition cases |
| backend-types | `node_modules/typescript/bin/tsc --noEmit` | 0; overlapped root282 absorption, not final-bound |
| backend-types-final | same | 0; overlapped final Teacher-only consent predicate edit, not final-bound |
| backend-types-f299 | same | 0; exact frozen final production inputs |
| frontend-app-account | frontend Vitest `src/huiteacher/HuiteacherAccountChange.test.tsx` | 0; 1 existing password gate consumer |
| frontend-types-final | frontend `node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` | 0; final frontend tree unchanged |
| frontend-app-lint | frontend ESLint `src/huiteacher/HuiteacherApp.tsx` | 0; one existing line279 useEffect org warning; same baseline source hunk at root282 |

The new actual integration test file is
`src/__tests__/huiteacher/assessment-runtime.postgres.integration.test.ts`.
Five distinct PG cases have observed passes across targeted invocations; this is
**not** a final all-five invocation. Unaffected successful cases were not rerun.
The initial failures above are preserved, including failed assertions; no
assertion was deleted to hide a production failure. The consent expectation was
corrected to obtain a fresh canonical parent COMPLETED state **before** revoking
consent. A child receipt alone never proves Composite completion. Withdrawal
before parent completion continues to reject unfinished work.

The PG cases prove actual foreign Training/School credentials and copied School
JWT rejection; another Teacher/wrong item/session exclusion; origin/CSRF denial;
no parent when original issuer is frozen before admission; actual dedicated
SJT and Cognitive START; mixed CG→SJT→typed Form flow; same durable parent on
resume; encrypted raw row count 1; repeated FINAL; valid payload conflict;
parent/assignment/execution completion; unchanged encrypted raw after replay;
ordinary retirement and original issuer freezing after binding; current account
freezing; current organization access deny and recovery; explicit SELF pending
consent acceptance, no START before acceptance, withdrawal of unfinished work,
and stable replay after canonical parent completion.

## Portable isolated invocation for integration

Prepare a new loopback database named exactly `pr363_runtime_test`, with separate
restricted runtime and migration-owner roles. Apply current candidate migrations
as owner, then current `runtime-role-defaults.sql` with its actual table-policy
JSON as documented by that script. Never reuse an application/developer database,
run runtime services as owner, or set CI-only fixture flags to bypass admission.
Credentials below are supplied through the operator's existing protected env:

```bash
# cwd: server-version/backend; URL variables refer only to this disposable DB.
DATABASE_URL="$DATABASE_URL_MIGRATION" node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js generate
DATABASE_URL="$DATABASE_URL_RUNTIME" node scripts/runtime-role-contract.mjs verify-current

NODE_ENV=test DATABASE_URL="$DATABASE_URL_RUNTIME" \
DATABASE_URL_RUNTIME="$DATABASE_URL_RUNTIME" \
TEACHER_RUNTIME_INTEGRATION_DATABASE_URL="$DATABASE_URL_RUNTIME" \
TEACHER_RUNTIME_FIXTURE_OWNER_URL="$DATABASE_URL_MIGRATION" \
COGNITIVE_MODULE_ENABLED=true HUITEACHER_WORKSPACE_ENABLED=true \
DATA_ENCRYPTION_KEY="$SYNTHETIC_TEST_ENCRYPTION_KEY" \
DATA_PSEUDONYM_KEY="$SYNTHETIC_TEST_PSEUDONYM_KEY" \
node node_modules/vitest/vitest.mjs run \
src/__tests__/huiteacher/assessment-runtime.postgres.integration.test.ts \
-t 'CHANGED_OR_MISSING_CASE_ONLY' --reporter=verbose
```

Use valid, disposable 64-hex crypto test keys. Do not print secrets. The suite
rejects non-loopback/mismatched databases, any database other than the named
disposable one, missing owner identity and an unrestricted runtime principal.
Ordinary unit runs intentionally skip when its opt-in URL is absent; CI/release
mode requires explicit integration configuration and is not declared successful
by a skipped run. The old narrow read-only query suite retains its separate
`TEACHER_RUNTIME_QUERY_DATABASE_URL` requirement.

## Remaining proof and integration work

- Root's production source authoring/review/publication workflow and actual
  provenance/license corpus; the local producer above is synthetic.
- Feedback worker's independent report permission and `renderFeedback` injection.
- Real Teacher browser participation; all phase-one frontend runner signals are
  synthetic UI contracts and the one phase-two app case is jsdom.
- Real object-store images/video capabilities and Redis session revocation.
- Concurrent source/issuer/account/consent revocation versus START/FINAL fences;
  sequential rejection does not establish race linearization.
- Additional specific Scale mixtures and pure-Form BUNDLE beyond the shared
  engine/root contracts; no existing Scale/Form scoring or policy was rewritten.
- Root's combined candidate review, any newly affected direct checks and selected
  formal CI. No CI, image build, PR merge, deployment or protection change ran.


## Pending source-contract delta announced by root

Root subsequently announced source producer
`8fcfadcadeb7fd09fd8e453aa6eb16d87d53e686`. It was fetched and inspected only,
not merged into this evidence candidate. It requires
`origin.distribution={actorId,grants:[{resourceId,grantId,version}]}`. Root is
wiring exact grant authorization at NEW_USE/NEW_START; FROZEN must not reapply
new-use eligibility. The participant adapter continues to use the real reader,
exact identity and its own current Teacher permission. No separate distribution
authorization engine belongs in this runtime adapter.

The synthetic HTTP fixture in `assessment-runtime.routes.test.ts` also needs
the new required origin shape (its grants remain explicitly mocked). The actual
PG producer fixture must be adapted after that integration to prepare the corresponding real original grant rows, include distribution in the
origin and recompute its hashes. The grant must cover `material.distribute` in
the target TEACHER organization for the source Composite and every selected
C/P/R release; a system-admin source issuer alone is insufficient (prefer the source worker's shared producer).
The new source contract has **not** been PG-tested by this worker; the five
passes above belong to root282 semantics and cannot be reused as distribution
revocation proof. No source worker files or its 18-case suite were changed or
repeated. A short-SHA fetch first failed because GitHub does not serve an
abbreviated SHA as a ref; resolving the branch's full SHA and fetching it worked.
No action was denied by automatic approval review.
