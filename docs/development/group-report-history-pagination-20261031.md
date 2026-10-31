# Shared group snapshot history: stable pages and actual Training task rights

Local continuation from `a71b366a4e0e7e6b8cc6ecfa4b6532a88f954633`. No snapshot generation, statistical engine, result projection, schema, permission grant or production setting changes. This slice reads only stored history pointers and the existing current source authority.

## Shared page contract

`listTaskGroupArtifactsPage(db,source,before?)` returns `{artifacts,nextCursor}`. A cursor is `{generatedAt,artifactId}`. The query retains exact product/container/task/kind predicates, plus the exact plan ID for `listTaskGroupLongitudinalArtifactsPage`. PostgreSQL seeks `(generated_at,id)` descending, takes26, returns25, and gives the last returned pointer only when another row exists. No OFFSET, payload read/decryption, FINAL query or new aggregate generation is needed. Both timestamp and ID are retained so equal generation times do not lose records.

SQL formats the stored timestamp as a UTC six-fraction string and consumes the cursor as `timestamp`, matching this table's existing UTC-without-time-zone storage. JavaScript Date never constructs the seek boundary. The current table is **TIMESTAMP(3)**; existing rows therefore end in three zeros. This change does not migrate precision or claim that the old table stores nonzero microseconds. It preserves all available fractional digits and correctly handles a nonzero-microsecond input boundary without truncating it to milliseconds.

The legacy per-source array functions wrap page1 for compatibility. The old container-array convenience is no longer a consumer in the Training history path and is not an authority list. Active Survey single/longitudinal, Training single/longitudinal and School shared longitudinal history use the page contract. Native School single-report history in its separate organization-artifact table is outside this shared task-store change.

## Product wiring and authority

- Survey has a pointer-only single-history GET, independently checking its real project/wave authorization. It does not reload the item dictionary or response facts on page requests. Its longitudinal catalog accepts the same cursor after the existing published-plan authorization.
- Training single-history GET is explicitly scoped to one actual task. It calls the existing `assertTrainingGroupAccess` before querying that task's pointers. The index no longer reads25 whole-course pointers and filters them against a recent100 menu. Its response retains pointer task IDs for existing index consumers. The course task menu itself continues by a stable publishedAt/ID database cursor, allowing older tasks to be selected in the page.
- Training longitudinal resolution separately authorizes the actual anchor and baseline; waves use the original `authorizedTaskWhere` conditions with the exact plan/course and the existing hundred-wave bound. The recent task menu is not an authorization universe. No new cache, role or generalized authorization platform is introduced.
- School shared longitudinal catalog applies its existing School manager/plan checks, then pages the exact School plan source. Its ordinary reporting, source directories and Teacher namespace stay unchanged.
- Survey, Training and the common longitudinal panel expose explicit load-older buttons, preserve cursor strings, and merge pointers by immutable artifact ID. Loading pages issues GET only. Generating a new snapshot no longer truncates the already loaded longitudinal list to25. Training task changes replace the history source, and the existing request-epoch checks continue to reject stale responses.

`training-analysis/source.ts` changes only its final task-menu helpers: paging and a plan-scoped metadata query reuse the existing authority and where clause. Its scientific/group fact loader is not rewritten. `group-report.service.ts` changes imports and history/index methods, leaving the compute/persist body untouched for the Group owner's pending contributor/beforePersist delta. No unseen cross-thread patch was fabricated or overwritten.

## Necessary validation only

One real isolated PostgreSQL case passed on its first invocation. It creates102 synthetic task headers so the selected old task is genuinely outside the first100, and26 target history pointers at the same stored time. It verifies25+1 unique IDs, the ID tie-break, a `.123001` boundary above stored `.123000`, product/container/task/kind/plan isolation, direct old-task access plus menu continuation, and wrong-actor rejection. Deliberately unreadable pointer payloads ensure the page does not decrypt report bodies. No new participant answer, FINAL or group result is generated. These are pointer/authority fixtures, not a new publication or instrument lifecycle proof.

Current backend and frontend-app TypeScript checks each exited0. A final additive index `taskId` compatibility change was checked through a focused two-module semantic increment (0 diagnostics), without another full backend type run. Four affected frontend files passed lint with the same three existing epoch-cleanup warnings. Two old mock factories were adjusted to return the new page shape; their existing case suites were not replayed. Raw reporter, exits, lint warnings, increment details and source blobs are retained in `docs/evidence/group-report-history-pagination-20261031/manifest.json`.

No old15/22/37 suite, twenty-FINAL chain, full unit suite, new browser journey or Cognitive type suite was repeated. No new migration is needed. Formal CI/image/SAST qualification has not started, and the previous quota tree denial remains stopped pending DOT. This turn performed no GitHub/Notion upload, PR operation, merge or deployment.
