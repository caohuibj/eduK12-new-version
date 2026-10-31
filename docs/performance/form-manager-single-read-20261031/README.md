# O04: shared manager single repaired section snapshot

Base: `f941e745d1c4148bd2e692a1c6e75af847d93fa5`.
Prerequisite commit `4950f513` imports only the two reviewed race-fix source/test files
from `ed6196d84a`; no old evidence or unrelated tree is imported. This candidate is
stacked on that fix and must not remove its request sequence/cleanup behavior.
Product tree before this evidence directory: `bbd989df8f226c50b25c2307e00d6d09a6694831`.

## Frozen scope / checks

GENERAL/COURSE `form-sections?include=units` opts into an additive response.
Authorization remains before the original list service, which retains lazy repair.
The existing units service receives the repaired sections rather than ensuring a
second time. Default sections, full/units content endpoints and Composite are unchanged.
The manager uses one request for those two questionnaire kinds only. No cache,
new route, model, migration, permission or CI gate is introduced.

Checks run locally: real controller/service with synthetic Prisma (auth/default/
repair/sorted units/delegate budget), actual loopback HTTP + React consumer
(load/move/refresh/failure/read-only), full mixed order, stale-resource behavior,
backend and frontend app TypeScript. Budget approximately five minutes. Formal CI,
real DB SQL, production latency/concurrency, merge and deployment were not run.

## Evidence and limits

- Backend `backend.json`: 14 passed, including 8 new real service tests and 6
  unchanged content compatibility tests.
- Frontend `frontend.json`: 17 passed across original unit/HTTP/race cases.
- Additional combined-resource race: one passed in `frontend-additional-fixed.json`.
- Additional multi-unit ordering: two passed in `frontend-mixed-fixed.json`.
  Total distinct frontend assertions: 20. Do not count filtered cases as passes.
- `backend-types.exit`: 0. `frontend-types-final.exit`: 0 on final frozen inputs. Changed manager ESLint: 0.
- Normal path: HTTP calls 2 -> 1; parent lookup/authorization 2 -> 1;
  Prisma Questionnaire.findUnique 2 -> 1 and FormSection.findMany 2 -> 1;
  QuestionnaireScale.findMany remains 1. These are delegate calls, **not SQL counts**.
  Nested relation execution is Prisma-engine dependent and was not measured here.
- Legacy missing-membership path still performs a transaction, rereads current
  membership, creates the missing section and updates its field before mapping
  either DTO. The tested one-field fixture is not a concurrent database repair proof.
- `payload.json` uses the identical fixture SHA as actual `http.jsonl`: 41 fields,
  3 sections. Paired versus combined serialized raw bytes 11669 -> 11631;
  gzip level 1 bodies 1197 -> 1084. Actual combined HTTP measured 1084. Previous
  paired bytes here are serialized from the same fixture, not a second live run.
  Units metadata continues alongside list metadata, as before; no repeated full
  fields or new scale definitions. Do not treat synthetic CPU/jsdom timings as
  production improvements.

## Retained failures / environment

The first additional-case shell used an incorrect relative append path; it wrote
no test and the filtered invocation `frontend-additional.json` ran zero cases
(5 skipped). It is not passing evidence. After fixing only the path, two added
ordering assertions failed because the selector included a nested field `<li>`;
`frontend-additional-fixed.json` preserves these two failures and the passing
combined-resource race. The selector was narrowed to the content-order `<ol>`;
only the two affected assertions were rerun. First frontend types overlapped that
test-only selector edit; final types were rerun on frozen inputs for an unambiguous
final-input result. Product code did not change after the first tests.

Existing dependencies were reused via worktree-local symlinks; no dependency was
installed or modified. package-lock files compare equal to those in the source
worktrees; this is not a full installed-tree attestation. Backend uses
`dot-o09-composite-20261031` (Vitest 4.1.11, TS 5.9.3, Prisma 5.22.0,
follow-redirects 1.16.2). Frontend resolves through the race worktree to
`dot-main-review-perf-20261030` (Vitest 4.1.11, TS 5.6.3, React 18.3.1,
Axios 1.20.0, follow-redirects 1.16.1). The frontend installed follow-redirects
is older than current lock; HTTP test uses Node fetch adapter, but this limitation
must not be concealed or described as a fresh locked install/security audit.

Commands: `vitest run` backend two questionnaire test paths, frontend three
FormSectionManager test paths, all with `--maxWorkers=1 --reporter=json
--outputFile=...`. Additional tests use `-t 'loads all mixed|newer combined'`,
then only `-t 'loads all mixed'`. Types: backend `tsc --noEmit`; frontend
`tsc -p tsconfig.app.json --noEmit`. Logs/exits/reporter files are retained.
The shared service implementation and default API remain untouched.

Transport boundary verified after the run: fixture lines 92–93 explicitly override
all API calls to `adapter: 'fetch'`; installed Axios fetch adapter lines 489–490
execute `_fetch`. Thus the observed HTTP traffic did not use follow-redirects as
its transport. Module-load tracing was NOT recorded; Axios also statically imports
its HTTP adapter, so “follow-redirects was never loaded” is not established and is
not claimed. Axios declarations used by frontend types do not directly reference
follow-redirects; the complete compiler reachable-input graph was not recorded,
so the type result remains a result in the disclosed reused environment, not a
fresh current-lock qualification. No successful test was rerun to hide this limit.
