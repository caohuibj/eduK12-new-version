-- C20 is additive and opt-in. No historical attempt, publication, or hash backfill.
CREATE TABLE training_material_experiments (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
 experiment_key TEXT NOT NULL CHECK(length(experiment_key) BETWEEN 1 AND 200),
 group_keys_hash TEXT NOT NULL CHECK(group_keys_hash ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX training_material_experiment_scope_key ON training_material_experiments(owner_id,course_id,experiment_key);
CREATE TABLE training_material_quota_buckets (
 id TEXT PRIMARY KEY,
 composite_id TEXT NOT NULL REFERENCES composite_assessments(id) ON DELETE RESTRICT,
 publication_key TEXT NOT NULL CHECK(length(publication_key) BETWEEN 1 AND 100),
 config_digest TEXT NOT NULL CHECK(config_digest ~ '^[0-9a-f]{64}$'),
 group_key TEXT NOT NULL CHECK(length(group_key) BETWEEN 1 AND 200),
 max_assigned INTEGER NOT NULL CHECK(max_assigned BETWEEN 1 AND 10000),
 assigned_count INTEGER NOT NULL DEFAULT 0 CHECK(assigned_count BETWEEN 0 AND max_assigned)
);
CREATE UNIQUE INDEX training_material_quota_scope_key ON training_material_quota_buckets(composite_id,publication_key,config_digest,group_key);
CREATE TABLE training_material_allocation_claims (
 id TEXT PRIMARY KEY,
 experiment_id TEXT NOT NULL REFERENCES training_material_experiments(id) ON DELETE RESTRICT,
 composite_id TEXT NOT NULL REFERENCES composite_assessments(id) ON DELETE RESTRICT,
 publication_key TEXT NOT NULL CHECK(length(publication_key) BETWEEN 1 AND 100),
 config_digest TEXT NOT NULL CHECK(config_digest ~ '^[0-9a-f]{64}$'),
 participant_key TEXT NOT NULL CHECK(length(participant_key) BETWEEN 1 AND 500),
 group_key TEXT NOT NULL CHECK(length(group_key) BETWEEN 1 AND 200),
 algorithm TEXT NOT NULL CHECK(algorithm IN ('CRYPTO_RANDOM_INT_V1','CRYPTO_QUOTA_WEIGHTED_V1','LINKED_INHERIT_V1')),
 inherited_from_claim_id TEXT REFERENCES training_material_allocation_claims(id) ON DELETE RESTRICT,
 initial_attempt_id TEXT NOT NULL,
 material_digest TEXT NOT NULL CHECK(material_digest ~ '^[0-9a-f]{64}$'),
 reservation_ordinal INTEGER CHECK(reservation_ordinal BETWEEN 1 AND 10000),
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT training_material_claim_attempt_fk FOREIGN KEY(initial_attempt_id) REFERENCES composite_assessment_attempts(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT training_material_claim_inheritance CHECK((algorithm='LINKED_INHERIT_V1')=(inherited_from_claim_id IS NOT NULL) AND inherited_from_claim_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX training_material_claim_attempt_key ON training_material_allocation_claims(initial_attempt_id);
CREATE UNIQUE INDEX training_material_claim_reservation_key ON training_material_allocation_claims(composite_id,publication_key,config_digest,group_key,reservation_ordinal);
CREATE INDEX training_material_claim_subject_idx ON training_material_allocation_claims(experiment_id,participant_key);
CREATE INDEX training_material_claim_quota_idx ON training_material_allocation_claims(composite_id,publication_key,config_digest,group_key);
CREATE TABLE training_material_subject_bindings (
 id TEXT PRIMARY KEY,
 experiment_id TEXT NOT NULL REFERENCES training_material_experiments(id) ON DELETE RESTRICT,
 participant_key TEXT NOT NULL CHECK(participant_key LIKE 'user:%' AND length(participant_key)>5),
 group_key TEXT NOT NULL CHECK(length(group_key) BETWEEN 1 AND 200),
 initial_claim_id TEXT NOT NULL,
 CONSTRAINT training_material_binding_initial_claim_fk FOREIGN KEY(initial_claim_id) REFERENCES training_material_allocation_claims(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX training_material_binding_subject_key ON training_material_subject_bindings(experiment_id,participant_key);

CREATE FUNCTION training_material_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Training material identity and receipts are immutable'; END $$;
CREATE TRIGGER training_material_experiment_immutable BEFORE UPDATE OR DELETE ON training_material_experiments FOR EACH ROW EXECUTE FUNCTION training_material_immutable();
CREATE TRIGGER training_material_binding_immutable BEFORE UPDATE OR DELETE ON training_material_subject_bindings FOR EACH ROW EXECUTE FUNCTION training_material_immutable();
CREATE TRIGGER training_material_claim_immutable BEFORE UPDATE OR DELETE ON training_material_allocation_claims FOR EACH ROW EXECUTE FUNCTION training_material_immutable();
CREATE FUNCTION training_material_experiment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Matches composite authoring: ADMIN may author on another creator's course;
 -- TEACHER authors only on their own course. A share is not authoring authority.
 PERFORM 1 FROM courses c JOIN users u ON u.id=NEW.owner_id
 WHERE c.id=NEW.course_id AND c.course_type='TRAINING_COURSE' AND NOT c.is_library
 AND (u.role::text='ADMIN' OR (u.role::text='TEACHER' AND c.creator_id=u.id))
 FOR SHARE OF c,u;
 IF NOT FOUND THEN RAISE EXCEPTION 'Training material experiment requires an authorized nonlibrary Training course'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_material_experiment_guard BEFORE INSERT ON training_material_experiments FOR EACH ROW EXECUTE FUNCTION training_material_experiment_guard();

CREATE FUNCTION training_material_quota_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE config JSONB;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Training material quota is retained'; END IF;
 IF TG_OP='UPDATE' THEN
   IF (to_jsonb(NEW)-'assigned_count') IS DISTINCT FROM (to_jsonb(OLD)-'assigned_count')
     OR NEW.assigned_count <> OLD.assigned_count + 1 THEN
     RAISE EXCEPTION 'Training material quota identity and consumed capacity are immutable';
   END IF;
   RETURN NEW;
 END IF;
 SELECT a.training_flow_frozen INTO config FROM composite_assessments a
 JOIN questionnaire_course_deliveries q ON q.composite_id=a.id JOIN courses c ON c.id=q.course_id
 WHERE a.id=NEW.composite_id AND c.course_type='TRAINING_COURSE' AND NOT c.is_library
 AND to_char(a.published_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=NEW.publication_key AND a.training_flow_digest=NEW.config_digest
 FOR SHARE OF a,q,c;
 IF config IS NULL OR config->>'schemaVersion' IS DISTINCT FROM '2'
 OR config->'quotaPolicy'->'groupLimits'->>NEW.group_key IS DISTINCT FROM NEW.max_assigned::text
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(config->'experiment'->'groups') g WHERE g->>'groupKey'=NEW.group_key)
 OR NEW.assigned_count<>0 THEN RAISE EXCEPTION 'Training material quota must match the frozen publication and start empty'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_material_quota_guard BEFORE INSERT OR UPDATE OR DELETE ON training_material_quota_buckets FOR EACH ROW EXECUTE FUNCTION training_material_quota_guard();

-- Deferred checks permit claim-before-parent and binding-before-claim ordering
-- inside the same admission transaction; nothing incomplete can commit.
CREATE FUNCTION training_material_claim_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE config JSONB; experiment_key_value TEXT;
BEGIN
 SELECT a.training_flow_frozen,e.experiment_key INTO config,experiment_key_value
 FROM composite_assessments a JOIN training_material_experiments e ON e.id=NEW.experiment_id
 JOIN courses c ON c.id=e.course_id JOIN composite_assessment_attempts t ON t.id=NEW.initial_attempt_id
 JOIN questionnaire_course_deliveries q ON q.composite_id=a.id AND q.course_id=e.course_id
 WHERE a.id=NEW.composite_id AND a.created_by=e.owner_id
 AND c.course_type='TRAINING_COURSE' AND NOT c.is_library
 AND t.composite_assessment_id=a.id AND t.participant_key=NEW.participant_key
 AND t.delivery_course_id=e.course_id
 AND to_char(a.published_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=NEW.publication_key AND a.training_flow_digest=NEW.config_digest
 FOR SHARE OF a,e,c,t,q;
 IF config IS NULL OR config->>'schemaVersion' IS DISTINCT FROM '2'
 OR config->'experiment'->>'experimentKey' IS DISTINCT FROM experiment_key_value
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(config->'experiment'->'groups') g WHERE g->>'groupKey'=NEW.group_key) THEN
   RAISE EXCEPTION 'Training material claim must bind the exact frozen course, author, attempt, experiment and group';
 END IF;
 IF NEW.inherited_from_claim_id IS NOT NULL AND (
   config->'experiment'->>'linkedPolicy' IS DISTINCT FROM 'KEEP_LINKED'
   OR NOT EXISTS(SELECT 1 FROM training_material_allocation_claims prior
     JOIN training_material_subject_bindings b ON b.initial_claim_id=prior.id
     WHERE prior.id=NEW.inherited_from_claim_id AND prior.experiment_id=NEW.experiment_id
     AND prior.participant_key=NEW.participant_key AND prior.group_key=NEW.group_key
     AND b.experiment_id=NEW.experiment_id AND b.participant_key=NEW.participant_key AND b.group_key=NEW.group_key)
 ) THEN RAISE EXCEPTION 'Training material inheritance requires the exact durable subject binding'; END IF;
 IF config->'quotaPolicy' IS NOT NULL AND config->'quotaPolicy'<>'null'::jsonb THEN
   IF NOT EXISTS(SELECT 1 FROM training_material_quota_buckets b WHERE b.composite_id=NEW.composite_id
     AND b.publication_key=NEW.publication_key AND b.config_digest=NEW.config_digest AND b.group_key=NEW.group_key
     AND b.max_assigned::text=config->'quotaPolicy'->'groupLimits'->>NEW.group_key
     AND NEW.reservation_ordinal BETWEEN 1 AND b.assigned_count AND NEW.reservation_ordinal<=b.max_assigned)
   OR NEW.algorithm='CRYPTO_RANDOM_INT_V1' THEN RAISE EXCEPTION 'Training material claim requires its frozen quota reservation'; END IF;
 ELSIF NEW.algorithm='CRYPTO_QUOTA_WEIGHTED_V1' OR NEW.reservation_ordinal IS NOT NULL THEN RAISE EXCEPTION 'Training material quota algorithm requires a quota policy'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER training_material_claim_scope AFTER INSERT ON training_material_allocation_claims
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION training_material_claim_scope();
CREATE FUNCTION training_material_quota_claim_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM training_material_allocation_claims claim
   WHERE claim.composite_id=NEW.composite_id AND claim.publication_key=NEW.publication_key
     AND claim.config_digest=NEW.config_digest AND claim.group_key=NEW.group_key
     AND claim.reservation_ordinal=NEW.assigned_count) THEN
   RAISE EXCEPTION 'Training material quota increment requires its unique immutable claim';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER training_material_quota_claim_scope AFTER UPDATE ON training_material_quota_buckets
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION training_material_quota_claim_scope();
CREATE FUNCTION training_material_binding_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM training_material_allocation_claims a
   JOIN composite_assessment_attempts t ON t.id=a.initial_attempt_id
   JOIN composite_assessments c ON c.id=a.composite_id
   WHERE a.id=NEW.initial_claim_id AND a.experiment_id=NEW.experiment_id
   AND a.participant_key=NEW.participant_key AND a.group_key=NEW.group_key
   AND a.inherited_from_claim_id IS NULL AND NEW.participant_key='user:'||t.user_id
   AND c.training_flow_frozen->'experiment'->>'linkedPolicy'='KEEP_LINKED') THEN
   RAISE EXCEPTION 'Training material binding requires its exact first authenticated linked claim';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER training_material_binding_scope AFTER INSERT ON training_material_subject_bindings
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION training_material_binding_scope();

-- Protect referenced identity from being moved after the insertion checks.
-- V2 has no separate publication-history store: preserve its exact frozen
-- publication forever. Status may still change (including archive). V1 is unchanged.
CREATE FUNCTION training_material_parent_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='courses' THEN
   IF (OLD.id,OLD.creator_id,OLD.course_type,OLD.is_library) IS DISTINCT FROM (NEW.id,NEW.creator_id,NEW.course_type,NEW.is_library)
   AND EXISTS(SELECT 1 FROM training_material_experiments WHERE course_id=OLD.id) THEN
     RAISE EXCEPTION 'Training material course identity is retained'; END IF;
 ELSIF TG_TABLE_NAME='composite_assessments' THEN
   IF OLD.training_flow_frozen->>'schemaVersion'='2'
   AND (OLD.published_at,OLD.training_flow_frozen,OLD.training_flow_digest)
     IS DISTINCT FROM (NEW.published_at,NEW.training_flow_frozen,NEW.training_flow_digest) THEN
     RAISE EXCEPTION 'Training material V2 frozen publication is immutable'; END IF;
   IF (OLD.id,OLD.created_by) IS DISTINCT FROM (NEW.id,NEW.created_by)
   AND (EXISTS(SELECT 1 FROM training_material_allocation_claims WHERE composite_id=OLD.id)
     OR EXISTS(SELECT 1 FROM training_material_quota_buckets WHERE composite_id=OLD.id)) THEN
     RAISE EXCEPTION 'Training material publication owner and course are retained'; END IF;
 ELSE
   IF (OLD.id,OLD.composite_assessment_id,OLD.participant_key,OLD.user_id,OLD.delivery_course_id)
     IS DISTINCT FROM (NEW.id,NEW.composite_assessment_id,NEW.participant_key,NEW.user_id,NEW.delivery_course_id)
   AND EXISTS(SELECT 1 FROM training_material_allocation_claims WHERE initial_attempt_id=OLD.id) THEN
     RAISE EXCEPTION 'Training material initial attempt identity is retained'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_material_course_identity BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION training_material_parent_identity_guard();
CREATE TRIGGER training_material_composite_identity BEFORE UPDATE ON composite_assessments FOR EACH ROW EXECUTE FUNCTION training_material_parent_identity_guard();
CREATE TRIGGER training_material_attempt_identity BEFORE UPDATE ON composite_assessment_attempts FOR EACH ROW EXECUTE FUNCTION training_material_parent_identity_guard();
