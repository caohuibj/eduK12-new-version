# Teacher longitudinal closeout: exact owner handoff

This follow-up starts at Draft #440 `b4670dd5eeb50af402ec51599ca572286abf8bfb`, tree `d6f2708d72ffab3cf49671cf1ba6061c10d3ec6b`, based on main `f5fa29314eb731f0479b90ae962b731da8e08d34`. It contains documentation/preparation only. #440 stays frozen and Draft; CI41172913061 passed scope only. No Ready qualification, merge or deployment is claimed. This record is not an extra review gate.

## Group-owned producer interface

Owner file: `server-version/backend/src/modules/huiteacher/numericGroupReport.service.ts`, `generateTeacherNumericGroup`, currently lines200–217. Longitudinal caller: `huiteacher/groupLongitudinalReport.service.ts`, inside the per-wave loop after exact plan/C/leaf resolution. The caller will be the only new internal consumer. Do not copy or replace `generateOrganizationGroupAnalysis`, cohort logic, metric statistics, current disclosure readers, or the existing Teacher transaction.

Suggested minimal signature, to be implemented by the original Group owner:

```ts
export async function generateTeacherNumericGroup(
  input: TeacherNumericScope & {
    trackId: string; leaf: ReportingLeafSourceV2;
    specId: string; selection: EducationGroupSelection;
  },
  internal: { allowPartialSourceMetrics?: true } = {},
)
```

Current guard unconditionally rejects `spec.metricRules.some(rule => !run.allowedMetricKeys.includes(rule.sourceMetricKey))`. In the internal mode it may accept a superset only when at least one real source rule is allowed. Default calls must retain the existing rejection. Keep the resolved exact released source, per-leaf filter, current audience/N/delay, actual contributor differencing and same-transaction artifact/audit path. A callback, new result table or new reporting spec is unnecessary. The HTTP body remains strict and must not accept this option.

Once the owner supplies the exact commit/delta, the sole call change here is:

```ts
const safe = await generateTeacherNumericGroup(
  { ...input, eventId: source.wave.eventId, trackId: source.trackId,
    leaf: source.leaf, selection: bindings.selection },
  { allowPartialSourceMetrics: true },
)
```

A reproducible counterexample is defined without rerunning any FINALs:

1. Published plan freezes same leaf/C with metrics A and B, and an existing GROUP spec has both rules. T1 organization and leaf contracts allow A/B; T2's new lawful source version allows A only. Both rounds have sufficient effective N.
2. Current T2 producer throws `REPORT_SPEC_SCOPE` before the existing engine. The longitudinal service already retained A in `allowedMetricIds`, but cannot obtain A's otherwise permitted summary.
3. After the internal interface, A remains numeric in both rounds. T1 B remains its originally allowed value; T2 B and its adjacent/baseline deltas are null/suppressed. No count or numeric value for B is restored.
4. A default single-report call with the same T2 spec still rejects. A source with no authorized planned metric remains a whole null round and skips the producer, as #440 already implements. HTTP caller-supplied `allowPartialSourceMetrics` already has a 400 assertion.

Only this new partial-contract boundary needs a focused producer/adapter sample. Reuse the original 20 completed native FINALs, prior authority/transaction and common projection proofs; no new all-tool PG or browser matrix is necessary.

## Supported matrix and exact Form distinction

| Source | Existing plan and SELF path | Current single-wave GROUP | #440 numeric longitudinal |
|---|---|---|---|
| Registered original Teacher GROUP Scale | Existing frozen Run plan/next Event | Existing explicit V2 contract | New native two-wave/20 FINAL proof; values1/3, N10/10, saved reads0 canonical decodes |
| Library Teacher GROUP Scale | Existing frozen numeric plan | Existing licensed V2 source | Thin adapter consumes the same source interface; not claimed as a new library two-wave journey |
| Education-assessment V2 Cognitive/SJT and legal Bundle leaves | Existing actual-mode frozen leaves | Existing Group-owned native consumer | Thin adapter resolves actual slot/C/profile; no Profile aggregation; not a new all-protocol journey |
| Private education-composition Scale/Cognitive/SJT | Personal SELF plans/next waves already exist | Remaining Group-owned single-wave consumer | Consume that owner interface; do not substitute native Bundle or invent another collector |
| Native Teacher Form NUMBER/SLIDER | Answers exist, but no numeric measurement choices/plan/next-wave binding | Current report explicitly withholds numeric aggregation | Not connected by #440; needs the distinct release and plan work below |
| Form inside an ordinary private composition | Numeric answers may exist; explicit non-Form restriction in longitudinal declarations | No automatic numeric GROUP rights | Existing completion-only boundary, not a scored leaf |

Original requirements must be distinguished:

- The original general implementation instruction covers Forms **with explicit numeric meaning, frozen question/unit/encoding and an available authorized source**; it forbids treating category codes as continuous scores or inventing psychometric scoring for unscored Forms.
- The original longitudinal specification's Teacher row, L4 and LA-11 explicitly exclude unscored native Form from personal continuous scores. It also says pure numeric-looking Forms are not automatically measurements.
- The user-approved Hui closeout plan `40a190e0cc308147ab29f43c1fc5e7f7` explicitly calls native Teacher numeric Form a conditional scope item, requiring confirmation before a third slice. It is not part of its definite PR2 existing numeric-source commitment. User direction to finish the original work does not by itself resolve this explicit condition.

