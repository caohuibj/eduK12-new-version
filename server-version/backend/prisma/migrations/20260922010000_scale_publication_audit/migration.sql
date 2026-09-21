CREATE TABLE "scale_publication_audits" (
  "id" UUID PRIMARY KEY,
  "scale_id" TEXT NOT NULL REFERENCES "scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actor_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "proof_hash" TEXT NOT NULL,
  "proof" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "scale_publication_audits_scale_id_created_at_idx" ON "scale_publication_audits"("scale_id", "created_at");
