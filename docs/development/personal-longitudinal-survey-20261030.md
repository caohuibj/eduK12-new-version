# Personal Longitudinal, batch 1: shared contract and Survey

Base: `40799e96f34d12047f31507ca2eba87e31fc08d3` (main fetched on 2026-10-30).
This batch is a Survey SELF implementation, not completion of all four entries.
No unmerged measurement-version branch was copied.

## Behavior and storage

The publisher can select Longitudinal and leaf metrics at the first T1 freeze
in a LINKED_WAVES project. The existing publication transaction freezes the
plan and wave-to-leaf bindings together. SINGLE_UNLINKED stays unlinked;
already-published projects cannot acquire a retrospective plan. A stable metric
ID identifies the tracked output; the current draft/slot ID locates its leaf.
An explicit API binding permits a new draft location with the exact same
measurement identity. Whole-questionnaire `total` names are never flattened.

The existing C release supplies the measurement hash and units. Scale P/R
content selections remain in the publication/FINAL but do not affect raw-score
comparison. The full runtime scoringDigest is used only to verify a stored
leaf against its own publication, not for cross-wave comparability.

`POST /projects/:pid/waves/:wid/next` reuses Survey's project drafts, existing
Flow and package membership. It creates a draft with the preceding source
wave, consent, tools and operations; collection times and quotas require fresh
configuration. It does not unpack a Bundle. The existing source authority and
full-package checks still execute at freeze. Missing tracked tools or changed
C/protocol/unit block the publication transaction and retain the draft. ABCD
can become ABC or ABCE when ABC are the tracked tools. This does not make a
fixed Bundle editable. A changed current source draft must be resolved before
publication; there is no silent replacement of its measurement definition.

The plan's metrics and the tools' `longitudinalMetricKeys` are separate. The
latter are intersected with the existing frozen numeric feedback selection;
ordinary disclosure and native Bundle audience ceilings still apply on read.
This never grants a formerly hidden metric. Cognitive invalid/limited quality
does not become a valid longitudinal value.

The participant explicitly opens “我的变化”. A single authenticated request
returns NOT_CONFIGURED, WAITING or AVAILABLE; there is no eligibility request,
push, online AI, latest norm lookup or aggregation during answer saving/FINAL.
Existing single reports are retained. Dates use actual completion times.
Whole completed parents are selected before extracting any metric; Survey's
current unique participant/wave attempt constraint remains unchanged. The
shared selection helper supports completion-time ordering and a result-ID
tie-break. A missing value in the latest parent never falls back to an older
metric. Missing T2 breaks adjacent segments; the baseline-to-T3 delta remains
available with a missing-wave note. Zero, negative values and signed deltas
remain intact. One eligible metric opens the report without erasing the other
independently missing disclosed metrics.

Storage adds three nullable/defaulted columns to existing tables:
`survey_projects.longitudinal_plan`,
`survey_waves.longitudinal_source_wave_id`, and
`survey_participants.longitudinal_snapshots`. There is no Observation or third
report table. Existing publications/FINALs are not rewritten. The compact
projection is stored once as encrypted append-only entries keyed by source
identity on the existing participant, and reused after current identity and
consent checks. Each end wave has its own source selection; viewing T3 does
not overwrite a previously generated T1–T2 snapshot. Reads are limited to the
project's existing maximum 100 waves and one selected parent per wave, with
batch queries and at most one decryption per selected FINAL on a cache miss.
Project and published-wave source immutability are also enforced by additive
database triggers. Reverting application code requires keeping the additive
columns and compatible old readers; no destructive down migration is supplied.

## Validation and limits

Primary execution was this isolated cloud environment: Node 24.21.0, npm
11.9.0, Prisma 5.22.0, existing locked dependencies, PostgreSQL 16.15, Redis
7.4.11, and existing Chromium/playwright-core. No dependency or lock changes.
Prisma was generated for the current schema. Migrations ran only against the
explicit loopback `eduk12_test` database. No production database or deployment.

