-- Frozen Survey Flow authoring and cryptographically chosen, encrypted Attempt assignment.
-- No changes to existing Publications, FINAL ciphertext or account realms.
ALTER TABLE "survey_waves"
  ADD COLUMN "flow_definition" JSONB;
ALTER TABLE "survey_wave_attempts"
  ADD COLUMN "flow_assignment_cipher" TEXT;
