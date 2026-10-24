-- Additive Survey-only governance. Existing answers, releases, accounts and keys are untouched.
CREATE TABLE survey_tool_policies (
 resource_key text NOT NULL, fingerprint text NOT NULL,
 decision text NOT NULL DEFAULT 'PENDING' CHECK(decision IN ('PENDING','APPROVED','RETURNED')),
 paused boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 reason text NOT NULL, reviewed_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(resource_key,fingerprint)
);
CREATE TABLE survey_system_export_grants (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 project_id text NOT NULL REFERENCES survey_projects(id) ON DELETE RESTRICT,
 pseudonym_salt text NOT NULL, capability text NOT NULL CHECK(capability='DEIDENTIFIED_EXPORT'),
 issued_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT, reason text NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX survey_system_export_grants_scope ON survey_system_export_grants(user_id,project_id,expires_at);
CREATE TABLE survey_admin_data_audits (
 id text PRIMARY KEY, actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 project_id text REFERENCES survey_projects(id) ON DELETE RESTRICT,
 action text NOT NULL, reason text NOT NULL CHECK(length(trim(reason))>0),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION survey_admin_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Survey administrator data audit is append-only'; END $$;
CREATE TRIGGER survey_admin_audit_immutable BEFORE UPDATE OR DELETE ON survey_admin_data_audits
 FOR EACH ROW EXECUTE FUNCTION survey_admin_audit_append_only();
