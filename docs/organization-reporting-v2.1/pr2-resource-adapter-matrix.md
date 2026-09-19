# PR2 C04 — Resource Authority / Runtime Adapter Capability Matrix

This matrix separates **owning-resource authority** from **Run START capability**. Exact resource lookup is not evidence that START is recoverable.

| Family | Exact authority today | Runtime target | Transaction mode | operationKey lookup proven | Safe cancel proven | Run V1 START after C04 |
|---|---|---|---|---|---|---|
| BUNDLE | RelationalProductRegistry exact identity | Composite when published entry declares it | DB-capable | not wired yet | no | disabled |
| SCALE | RelationalProductRegistry exact identity for RA products | Composite when declared | DB-capable | not wired yet | no | disabled |
| FORM | RelationalProductRegistry exact identity for RA products | Composite when declared | DB-capable | not wired yet | no | disabled |
| SITUATIONAL | RelationalProductRegistry exact identity for RA products | Composite when declared | DB-capable | not wired yet | no | disabled |
| COGNITIVE | separate Cognitive owning authority; no RA product adapter | Cognitive | external/independent runtime | not wired for Run | not proven | unsupported |

Rules enforced in code:

1. Exact `(family,key,version)` only; no `latest` fallback.
2. DRAFT/unreleased resources cannot publish into a Run.
3. Track roles/relationships/perspectives may only narrow owning applicability.
4. Run cannot replace visibility policy or lower `minimumRespondents`.
5. An external adapter cannot be marked `runV1Enabled` unless stable server operation-key lookup is supported.
6. A DB-transactional adapter cannot be enabled unless its START mode is explicitly transactional.
7. FINAL authority always remains the existing canonical Runtime.

C12 is the only place allowed to flip a production family to Run-enabled after dispatch/recovery evidence exists.
