# Teacher Cognitive / SJT / mixed runtime integration

Base: `6cf241d65b4bc44878ef9d9fe21c81fdd02561cd`. This work does not register,
approve or publish any tool. No Training or School credential is accepted by
the Teacher authentication middleware.

The runtime factory requires a `TeacherAssessmentSourceAccess` dependency.
`readIdentity(db, {resourceKey, version, purpose:'NEW_USE'|'HISTORY'})` maps to root's
`readEducationAssessmentDeliveryIdentity` and returns `{origin, entry, identityOnly:true}`;
additional `runtime` and `releases` fields from the root reader are permitted.
The consumer independently binds the origin to the actual organization, exact
track policy/hash, SELF Teacher assignment and its exact Composite parent.
`assertUse(db, {identity, executionId, actorUserId, purpose})` must separately
check the original authorizer's current exact proof for new use, plus any
source-specific collection stop policy. The identity reader already validates
exact frozen C/P/R and runtime snapshots. Purpose is `START`, `BOUND_COLLECTION`
or `HISTORY_READ`. The participant guard owns current actor/organization access;
the manager-only `assertEducationAssessmentRunUse` is never a participant guard.
An identity-only reader is never a use authorization. Source retirement must
retain the existing bound-completion contract; emergency stop, actor revocation
and consent withdrawal remain authoritative. There is no permissive default.

Root integration must also put the same source/current-use checks inside the
shared START and FINAL transaction fences. An HTTP preflight alone cannot close
a concurrent revocation race. This worker does not edit the root-owned source,
START, shared FINAL, migration, policy or registry files.

Mount `createTeacherAssessmentRuntimeRouter(sourceAccess)` under
`/api/huiteacher`, after its existing feature/origin guards. The factory is not
mounted with a dummy source checker. Frontend assembly is available separately;
root enables it only together with this mount and the shared transaction checks.

API paths (relative to `/api/huiteacher`):

- `GET /my-assessment-tasks?cursor=...&pageSize=50`: bounded actor-scoped pages;
  task DTO includes execution/event/run/organization IDs, title, resource family,
  status, run status, existing parent ID and consent purpose/visibility.
- `POST /run-executions/:executionId/assessment-consent/accept`: accepts only the
  actual assigned consent. No browser-supplied consent or source identity.
- `POST /run-executions/:executionId/start-assessment`: canonical Run START or
  exact existing-parent resume; `STARTED` / `IN_PROGRESS`, never a new standalone
  Cognitive/SJT session.
- `/assessment-composite-attempts/:attemptId`: current-unit read and existing
  Form/Scale FINAL/media operations; all require the new exact source guard.
- `.../items/:itemId/cognitive/:sessionId`: frozen session read, image,
  video capability and one-shot FINAL only.
- `.../items/:itemId/situational/:situationalAttemptId`: frozen attempt resume,
  image, video capability and one-shot FINAL only.

The client validates exact parent/child IDs before transport. Completion comes
only from a fresh authoritative parent `COMPLETED` state. A child receipt,
empty current item or child callback cannot signal whole completion. The host
offers `onCompleted({executionId,attemptId})` and `renderFeedback(completion)`;
the report worker supplies the independently authorized feedback component.
Runtime reads and FINAL responses never grant or copy personal report access.

Local fixtures are synthetic source/HTTP/UI contracts. They are not actual
PostgreSQL authorization, immutable FINAL durability, content approval or
browser end-to-end qualification. Actual PG/race/browser coverage remains an
integration obligation until run and recorded against the combined candidate.

## Worker progress (2026-10-27)

The independent cloud environment is ready. Initial checkout `work` was clean;
remote main was verified as `7e6d7da4a01e4a42b410cf2dbdcfa76f11759fdc` and
integration as `6cf241d65b4bc44878ef9d9fe21c81fdd02561cd`. Branch
`feat/pr363-teacher-runtime` was created from that exact integration commit.
`AGENTS.md`, release rules, matrix and progress records were read. No nested
AGENTS.md exists in this checkout. The first interface-only commit is
`6a79351d0a9b6f998ddc8c2a90d9477948450321`, pushed and read back from origin.

Backend router/access guard, scoped clients, participant host and direct
synthetic HTTP tests are now authored in the working tree; validation remains
pending. The production source adapter and shared START/FINAL transaction
integration remain root-owned dependencies. No PG/browser/CI/merge/deploy action
has occurred. `runtime-table-policy.json` is outside this worker's changes and
will not be uploaded or used to bypass root's reported approval blocker.

## Implementation delivered

Product commit: `bad260a01406cae83e736ae7f6c3f7437e003b24`; tree:
`c5256958017d158c24be7dfd9a10aaf5a4086b87`. Pushed on the independent branch
and verified with `git ls-remote`; the integration branch was never written.
Root source commit `f46336cc45abaa21d4b946029cda2a0dfadec654` was fetched and
read only. Its new `runtimeDefinitionHash` is accommodated by the synthetic
fixture when that later contract is present; no merged-source run is claimed.

The participant SQL checks actual SCHOOL account/Teacher approval and expiry,
HUITEACHER entitlement, current organization/persona, exact event/run, SELF
subject/respondent, individual policy, assignment/episode and durable parent.
Every child additionally checks the encrypted frozen slot plan/hash/epoch;
Cognitive and SJT compare the child's compiled runtime, and SJT also its frozen
definition. Canonical FINAL services retain idempotency and durable storage.
The HTTP tests mock those services; they do not prove storage durability.

The frontend uses the injected Teacher API for JSON, binary material and video
capabilities. It never falls back to a Training client or raw `fetch`. It loads
the shared Cognitive/SJT runners through their neutral embedded/host bindings.
The unified inbox lazy-loads this source only when `assessmentRuntime` is
explicitly supplied, preserving the existing Form/Scale assembly. Only a fresh
parent COMPLETED state emits the completion callback. Late responses after
exit, API or account change cannot restore an old task.

Integration still required:

1. Supply `readIdentity: readEducationAssessmentDeliveryIdentity`. Its return
   retains `authority`, `runtime` and `releases`; the runtime never serves those
   internal objects as a participant response.
2. Supply the separate `assertUse` implementation. For START, validate the
   returned original authority proofs with `assertEducationDeliveryIssuerCurrent`;
   never require the respondent to be a manager or substitute a current arbitrary
   administrator. HISTORY is exact source identity only. Bound continuation
   retains the existing retirement/consent/current-account contract.
3. Finish root's production COGNITIVE adapter and exact source/C/P/R bindings in
   shared START/FINAL transactions. Preflight is insufficient for revocation races.
4. Mount the required-source router in backend `index.ts`, then supply
   `assessmentRuntime={{onCompleted,renderFeedback}}` (or `{}` for completion only)
   to the existing inbox in `HuiteacherApp.tsx`. Neither production enablement is
   performed by this worker while the transaction consumer is absent.
5. The report worker provides the independent authorized feedback component. The
   runtime provides completion, pending/error/retry UX and never copies report
   access from a child submission or Training result.

See [the evidence index](teacher-runtime-evidence/README.md) for exact commands,
exits, original failures and limitations. No CI, production build, merge,
deployment, protection or credential change occurred.
