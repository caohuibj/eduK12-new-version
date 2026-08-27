-- A StoredAsset may be referenced by multiple logical records when the
-- migration catalog deduplicates identical content within an access scope.
DROP INDEX IF EXISTS "courses_cover_asset_id_key";
DROP INDEX IF EXISTS "documents_asset_id_key";
DROP INDEX IF EXISTS "videos_original_asset_id_key";
DROP INDEX IF EXISTS "videos_processed_asset_id_key";
DROP INDEX IF EXISTS "videos_thumbnail_asset_id_key";
