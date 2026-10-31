# PR374 cloud continuation — review record

This is an API/database qualification and a Draft handoff for DOT review. It is
not a completed browser acceptance, Actions run, merge qualification or deployment.

## Candidate and change

- Remote main/base: `8774b1cf158dae1c5eb0f4950044c6ae6d6a18dd`.
- DOT handoff: `dece996eba527ed51c41e7488100c75fe55ff280`, tree
  `188466aecd4e246cd242b0d602ec80fb45bf411e`.
- Additional product fix: `3ad550800119b87ad355b52b5268a6fc38a542b0`, tree
  `fdf6a76ed46d36fd64813ee9c82abb5ff7fd0044`.
- This fix changes only `assessment-run/startExecution.ts`: the transactional
  Composite adapter used the relational transition's legacy occupational type
  after START admission had already frozen SELF. It now uses the admitted
  identity, checks current subject/respondent/episode/assignment/consent against
  that identity, and verifies respondent type when reconciling an existing
  binding. No old claim or old attempt is rewritten.
- The full main-to-candidate application inventory is in
  `cloud-candidate.json`; the final evidence commit is identified by GitHub and
  the handoff message, not a self-referential SHA in this file.

## One exact content fixture

Only the C1 `source.json` from commit
`75b956cbd4c45f75beee606fb53257494adc1ca0` is included under `fixtures/`.
`fixtures/manifest.json` pins its original blob and SHA-256. The isolated Node
process appends that source to the generated source array **before** importing
the real registry. The tracked generated registry and all production content
remain unchanged. See `evidence/cloud-load-c1.cjs.txt`.

Install, publication, combination approval/trials, precise Training/Survey use,
education distribution, target registration, independent business review,
publication, roster/registration/approval and Run publication used the existing
business functions. Management authorization bootstrap/proofs are explicitly
synthetic fixture inputs, not browser administrator MFA acceptance. Researcher
password/TOTP setup and participant login/FINAL used actual HTTP routes.

The source remains CANDIDATE/PILOT, localization review PENDING, with no scientific
review. School's STUDENT role is an adult synthetic technical identity. These
tests neither authorize real minors nor establish translation, science or rights
approval. Content/instruction/scoring/localization are 1.0.0, semantic report is
1.0.1, reference is none. Education target release IDs and audiences are explicitly
different; their template hash and approved source axis remain identical.
Derived content-store release versions can be hashes. They are not the semantic
report version or the instrument `sourceVersion`.

## Actually supported modes and observed results

| Entry/mode | Real qualification | Evidence |
| --- | --- | --- |
| Training authenticated STUDENT, active course member | START, same frozen resume, FINAL, same-submit replay, changed-answer 409, reopen COMPLETED, saved 30/report1.0.1, report read | `cloud-more-r2.json`, first case |
| Training anonymous public Composite link + private recovery credential | Separate attempt and actual capability boundary; resume, FINAL/replay/conflict/reopen, saved 30, report read; wrong recovery rejected | `cloud-more-r2.json`, second case |
| School registered/approved STUDENT, exact activity/run respondent | START/resume/FINAL/replay/conflict/reopen, then canonical 30 and current READY report | `cloud-http-r1.json` successful stages; only missing readback continued in `cloud-http-r2.json`, first case |
| Teacher authenticated SCHOOL identity with HUITEACHER session, same-person SELF | Fresh task after dispatch fix; persisted SELF, START/resume/FINAL/replay/conflict/reopen, canonical 30/report1.0.1 and READY report | `cloud-http-r3.json` |
| Survey SINGLE_UNLINKED recruitment capability + one-attempt secret | Existing attempt resumed after invalid synthetic payloads; FINAL/replay/conflict/reopen, saved 30, frozen Chinese metric label | `cloud-more-r3.json`, first case |
| Survey LINKED_WAVES research code + private identity credential | Same identity across two waves, separate FINALs; both saved 30; immediate feedback on wave1, AFTER_COLLECTION remains pending on wave2; wrong/revoked credentials denied | `cloud-more-r3.json`, second case |

School activity and Teacher assessment routes require their authenticated product
identity; registration/invitation links provision identity and do not create an
anonymous respondent lane. The selected Teacher assessment route is TEACHER/ADMIN,
not the separate student-invitation or student-feedback product. Teacher/parent
observer modes exist elsewhere but are not applicable to this SELF-only C1.
Training anonymous studies and Survey memorable/self code entry conveniences also
exist; their enrollment/recovery variants are not newly qualified here. Survey's
PERSONAL_LINK research identity and two-wave use are the actual tested linked
mode. No unsupported mode is invented or permission removed.

Seven canonical FINALs hold 30: four Composite Scale results and three Survey
results. `cloud-guards-r1.json` contains the four actual canonical result reads;
`cloud-guards-r2.json` continues only the remaining report/Survey/history reads.
`cloud-axis-r2.json` independently verifies all seven current immutable report
templates against the real approved combination and checks report axis
`version=1.0.1`, `sourceVersion=1.0.0`. It is the authoritative axis check; the
earlier provisional fallback comparison in guards-r2 is not qualification.

Survey's CLI inputs have no browser-observed clocks. The actual shared timing
sealer produced explicit `recoveredWithoutClock=true`, null first-response values;
no attention timing or browser interaction was fabricated. These telemetry
fields do not enter the scorer. This is HTTP/DB evidence, not ten UI clicks.

## Current boundaries, failure history and reuse

