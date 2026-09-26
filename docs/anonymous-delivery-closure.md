# Anonymous / Public Delivery Closure

Base: `main@6d670cd5`, after PR #170 (individual longitudinal reporting).

## Plan status

- PR #169 delivered report-time label/class cohort selection and automatic group longitudinal planning. The same selector applies to a single measurement, repeated cohorts, and matched longitudinal reports.
- PR #170 delivered individual longitudinal discovery, generation, scoped reading and export.
- This PR completes the remaining anonymous delivery product work from the original plan. It does not introduce anonymous group or longitudinal reporting. Publishing validated reporting specifications and verifying the full deployment gate remain release prerequisites, not automatic side effects of these changes.

## Product behavior

One link manager now serves legacy questionnaires, standalone cognitive assignments, legacy composites, four-type questionnaires and Bundles. Managers choose an exact expiry and a non-negative integer quota (zero means unlimited), inspect created/expiry dates and used/max counts, copy links, refresh or disable a selected link. Expired, disabled and exhausted states use the actual service fields. Missing recoverable tokens are visibly unavailable. Resource changes and failed management reads clear old bearer links.

The frontend adapter delegates to the three existing authenticated token APIs. Authorization, encrypted bearer storage, one-way recovery hashes, atomic quota claims, rate limits and PoW remain in the existing services. No new token table, anonymous runtime or migration is added. Legacy questionnaire creation also accepts an exact `expiresAt`; existing `expiresDays` callers and the 30-day default remain supported. Ambiguous deadlines, past dates, dates beyond one year and invalid quotas are rejected. Composite expiry cannot exceed the assessment deadline, and the link manager no longer silently extends that deadline.

Reopening a legacy questionnaire with a saved session and recovery capability reads the authorized attempt first. Completed attempts open their result; in-progress attempts resume. It does not consume another slot or consult an exhausted global entry link. Rejected capabilities display an error rather than silently starting another attempt. Existing cognitive and composite recovery already follows this order and is retained.

Recovery retains each runtime's existing lifetime: legacy questionnaire capabilities expire after at most 24 hours, bounded by entry expiry. This change does not promise indefinite retrieval, cross-device credential recovery, or identity matching between anonymous attempts. Anonymous results remain outside Organization group and longitudinal reporting.

## Validation

- PostgreSQL lifecycle tests exercise the final available slot under concurrent starts, encrypted token persistence, management ownership, cross-attempt credential rejection, completion/report read, and recovery after entry exhaustion, disablement and expiry.
- Cognitive coverage completes a real FINAL, replays it idempotently and reads the completed result with the original capability after the entry closes.
- Questionnaire controller tests cover exact and legacy deadlines, permission checks and invalid inputs. Existing capability and rate-limit tests remain in force.
- Frontend tests cover all three adapters, quota validation, clearing stale links and completed/in-progress recovery without new starts.
- The existing real-browser questionnaire scenario now uses the shared link manager with a one-person quota and reopens the completed report from the exhausted entry. This scenario was updated and syntax-checked locally; remote browser acceptance remains required.

The expanded PostgreSQL suite already belongs to CI's mandatory non-skipping integration list. Full CI must pass on this PR before merge.

Local results (2026-09-26): backend production build passed; 13 PostgreSQL lifecycle tests passed; 9 controller tests passed; capability/rate-limit/credential/wrapper suites passed (13 tests); frontend typecheck and all 141 suites / 534 tests passed. Changed-file lint has no errors; existing page warnings remain. Browser script syntax check passed; the real-browser scenario has not been executed locally.

The follow-up [Reporting V2.2 closure](reporting-v2.2-closure.md) wires the real questionnaire browser scenario into the mandatory CI browser job and records final product acceptance.
