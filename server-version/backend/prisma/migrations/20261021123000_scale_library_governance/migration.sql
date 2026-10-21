-- Additive only. Historical version lineage and PUBLIC deliveries are not guessed.
ALTER TABLE scales ADD COLUMN authoring_family_id text, ADD COLUMN authoring_version integer,
  ADD COLUMN source_scale_id text REFERENCES scales(id) ON DELETE RESTRICT,
  ADD CONSTRAINT scales_authoring_version_check CHECK ((authoring_family_id IS NULL AND authoring_version IS NULL) OR (authoring_family_id IS NOT NULL AND authoring_version IS NOT NULL AND authoring_version > 0));
CREATE UNIQUE INDEX scales_authoring_family_version_key ON scales(authoring_family_id,authoring_version);
ALTER TABLE survey_instrument_drafts ADD COLUMN authoring_family_id text, ADD COLUMN authoring_version integer,
  ADD COLUMN source_draft_id text REFERENCES survey_instrument_drafts(id) ON DELETE RESTRICT,
  ADD COLUMN measurement_release_id text REFERENCES measurement_content_releases(id) ON DELETE RESTRICT,
  ADD CONSTRAINT survey_authoring_version_check CHECK ((authoring_family_id IS NULL AND authoring_version IS NULL) OR (authoring_family_id IS NOT NULL AND authoring_version IS NOT NULL AND authoring_version > 0));
CREATE UNIQUE INDEX survey_authoring_family_version_key ON survey_instrument_drafts(authoring_family_id,authoring_version);
CREATE TABLE scale_library_submissions (
 id text PRIMARY KEY, release_id text NOT NULL REFERENCES measurement_content_releases(id) ON DELETE RESTRICT,
 product text NOT NULL CHECK(product IN ('TRAINING','SURVEY')), source_id text NOT NULL,
 author_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 metadata jsonb NOT NULL, dependency_release_ids text[] NOT NULL DEFAULT '{}',
 snapshot jsonb NOT NULL, snapshot_hash text NOT NULL,
 status text NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED','WITHDRAWN','RETURNED','APPROVED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),reason text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX scale_library_submission_active_release ON scale_library_submissions(release_id) WHERE status IN ('SUBMITTED','APPROVED');
