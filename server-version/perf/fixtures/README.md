# Disposable FINAL_ONLY fixtures

The k6 scripts require request fixtures because the application-specific IDs, definitions, hashes, and authentication model are environment-dependent. This directory provides only a shape example; it must not contain real credentials or shared-environment IDs.

## Required fixture properties

Create a disposable tenant/user/course/assessment set in an isolated database and record every created ID in a ledger owned by the run. Prepare at least these groups in `final-submit-fixtures.json`:

- `scale`: valid FINAL_ONLY Scale submissions;
- `formSection`: valid Questionnaire/Form section final submissions;
- `cognitive`: valid Cognitive final submissions;
- `sameParent`: requests for different children/sections of one parent attempt, with the same current `attemptEpoch`;
- `mixed`: a combined list of complete requests from the three instrument types.

The runner sends `method`, `path`, `body`, and optional `headers`. Extra metadata such as `instrument`, `parentKey`, and `fixtureId` is ignored by the runner and is useful for the ledger and result labeling. Do not place an access token in a fixture file.

## Isolation and cleanup

1. Use a one-shot PostgreSQL instance/database or a separately named isolated compose project. Do not reuse the persistent `ptool-postgres` database or its volumes.
2. Create only disposable users, courses, assessments, attempts, context snapshots, and instrument records needed by the scenarios.
3. Record each fixture ID, generated database name, temporary container/network, and application process in a ledger before the load starts.
4. Run the scenarios and save the raw output and metric snapshots.
5. Delete only the IDs and temporary resources in that ledger. Never issue a broad table deletion and never remove pre-existing data.
6. Verify the shared `ptool-*` containers and persistent volumes still exist and are healthy. Report any resource that could not be cleaned up.

The example below is deliberately not runnable: replace all `REPLACE_*` values with disposable values and use the exact final-submit routes and payloads accepted by the target build. Keep the resulting `final-submit-fixtures.json` untracked.
