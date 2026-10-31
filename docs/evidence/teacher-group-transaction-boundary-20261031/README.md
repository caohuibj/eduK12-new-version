# Teacher disclosure lock and Artifact transaction boundary

Local correction to 21f15b91627a3d3a500957f9d1af837324389675. No external writes, formal CI, merge, deployment, schema or production permission changes.

## Confirmed original failure path

Original `generateTeacherNumericGroup` acquired the advisory transaction lock in an outer Prisma transaction with timeout60000. Its `beforePersist` called `assertTeacherNumericDisclosure` through global prisma. The shared `generateOrganizationGroupAnalysis` then called `createOrReuseReportingArtifact`, which opened a separate independent transaction. If the outer lock transaction expired or disconnected while global work was still pending, that independent Artifact transaction could commit after the lock had been released. A failed outer request therefore did not imply no new disclosure artifact. This path is confirmed from the original call chain; no production occurrence or actual sixty-second leak reproduction is claimed.

Original before blobs:

- reporting/artifact.ts: 244795010b5a7e94b5882d8a86f40c82e602a122
- reporting/service.ts: ee07290182fcf657060d7b6c0c17a675ba77a8b0
- huiteacher/numericGroupReport.service.ts: 7ba9e64f16f2eb95c01407a290c9e401251e85a5

## Minimal correction

Artifact's existing GROUP persist body now accepts an optional caller-owned TransactionClient. When supplied it uses that exact client for insert/reuse, integrity verification and governance audit; it never opens a replacement transaction. Existing callers without tx keep the original transaction path and isolation. The shared single-group generation function forwards its optional internal tx to this persist function.

Teacher passes its existing lock-owning tx both to the prior-disclosure comparison queries and through generation to Artifact persistence. Its timeout remains60000. Global preparation/authorized computation may still finish after a caller timeout, but they cannot commit the Artifact through an expired transaction; comparison/write fails closed. The normal saved Artifact read occurs after the outer transaction commits, avoiding a separate connection reading an uncommitted new Artifact. Cohort freezing is unchanged; no promise is made that rollback removes previously frozen cohort metadata.

`production.patch` is the exact three-file delta with zero context (`git diff --unified=0`; apply with `git apply --unidiff-zero`). No Longitudinal Artifact persist body, task-artifact paging, School namespace, privacy floor, role or scoring logic changed.

## One necessary counterexample

`postgres.json` records one actual isolated PostgreSQL / Prisma case. It reads only an existing synthetic native GROUP Artifact, makes a fresh synthetic candidate identity, acquires the real Teacher disclosure lock, and allows a controlled100ms Prisma transaction to expire before attempting persistence after200ms. The actual persist call receives that expired tx and returns P2028. Artifact rows=0, audit rows=0; a subsequent transaction reacquires the advisory lock.

With the original independent-transaction helper, the extra tx argument would be ignored and the independent insert could resolve despite the expired outer transaction. The test also requires persistResolved=false and the inner P2028, so an outer commit error alone cannot produce a false pass.

No FINALs, canonical result decoding, source publication, new participant assignments, old twenty-FINAL journey, broad PG or browser suite were repeated. `proof.json` retains the explicit counters. Backend types are run only for this changed candidate; frontend is unchanged and is not recompiled. These local receipts are not formal CI or signed execution attestations.
