ALTER TABLE "users"
ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "questionnaire_assessments"
ADD COLUMN "resume_token_hash" TEXT,
ADD COLUMN "resume_token_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "questionnaire_assessments_resume_token_hash_key"
ON "questionnaire_assessments"("resume_token_hash");

CREATE INDEX "questionnaire_assessments_resume_token_expires_at_idx"
ON "questionnaire_assessments"("resume_token_expires_at");