Concrete source facts at this candidate:

- `assessment-core/form/definition.ts` admits NUMBER/SLIDER and number constraints but has no measurement-unit/encoding declaration.
- `huiteacher/formRunResource.ts` freezes the native runtime as `HUITEACHER_FORM_V2`, `UNSCORED_FORM_V2`; respondent/subject are COMPLETION_ONLY and organization metric keys are empty.
- `huiteacher/groupReport.service.ts` only releases SINGLE/LIKERT/MATRIX/MULTIPLE/MATRIX_MULTIPLE distributions. NUMBER/SLIDER explicitly return `AGGREGATION_NOT_RELEASED`; they do not already have a safe numeric mean to consume.
- `reporting/education-personal-tracking.ts` only enumerates COMPOSITE runtime measurements. Native Teacher Form is not COMPOSITE and is skipped.
- `createNextTeacherTrackingEvent` accepts the existing Scale/library/private/composition/native assessment prefixes, not `huiteacher-form:`. Current #440 leaf binding also explicitly rejects FORM rather than fabricating a canonical scored leaf.

If the pending decision includes native Form numeric GROUP longitudinal, the minimum separate slice is: (1) a publisher explicitly permits a selected field's numeric group use in a new frozen Form version, with question/unit/encoding identity, old versions unchanged; (2) existing Run plan choices/freezing and native next-wave binding support those authorized fields; (3) current native Form FINAL facts yield an authorized single-wave numeric summary through reused aggregation/privacy machinery, rather than a second collector or converting category distributions; (4) that safe summary feeds the existing shared independent-wave projection, snapshot/history and #440 UI. No new table, account platform, paired analysis, Profile or personal Form report is implied. This is more than adding a report button; the exact pending decision is whether to authorize that new numeric Form release/plan slice while keeping the old completion-only and numeric-withheld versions unchanged.

## Qualification preparation that does not depend on the owner patch

Current main is still exact basef5fa, with no new merge conflict. The full42-path #440 diff and production blobs were read; `static-review.json` captures the immutable identities and current findings, not an independent security audit.

Existing route is already pinned to #440. When the owner delta is integrated, update only affected source/file/component pins and run the new boundary sample. One actual final-image build provides backend compilation; don't run another full local compiler. Existing CI frontend types/changed lint provides full app coverage beyond the selected-module local check. Only the added TEACHER CHECK needs a nonempty exact-main upgrade plus native dump/restore through the existing job; fresh-database fixture setup is not that proof. Backend/frontend audit reuse must still verify identical locks, original successful step and24h age. Existing scoped SAST and HIGH/CRITICAL image scans keep their thresholds. No new workflow or qualifying layers, no replay of old22/37 observations or20 FINALs. Expected budget is the established migration/frontend and image jobs in parallel, roughly5–10minutes; report the actual slow job after5minutes instead of broadening tests.

Don't start expensive qualification on the knowingly incomplete producer interface and then rebuild the same inputs after it changes. Prepare and preserve exact evidence now; activate once the complete small source delta is frozen. This is a dependency choice, not a new user approval gate. Native Form's undecided release scope stays on a separate branch from definite PR2.

## Scope correction after the development confirmations

The user's later clarification explicitly excludes native Teacher numeric Form longitudinal from this development round. The preceding Form discussion is a retained plan only; it is not an authorization to implement or a blocker for #440. A local branch was prepared and existing code read, but no new Form production code, tests, schema, release or PR was added. Continue #440's existing numeric-source scope and its Group-owned partial-source/private-composition dependency. The user confirmed the earlier development/upload requests, not this separate Form expansion.

## Current-main preparation after DOT #439/#442

Actual main `769141d5bc4954919b163a8d8d522530048fbfb6` was merged without conflicts into the independent preparation branch. All six #440 runtime source blobs and its TEACHER CHECK migration remain exact. Main changed School login and the student questionnaire retry, not Teacher/group report implementations. `static-review.json` records those identities. Do not rerun the nine local feature cases or twenty FINALs. The initial Draft scope success remains bound to b467/f5fa; it is not relabelled as current Ready qualification. Final base/source pins must include the Group owner delta once, then use the same original qualification route. No new feature PR is opened for preparation/docs.

## Actual Group interface delivered and consumed

Group #443 is merged as mainf941e745d1c4148bd2e692a1c6e75af847d93fa5 (producer head5f72668a2e35192086184408c8ee744f87814bea). The exact `allowPartialSourceMetrics` second argument is now used by this service. One new planned A/B→onlyA mock adapter boundary passes; the previous nine cases,20 FINALs and upstream producer proof were not repeated. Private education-composition source remains the only missing owner source delta; no native Form expansion is included. Keep final Ready qualification tied to that complete small source rather than prebuilding an incomplete backend.
