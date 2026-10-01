CREATE TABLE "sjt_author_drafts" (
  "id" TEXT PRIMARY KEY, "owner_id" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','IN_REVIEW','PUBLISHED')),
  "content_digest" TEXT NOT NULL, "template" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "sjt_author_drafts_owner_id_updated_at_idx" ON "sjt_author_drafts"("owner_id", "updated_at");
CREATE TABLE "sjt_author_audits" (
  "id" TEXT PRIMARY KEY, "draft_id" TEXT NOT NULL REFERENCES "sjt_author_drafts"("id") ON DELETE RESTRICT,
  "actor_id" TEXT NOT NULL, "revision" INTEGER NOT NULL, "action" TEXT NOT NULL,
  "content_digest" TEXT NOT NULL, "template" JSONB, "note" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "sjt_author_audits_draft_id_created_at_idx" ON "sjt_author_audits"("draft_id", "created_at");
CREATE TABLE "sjt_author_releases" (
  "id" TEXT PRIMARY KEY, "instrument_key" TEXT NOT NULL, "instrument_version" TEXT NOT NULL,
  "source_draft_id" TEXT NOT NULL UNIQUE REFERENCES "sjt_author_drafts"("id") ON DELETE RESTRICT,
  "content_digest" TEXT NOT NULL, "definition_hash" TEXT NOT NULL, "package" JSONB NOT NULL,
  "author_id" TEXT NOT NULL, "reviewer_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK ("status" IN ('PUBLISHED','RETIRED')),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sjt_author_releases_instrument_key_instrument_version_key" UNIQUE ("instrument_key", "instrument_version"),
  CONSTRAINT "sjt_author_independent_reviewer" CHECK ("author_id" <> "reviewer_id")
);
