# Observer questionnaires and native SELF candidate

PR #385 completes School parent/homeroom-teacher observation, Teacher student
and expert observation, and authorized native Cognitive/SJT SELF questionnaires.
P6 whole-package runtime remains separate and is not declared complete.

Current base is merged main #386,
`f39a00f12fed2e1b8e1d3cc45185969262925ed8`; product anchor
`25606ccd895c7059e8b391ee7570e932140e0568`. Main #382/#384 and #386 are retained
by normal merges. Both scientific forward migrations and the V1 admission row
lock remain intact. The full raw diff, modes, source/control blobs, component
and transitive input closures remain frozen in the existing School/Teacher
binding. Its internal `education-self` identifier selects that existing executor;
the backend/UI selections explicitly include the observer capabilities.

| Capability / risk | Evidence and unique next position | Invalidating change |
| --- | --- | --- |
| School parent/teacher identity, relationship, consent, first/replay receipt privacy, ADMIN+TEACHER feedback and closed history | Official run2 real PG PASS; no reexecution | Admission, source audience, REPORT_READ, history SQL, result projection |
| Student private/explicit STANDARD sources, ten canonical zero+Form results and protected cohort feedback | Official run2 real PG PASS; generic OBSERVER still has no student reference action | Declaration, mapping, native seal, role or disclosure |
| Private/public PERSON experts, TEAM Form, invitation/MFA/revocation and independent encrypted evidence | Official run2 real PG PASS | Invitation, target, source binding or evidence ACL |
| School experience / Teacher research native SELF, four FINALs, exact versions and real START/NEW_USE versus retirement | Official run2 real PG PASS; original deadlock and repair retained | Config/measurement, root binding, U, runtime or lock order |
| Shared UI, task lifetime and service contracts | Official run2 UI58 and backend200 PASS, types/lint PASS; do not rerun | Actual implementation/fixture/dependency changes; unrelated CLI exception below |
| Nonempty upgrade | Official run2 upgrade from main #384 PASS; #386 Prisma tree is identical | Schema/migration/baseline inputs |
| Durable same-page Teacher resume | Component cases PASS; missing production browser is the unique next execution | Mounted card/session binding, async list state, runner lifecycle |
| Result preservation and runtime least privilege | Missing actual dump/restore, full-row hashes, education DDL, restricted-role/schema checks | Restore executor, schema, runtime policy or fixed synthetic input |

