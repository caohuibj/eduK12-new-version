CREATE TABLE "stored_assets" (
    "id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "original_name" TEXT,
    "owner_id" TEXT,
    "access_scope" TEXT NOT NULL DEFAULT 'PRIVATE',
    "scope_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stored_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stored_assets_object_key_key" ON "stored_assets"("object_key");
CREATE INDEX "stored_assets_owner_id_idx" ON "stored_assets"("owner_id");
CREATE INDEX "stored_assets_access_scope_scope_id_idx" ON "stored_assets"("access_scope", "scope_id");

CREATE TABLE "asset_references" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_references_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_references_asset_id_entity_type_entity_id_field_key"
  ON "asset_references"("asset_id", "entity_type", "entity_id", "field");
CREATE INDEX "asset_references_entity_type_entity_id_idx"
  ON "asset_references"("entity_type", "entity_id");

ALTER TABLE "asset_references"
  ADD CONSTRAINT "asset_references_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "stored_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "courses" ADD COLUMN "cover_asset_id" TEXT;
ALTER TABLE "documents" ADD COLUMN "asset_id" TEXT;
ALTER TABLE "videos" ADD COLUMN "original_asset_id" TEXT;
ALTER TABLE "videos" ADD COLUMN "processed_asset_id" TEXT;
ALTER TABLE "videos" ADD COLUMN "thumbnail_asset_id" TEXT;

CREATE UNIQUE INDEX "courses_cover_asset_id_key" ON "courses"("cover_asset_id");
CREATE UNIQUE INDEX "documents_asset_id_key" ON "documents"("asset_id");
CREATE UNIQUE INDEX "videos_original_asset_id_key" ON "videos"("original_asset_id");
CREATE UNIQUE INDEX "videos_processed_asset_id_key" ON "videos"("processed_asset_id");
CREATE UNIQUE INDEX "videos_thumbnail_asset_id_key" ON "videos"("thumbnail_asset_id");

ALTER TABLE "courses"
  ADD CONSTRAINT "courses_cover_asset_id_fkey"
  FOREIGN KEY ("cover_asset_id") REFERENCES "stored_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "stored_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "videos"
  ADD CONSTRAINT "videos_original_asset_id_fkey"
  FOREIGN KEY ("original_asset_id") REFERENCES "stored_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "videos"
  ADD CONSTRAINT "videos_processed_asset_id_fkey"
  FOREIGN KEY ("processed_asset_id") REFERENCES "stored_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "videos"
  ADD CONSTRAINT "videos_thumbnail_asset_id_fkey"
  FOREIGN KEY ("thumbnail_asset_id") REFERENCES "stored_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
