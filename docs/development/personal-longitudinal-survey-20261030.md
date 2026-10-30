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
