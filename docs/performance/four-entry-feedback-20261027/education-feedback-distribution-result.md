# Feedback delta after exact education distribution integration

Branch `feat/pr363-education-feedback`; code `b5bc4737b42e1328f1062d3ae2e6abc89e8f9879`, tree `da8318a6f3c52492f4f23c17dd0732280b6b4436`. Normally merged root `0e3d210d63ae1b6c74835265e12943cf6e84ec4e` in `5eca80355`. Earlier evidence remains bound to its original source. This delta does not relabel that evidence as current-source success.

## Reuse and actual changes

- Kept the existing concrete education report routes and root FROZEN source consumer. No second source reader, scorer, interpreter, report renderer or authority cache was added. Root's exact FINAL/read report-consumer changes and their own 40-case evidence were absorbed without rerunning those tests.
- Updated the synthetic report fixture to include mandatory `origin.distribution`, including exact source/C/P/R resource IDs, original grant IDs/versions and original actor. Removed the obsolete additive-schema compatibility probe. The real-PG fixture now aligns runtime/report owner with the recorded original creator, as root's source identity requires.
- Used the existing `issueAdminContentRoot`, `assertEducationAssessmentDistributionCurrent` and `revokeAdminContentGrant` against the new real DB. The fixture obtains an actual scoped education material distribution grant and freezes its original version. Both products explicitly revoke that grant and verify new distribution fails while the already-completed, currently authorized own report remains readable. Ordinary source retirement and original issuer loss remain independently tested, as do real report/account revocations.
- Added one unit case refusing replacement of the frozen distribution proof during async report materialization. The source origin is compared as a whole; historical reads do not replace old proofs with newly discovered grants or invoke NEW_USE/NEW_START authorization.
- Resolved the sole merge conflict in Teacher App by retaining both independent constants: `assessmentResources` for the authorized directory and `assessmentRuntime.renderFeedback` for the shared feedback adapter. Relative to root, feedback adds only its import, renderer factory and the existing tasks prop. No new Teacher runtime internals were edited.

## Necessary affected verification

Exact raw results, command arrays, source observations and hashes are in [the delta evidence index](education-feedback-distribution-evidence/index.json).

| Invocation | Actual result | Scope |
|---|---|---|
| `report-unit-1` | 39 PASS, exit 0 | Both direct report-fixture consumers; includes the new proof-replacement case |
| `backend-types-1` | exit 0 | Type compatibility of the updated source contract and report fixtures |
| `app-lint-1` | exit 0, one preexisting `org` dependency warning | Only the conflicting Teacher App file |
| `migrate-setup-1` | exit 0 | Apply all 240 migrations to the new disposable PG16 DB; required fixture setup, not repeat migration qualification |
| `report-pg-1` | Teacher PASS / School FAIL, exit 1 | School lacked the synthetic `CAMPUS_ELIGIBILITY_HMAC_KEY` before report fixture setup; original failure retained |
| `report-pg-2`, School only | School PASS / Teacher filtered, exit 0 | Only the failed School input reran after adding the synthetic key |

The disjoint real PG successes are Teacher in PG1 and School in PG2. The first whole invocation remains failed. The full new schema had 267 public tables. Final SQL observed each product's source RETIRED and its real original distribution grant revoked at version 2. Real product-cookie middleware, source identity, owner/disclosure SQL, current report denials and emergency stop ran against that schema; no authorization/SQL mocks were used in these PG cases.

Only new disposable PostgreSQL `16.15-bookworm` and Redis `7.4.11-bookworm` containers were used. Both were stopped and removed, with IDs and cleanup exit codes retained. Original databases/caches were not used. CI/GITHUB_ACTIONS/RELEASE_VERIFY_LOCAL were unset. Stored FINAL facts and approved source metadata remain synthetic preparations; these checks do not claim real new-tool publication/START/scorer/FINAL or a restricted database runtime role.

## Teacher assembly and remaining qualification

Read-only inspection of Teacher runtime `2b4955954` confirms its `renderFeedback(completion: {executionId,attemptId})` and wrapper `assessmentRuntime` match the actual App injection here. Keep that worker's real lazy `HuiteacherMyAssessmentTasks` and forwarding implementation when integrating the shared assembly file; this branch still does not copy or replace the new host. Our existing adapter sends only the execution ID through `teacherApi`, keeps attemptId as a lifecycle key, and does not borrow Training transport or credentials. No runtime tests were repeated.

Root's previous ordinary PRIVATE report FINAL/read rejection is addressed by the absorbed `0e3d210d` consumers; this line did not alter those files. Root's source producer/standard/privateVersion markers and runtime workers still own real START/recovery/FINAL production of the exact frozen bindings, selected references and saved interpretation receipt listed in [the interface](education-feedback-interface.md). This delta verifies report reading of prepared accepted facts, not that whole runtime loop.

Node remains `24.19.0`, below engines. No build, real browser/mobile keyboard/layout, formal CI, PR merge or deployment was run. Unchanged feedback lifecycle, source 18-case and runtime tests were not rerun. Source/registry/authority/migration/shared FINAL files remain byte-identical to root `0e3d210d` in this branch.
