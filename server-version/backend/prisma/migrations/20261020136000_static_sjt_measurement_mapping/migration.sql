CREATE TABLE static_sjt_measurement_mappings (
 id TEXT PRIMARY KEY,
 instrument_key TEXT NOT NULL,
 instrument_version TEXT NOT NULL,
 content_digest TEXT NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
 deployment JSONB,
 deployment_hash TEXT CHECK(deployment_hash ~ '^[a-f0-9]{64}$'),
 measurement_release_id TEXT REFERENCES measurement_content_releases(id) ON DELETE RESTRICT,
 CHECK ((measurement_release_id IS NULL AND deployment IS NULL AND deployment_hash IS NULL) OR (measurement_release_id IS NOT NULL AND deployment IS NOT NULL AND deployment_hash IS NOT NULL)),
 UNIQUE(instrument_key,instrument_version)
);
CREATE FUNCTION guard_static_sjt_measurement_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'static SJT source mapping is immutable'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.instrument_key<>OLD.instrument_key OR NEW.instrument_version<>OLD.instrument_version
   OR NEW.content_digest<>OLD.content_digest OR (OLD.measurement_release_id IS NOT NULL AND (NEW.measurement_release_id IS DISTINCT FROM OLD.measurement_release_id OR NEW.deployment IS DISTINCT FROM OLD.deployment OR NEW.deployment_hash IS DISTINCT FROM OLD.deployment_hash)))
 THEN RAISE EXCEPTION 'static SJT source mapping is immutable'; END IF;
 IF NEW.measurement_release_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM measurement_content_releases r WHERE r.id=NEW.measurement_release_id AND r.layer='MEASUREMENT' AND r.family='SJT' AND r.scope->>'kind'='PLATFORM' AND NOT (r.scope ? 'ownerId')
    AND r.provenance->>'sourceKind'='STATIC_SJT_REGISTRY' AND r.provenance->>'mappingId'=NEW.id
    AND r.provenance->>'contentDigest'=NEW.content_digest AND r.provenance->>'instrumentKey'=NEW.instrument_key
    AND r.provenance->>'instrumentVersion'=NEW.instrument_version AND r.content->>'instrumentVersion'=NEW.instrument_version
 ) THEN RAISE EXCEPTION 'static SJT mapping requires platform SJT measurement'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER static_sjt_measurement_mapping_guard BEFORE INSERT OR UPDATE OR DELETE ON static_sjt_measurement_mappings
 FOR EACH ROW EXECUTE FUNCTION guard_static_sjt_measurement_mapping();
