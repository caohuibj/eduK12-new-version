-- SCREEN_OUT is a terminal, non-FINAL Attempt state; preserve every historical status.
-- The pre-Flow CHECK was restricted to STARTED/COMPLETED/FAILED/WITHDRAWN.
ALTER TABLE "survey_wave_attempts"
  DROP CONSTRAINT "survey_wave_attempts_status_check";
ALTER TABLE "survey_wave_attempts"
  ADD CONSTRAINT "survey_wave_attempts_status_check"
    CHECK ("status" IN ('STARTED','COMPLETED','FAILED','WITHDRAWN','SCREENED_OUT'));

-- Frozen Survey Flow authoring and cryptographically chosen, encrypted Attempt assignment.
-- No changes to existing Publications, FINAL ciphertext or account realms.
ALTER TABLE "survey_waves"
  ADD COLUMN "flow_definition" JSONB;
ALTER TABLE "survey_wave_attempts"
  ADD COLUMN "flow_assignment_cipher" TEXT;
