-- Additive and nullable: old releases/templates/hashes and frozen attempts are not rewritten.
ALTER TABLE sjt_author_drafts ADD COLUMN authorization_policy TEXT,
 ADD COLUMN adaptation_source JSONB,
 ADD CONSTRAINT sjt_draft_authorization_policy CHECK (authorization_policy IS NULL OR authorization_policy='COURSE_GRANT_V1'),
 ADD CONSTRAINT sjt_draft_adaptation_policy CHECK (adaptation_source IS NULL OR (authorization_policy IS NOT NULL AND authorization_policy='COURSE_GRANT_V1'));
ALTER TABLE sjt_author_audits ADD COLUMN authorization_policy TEXT;
ALTER TABLE sjt_author_releases ADD COLUMN authorization_policy TEXT,
 ADD CONSTRAINT sjt_release_authorization_policy CHECK (authorization_policy IS NULL OR authorization_policy='COURSE_GRANT_V1'),
 ADD CONSTRAINT sjt_release_exact_grant_identity UNIQUE(id,instrument_key,instrument_version,definition_hash,content_digest);
CREATE TABLE sjt_release_grants (
 id TEXT PRIMARY KEY,
 release_id TEXT NOT NULL REFERENCES sjt_author_releases(id) ON DELETE RESTRICT,
 instrument_key TEXT NOT NULL, instrument_version TEXT NOT NULL,
 definition_hash TEXT NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
 content_digest TEXT NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
 grantee_teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
 purpose TEXT NOT NULL CHECK (purpose='TRAINING_COURSE'),
 permission TEXT NOT NULL CHECK (permission IN ('DISTRIBUTE','ADAPT')),
 valid_from TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
 version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
 grantor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 note TEXT NOT NULL CHECK (length(trim(note))>0),
 revoked_at TIMESTAMPTZ, revoked_by TEXT REFERENCES users(id) ON DELETE RESTRICT, revoke_note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT sjt_grant_exact_release FOREIGN KEY(release_id,instrument_key,instrument_version,definition_hash,content_digest)
 REFERENCES sjt_author_releases(id,instrument_key,instrument_version,definition_hash,content_digest) ON DELETE RESTRICT,
 CHECK (isfinite(valid_from) AND isfinite(expires_at) AND expires_at>valid_from),
 CHECK ((status='ACTIVE' AND revoked_at IS NULL AND revoked_by IS NULL AND revoke_note IS NULL AND version=1)
 OR (status='REVOKED' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_note IS NOT NULL AND length(trim(revoke_note))>0 AND version=2))
);
CREATE UNIQUE INDEX sjt_grant_active_scope ON sjt_release_grants(release_id,grantee_teacher_id,course_id,purpose,permission) WHERE status='ACTIVE';
CREATE INDEX sjt_release_grants_grantee_teacher_id_course_id_purpose_permi_idx ON sjt_release_grants(grantee_teacher_id,course_id,purpose,permission,status);
CREATE INDEX sjt_release_grants_release_id_status_idx ON sjt_release_grants(release_id,status);
CREATE TABLE sjt_release_grant_audits (
 id TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES sjt_release_grants(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('CREATE','REVOKE')), version INTEGER NOT NULL CHECK(version>0),
 snapshot JSONB NOT NULL, note TEXT NOT NULL CHECK(length(trim(note))>0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(grant_id,version)
);
-- Invoker-rights triggers work under the existing restricted runtime role; no
-- SECURITY DEFINER, role grants, owner bypass, or runtime DDL is introduced.
CREATE FUNCTION guard_sjt_release_grant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SJT grant evidence is retained'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','version','revoked_at','revoked_by','revoke_note'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','revoked_at','revoked_by','revoke_note'])
 OR OLD.status<>'ACTIVE' OR NEW.status<>'REVOKED' OR NEW.version<>OLD.version+1
 THEN RAISE EXCEPTION 'SJT grant scope is immutable; revoke and issue a new grant'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sjt_release_grant_immutable BEFORE UPDATE OR DELETE ON sjt_release_grants FOR EACH ROW EXECUTE FUNCTION guard_sjt_release_grant();
CREATE FUNCTION guard_sjt_grant_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SJT grant audit is append only'; END $$;
CREATE TRIGGER sjt_release_grant_audit_immutable BEFORE UPDATE OR DELETE ON sjt_release_grant_audits FOR EACH ROW EXECUTE FUNCTION guard_sjt_grant_audit();
CREATE FUNCTION guard_sjt_controlled_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.authorization_policy IS NOT NULL THEN RAISE EXCEPTION 'Controlled SJT release is immutable'; END IF;
  RETURN OLD;
 END IF;
 IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')
 OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status='PUBLISHED' AND NEW.status='RETIRED'))
 THEN RAISE EXCEPTION 'Published SJT release is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sjt_controlled_release_immutable BEFORE UPDATE OR DELETE ON sjt_author_releases FOR EACH ROW EXECUTE FUNCTION guard_sjt_controlled_release();
CREATE FUNCTION guard_sjt_adaptation_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.adaptation_source IS DISTINCT FROM NEW.adaptation_source
 OR (OLD.status='PUBLISHED' AND NEW IS DISTINCT FROM OLD)
 OR (OLD.authorization_policy='COURSE_GRANT_V1' AND NEW.authorization_policy IS DISTINCT FROM OLD.authorization_policy)
 THEN RAISE EXCEPTION 'SJT source and controlled policy cannot be removed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sjt_adaptation_source_immutable BEFORE UPDATE ON sjt_author_drafts FOR EACH ROW EXECUTE FUNCTION guard_sjt_adaptation_source();
