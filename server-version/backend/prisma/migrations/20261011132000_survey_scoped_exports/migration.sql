-- Audit-backed, encrypted, short-lived Survey researcher data extracts.
CREATE TABLE "survey_export_tickets" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL REFERENCES "survey_projects"("id") ON DELETE RESTRICT,
  "actor_user_id" TEXT NOT NULL REFERENCES "survey_accounts"("user_id") ON DELETE RESTRICT,
  "format" TEXT NOT NULL CHECK ("format" IN ('RAW_WAVE','RAW_LONG','RAW_WIDE','SCORE_LONG','SCORE_WIDE')),
  "status" TEXT NOT NULL DEFAULT 'READY' CHECK ("status" IN ('READY','EXPIRED','REVOKED')),
  "source_digest" TEXT NOT NULL CHECK ("source_digest" ~ '^[0-9a-f]{64}$'),
  "artifact_cipher" TEXT NOT NULL CHECK (octet_length("artifact_cipher")<=4000000),
  "artifact_hash" TEXT NOT NULL CHECK ("artifact_hash" ~ '^[0-9a-f]{64}$'),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "survey_export_expiry_valid"
    CHECK ("expires_at">"created_at" AND "expires_at"<="created_at"+INTERVAL '30 minutes')
);
CREATE INDEX "survey_exports_project_actor_idx" ON "survey_export_tickets"("project_id","actor_user_id","created_at" DESC);
CREATE INDEX "survey_exports_expires_idx" ON "survey_export_tickets"("expires_at");
