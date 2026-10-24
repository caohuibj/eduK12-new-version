-- Empty, additive Survey workflow. Never approves, publishes or rewrites existing tools/data.
CREATE TABLE survey_standard_versions (
 id text PRIMARY KEY, tool_key text NOT NULL, axis text NOT NULL CHECK(axis IN ('CONTENT','PARAMETERS','REPORT')),
 version text NOT NULL, content_hash text NOT NULL, payload jsonb NOT NULL, source_version text NOT NULL,
 reference jsonb NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tool_key,axis,version), UNIQUE(tool_key,axis,content_hash)
);
CREATE TABLE survey_standard_releases (
 id text PRIMARY KEY, tool_key text NOT NULL, combination_hash text NOT NULL UNIQUE,
 snapshot jsonb NOT NULL, reference jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('APPROVED','TRIAL_RUNNING','TRIAL_FAILED','ONLINE','WITHDRAWN')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), approved_by text NOT NULL, approved_at timestamptz NOT NULL DEFAULT now(),
 latest_trial text, lease_until timestamptz, blockers jsonb NOT NULL DEFAULT '[]', measurement_release jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE survey_standard_trials (
 id text PRIMARY KEY, release_id text NOT NULL REFERENCES survey_standard_releases(id) ON DELETE RESTRICT,
 run_id text NOT NULL, case_index integer NOT NULL CHECK(case_index>=0), answers jsonb NOT NULL,
 scores jsonb NOT NULL, report jsonb NOT NULL, record_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(release_id,run_id,case_index)
);
CREATE INDEX survey_standard_releases_state ON survey_standard_releases(tool_key,state,created_at);
CREATE FUNCTION survey_standard_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Survey standard version/trial is immutable'; END $$;
CREATE TRIGGER survey_standard_versions_immutable BEFORE UPDATE OR DELETE ON survey_standard_versions FOR EACH ROW EXECUTE FUNCTION survey_standard_immutable();
CREATE TRIGGER survey_standard_trials_immutable BEFORE UPDATE OR DELETE ON survey_standard_trials FOR EACH ROW EXECUTE FUNCTION survey_standard_immutable();
CREATE FUNCTION survey_standard_release_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Survey approval history cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'APPROVED' OR NEW.measurement_release IS NOT NULL OR NEW.latest_trial IS NOT NULL THEN RAISE EXCEPTION 'New approvals must start before trial'; END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW.tool_key,NEW.combination_hash,NEW.snapshot,NEW.reference,NEW.approved_by,NEW.approved_at,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.tool_key,OLD.combination_hash,OLD.snapshot,OLD.reference,OLD.approved_by,OLD.approved_at,OLD.created_at)
 THEN RAISE EXCEPTION 'Survey approved triplet is immutable'; END IF;
 IF NEW.state='ONLINE' AND (NEW.latest_trial IS NULL OR NEW.measurement_release IS NULL OR jsonb_array_length(NEW.blockers)>0
 OR (SELECT count(*) FROM survey_standard_trials WHERE release_id=NEW.id AND run_id=NEW.latest_trial)<3)
 THEN RAISE EXCEPTION 'Survey trial proof is required before online'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER survey_standard_release_identity BEFORE INSERT OR UPDATE OR DELETE ON survey_standard_releases FOR EACH ROW EXECUTE FUNCTION survey_standard_release_identity();
