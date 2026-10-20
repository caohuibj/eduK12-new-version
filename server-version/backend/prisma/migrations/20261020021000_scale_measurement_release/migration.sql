-- Current content pointer only; attempts freeze a precise release independently.
-- Historical rows remain null until the explicit V09 inventory/mapping.
ALTER TABLE scales ADD COLUMN measurement_release_id TEXT;
ALTER TABLE scales ADD CONSTRAINT scales_measurement_release_fkey
  FOREIGN KEY (measurement_release_id) REFERENCES measurement_content_releases(id) ON DELETE RESTRICT;

-- Immutable source evidence is distinct from scientific hash and live permissions.
ALTER TABLE measurement_content_releases ADD COLUMN provenance JSONB NOT NULL DEFAULT '{}'::jsonb;
