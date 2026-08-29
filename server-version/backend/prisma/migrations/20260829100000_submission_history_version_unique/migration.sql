-- Keep one immutable history row per submission/version. Do not delete or
-- rewrite existing history during deployment: if duplicates exist, fail the
-- guarded migration and require an audited, backed-up operator remediation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM submission_histories
    GROUP BY submission_id, version
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate submission history versions exist; remediate before applying unique constraint';
  END IF;
END $$;

CREATE UNIQUE INDEX "submission_histories_submission_id_version_key"
  ON "submission_histories"("submission_id", "version");
