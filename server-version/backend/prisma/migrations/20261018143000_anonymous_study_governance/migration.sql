-- Additive only: legacy identity consent is NOT research consent. No backfill.
CREATE TABLE anonymous_study_consent_versions (
 id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES anonymous_studies(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0), body TEXT NOT NULL CHECK(length(body) BETWEEN 20 AND 20000),
 scope_id TEXT NOT NULL, scope JSONB NOT NULL, scope_hash TEXT NOT NULL CHECK(scope_hash ~ '^[0-9a-f]{64}$'),
 CHECK(scope_id=study_id), CHECK(jsonb_typeof(scope)='object'),
 body_hash TEXT NOT NULL CHECK(body_hash ~ '^[0-9a-f]{64}$'),
 published_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 published_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(study_id,version), UNIQUE(id,study_id), UNIQUE(id,study_id,body_hash)
);
CREATE TABLE anonymous_study_consent_acceptances (
 id TEXT PRIMARY KEY, study_id TEXT NOT NULL, participant_id TEXT NOT NULL,
 version_id TEXT NOT NULL, body_hash TEXT NOT NULL,
 accepted_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(participant_id,study_id) REFERENCES anonymous_study_participants(id,study_id) ON DELETE RESTRICT,
 FOREIGN KEY(version_id,study_id,body_hash) REFERENCES anonymous_study_consent_versions(id,study_id,body_hash) ON DELETE RESTRICT,
 UNIQUE(participant_id,version_id), UNIQUE(id,study_id,participant_id)
);
CREATE TABLE anonymous_study_research_states (
 participant_id TEXT PRIMARY KEY, study_id TEXT NOT NULL,
 acceptance_id TEXT, status TEXT NOT NULL CHECK(status IN ('CONSENTED','WITHDRAWAL_PENDING','EXCLUDED')),
 revision INTEGER NOT NULL CHECK(revision>0), updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(participant_id,study_id) REFERENCES anonymous_study_participants(id,study_id) ON DELETE RESTRICT,
 FOREIGN KEY(acceptance_id,study_id,participant_id) REFERENCES anonymous_study_consent_acceptances(id,study_id,participant_id) ON DELETE RESTRICT,
 CHECK(status!='CONSENTED' OR acceptance_id IS NOT NULL), UNIQUE(participant_id,study_id)
);
CREATE TABLE anonymous_study_research_audit (
 id TEXT PRIMARY KEY, study_id TEXT NOT NULL, participant_id TEXT NOT NULL,
 acceptance_id TEXT, status TEXT NOT NULL CHECK(status IN ('CONSENTED','WITHDRAWAL_PENDING','EXCLUDED')),
 previous_status TEXT NOT NULL CHECK(previous_status IN ('UNKNOWN','CONSENTED','WITHDRAWAL_PENDING','EXCLUDED')),
 revision INTEGER NOT NULL CHECK(revision>0), actor_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
 reason TEXT CHECK(length(reason) BETWEEN 2 AND 1000), created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(participant_id,study_id) REFERENCES anonymous_study_research_states(participant_id,study_id) ON DELETE RESTRICT,
 FOREIGN KEY(acceptance_id,study_id,participant_id) REFERENCES anonymous_study_consent_acceptances(id,study_id,participant_id) ON DELETE RESTRICT,
 UNIQUE(participant_id,revision)
);
CREATE INDEX anonymous_study_research_audit_study_idx ON anonymous_study_research_audit(study_id,participant_id);
CREATE FUNCTION anonymous_study_research_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Research consent and audit facts are append-only'; END $$;
CREATE TRIGGER anonymous_study_consent_versions_immutable BEFORE UPDATE OR DELETE ON anonymous_study_consent_versions FOR EACH ROW EXECUTE FUNCTION anonymous_study_research_immutable();
CREATE TRIGGER anonymous_study_consent_acceptances_immutable BEFORE UPDATE OR DELETE ON anonymous_study_consent_acceptances FOR EACH ROW EXECUTE FUNCTION anonymous_study_research_immutable();
CREATE TRIGGER anonymous_study_research_audit_immutable BEFORE UPDATE OR DELETE ON anonymous_study_research_audit FOR EACH ROW EXECUTE FUNCTION anonymous_study_research_immutable();
CREATE FUNCTION anonymous_study_research_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Research governance history is retained'; END IF;
 IF NEW.participant_id IS DISTINCT FROM OLD.participant_id OR NEW.study_id IS DISTINCT FROM OLD.study_id OR NEW.revision != OLD.revision+1
 OR (OLD.status IN ('WITHDRAWAL_PENDING','EXCLUDED') AND (NEW.acceptance_id IS DISTINCT FROM OLD.acceptance_id OR NEW.status!='EXCLUDED'))
 THEN RAISE EXCEPTION 'Research governance scope and withdrawal are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anonymous_study_research_state_guard BEFORE UPDATE OR DELETE ON anonymous_study_research_states FOR EACH ROW EXECUTE FUNCTION anonymous_study_research_state_guard();
CREATE FUNCTION anonymous_study_research_audit_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous TEXT;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM anonymous_study_research_states s WHERE s.participant_id=NEW.participant_id AND s.study_id=NEW.study_id
 AND s.acceptance_id IS NOT DISTINCT FROM NEW.acceptance_id AND s.status=NEW.status AND s.revision=NEW.revision) THEN RAISE EXCEPTION 'Research audit must bind current decision'; END IF;
 IF NEW.revision=1 THEN previous:='UNKNOWN'; ELSE SELECT status INTO previous FROM anonymous_study_research_audit WHERE participant_id=NEW.participant_id AND revision=NEW.revision-1; END IF;
 IF previous IS NULL OR previous IS DISTINCT FROM NEW.previous_status THEN RAISE EXCEPTION 'Research audit must extend prior decision'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anonymous_study_research_audit_binding BEFORE INSERT ON anonymous_study_research_audit FOR EACH ROW EXECUTE FUNCTION anonymous_study_research_audit_binding();
CREATE FUNCTION anonymous_study_research_requires_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM anonymous_study_research_audit a WHERE a.participant_id=NEW.participant_id AND a.study_id=NEW.study_id
 AND a.revision=NEW.revision AND a.status=NEW.status AND a.acceptance_id IS NOT DISTINCT FROM NEW.acceptance_id) THEN RAISE EXCEPTION 'Research decision requires immutable audit'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER anonymous_study_research_requires_audit AFTER INSERT OR UPDATE ON anonymous_study_research_states DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION anonymous_study_research_requires_audit();

-- Scope is the authorization boundary; later explanatory text cannot expand it.
CREATE FUNCTION anonymous_study_consent_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM anonymous_studies WHERE id=NEW.study_id FOR UPDATE;
 IF NEW.body_hash != encode(digest(NEW.body,'sha256'),'hex') THEN RAISE EXCEPTION 'Consent body hash mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM anonymous_study_consent_versions v WHERE v.study_id=NEW.study_id AND (v.scope_id IS DISTINCT FROM NEW.scope_id OR v.scope IS DISTINCT FROM NEW.scope OR v.scope_hash IS DISTINCT FROM NEW.scope_hash)) THEN
   RAISE EXCEPTION 'Study research purpose scope is immutable; create another study';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anonymous_study_consent_scope_guard BEFORE INSERT ON anonymous_study_consent_versions FOR EACH ROW EXECUTE FUNCTION anonymous_study_consent_scope_guard();
