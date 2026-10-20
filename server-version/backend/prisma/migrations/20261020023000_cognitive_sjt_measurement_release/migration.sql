ALTER TABLE cognitive_test_configs ADD COLUMN measurement_release_id TEXT;
ALTER TABLE cognitive_test_configs ADD CONSTRAINT cognitive_config_measurement_release_fkey
  FOREIGN KEY (measurement_release_id) REFERENCES measurement_content_releases(id) ON DELETE RESTRICT;
ALTER TABLE sjt_author_releases ADD COLUMN measurement_release_id TEXT;
ALTER TABLE sjt_author_releases ADD CONSTRAINT sjt_author_measurement_release_fkey
  FOREIGN KEY (measurement_release_id) REFERENCES measurement_content_releases(id) ON DELETE RESTRICT;
