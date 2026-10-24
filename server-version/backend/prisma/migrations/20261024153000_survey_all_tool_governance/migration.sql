-- Additive Survey-only approvals and package bindings. No existing tool is approved or granted.
CREATE TABLE survey_governed_tools (
 id text PRIMARY KEY, family text NOT NULL CHECK(family IN ('SCALE','COGNITIVE','SJT','FORM','COMBINATION','BUNDLE')),
 tool_key text NOT NULL, tool_version text NOT NULL, title text NOT NULL, snapshot jsonb NOT NULL, snapshot_hash text NOT NULL,
 reference jsonb NOT NULL, submitted_by text NOT NULL REFERENCES users(id), submitted_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'SUBMITTED' CHECK(state IN ('SUBMITTED','RETURNED','APPROVED','TRIAL_RUNNING','TRIAL_FAILED','ONLINE','WITHDRAWN')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), approved_by text REFERENCES users(id),approved_at timestamptz,approval_reason text,reason text NOT NULL DEFAULT '',
 latest_trial text, lease_until timestamptz, blockers jsonb NOT NULL DEFAULT '[]', measurement_release jsonb,
 UNIQUE(family,tool_key,tool_version), UNIQUE(snapshot_hash)
);
CREATE INDEX survey_governed_tools_catalog ON survey_governed_tools(family,state,submitted_at,id);
CREATE TABLE survey_governed_trials (
 id text PRIMARY KEY,tool_id text NOT NULL REFERENCES survey_governed_tools(id),run_id text NOT NULL,case_index integer NOT NULL CHECK(case_index BETWEEN 0 AND 2),
 result jsonb NOT NULL,result_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tool_id,run_id,case_index)
);
CREATE TABLE survey_package_grants (
 id text PRIMARY KEY,tool_id text NOT NULL REFERENCES survey_governed_tools(id),snapshot_hash text NOT NULL,user_id text NOT NULL REFERENCES users(id),
 product text NOT NULL DEFAULT 'SURVEY' CHECK(product='SURVEY'),mode text NOT NULL DEFAULT 'PACKAGE_ONLY' CHECK(mode='PACKAGE_ONLY'),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),version integer NOT NULL DEFAULT 1,
 valid_from timestamptz NOT NULL DEFAULT now(),expires_at timestamptz,created_by text NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,reason text NOT NULL,CHECK(expires_at IS NULL OR expires_at>valid_from)
);
CREATE UNIQUE INDEX survey_package_grants_active ON survey_package_grants(tool_id,user_id) WHERE status='ACTIVE';
CREATE TABLE survey_package_imports (
 id text PRIMARY KEY,grant_id text NOT NULL REFERENCES survey_package_grants(id),project_id text NOT NULL REFERENCES survey_projects(id),
 tool_id text NOT NULL REFERENCES survey_governed_tools(id),snapshot_hash text NOT NULL,bindings jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX survey_package_imports_project ON survey_package_imports(project_id);
CREATE TABLE survey_package_members (
 draft_id text PRIMARY KEY REFERENCES survey_instrument_drafts(id),import_id text NOT NULL REFERENCES survey_package_imports(id),
 slot_key text NOT NULL,technical_grant_id text NOT NULL UNIQUE REFERENCES survey_tool_grants(id),UNIQUE(import_id,slot_key)
);
CREATE TABLE survey_package_report_artifacts (
 id text PRIMARY KEY,project_id text NOT NULL REFERENCES survey_projects(id),wave_id text NOT NULL REFERENCES survey_waves(id),
 final_id text NOT NULL REFERENCES survey_wave_finals(id),import_id text NOT NULL REFERENCES survey_package_imports(id),
 tool_id text NOT NULL REFERENCES survey_governed_tools(id),snapshot_hash text NOT NULL,source_final_hash text NOT NULL,
 report_hash text NOT NULL,report_cipher text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(final_id,import_id)
);
CREATE INDEX survey_package_report_project ON survey_package_report_artifacts(project_id,wave_id,final_id);
CREATE FUNCTION survey_governed_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Survey governed content is append-only'; END $$;
CREATE TRIGGER survey_governed_trials_immutable BEFORE UPDATE OR DELETE ON survey_governed_trials FOR EACH ROW EXECUTE FUNCTION survey_governed_immutable();
CREATE TRIGGER survey_package_imports_immutable BEFORE UPDATE OR DELETE ON survey_package_imports FOR EACH ROW EXECUTE FUNCTION survey_governed_immutable();
CREATE TRIGGER survey_package_members_immutable BEFORE UPDATE OR DELETE ON survey_package_members FOR EACH ROW EXECUTE FUNCTION survey_governed_immutable();
CREATE TRIGGER survey_package_reports_immutable BEFORE UPDATE OR DELETE ON survey_package_report_artifacts FOR EACH ROW EXECUTE FUNCTION survey_governed_immutable();
CREATE FUNCTION survey_governed_tool_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Survey approval history is append-only'; END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'SUBMITTED' OR NEW.approved_by IS NOT NULL OR NEW.latest_trial IS NOT NULL OR NEW.measurement_release IS NOT NULL THEN RAISE EXCEPTION 'A new tool must start unapproved'; END IF; RETURN NEW; END IF;
 IF ROW(NEW.id,NEW.family,NEW.tool_key,NEW.tool_version,NEW.title,NEW.snapshot,NEW.snapshot_hash,NEW.reference,NEW.submitted_by,NEW.submitted_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.family,OLD.tool_key,OLD.tool_version,OLD.title,OLD.snapshot,OLD.snapshot_hash,OLD.reference,OLD.submitted_by,OLD.submitted_at) THEN RAISE EXCEPTION 'Submitted exact content is immutable'; END IF;
 IF OLD.approved_by IS NOT NULL AND ROW(NEW.approved_by,NEW.approved_at,NEW.approval_reason) IS DISTINCT FROM ROW(OLD.approved_by,OLD.approved_at,OLD.approval_reason) THEN RAISE EXCEPTION 'Historical approval identity is immutable'; END IF;
 IF NEW.state='ONLINE' AND (NEW.approved_by IS NULL OR NEW.latest_trial IS NULL OR jsonb_array_length(NEW.blockers)<>0 OR (SELECT count(*) FROM survey_governed_trials WHERE tool_id=NEW.id AND run_id=NEW.latest_trial)<>3) THEN RAISE EXCEPTION 'Committed trial evidence is required before online'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER survey_governed_tool_guard BEFORE INSERT OR UPDATE OR DELETE ON survey_governed_tools FOR EACH ROW EXECUTE FUNCTION survey_governed_tool_guard();
CREATE FUNCTION survey_package_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Package grant history is append-only'; END IF;
 IF ROW(NEW.id,NEW.tool_id,NEW.snapshot_hash,NEW.user_id,NEW.product,NEW.mode,NEW.valid_from,NEW.expires_at,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.tool_id,OLD.snapshot_hash,OLD.user_id,OLD.product,OLD.mode,OLD.valid_from,OLD.expires_at,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Package grant identity is immutable'; END IF;
 IF OLD.status='REVOKED' OR NEW.status<>'REVOKED' THEN RAISE EXCEPTION 'Package grant cannot be silently restored'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER survey_package_grant_guard BEFORE UPDATE OR DELETE ON survey_package_grants FOR EACH ROW EXECUTE FUNCTION survey_package_grant_guard();
