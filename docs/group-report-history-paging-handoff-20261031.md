# Task artifact history: proposed minimal shared interface

Coordination proposal only; no `task-artifact.ts` / `group-longitudinal.ts` edits in this slice. Long owns the unpublished School namespace. Its actual `TaskArtifactSource` union must be retained verbatim when integrating; the old local SURVEY/TRAINING-only file must not replace it.

```ts
export type TaskGroupVersionCursor = {
  generatedAt: string
  artifactId: string
}
export type TaskGroupVersionPage = {
  artifacts: Array<{artifactId: string; generatedAt: string}>
  nextCursor: TaskGroupVersionCursor | null
}
export function listTaskGroupArtifactsPage(
  db: Prisma.TransactionClient,
  source: TaskArtifactSource,
  before?: TaskGroupVersionCursor,
): Promise<TaskGroupVersionPage>
```

Keep the same exact product/container/task predicates. Seek `(generated_at,id) < (beforeAt::timestamptz,beforeId)` in descending order; fetch 26, return 25 and the last returned pointer as the next cursor only when there is another row. Use a UTC ISO timestamp with all six PostgreSQL fractional digits for the cursor. Return no encrypted payloads and read no FINALs. The existing array-returning `listTaskGroupArtifacts` may remain as a wrapper around the first page of this one query implementation, preserving current School callers.

Survey should apply its existing exact project/wave access guard before paging. Training must authorize the requested actual task before applying the query limit: its current course-wide LIMIT25 followed by a catalog-based filter can hide a permitted older task. `listTrainingGroupTasks`' recent100 catalog is not an authorization set. Expose/reuse metadata-only frozen-course/creator/course-owner checks for composite, standalone Cognitive and standalone Scale; do not load/decrypt all task results to authorize history. Preserve rejection of old standalone Scale results without frozen course attribution. Then Training can offer task-scoped “更早版本” from the same page interface. Source catalog paging is a separate concern.

Teacher's organization-artifact consumer now has its own corresponding pointer page in `huiteacher/numericGroupReport.service.ts` because it uses the existing organization artifact store, not task-artifact storage. It does not alter this shared interface or School behavior.

## Small shared delta needed by Teacher partial samples

- `ReportingGroupArtifactPayloadV2.metricContributorExecutionIds?: Record<string,string[]>` is private frozen metadata. Existing inputManifest remains authoritative; only a visible metric with a subset of resolved inputs stores extra execution references.
- Existing `buildReportingArtifact` fills this map inside its existing quality/numeric acceptance loop. No second calculation or result resolver.
- `generateOrganizationGroupAnalysis` gains optional internal `beforePersist({cohort,payload})`. Existing callers and `beforeCompute` are unchanged. Teacher invokes existing differencing checks under its existing disclosure lock after contributor resolution and before persistence.
- These three shared files need a small delta integration in Long's worktree, not whole-file replacement. No metric references appear in the public authorized projection.

The partial-sample evidence and real verification limits are in `docs/evidence/teacher-group-partial-population-20261031/README.md`. No production schema, permission or data changes are proposed by this paging interface.