First [run40846513434](https://github.com/caohuibj/eduK12-new-version/actions/runs/40846513434)
retained 200 actual backend passes but strict report normalization rejected two
identical parameter-case names. Only titles changed; original inputs/assertions
remain. Second [run40849532868](https://github.com/caohuibj/eduK12-new-version/actions/runs/40849532868),
source `fe17d12aae66965b59b3bc3ed93d17dd9455cfdb`, checkout
`772a8ed525fd769ebd9e11a432b8f80ffa155612`, completed UI58, backend200, real PG14,
nonempty upgrade, both builds, HIGH/CRITICAL audits and full application CodeQL.
Its PG job failed before dumping: the restore list falsely required legacy
`cognitive_trials` to be nonempty. Unified FINAL writes `cognitive_raw_submissions`
(unified-final-submit.service.ts:496). Restore/browser were NOTRUN. Both original
failures remain; a new SHA does not reset their count. Further full replay stopped.

The continuation extends the existing fixed-official helpers only for that exact
PR385 run/source/checkout/job/artifact/digest. Metadata, original manifests,
output bytes, successful commands, exact unique case sets and 24-hour validity
are verified. Failed parent and PG conclusions remain explicit. No local
application assertion, old PR382 green, manifest relabelling, arbitrary producer,
new signer or fallback is accepted.

Main #386 changed only the standalone `src/scripts/cognitive-onboarding-check.ts`
inside the backend tree. Runtime modules, selected assertions, schema and
frontend bytes are unchanged; source search finds only the separate unselected
onboarding CLI test as an application-tree consumer. Both exact CLI blobs and
all other backend bytes are pinned. Only its nonconsumed change is normalized
when comparing assertion closures; all names, fixtures and dependencies remain
exact. The backend BUILD is invalidated because tsc includes that CLI: compile
once on current CI, then use the same new dist for PG/browser. Frontend build,
UI/backend/PG assertions and lock-bound audits reuse their original official
successes. The CLI's actual successful #386 CodeQL run `40856204332`, job
`123387826227`, source `d612c0981603b835774ee489991ec040e94e76c0`, checkout
`d23ac56880e188e350cc24e33d7d41601fd6d32d`, configuration and exact main tree
are independently verified alongside original application SAST. Current CodeQL
scans only the changed continuation/browser controls; queries/actions and strict
Chrome sandbox remain unchanged.

The original Actions database was destroyed before a dump existed. Restore uses
a fixed 193,446-byte compressed synthetic INPUT, minimized from this node's
already existing real-service fixtures to 148 rows / 45 tables with complete SQL
FK closure. All users have synthetic test prefixes. It is neither that lost CI
database nor accepted local PASS evidence. Loading it exercises no START/FINAL.
Formal restore compares all required storage hashes and actual DDL and checks
the restricted runtime role/schema. Empty `cognitive_trials` still exists in the
whole dump; only its false nonempty expectation is removed. Disabled compact
facts must still be exactly empty; other required native/canonical storage
remains nonempty. Fixture gzip/SQL hashes are pinned in the helper.

R's persisted PR382 fixes are retained. PR385 gets an exact ref/branch/approval
binding for the same root-owned, package-inventory/MD5-verified temporary `go-w`
tightening. Mixed refs, bytes, untracked paths and wider permission changes deny
before chmod. No sandbox privilege is added. Same-page Teacher resume does not
reload and must keep the same parent/item/answer through FINAL and feedback.

Control-unit contracts have their primary position locally; original successes
are retained and only changed/failed cases rechecked. Formal admission still
authenticates actual complete candidate/closures, producers verify official
proofs/bytes, and changed-control SAST executes. No local control log is called
formal application evidence. Next work: one changed-input backend compile,
missing restore and production browser, with changed-control CodeQL in parallel.
Expected 3–5 minutes restore, 5–10 browser, 2–4 backend compile; retain existing
job caps. A new error stops dependents and invalidates only relevant evidence.
No deployment, production data access or tool activation.


## Compiled initialization repair and final browser position

Run `40859479182` completed the fresh changed-input backend build, official
frontend/audit reuse, real restore (32 nonempty/default-empty storage tables,
full-row hashes, DDL and restricted runtime/schema), and 78-second changed-control
CodeQL. Browser stopped before launch while preparing an approved synthetic
source. The actual compiled artifact reproduced `Cannot access
education_applicability_1 before initialization`: two value imports were below
top-level Zod construction. This is our production initialization error and a
missed compiled-entry check, not evidence that the existing TS/ESM assertions
failed. Its original safe diagnostics, reporter and artifact remain retained.

The repair only moves those two imports to the header. Exact old/new schema
blobs and equality of its entire remaining body are checked. One-file CommonJS
compilation loads both the schema and executable registry; the same actual
approved-source service path then passes for both School/Teacher (0.633 seconds)
using an explicit local diagnostic overlay on the original dist. That overlay
is not a qualified build. A static pass over all 78 changed production TS files
found no other top-level use before its value import; no business matrix rerun.

Reuse run40859479182's completed restore through exact run/job/artifact/digest,
commands, fixed input and 32 table receipts. The PG job is now proof-only: no
Postgres/Redis containers, dependency install, migration, tests or restore replay.
Data schema, restore role/DDL code and input are unchanged by this import move.
Fresh backend compilation remains necessary for the changed CJS input; new
CodeQL includes the repaired schema plus changed controls. Original 58/200/14,
frontend and lock-bound audits remain reused. The missing browser journey is
the only new behavioral gate; current required gates remain real successes.
