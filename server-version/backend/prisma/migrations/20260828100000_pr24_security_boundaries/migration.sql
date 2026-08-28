-- PR24 security boundary expansion. This migration is additive and keeps
-- legacy token data readable until the application backfill has completed.
ALTER TABLE "questionnaire_access_tokens"
  ALTER COLUMN "token" DROP NOT NULL;

ALTER TABLE "questionnaire_access_tokens"
  ADD COLUMN "token_hash" TEXT,
  ADD COLUMN "token_encrypted" TEXT;

CREATE UNIQUE INDEX "questionnaire_access_tokens_token_hash_key"
  ON "questionnaire_access_tokens"("token_hash");

CREATE TABLE "export_artifacts" (
  "id" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "anonymized" BOOLEAN NOT NULL DEFAULT false,
  "storage_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "export_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "export_artifacts_resource_type_resource_id_idx"
  ON "export_artifacts"("resource_type", "resource_id");
CREATE INDEX "export_artifacts_created_by_idx"
  ON "export_artifacts"("created_by");
CREATE INDEX "export_artifacts_expires_at_idx"
  ON "export_artifacts"("expires_at");

ALTER TABLE "export_artifacts"
  ADD CONSTRAINT "export_artifacts_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
