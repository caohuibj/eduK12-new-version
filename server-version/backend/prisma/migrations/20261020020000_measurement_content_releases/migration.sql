-- Additive shared release authority. Drafts remain in their existing workspaces.
CREATE TABLE measurement_content_releases (
  id TEXT PRIMARY KEY,
  layer TEXT NOT NULL CHECK (layer IN ('MEASUREMENT','REFERENCE','REPORT')),
  family TEXT NOT NULL CHECK (family IN ('SCALE','COGNITIVE','SJT')),
  content_key TEXT NOT NULL,
  version TEXT NOT NULL,
  hash_scheme TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  content JSONB NOT NULL,
  scope JSONB NOT NULL,
  asset_refs JSONB NOT NULL,
  source_release_id TEXT REFERENCES measurement_content_releases(id) ON DELETE RESTRICT,
  published_by TEXT NOT NULL,
  published_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED','SUPERSEDED','RETIRED','REVOKED')),
  CONSTRAINT measurement_content_release_identity_key UNIQUE (family,layer,content_key,version)
);
CREATE INDEX measurement_content_catalog_idx ON measurement_content_releases(family,layer,status);
CREATE TABLE measurement_content_release_events (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES measurement_content_releases(id) ON DELETE RESTRICT,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX measurement_content_events_release_idx ON measurement_content_release_events(release_id,created_at);
-- Published bytes and provenance cannot be overwritten through a different caller.
CREATE FUNCTION protect_measurement_content_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'CONTENT_RELEASE_DELETE_FORBIDDEN'; END IF;
  IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'CONTENT_RELEASE_IMMUTABLE';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'PUBLISHED' AND NEW.status IN ('SUPERSEDED','RETIRED','REVOKED')) OR
    (OLD.status = 'SUPERSEDED' AND NEW.status IN ('RETIRED','REVOKED')) OR
    (OLD.status = 'RETIRED' AND NEW.status = 'REVOKED')
  ) THEN RAISE EXCEPTION 'CONTENT_LIFECYCLE_INVALID'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_content_release_immutable BEFORE UPDATE OR DELETE ON measurement_content_releases
FOR EACH ROW EXECUTE FUNCTION protect_measurement_content_release();
CREATE FUNCTION protect_measurement_content_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'CONTENT_EVENT_IMMUTABLE'; END $$;
CREATE TRIGGER measurement_content_event_immutable BEFORE UPDATE OR DELETE ON measurement_content_release_events
FOR EACH ROW EXECUTE FUNCTION protect_measurement_content_event();