| Check | Actual result | Scope |
| --- | --- | --- |
| `src/__tests__/reporting/personal-tracking.test.ts` | 9 PASS | ABCD→ABCE, leaf identity, P/R independence, exact mismatch, parent selection, null/zero/signs, missing waves, partial metrics, cognitive quality |
| `PersonalChangesReport.test.tsx` | 2 PASS | dates, zero, signed baseline, missing segments and waiting state |
| `SurveyWaveStudio.tracking/feedback/content.test.tsx` | 17 PASS | publisher selection, independent disclosure, existing single prepare payload and content-selection consumers |
| real Survey PG/HTTP loop | 1 PASS | actual C publication, T1 freeze/open, FINAL, next draft, ABC T2, FINAL, both reports, cache reuse, old FINAL unchanged, wrong bearer/cross-project/revoked access refused |
| real Chromium loop | 1 PASS | actual Survey host, stable private link, T1/T2 answers saved via HTTP, single feedback and separate changes with chart/table |
| frozen-plan/source PG guards | 1 PASS | real SQL rejects rewriting frozen plan and published source |
| backend `tsc --noEmit` / frontend app `tsc` | PASS | current generated schema and existing type consumers |
| changed frontend ESLint | exit 0 | two hook warnings: existing Wave content-selection dependency and request-generation cleanup; no suppressed errors |

The PG/HTTP, Chromium and guard cases passed in separate invocations. Filtered
cases are not counted as rerun successes. Unit cases were rerun only after
their affected projection or adapter changed. The last adapter change limits
cognitive quality; the preceding valid Scale PG/browser fixture continues to
use the unchanged `interpretable` raw feedback branch. These are local cloud
results, not signed historical executions or official Actions qualification.

Original failures remain in `/tmp` raw reporters, not rewritten:

1. `longitudinal-survey-pg.json`: 0 PASS / 1 FAIL. The fixture sent a Date into
   canonical JSON hashing at the final old-record assertion. Replaced that
   assertion with exact object equality; no product/hash validator changed.
2. `longitudinal-survey-pg-browser.json`: PG/HTTP 1 PASS, browser 1 FAIL. The
   browser used the generic 127.0.0.1 product host instead of `survey.localhost`.
3. `longitudinal-survey-browser-continuation.json`: browser 1 FAIL / PG filtered.
   T1 completed, then the fixture did not select T2's participation disclosure.
   It now follows the actual “查看参与说明” control. Product consent was preserved.
4. The initial exploratory backend type check reported the missing
   `ResearchFrozenPublication` type import; it was added. Subsequent checks
   succeeded. No failure was treated as a CI execution or product acceptance.

Latest raw reporters: `longitudinal-core-quality.json`,
`longitudinal-ui-vitest.json`, `longitudinal-wave-ui.json`,
`longitudinal-survey-pg-browser.json` (PG success only),
`longitudinal-survey-browser-final.json` (browser success only), and
`longitudinal-guards-pg.json`. All reside under `/tmp`; the screenshot is
`/tmp/longitudinal-survey-browser.png`. They contain synthetic observations.
The committed test sources are the reproducible checks; no credentials or
database dump are included in this PR.

## Remaining boundary and CI

Training (including its stable anonymous Study), School and Teacher are later
batches. Survey's current Form single feedback is GENERAL_ONLY, so NUMBER and
SLIDER may supply typed internal raw facts but do not acquire personal numeric
disclosure here. Category codes are excluded. Survey's cognitive application
still admits only its existing fixed Go/No-Go template; this batch does not add
other cognitive protocols or cross-profile equivalence. SJT and fixed-Bundle
leaf adapters retain existing runtime/disclosure contracts; a new real native
Bundle/cognitive/SJT journey has not been qualified by the Scale-only PG case.
These limits must not be described as four-entry/all-tool completion.

This is a C data/publication/report change. Existing successful evidence is
reused only for its actual unchanged inputs. The CI error page was read before
the Draft action; applicable IDs include CI-001/003/006/008/009 (explicit
DB opt-in, schema/type dependencies, real identity, DOM/navigation, actual saved
results and provenance). No workflow, gate, dependency, security configuration
or source authority is weakened. The existing Draft route is the initial
official consumer; no Ready/full-platform run is activated by this batch.
Draft success will not mean final merge qualification. The exact candidate and
selected official results are for DOT's independent review before any merge;
APPROVE, merge, real-user publication and deployment are not performed.

