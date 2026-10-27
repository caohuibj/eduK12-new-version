# Marker WIP: root NOWAIT fence integration

Base rescue commit: `2224f2ae087df5887c2cc97694a9f75437ce94f3`.
This supplement remains unvalidated WIP, not an extension of the qualified producer delivery.

`prelockEducationStandardSourceActors` discovers the original source owner,
marker owner/issuer, and subjects on the exact original content-grant ancestry.
It calls root's `lockEducationAssessmentUsers(tx, sortedIds)` before the original
Training owner/issuer SHARE validators. Discovery does not authorize anything;
the original marker hash, source identity, Training recipient, use-grant and
authority checks still execute after this fence.

Call sites are limited to the education producer's standard-source preparation
and the education branch of `verifyStoredTrainingStandardItem`, before recursion
into the original Training container. Ordinary Training callers retain their
existing path. Root owns the helper, issuer, distribution and authority changes;
none of those files are modified here.

At readback, remote integration HEAD `0e3d210d63ae1b6c74835265e12943cf6e84ec4e`
does not contain `education-tools/assessment-resource.locks.ts`. This patch names
the promised public interface and deliberately adds no duplicate implementation
or local stub. No fresh types/PG invocation was run against that missing dependency.
`git diff --check` exited 0. Root's actual concurrent account-mutation PG evidence
is still required; the earlier content-grant revoke case does not cover it.

Original marker loading failure (0 assertions) and prior types process receipts
remain preserved in the rescue manifest and raw logs. No CI, merge or deployment.
