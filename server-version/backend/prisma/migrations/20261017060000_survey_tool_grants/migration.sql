-- Additive, authoring-only grants. Frozen publications never depend on current grants.
CREATE TABLE survey_tool_grants (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
 snapshot JSONB NOT NULL,
 snapshot_digest TEXT NOT NULL CHECK (snapshot_digest ~ '^[a-f0-9]{64}$'),
 created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 revoked_at TIMESTAMPTZ,
 CHECK ((status='ACTIVE' AND revoked_at IS NULL) OR (status='REVOKED' AND revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX survey_tool_grants_active_source_key ON survey_tool_grants(user_id,snapshot_digest) WHERE status='ACTIVE';
CREATE INDEX survey_tool_grants_user_status_idx ON survey_tool_grants(user_id,status,created_at,id);
ALTER TABLE survey_instrument_drafts ADD COLUMN catalog_grant_id TEXT REFERENCES survey_tool_grants(id) ON DELETE RESTRICT;
CREATE FUNCTION guard_survey_tool_grant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Survey source grant audit is retained'; END IF;
 IF NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.snapshot<>OLD.snapshot
 OR NEW.snapshot_digest<>OLD.snapshot_digest OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR OLD.status='REVOKED' THEN RAISE EXCEPTION 'Survey source snapshot is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER survey_tool_grant_frozen BEFORE UPDATE OR DELETE ON survey_tool_grants
 FOR EACH ROW EXECUTE FUNCTION guard_survey_tool_grant();
CREATE FUNCTION guard_survey_sourced_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.catalog_grant_id IS NOT NULL AND (NEW.catalog_grant_id IS DISTINCT FROM OLD.catalog_grant_id
 OR NEW.definition<>OLD.definition OR NEW.kind<>OLD.kind OR NEW.project_id<>OLD.project_id)
 THEN RAISE EXCEPTION 'Survey catalog draft is read only'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER survey_sourced_draft_readonly BEFORE UPDATE ON survey_instrument_drafts
 FOR EACH ROW EXECUTE FUNCTION guard_survey_sourced_draft();
