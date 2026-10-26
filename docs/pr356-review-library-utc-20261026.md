# PR356 review: shared-library delegated admission time

assertLibraryUseGrantCurrent compares UTC TIMESTAMP(3) grant/ancestor windows to `clock_timestamp() AT TIME ZONE 'UTC'`. The original exact delegation and active use/entry/policy/stop checks remain mandatory for new admission.

Primary local verification: only the new shared-library admission cases in content-grant-time.postgres.integration.test.ts, UTC / Asia/Tokyo / America/Los_Angeles, 3/3 passed. Each real SQL transaction uses temporary synthetic tables, verifies a current one-minute window, future start, exclusive expiry and ancestor revocation, then rolls back. Existing root/delegation/metadata time cases were filtered, not repeated. Evidence `/workspace/scratch/pr356-review-utc/test.json`.

Development verification only; no CI or deployment.