CREATE INDEX scale_library_submission_author ON scale_library_submissions(author_id,created_at DESC,id);
CREATE TABLE scale_library_entries (
 id text PRIMARY KEY, submission_id text NOT NULL UNIQUE REFERENCES scale_library_submissions(id) ON DELETE RESTRICT,
 release_id text NOT NULL UNIQUE REFERENCES measurement_content_releases(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','WITHDRAWN','EMERGENCY_DISABLED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), reason text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE scale_library_use_grants (
 id text PRIMARY KEY, entry_id text NOT NULL REFERENCES scale_library_entries(id) ON DELETE RESTRICT,
 user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT, product text NOT NULL CHECK(product IN ('TRAINING','SURVEY')),
 issuer_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 authority_grant_id text REFERENCES content_capability_grants(id) ON DELETE RESTRICT,
 material_grant_id text, survey_tool_grant_id text,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 reason text,created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz
);
CREATE UNIQUE INDEX scale_library_use_grant_active ON scale_library_use_grants(entry_id,user_id,product) WHERE status='ACTIVE';
CREATE TABLE scale_library_events (
 id text PRIMARY KEY, submission_id text REFERENCES scale_library_submissions(id) ON DELETE RESTRICT,
 entry_id text REFERENCES scale_library_entries(id) ON DELETE RESTRICT,
 actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,action text NOT NULL,
 reason text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION protect_scale_library_facts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Scale library history is retained'; END IF;
 IF TG_TABLE_NAME IN ('scale_library_events','scale_library_emergency_stops','scale_library_media') THEN RAISE EXCEPTION 'Scale library events are append only'; END IF;
 -- Dispatch before referencing table-specific record fields. SQL AND does not
 -- protect heterogeneous NEW/OLD records from field resolution in PostgreSQL.
 IF TG_TABLE_NAME='scale_library_submissions' THEN
  IF (NEW.id,NEW.release_id,NEW.product,NEW.source_id,NEW.author_id,NEW.metadata,NEW.dependency_release_ids,NEW.snapshot,NEW.snapshot_hash,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.release_id,OLD.product,OLD.source_id,OLD.author_id,OLD.metadata,OLD.dependency_release_ids,OLD.snapshot,OLD.snapshot_hash,OLD.created_at)
  THEN RAISE EXCEPTION 'Submitted release and metadata are immutable'; END IF;
 ELSIF TG_TABLE_NAME='scale_library_entries' THEN
  IF (NEW.id,NEW.submission_id,NEW.release_id,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.submission_id,OLD.release_id,OLD.created_at)
  THEN RAISE EXCEPTION 'Approved entry identity is immutable'; END IF;
 ELSIF TG_TABLE_NAME='scale_library_use_grants' THEN
  IF (NEW.id,NEW.entry_id,NEW.user_id,NEW.product,NEW.issuer_id,NEW.authority_grant_id,NEW.material_grant_id,NEW.survey_tool_grant_id,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.entry_id,OLD.user_id,OLD.product,OLD.issuer_id,OLD.authority_grant_id,OLD.material_grant_id,OLD.survey_tool_grant_id,OLD.created_at)
  THEN RAISE EXCEPTION 'Use grant scope is immutable'; END IF;
 ELSE
  RAISE EXCEPTION 'Unsupported scale library history table';
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Scale library transition version must advance once'; END IF;
  IF TG_TABLE_NAME='scale_library_submissions' AND NOT (OLD.status='SUBMITTED' AND NEW.status IN ('WITHDRAWN','RETURNED','APPROVED')) THEN RAISE EXCEPTION 'Invalid application transition'; END IF;
  IF TG_TABLE_NAME='scale_library_entries' AND NOT (OLD.status='ACTIVE' AND NEW.status IN ('WITHDRAWN','EMERGENCY_DISABLED') OR OLD.status='WITHDRAWN' AND NEW.status='EMERGENCY_DISABLED') THEN RAISE EXCEPTION 'Invalid entry transition'; END IF;
  IF TG_TABLE_NAME='scale_library_use_grants' AND NOT (OLD.status='ACTIVE' AND NEW.status='REVOKED') THEN RAISE EXCEPTION 'Invalid use transition'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scale_library_submissions_immutable BEFORE UPDATE OR DELETE ON scale_library_submissions FOR EACH ROW EXECUTE FUNCTION protect_scale_library_facts();
CREATE TRIGGER scale_library_entries_immutable BEFORE UPDATE OR DELETE ON scale_library_entries FOR EACH ROW EXECUTE FUNCTION protect_scale_library_facts();
CREATE TRIGGER scale_library_use_grants_immutable BEFORE UPDATE OR DELETE ON scale_library_use_grants FOR EACH ROW EXECUTE FUNCTION protect_scale_library_facts();
CREATE TRIGGER scale_library_events_immutable BEFORE UPDATE OR DELETE ON scale_library_events FOR EACH ROW EXECUTE FUNCTION protect_scale_library_facts();

ALTER TABLE scales ADD COLUMN legacy_public_access boolean NOT NULL DEFAULT false;
UPDATE scales SET legacy_public_access=true WHERE status='PUBLISHED' AND visibility='PUBLIC';
CREATE TABLE scale_library_emergency_stops (
 target_kind text NOT NULL CHECK(target_kind IN ('RELEASE','TRAINING_SCALE','SURVEY_INSTRUMENT')),target_id text NOT NULL,
 actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(target_kind,target_id)
);
CREATE TRIGGER scale_library_emergency_stops_immutable BEFORE UPDATE OR DELETE ON scale_library_emergency_stops FOR EACH ROW EXECUTE FUNCTION protect_scale_library_facts();

ALTER TABLE scales ADD COLUMN public_distribution_grant_id text REFERENCES content_capability_grants(id) ON DELETE RESTRICT;

ALTER TABLE survey_instrument_drafts ADD COLUMN revision_source_release_id text REFERENCES measurement_content_releases(id) ON DELETE RESTRICT;

ALTER TABLE survey_instrument_drafts DROP CONSTRAINT survey_instrument_drafts_status_check;
ALTER TABLE survey_instrument_drafts ADD CONSTRAINT survey_instrument_drafts_status_check CHECK(status IN ('DRAFT','PUBLISHED','ARCHIVED'));
ALTER TABLE material_grants ADD COLUMN legacy_scale_grant boolean NOT NULL DEFAULT false;
UPDATE material_grants SET legacy_scale_grant=true WHERE resource_type='SCALE';
CREATE TABLE scale_library_media (
 id uuid PRIMARY KEY,entry_id text NOT NULL REFERENCES scale_library_entries(id) ON DELETE RESTRICT,
 asset_id text NOT NULL REFERENCES stored_assets(id) ON DELETE RESTRICT,
 manifest_hash text NOT NULL,identity jsonb NOT NULL,state text NOT NULL DEFAULT 'READY' CHECK(state='READY'),
 UNIQUE(entry_id,asset_id)
);
CREATE TRIGGER scale_library_media_immutable BEFORE UPDATE OR DELETE ON scale_library_media FOR EACH ROW EXECUTE FUNCTION protect_scale_library_facts();
CREATE FUNCTION protect_library_asset_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM scale_library_media WHERE asset_id=OLD.id) OR EXISTS(SELECT 1 FROM asset_references WHERE asset_id=OLD.id AND entity_type='ScaleLibrarySubmission') THEN RAISE EXCEPTION 'Submitted and approved library media are retained'; END IF;
  RETURN OLD;
 END IF;
 IF (NEW.sha256,NEW.mime_type,NEW.size_bytes,NEW.object_key,NEW.provider,NEW.created_at,NEW.deleted_at,NEW.access_scope,NEW.storage_object_key,NEW.owner_id)
  IS DISTINCT FROM (OLD.sha256,OLD.mime_type,OLD.size_bytes,OLD.object_key,OLD.provider,OLD.created_at,OLD.deleted_at,OLD.access_scope,OLD.storage_object_key,OLD.owner_id)
  AND (EXISTS(SELECT 1 FROM scale_library_media WHERE asset_id=OLD.id) OR EXISTS(SELECT 1 FROM asset_references WHERE asset_id=OLD.id AND entity_type='ScaleLibrarySubmission'))
 THEN RAISE EXCEPTION 'Approved library media identity and private access are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scale_library_asset_identity BEFORE UPDATE OR DELETE ON stored_assets FOR EACH ROW EXECUTE FUNCTION protect_library_asset_identity();

ALTER TABLE scales ADD COLUMN library_entry_id text UNIQUE REFERENCES scale_library_entries(id) ON DELETE RESTRICT;
CREATE FUNCTION protect_library_scale_wrapper() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.library_entry_id IS NOT NULL THEN RAISE EXCEPTION 'Platform scale identity is retained'; END IF;
 IF TG_OP='UPDATE' AND OLD.library_entry_id IS NOT NULL AND
  (NEW.id,NEW.library_entry_id,NEW.code,NEW.definition,NEW.definition_hash,NEW.measurement_release_id,NEW.creator_id,NEW.instrument_class,NEW.instrument_version,NEW.status,NEW.visibility,NEW.copy_source)
  IS DISTINCT FROM (OLD.id,OLD.library_entry_id,OLD.code,OLD.definition,OLD.definition_hash,OLD.measurement_release_id,OLD.creator_id,OLD.instrument_class,OLD.instrument_version,OLD.status,OLD.visibility,OLD.copy_source)
 THEN RAISE EXCEPTION 'Platform scale wrapper is an immutable approved-version reference'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scale_library_wrapper_immutable BEFORE UPDATE OR DELETE ON scales FOR EACH ROW EXECUTE FUNCTION protect_library_scale_wrapper();

CREATE FUNCTION protect_library_media_pin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.entity_type IN ('ScaleLibrarySubmission','ScaleLibraryMedia') THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Library audit and platform media references are retained'; END IF;
  IF (NEW.asset_id,NEW.entity_type,NEW.entity_id,NEW.field) IS DISTINCT FROM (OLD.asset_id,OLD.entity_type,OLD.entity_id,OLD.field) THEN RAISE EXCEPTION 'Library media reference is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scale_library_media_pin_immutable BEFORE UPDATE OR DELETE ON asset_references FOR EACH ROW EXECUTE FUNCTION protect_library_media_pin();
