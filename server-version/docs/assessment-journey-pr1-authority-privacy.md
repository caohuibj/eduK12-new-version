# Assessment Journey PR1 — authority and privacy gates

Baseline: `main@b22fde42b57b18b07282526e1765f68b207d1714`

This PR is a foundation change only. It does not alter Scale/Cognitive/Situational
scoring, ONE FINAL semantics, canonical result identity, or existing report
calculations.

## Authority split

- Scientific/content publication remains owned by the existing content/package
  governance.
- Organization assessment delivery is separate from Organization governance.
- Current ORG_ADMIN membership has organization-wide delivery scope.
- Current TEACHER and COUNSELOR personas may use delivery APIs without receiving
  membership/persona/deny governance.
- Scoped professionals may list/read/edit/publish/close only campaigns they
  created. Preview/publish still re-resolve every pair and enforce existing
  class/client scope.
- Platform SYSTEM_ADMIN alone is not Organization delivery authority.

## Normalized contracts

`AssessmentJourneyPolicyV1` is a projection of owning applicability, not a new
scientific source of truth. It normalizes initiation vocabulary while retaining
the source-policy hash.

`AssessmentDisclosureProjectionV1` normalizes result audiences:

- RESPONDENT
- SUBJECT
- TEACHER
- PROFESSIONAL
- ORGANIZATION
- RESEARCH

and report modes without changing the underlying report payload.

Campaign/report policy may narrow source initiation/disclosure; it may not widen
it or lower an existing minimum-respondent floor.

## Fail-closed privacy gates

1. Cohort-only relational FINAL returns completion acknowledgement only to the
   respondent.
2. Generic Composite and Scale/Questionnaire report surfaces continue to reject
   aggregate/protected relational attempts.
3. Legacy Scale management record listing is standalone-only for TEACHER and
   ADMIN. Embedded Composite/Relational Scale children must be read through the
   parent authorization surface.
4. Bundle audience projections retain `rawAnswers = null` and
   `sensitiveContextValues = null`.
5. ORG_ADMIN delivery scope does not imply unrestricted individual-result
   disclosure; reporting remains separately authorized.

## Deferred to subsequent PRs

- unified participant Assessment Inbox;
- Parent SELF population;
- production relational content release;
- participant-facing longitudinal projection;
- teacher/org campaign UI;
- full per-content Who answers / Who assigns / Who sees publication gate.
