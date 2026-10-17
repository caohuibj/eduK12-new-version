ALTER TABLE stored_assets ADD COLUMN storage_object_key TEXT;
CREATE INDEX stored_assets_storage_object_key_idx ON stored_assets(storage_object_key);
ALTER TABLE stored_assets ADD CONSTRAINT stored_assets_shared_storage_cos_only CHECK (storage_object_key IS NULL OR (provider = 'cos' AND storage_object_key LIKE 'assets/%' AND storage_object_key !~ '(^|/)\.\.?(/|$)' AND storage_object_key !~ '[[:cntrl:]]' AND position(chr(92) in storage_object_key) = 0));
