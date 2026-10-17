ALTER TABLE stored_assets ADD COLUMN duplicate_cleanup_pending BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX stored_assets_content_lookup_idx ON stored_assets(provider, sha256, size_bytes, mime_type, deleted_at, created_at DESC, id DESC);
CREATE INDEX stored_assets_duplicate_cleanup_idx ON stored_assets(updated_at, id) WHERE duplicate_cleanup_pending = true;
ALTER TABLE stored_assets ADD CONSTRAINT stored_assets_duplicate_cleanup_valid CHECK (NOT duplicate_cleanup_pending OR (provider = 'cos' AND storage_object_key IS NOT NULL AND storage_object_key <> object_key));
