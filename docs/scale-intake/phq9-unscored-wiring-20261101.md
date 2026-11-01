# Standard scale unscored supplements and PHQ-9 handoff

The PHQ-9 draft previously preserved its functional-difficulty question only in a
companion file. Ordinary CONTENT would create an item score, while attention and
social-desirability roles misdescribe that question and remain forbidden for
STANDARD sources. `purpose: UNSCORED` now uses the existing single-choice item,
typed response sets, frozen definition, answer storage and raw-export path. No
new question type, scoring engine, table, permission or approval gate is added.

The role is excluded from item scores, aggregate members and range/denominator
calculation. Authoring validation and runtime scoring reject attempts to add it
to a score; reverse/map transformations are not allowed. STANDARD still rejects
the two existing custom quality roles. Existing item purposes and defaults keep
their original bytes. The shared editor preserves and labels the imported role;
raw-long exports identify it as UNSCORED rather than CONTENT. Missing required
questions still follow their existing validation; a non-scoring question is not
automatically optional.

PHQ-9 uses nine unchanged symptom items and one optional functional question.
The latter uses distinct typed values and its own labels. The existing response
set schema requires numeric option scores, so this unscored set has zero-valued
technical placeholders. The scorer skips the entire item before consuming those
values: it does **not** emit a zero item score, affect the nine-item 0–27 range,
or put a missing functional response in the score denominator. Raw answers remain
subject to the original storage and export authority.

## Instruction and report path

Use the existing independently frozen source `instruction` for original guidance
plus clearly separated platform support text. The current standalone Scale
AssessmentShell, FinalQuestionnaireAssessment, WholeCompositeQuestionnaire and
FinalCompositeAssessment all render the current scale instruction outside any
collapsed questionnaire instruction. School/Teacher consume the same shared
composite component. SurveyTimedScale and TaskForm likewise render the frozen
instruction before the current question/all-at-once items. The one-by-one player
now permits forward navigation past an optional question without synthesizing an
answer; final completeness/scoring checks are unchanged.

The existing report disclaimer is independent of individual interpretations and
is retained for invalid/incomplete numeric results. This is where the PHQ-9 draft
keeps its independent support text. It does not derive suicidal intent or a risk
level from item 9 or the total, nor create notification/intervention authority.
Canonical Survey FINAL continues to reject insufficient research scoring data;
this patch does not invent a completed incomplete research FINAL. In-progress
instructions remain available, and a complete nine-item response may omit the
optional functional question.

## Importer owner handoff (#457/#458)

There is no importer-format change. Existing advanced `itemJson` accepts the new
purpose after this shared schema patch is integrated; ordinary columns can use
the literal UNSCORED in 用途. Existing C/P/R save, revision, preview and approval
services remain authoritative. The private PHQ-9 source is not copied into this
public code patch.

1. Integrate the shared patch before accepting the revised PHQ-9 content.
2. Read the existing administrator draft ID and its actual current revision.
3. Update the same `toolKey=phq9_zh_cn_research` draft with
   `{expectedRevision: <read revision>, draft: <private drafts/phq9_zh_cn_research.json>}`.
   Do not create a second formal phq9/phq9_en tool or assume a production revision.
4. Read back the incremented revision: C1.0.1, scoring1.0.0, Pnone-v1, R1.0.1;
   ten displayed items, nine scoring members, functional purpose UNSCORED,
   `required=false`, and unchanged independent support instructions/disclaimer.
5. Keep it unapproved for administrator final review. The production LOADTEST
   package and historical results are not changed, promoted or reinterpreted.

## Bounded validation

Only the affected contracts are checked: five new backend supplement cases and
two relevant existing quality-item regressions; three new frontend cases for
optional navigation, shared campus instruction visibility and incomplete-report
support; and six private exact-PHQ source/score/report/Survey checks. The previous
104 intake checks are not rerun. Both component type checks pass on Node24.21.0.

Original failures are retained privately: an unsupported Vitest CLI option did
not run cases; the first canonical test omitted one-by-one timing and was fixed
to explicitly test the intended all-at-once path, with only that failed case
retried. An initial frontend run on Node24.19.0 is historical, not qualified
evidence; the three new cases were run on the declared Node24.21.0 environment.
Backend types initially consumed a stale generated Prisma client; regenerating
the unchanged main schema resolved its missing longitudinal fields before the
single affected type-check retry. No database schema source changed.

The private bundle contains actual parser and isolated draft-revision evidence.
These local checks are not CI, production installation, formal approval, full
browser journeys, translation validation or clinical validation. CI, merge and
deployment remain under the parent thread's existing workflow.