## DOT review continuation: eligible nulls and frozen source inheritance

The two P2 items from the independent review of `68bfc81ed` are repaired:

- Numeric disclosure eligibility and its release time are now read from the
  same static policy/ceiling helpers used by existing single feedback. They no
  longer depend on whether the stored result happened to contain a calculable
  metric. Authorized null metrics remain in an available report, with distinct
  invalid/missing, not-executed, and pending-release notes. Wholly unauthorized
  metrics remain excluded; any one metric still needs two valid released points
  before the report is AVAILABLE. The saved projection's existing source-key
  kind advances to V2 for this semantic repair, retaining V1 snapshots. This
  does not add a renderer-version framework or latest-template regeneration.
- `tracking-source.ts` resolves the existing immutable source publication.
  Preflight, freeze, draft display and preview use that source for tracked
  leaves, even if the same editable Scale draft row has since been revised.
  Non-tracked content continues to use its current draft. Tracked fixed Bundles
  inherit every required slot without copying/unpacking them. The original
  catalog grant, source-version and published-release checks remain active at
  preparation/publication; an old frozen pointer does not grant continued use
  of a withdrawn source. No new table, column or universal clone was added.

The actual regression case revised A's original item key and scoring to a new
same-row draft, updated an untracked Form, and then created/published T2 without
manually restoring A. T2 exposed the original A definition, accepted its original
answer key and scored it as 1 (rather than the new draft's 9), while the Form used
its new content. The revised A draft remained intact in the library.

New primary checks, independently scoped rather than replaying the original 31:

| Check | Result |
| --- | --- |
| eligible-null/release raw adapter and projection | 2 PASS, other core cases filtered |
| fixed Bundle source selection/isolation | 1 PASS, other core cases filtered |
| inherited-source same-row mutation, real PG/FINAL | 1 PASS, old PG/browser cases filtered |
| existing raw-feedback and measurement-result consumers affected by helper extraction | 25 PASS |
| wholly missing disclosed metric UI | 1 PASS, old report UI cases filtered |
| existing Draft scope/strict selected-outcome contracts | 1 PASS, old scope cases filtered |
| backend and frontend app TypeScript | exit 0 |
| affected frontend ESLint | exit 0; one existing Wave hook warning |
| actionlint 1.7.12, shellcheck/pyflakes explicitly not run | exit 0 |

The actionlint archive came from the official release; its official checksum
was verified as `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`.
Original outputs are durably retained under
`docs/evidence/personal-longitudinal-20261030/originals/` with a byte/hash manifest.
The new targeted continuation outputs are retained alongside them separately.
No dependency tree, secret or database dump is included.

### Why the original Draft CI selected maintenance

The actual full raw diff included backend runtime, frontend and Prisma changes.
It correctly did not qualify as content-only, frontend-only or maintenance-only;
`content-scope.mjs` conservatively emitted `application_route=legacy`,
`scenario=platform`, `maintenance=false`. The existing workflow condition
selected maintenance for *any* platform scenario, and `requiredChecks` also
unconditionally required maintenance and mini-program in that Draft branch.
The maintenance job used `ci-maintenance.yml`, whose generic path contains
attachment launcher and `host-ops/ci-backup-smoke.py` checks. These exercise the
host backup/restore implementation; they do not apply this candidate's Prisma
migrations or restore its actual plan/participant snapshots. Cancellation did
not establish that those later steps had run. Original job metadata is retained
as `originals/ci-41007596628-jobs.json`; no missing raw job log is fabricated.

The minimal change bounds only this feature's *Draft* use of the existing
compile/type producers. A complete regular-file allowlist includes the product,
its additive migrations, direct tests/controls and this evidence directory.
Unknown paths/modes or a force-full request refuse this choice. Existing scope
and the stable gate independently recompute the actual complete diff. The same
backend job compiles TypeScript without replaying unchanged instrument manifests
or unrelated parent-portal tests; frontend lint/type checks remain selected.
Maintenance and mini-program are not required by this bounded Draft selection.
There is no new workflow, producer platform or claim of Ready qualification.
Ready, main and unrelated changes retain their existing requirements.

The cancelled `41007596628` and failing aggregate remain original records.
Before another automatic Draft activation, the cancellation, repair and selected
checking list are appended to the existing CI error page. The two application
P2 resolutions remain subject to DOT's independent disposition.

For an eventual Ready qualification, the relevant migration proof is an actual
main-schema upgrade plus native dump/restore of rows containing the plan,
source pointer, encrypted snapshots and existing FINALs, followed by unchanged
source/identity reads. That work remains NOTRUN in official CI. It is not waived
because the host backup smoke is unrelated, and no broad Ready run is started.

### Scope-only run 41010101874: advanced main / stale event base

The revised source `64c8389a0` received publication SUCCESS in 41010101744,
then CI 41010101874 failed at scope step 24 before any application job ran.
Its recorded PR base was still `40799e96f`, while the actual GitHub merge preview
`3dcaf7e31dac80c0c32ba8b29967c5beddf8246f` had parents
`0e8f1de8e7d68d7c8cc76230315abbbbbf47cf4d` and `64c8389a0`.
The preview tree therefore included 23 additional files already merged on main
(Skaalvik/COPSOQ materials and their generated index). The exact same scope
consumer reproduced an unplanned-path refusal with that old base and actual
preview. This matches the failing stage; the original raw stdout is unavailable
because its Azure Blob GET returned HTTP403. No alternate log retrieval was
attempted; annotations, run metadata and Git parent/tree/diff evidence are saved
separately in `continuation/merge-base-reproduction.json` and the original JSON
API responses. An annotation alone is not represented as the full error log.

A normal merge aligned the branch with main `0e8f1de8e` without widening the
allowlist or changing the product repair. Merge commit `71fc66ece` has exactly
that previously observed preview tree, `de3f3d76c70d8bd7a7d384bfa75e68b364da5839`.
Using the new base, the full current diff selects personal_tracking_draft=true.
No application suite was replayed for this metadata/base correction. The new
main's change consists of added instrument declarations/materials and their
index, not changes to the repaired projection, publisher, scorer or credential
logic. Existing local assertions retain their original execution identities;
formal compilation still consumes the actual integrated source. The failed
scope run and earlier cancelled workflow remain retained, with no rerun.

### Explicit T2 disclosure narrowing (DOT follow-up)

The immutable-source repair copied the prior wave's mutable participant feedback
and private content selection together with C. Because the normal freezers set
only selected entries, an explicit T2 subset or empty array could retain an
omitted tool's prior disclosure. This was a real disclosure regression in the
candidate `8733effe0`; its successful Draft compile/type CI 41010833671 and
publication integrity 41010833605 did not establish the missing assertion.
Ready/merge qualification is paused pending independent disposition of this fix.

Inherited C now drops participantFeedback, contentSelection and the previous
longitudinal output allowlist before ordinary publication binding. Explicit
arrays (including []) take precedence. Only an omitted field defaults to the
previous wave's exact per-draft choices. Intentionally inherited private P/R
goes through the existing current PUBLISHED/scope/measurement checks. Approved
combinations rebind their own P/R through the existing authorized binders;
native Bundle disclosure ceilings and reportConfigured=false stay intact.

Minimal verification: the two A/B→A and A/B→[] cases and the affected existing
fixed-Bundle inheritance assertion pass (3 passed, 11 filtered). Direct content
selection and participant-feedback consumers pass (33 cases, including the
explicit empty private P/R and revoked inherited P/R case). Backend tsc exits 0;
the modified Draft scope allowlist contract passes once. No database, browser,
full cognitive journey or original 31-case suite was rerun. Raw reporter/logs
and byte manifests are in continuation/narrowing-manifest.json.

The first worktree test command used a wrong relative dependency-link target;
npx consequently launched an unpinned cached/downloaded test tool. That process
was stopped; its possibly interleaved initial files are retained and explicitly
unqualified. The reported 3-pass result is the subsequent direct invocation of
the existing locked node_modules/.bin/vitest with separate `narrowing-locked`
reporter/logs. No lockfile or package manifest changed.

Training WIP is preserved separately in /workspace/eduK12-new-version on
feat/personal-longitudinal-training-20261030. This patch changes Survey only.

### Untracked C edits and main PR401 alignment

DOT closed the stale-feedback disclosure issue and the prior P/R status issue
at `2f8829d64`. Its next ordinary P2 found that default private P/R inheritance
also attached D's old pointers when untracked D legitimately changed C. Defaults
now retain private P/R only if both measurement release ID and content hash
still match. A changed untracked C stays unselected; explicit new selections
still pass the original current-state/scope/compatibility validator.

The single targeted untracked-D case passes (11 other cases filtered). It proves
the unchanged tracking source does not copy D, old P/R stays absent, incompatible
explicit old P/R is still refused, and compatible explicit new P/R succeeds.
No old 31-case suite or full feedback matrix was replayed.

Main PR401 `1cc077a8ee8e9475799788ab2b8bf5a4511630fe` was merged normally.
The sole conflict was the top import block of publication.service.ts; both the
tracking imports and the new cognitive-profile measurement import were retained.
The current source passed backend tsc and merged-workflow actionlint. No original
application journey was replayed merely for already-reviewed upstream code.
Raw targeted reporter, merge/setup logs and hashes are retained in
continuation/untracked-content-manifest.json. A wrong relative git-add path
initially left the resolved file unmarked; staging the exact absolute path
completed the merge. It did not change the resolved product source or qualify
any failed setup as an application pass.

## PR399 bounded Ready qualification after main PR407

Main `8cf07bfd35702222e279cbfeee2f64d73a938b55` was merged without conflict at
`ef0490e6371ceb7bdebe8c2f84f087977f5f362c`. All 24 changed Survey application,
test and schema files remain byte-identical to DOT-reviewed `a62c9a5763...`;
the main delta is the separately reviewed Training choice-pagination change.
The interrupted cloud environment was restored with that exact local commit,
tree `bdb0ac23a4e84cd6809286aa3c08feabbcd4e69b`, and retained worktrees/evidence.

The existing CI workflow now has a bounded personal-tracking route. A fixed
base, original reviewed Git object, complete raw diff/modes, all 24 application
blobs and locked dependency/build inputs must match. Unknown files, changed
main, altered originals or whole-platform force fail closed. Draft only
classifies; Ready requires scope, personal-tracking qualification, the existing
production-image build/scans and existing CodeQL. The stable gate recomputes the
source plan and refuses missing/skipped/failed required jobs. PR406/409 keep
stack order and receive no separate workflow.

The original 31 successful application cases and targeted repair/consumer
reporters are read, hash-checked against immutable a62 Git originals, and
validated using the existing original-report/failure-continuation verifier.
Their union is 71 distinct successful case names. They remain unsigned,
reviewed-local-evidence with ciExecuted=false; this does not relabel failed
original reports or claim GitHub replayed those application cases.

Missing qualification executes once in Actions: a nonempty exact-main schema
fixture is upgraded with the candidate migrations, old publication/attempt/
opaque FINAL bytes are compared, new defaults and immutable guards are checked,
and native pg_dump/pg_restore into a separate empty database must reproduce
facts and normalized schema. This is an isolated SQL schema fixture, not a new
scientific FINAL submission or a repeated business journey. The transient dump
is not published. Existing production image HIGH/CRITICAL scanning and changed
source SAST remain required. Locked audits and actual frontend app types/source
lint run in the qualification job; no whole-platform/performance/browser suite
is enabled.

Local preflight: three new admission/refusal/gate contracts passed. After adding
an immutable Git-original check, only that one changed admission contract was
rechecked. Actionlint initially found the invalid job-context PG_SERVICE env;
a targeted edit also caught an unrelated old PG_SERVICE line and was corrected
by restoring the original workflow before applying only this slice. Original
failed lints are retained, final Actionlint passes. Six fixture INSERTs passed
EXPLAIN-only validation on the existing isolated DB, with no insertion/migration
or application replay. This is preflight only; official run outcomes remain the
source of truth for Ready qualification.

School explicit-source subset configuration is an authorized following slice:
a permitted publisher may select only originally permitted own numeric metrics,
freeze them into a new source/task, and preserve old contracts/completion-only.
It does not change this frozen first candidate.

### First official activation: workflow definition rejected

Source f4647a7aa produced workflow-level failure 41026381661, attempt1, eventpush,
with no runnable jobs/check-run annotations; publication 41026390424 succeeded.
No migration, image, audit, types or SAST ran. `gh run view` identifies a workflow
file issue. The CodeQL config expression grew from 20,768 to 21,201 characters;
Actions' expression parser defines MaxLength=21,000 in its primary source:
https://github.com/actions/runner/blob/main/src/Sdk/DTExpressions2/Expressions2/ExpressionConstants.cs
This identifies an independently reproducible definition defect; GitHub did not
provide a more specific annotation through the available run/check-suite APIs.

The personal CodeQL paths now come from a short existing-style config-output
step. The longest expression is 20,815; Actionlint and the explicit length guard
pass. Only workflow configuration changed; original application cases and the
three admission/gate contracts are not replayed. Raw first failure and new
preflight records are retained in continuation evidence.

A separate mark-ready tool call returned isError=true. Its detailed error text
was not retained in the concise output; readback confirms PR399 remains Draft,
so no Ready qualification is claimed. This state transition is not retried via
another interface. Missing Ready jobs remain NOTRUN pending resolution of that
specific operation; ordinary independent work may continue.

### Second activation: moving-main preview refused, before application jobs

Run 41027089221 attempt1 source6deb65fb6 reached classification and stopped at job
123967664202. Actual preview de26f0103e28b059d22e26638e07de19ef3461b0 has parents
main1d95bf5d9c104dcc9d0ffa344858cb39a70212bd and source6deb; the event base still
said8cf. This exact preview reproduces the planned unknown-path refusal: newly
merged BAT/COPSOQ catalog files appear in the old-base diff. This is confirmed
from the real Git preview, not an inference from a missing job log. All native,
image, audit/type and SAST stages remained NOTRUN.

Main1d95 was merged without conflict at37a7d20e1db005fe88e63fc4140e3003c8a4e466.
Only the base pin/review note is updated; the 24 Survey application/test/schema
blobs still match reviewed a62. These main catalog additions are independently
governed fixed material, not the synthetic tracked sources. The changed
base/refusal control alone passes; no old31/application or broad control suite
is replayed. The failed original run/preview and diagnostic are retained. Before
any next activation the live PR base event is refreshed again. Another moving
base stops classification rather than broadening the allowed scope or repeatedly
launching full CI; no original failed run is rerun.

### Authorized Ready run: preserve successful images; fix admission CLI cycle

The user explicitly authorized Draft→Ready. The original tool succeeded at
source171f. Ready run41028537466 passed scope123972428313, SAST123972543793 and
production images123972544793. The personal qualification job123972544549 failed
before migration at original-reporter admission: Node exit13, unsettled top-level
await. The CLI dynamically imported onboarding-checks→content-scope→its own
still-evaluating CLI module. Imported unit tests did not exercise that entrypoint.
The exact first failure section and run/job metadata are retained; the failed run
is not relabelled successful.

The CLI now invokes the same original verifier in a short separate Node process,
where the Ready module has completed import. A new real child-entry contract
passes, along with the changed gate contract. No original business test reruns.
To honor one-build execution, the next qualification authenticates the successful
original image job via the existing Actions read token: fixed run/job/source,
completed successful required build/scan steps, <24h age, identical full
server-version tree and original reusable-image workflow/build script. Original
whole-run failure remains failure. Missing/failed/skipped/expired or changed
producer inputs refuse admission. The existing image workflow is unchanged.

With that explicit receipt, the required image checks are admitted within the
personal-tracking qualification job instead of rebuilding identical sources.
Scope/qualification/current SAST remain required. Two new entry/provenance
contracts and the affected gate contract passed; failed/expired/scan-skipped
producer fixtures are refused. Actual new Actions metadata verification and
native migration still must run. There is no retained deployable image archive
and no deployment qualification. Current SAST is selected again because the
qualification control code changed; application31/32/5 are not replayed.