The actual cross-organization Teacher report request returned 404. Actual
`REPORT_READ` denial was installed through the existing organization business
service using the synthetic pre-existing ORG_ADMIN fixture; the same respondent's
report then returned 404 (`cloud-guards-r2.json`). No report was deleted.
Distribution retirement alone preserves already accepted history by the existing
HISTORY contract; it is not a participant REPORT_READ revocation. Survey's
revoked credential rejects General and the deferred wave does not disclose metrics.

All original failures remain:

- HTTP r1: School's final/replay/conflict/reopen succeeded, then the helper used
  a nonexistent Prisma `results` field; Teacher START succeeded but GET failed
  with `RESPONDENT_TYPE_NOT_ALLOWED`. The old parent remains IN_PROGRESS/TEACHER.
- The first new Teacher fixture hit the existing target uniqueness constraint.
  The helper continued from that actual target and created a fresh event/run.
  HTTP r2 still selected the old failed attempt and is not post-fix success.
  Only the new task in HTTP r3 qualifies the dispatch repair.
- More r1: wrong Training `{attempt:...}` envelope handling; Survey project
  preparation lacked explicit linkage notice; wrong Survey public option IDs.
  More r2 qualified both Training paths but Survey rejected missing timings.
  More r3 resumes the actual retained identities and uses explicit missing-clock
  markers; no previously accepted FINAL is re-executed.
- Guards r1 expected distribution withdrawal to withdraw historical REPORT_READ,
  and compared a derived release hash to 1.0.1. Axis r1 then confused report
  `sourceVersion` with report `version`. Those helper assertions remain failed.
  Current REPORT_READ and the precise real-axis continuation passed separately.

DOT's original 29 indexed files still match every recorded SHA-256. Its selected
identity4, instruction3, label2, SurveyUI6, target-report3, PG2 outcomes are not
rerun. The dispatch patch is not in the execution dependency of those direct
helper/binding cases. School's earlier SELF dispatch returned the same identity
as its frozen claim; its already accepted FINAL is reused and read back, not
resubmitted. The frontend tree is unchanged, so its explicit retrospective type
receipt retains its original limits. Backend types ran after the added PG test,
then only again after the actual dispatch source changed: cloud-r2 is the final
receipt, not an empty-log inference. It records real command, exit0, timestamps,
Node, input hashes, generated Prisma schema and exact backend tree.

Executions are unsigned local/cloud observations. They are not Actions tests or
historically signed statements. Full original dependency byte manifests were not
captured; no equality with DOT's installed environment is asserted. Fixture loader,
scripts, source associations, execution receipts and public-file hashes are
retained. `cloud-redactions.json` names any credential-only transport redactions;
private originals stay outside Git. No raw credentials, cookies or DB URL belong
in the published evidence.

## Browser and CI handoff

Cloud Chromium with `chromiumSandbox:true` fails before any page at the SUID
sandbox helper. Correct writable XDG directories did not resolve that failure.
The helper is owned by nobody rather than root. No chmod/chown, sandbox removal,
security escalation or alternate bypass was attempted. See
`cloud-browser-preflight-r2.log` and its execution receipt. The brief terminal
transport outage recovered; preserved local state was checked before continuation.

**BLOCKED:** actual current browser answering, visual instruction/Survey label
display, Training dark-report contrast/overflow, print/light preservation. No
current screenshot or full UI PASS is claimed.

**NOTRUN:** Actions/SAST, Ready, merge, deployment. Production was not accessed.
No cognitive task, content branch, protection, secret or safety configuration was
changed. Only this Draft fix branch is owned here.

The existing `onboarding-structure` bindings name PR372; PR374 is not currently
admitted to that route. Do not Ready this candidate or borrow PR372's green run.
The concrete next bounded CI plan for DOT's independent review is:

| Proposed selected work | Purpose and budget | Reuse / missing work |
| --- | --- | --- |
| Exact PR374 source scope and reviewed-original admission | Pin complete base/head/tree, source/merge tree, all blobs/modes and actual consumers; 5 minutes each | Encode PR374 explicitly in the existing bounded consumer; require actual DOT decision. Do not rerun the above application/type/PG results |
| Targeted browser qualification on a supported, sandboxed runner | Missing UI/contrast only; one frontend artifact, 15-minute job ceiling; report actual wait after 5 minutes | Browser fixture vs real authenticated UI scope must be explicit. No default full-platform, backend or repeated API suite |
| CodeQL JS/TS | Changed admission/dispatch/report-selection/feedback and frontend paths plus changed controls, existing query policy and 30-minute ceiling | New actual SARIF required; keep all findings and independent disposition. No old PR green substitution |
| Existing stable merge gate | Require every selected result and exact non-Draft candidate; scope/gate existing limits | Missing/failed/skipped/cancelled work blocks merge |

The PR374 routing/browser execution controls are **not implemented or activated**
by this evidence commit. This record makes the real remaining work reviewable;
it is not a self-approved admission. First review the added dispatch repair,
raw continuations, source compatibility and unresolved UI scope. After bounded
control preparation, freeze a new exact control checkpoint for DOT before any
activation. No full CI fallback or fabricated signatures are authorized.

Initial evidence packaging verification failed for the two API-r2 service logs
that appended graceful-shutdown output after indexing. The first Draft push
45e76c379 retained that stale index because the shell did not fail fast.
`cloud-index-correction.json` preserves the failure and before/after hashes; the
continuation freezes the stopped process logs without rewriting them or rerunning
application checks. Raw log whitespace warnings are retained as original bytes.
