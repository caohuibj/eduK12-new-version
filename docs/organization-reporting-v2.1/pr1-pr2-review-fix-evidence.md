# PR1 / PR2 post-merge review — START authority and recovery corrections

Review baseline: `main@3c5c75bcd27e9da76c06696ad201238178f611a0` (PR1 #118, PR2 #119).
Design reference: Huisurvey Development Plan V2.1, sections 2.2, 3.1, 3.3, 3.5 and PR2 C09–C13.

Both original ready-PR aggregate gates succeeded. Those results did not prove the missing scenarios below: the original lifecycle test explicitly expected CLOSE to abort an admitted claim. PR3 is not started by this correction.

## Findings and corrected behavior

| Finding | Impact | Correction / evidence |
| --- | --- | --- |
| New START checked respondent identity and Run status but not current Organization, frozen Membership/Persona, account, relationship, explicit deny or intake deadline | Revoked or expired authority could still admit a task | Admission validates current evidence under Organization/Run/Execution ownership and account/Parent row locks; StartClaim tests reject suspended org, ended membership, revoked persona, frozen account and expired deadline without leaving claim/provenance |
| CLOSE aborted CLAIMED work and refused UNKNOWN work | A committed admission could be lost; uncertain dispatch kept intake open | CLOSE shuts intake, expires only unclaimed ASSIGNED tasks and retains admitted/unknown claims; recovery can resume after CLOSE; dispatch/binding use the same lock order as lifecycle |
| Publish always inserted NULL consent | Parent and existing observer-policy tasks bypassed consent-bearing START/FINAL | Publish creates pending lineage roots using existing consent records; the exact respondent accepts through the Organization endpoint; repository validates organization resource-bound purpose; legacy consent-free Organization observer START/non-completed FINAL fail closed |
| First scientific freeze copied publish-time maturity and ran after claim commit | Admission could lack durable provenance or freeze an obsolete maturity | Resolve the exact resource at first admission and atomically commit frozen provenance, claim and admission audit; recovery preserves the first value |
| Publish replay returned before current publisher validation; publish bypassed explicit deny | Prior success or ORG_ADMIN membership could bypass present denial | Recheck membership/publisher authority and explicit deny inside the owning publish transaction, including replay |

PR1 review covered current principal hydration, platform role migration, Membership history, last usable administrator protection, tenant constraints and atomic governance audit. The existing focused suites passed; this is not a claim that every later reporting/history requirement is already implemented.

## Consent API and compatibility

`POST /api/organizations/:organizationId/runs/:runId/executions/:executionId/consent/accept`

The route validates the exact parent tuple, current authority and frozen respondent User ID. It does not require a matching legacy `User.role`. Acceptance creates an append-only accepted child of the pending root plus an atomic audit; replay does not add another accepted row or audit. START binds the accepted child ID. Existing runtime consent authority still rejects revoked consent at FINAL and preserves already-completed replay.

Supported observer visibility contracts use their existing scopes (`PRIVATE_RESPONDENT`, `ASSIGNING_TEACHER`, `SHARED_COURSE_LEAD`) with purpose `organization_run:<family>:<key>:<version>`. Unsupported Parent consent policies fail publication. No consent is automatically accepted by publication.

Previously published observer tasks missing a consent root cannot be silently repaired into accepted tasks. Unstarted affected Runs should be cancelled and republished to issue pending consent. Existing authoritative completed results remain unchanged; an affected non-completed runtime must not FINAL without valid consent. No history is deleted and no existing migration is rewritten.

## Validation

- Fresh isolated PostgreSQL 16: all 71 existing migrations applied successfully.
- Backend TypeScript build: passed.
- Focused PR1/PR2 and relational compatibility regression: **129 passed, 0 failed, 0 skipped**, 32 test files.
- Final consent audit/FINAL compatibility follow-up: allocation/Parent consent and runtime-consent suites rerun after the last change.
- `git diff --check`: passed.

Focused command (run from `server-version/backend`; set the integration URL and CI test encryption/pseudonym keys):

```sh
npx vitest run src/__tests__/integration/organization src/__tests__/integration/assessmentRun src/__tests__/integration/platformRole src/__tests__/assessment-relational src/__tests__/middleware/auth src/__tests__/modules/organizationAccess --maxWorkers=1
```

New/expanded evidence covers Parent and Teacher pending consent, accepted child binding, revoked consent, current Parent relationship revocation, mismatched legacy role, one Episode per Track/subject, CLOSE during external dispatch, UNKNOWN preservation, first-admission current maturity and durable freeze/audit. Production adapters remain limited to the existing transactional Composite bridge; the external adapter is a fault-injection fixture.

GitHub Full Gate on the fix PR remains the release authority. This evidence does not authorize merging or deploying, or certify PR3–PR5.
