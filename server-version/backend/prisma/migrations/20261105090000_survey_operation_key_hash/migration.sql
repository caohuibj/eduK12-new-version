-- Client-generated START operation identity for anonymous SINGLE_UNLINKED waves.
-- The digest is scoped per project+wave and unique so one logical start can
-- only ever admit one attempt; NULL (linked attempts) rows are unaffected.
ALTER TABLE "survey_wave_attempts" ADD COLUMN "operation_key_hash" TEXT;
CREATE UNIQUE INDEX "survey_attempts_project_wave_operation_key"
  ON "survey_wave_attempts"("project_id","wave_id","operation_key_hash");
