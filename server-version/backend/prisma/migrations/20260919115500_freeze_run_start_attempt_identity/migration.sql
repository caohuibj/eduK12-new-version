-- A committed START admission is an operation boundary. Recovery must reconcile that
-- operation without re-authorizing consent that may have changed after admission.
ALTER TABLE "assessment_run_execution_start_claims"
  ADD COLUMN "admitted_attempt_identity" JSONB;

-- PR2 admission audits already persisted the exact accepted consent / attempt identity.
-- Backfill pre-migration claims from that append-only event before enforcing the invariant.
UPDATE "assessment_run_execution_start_claims" AS claim
SET "admitted_attempt_identity" = audit."payload"->'attemptIdentity'
FROM "organization_governance_audits" AS audit
WHERE audit."domain_event_id" = claim."id"
  AND audit."action" = 'ASSESSMENT_RUN_START_ADMITTED'
  AND audit."payload" ? 'attemptIdentity';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "assessment_run_execution_start_claims"
    WHERE "admitted_attempt_identity" IS NULL
  ) THEN
    RAISE EXCEPTION 'cannot freeze START identity: claim without admission audit attemptIdentity';
  END IF;
END $$;

ALTER TABLE "assessment_run_execution_start_claims"
  ALTER COLUMN "admitted_attempt_identity" SET NOT NULL;

ALTER TABLE "assessment_run_execution_start_claims"
  ADD CONSTRAINT "run_start_claim_attempt_identity_shape_check" CHECK (
    jsonb_typeof("admitted_attempt_identity") = 'object'
    AND jsonb_typeof("admitted_attempt_identity"->'subjectUserId') = 'string'
    AND jsonb_typeof("admitted_attempt_identity"->'respondentUserId') = 'string'
    AND jsonb_typeof("admitted_attempt_identity"->'episodeId') = 'string'
    AND jsonb_typeof("admitted_attempt_identity"->'assignmentRef') = 'string'
    AND (
      "admitted_attempt_identity"->'consentId' = 'null'::jsonb
      OR jsonb_typeof("admitted_attempt_identity"->'consentId') = 'string'
    )
  );
