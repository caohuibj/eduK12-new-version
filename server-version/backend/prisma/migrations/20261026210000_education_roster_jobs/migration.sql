CREATE TABLE education_roster_import_jobs (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 entry TEXT NOT NULL CHECK(entry IN ('SCHOOL','TEACHER')),
 kind TEXT NOT NULL CHECK(kind IN ('GRADE','CLASS','STUDENT','STAFF','ASSIGNMENT')),
 input_digest TEXT NOT NULL, source_digest TEXT NOT NULL,
 row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 5000),
 part_count INTEGER NOT NULL CHECK(part_count BETWEEN 1 AND 50),
 status TEXT NOT NULL DEFAULT 'PREVIEWING' CHECK(status IN ('PREVIEWING','PREVIEW_ERROR','READY','RUNNING','PAUSED','COMPLETED')),
 verified_offline BOOLEAN NOT NULL DEFAULT FALSE, confirmed_at TIMESTAMPTZ(6),
 runner_digest TEXT, runner_expires_at TIMESTAMPTZ(6),
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days',
 UNIQUE(organization_id,id)
);
CREATE INDEX education_roster_jobs_owner_idx ON education_roster_import_jobs(organization_id,actor_user_id,entry,created_at DESC,id);
CREATE TABLE education_roster_import_parts (
 organization_id TEXT NOT NULL, job_id TEXT NOT NULL, part_index INTEGER NOT NULL CHECK(part_index BETWEEN 0 AND 49),
 batch_id TEXT NOT NULL UNIQUE,
 input_digest TEXT NOT NULL, row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 100),
 state TEXT NOT NULL DEFAULT 'PLANNED' CHECK(state IN ('PLANNED','PREVIEWED','COMMITTED')),
 preview_token TEXT, planned_add INTEGER NOT NULL DEFAULT 0, planned_skip INTEGER NOT NULL DEFAULT 0,
 error_count INTEGER NOT NULL DEFAULT 0, needs_verification BOOLEAN NOT NULL DEFAULT FALSE,
 issues JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(issues)='array'),
 receipt JSONB, committed_at TIMESTAMPTZ(6),
 PRIMARY KEY(job_id,part_index),
 FOREIGN KEY(organization_id,job_id) REFERENCES education_roster_import_jobs(organization_id,id) ON DELETE RESTRICT,
 CHECK((state='COMMITTED')=(receipt IS NOT NULL)),
 CHECK((state='COMMITTED')=(committed_at IS NOT NULL))
);
CREATE FUNCTION preserve_roster_part_receipt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.state='COMMITTED' AND (TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD) THEN
  RAISE EXCEPTION 'committed roster receipts are immutable' USING ERRCODE='23000';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER education_roster_part_receipt_immutable BEFORE UPDATE OR DELETE ON education_roster_import_parts FOR EACH ROW EXECUTE FUNCTION preserve_roster_part_receipt();
