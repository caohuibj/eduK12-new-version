-- Public bearer values for composite and cognitive links must not remain in
-- plaintext.  Keep the legacy column nullable only until the explicit,
-- resumable application backfill has completed.
ALTER TABLE "composite_assessment_access_tokens"
  ADD COLUMN "token_hash" TEXT,
  ADD COLUMN "token_encrypted" TEXT;

ALTER TABLE "composite_assessment_access_tokens"
  ALTER COLUMN "token" DROP NOT NULL;

CREATE UNIQUE INDEX "composite_assessment_access_tokens_token_hash_key"
  ON "composite_assessment_access_tokens"("token_hash");
CREATE INDEX "composite_assessment_access_tokens_token_idx"
  ON "composite_assessment_access_tokens"("token");

ALTER TABLE "composite_assessment_access_tokens"
  ADD CONSTRAINT "composite_assessment_access_tokens_token_must_be_null"
  CHECK ("token" IS NULL)
  NOT VALID;
ALTER TABLE "composite_assessment_access_tokens"
  ADD CONSTRAINT "composite_assessment_access_tokens_protected_fields_present"
  CHECK (
    "token" IS NOT NULL
    OR ("token_hash" IS NOT NULL AND "token_encrypted" IS NOT NULL)
  )
  NOT VALID;

ALTER TABLE "cognitive_access_tokens"
  ADD COLUMN "token_hash" TEXT,
  ADD COLUMN "token_encrypted" TEXT;

ALTER TABLE "cognitive_access_tokens"
  ALTER COLUMN "token" DROP NOT NULL;

CREATE UNIQUE INDEX "cognitive_access_tokens_token_hash_key"
  ON "cognitive_access_tokens"("token_hash");
CREATE INDEX "cognitive_access_tokens_token_idx"
  ON "cognitive_access_tokens"("token");

ALTER TABLE "cognitive_access_tokens"
  ADD CONSTRAINT "cognitive_access_tokens_token_must_be_null"
  CHECK ("token" IS NULL)
  NOT VALID;
ALTER TABLE "cognitive_access_tokens"
  ADD CONSTRAINT "cognitive_access_tokens_protected_fields_present"
  CHECK (
    "token" IS NOT NULL
    OR ("token_hash" IS NOT NULL AND "token_encrypted" IS NOT NULL)
  )
  NOT VALID;

-- Questionnaire rows already have the protected columns from the earlier
-- rollout; add the same database invariant before its backfill is run.
ALTER TABLE "questionnaire_access_tokens"
  ADD CONSTRAINT "questionnaire_access_tokens_token_must_be_null"
  CHECK ("token" IS NULL)
  NOT VALID;
ALTER TABLE "questionnaire_access_tokens"
  ADD CONSTRAINT "questionnaire_access_tokens_protected_fields_present"
  CHECK (
    "token" IS NOT NULL
    OR ("token_hash" IS NOT NULL AND "token_encrypted" IS NOT NULL)
  )
  NOT VALID;
