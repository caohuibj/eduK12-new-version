-- C21 additive, explicit NEW links only. No historical tokens/attempts rewritten.
CREATE TABLE training_public_rounds (
 id TEXT PRIMARY KEY,
 composite_id TEXT NOT NULL REFERENCES composite_assessments(id) ON DELETE RESTRICT,
 course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
 created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 published_at TIMESTAMP(3) NOT NULL,
 publication_hash TEXT NOT NULL CHECK(publication_hash ~ '^[0-9a-f]{64}$'),
 publication_identity JSONB NOT NULL,
 group_ip_policy JSONB NOT NULL,
 opens_at TIMESTAMP(3) NOT NULL,
 closes_at TIMESTAMP(3) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT training_public_round_window CHECK(closes_at>opens_at AND closes_at<=opens_at+interval '48 hours'),
 CONSTRAINT training_public_round_policy CHECK(group_ip_policy->>'schemaVersion'='1'
   AND jsonb_typeof(group_ip_policy->'timeZone')='string'
   AND group_ip_policy->>'activationDate' ~ '^\d{4}-\d{2}-\d{2}$')
);
CREATE INDEX training_public_rounds_composite_id_idx ON training_public_rounds(composite_id);
CREATE INDEX training_public_rounds_course_id_idx ON training_public_rounds(course_id);
ALTER TABLE composite_assessment_access_tokens ADD COLUMN training_round_id TEXT REFERENCES training_public_rounds(id) ON DELETE RESTRICT;
CREATE INDEX composite_assessment_access_tokens_training_round_id_idx ON composite_assessment_access_tokens(training_round_id);
CREATE FUNCTION training_public_round_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a composite_assessments; expected JSONB; expected_hash TEXT;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Training public round identity and window are immutable'; END IF;
 SELECT * INTO a FROM composite_assessments WHERE id=NEW.composite_id FOR SHARE;
 IF a.id IS NULL OR a.status::text<>'PUBLISHED' OR NOT a.public_enabled OR a.product_kind::text<>'QUESTIONNAIRE'
 OR a.questionnaire_type::text<>'COURSE' OR a.published_at IS DISTINCT FROM NEW.published_at
 OR (a.opens_at IS NOT NULL AND a.opens_at>NEW.opens_at)
 OR (a.expires_at IS NOT NULL AND a.expires_at<NEW.closes_at)
 OR NEW.opens_at>statement_timestamp() OR NEW.opens_at<statement_timestamp()-interval '5 minutes'
 OR (SELECT count(*) FROM questionnaire_course_deliveries WHERE composite_id=a.id)<>1 THEN
   RAISE EXCEPTION 'Training public round requires the exact active published course questionnaire'; END IF;
 PERFORM 1 FROM courses c JOIN questionnaire_course_deliveries q ON q.course_id=c.id AND q.composite_id=a.id
 JOIN users owner ON owner.id=a.created_by JOIN users actor ON actor.id=NEW.created_by
 WHERE c.id=NEW.course_id AND (c.ended_at IS NULL OR c.ended_at>=NEW.closes_at) AND c.course_type='TRAINING_COURSE' AND NOT c.is_library
 AND (owner.role::text='ADMIN' OR (owner.role::text='TEACHER' AND c.creator_id=owner.id))
 AND (actor.role::text='ADMIN' OR (actor.role::text='TEACHER' AND actor.id=a.created_by)) FOR SHARE OF c,q,owner,actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Training public round course/author mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM anonymous_study_waves w JOIN composite_assessment_access_tokens t ON t.id=w.access_token_id WHERE t.composite_assessment_id=a.id) THEN
   RAISE EXCEPTION 'Training public round does not compose with anonymous study'; END IF;
 IF NEW.group_ip_policy IS DISTINCT FROM jsonb_build_object('schemaVersion',1,'timeZone',NEW.group_ip_policy->>'timeZone','activationDate',NEW.group_ip_policy->>'activationDate')
 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.group_ip_policy->>'timeZone')
 OR to_char(NEW.opens_at AT TIME ZONE 'UTC' AT TIME ZONE (NEW.group_ip_policy->>'timeZone'),'YYYY-MM-DD') IS DISTINCT FROM NEW.group_ip_policy->>'activationDate' THEN
   RAISE EXCEPTION 'Training public round requires server activation date in a valid time zone'; END IF;
 expected=jsonb_build_object('schemaVersion',1,'compositeId',a.id,'courseId',NEW.course_id,
  'publishedAt',to_char(a.published_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'productKind',a.product_kind,
  'questionnaireType',a.questionnaire_type,'trainingFlowDigest',a.training_flow_digest,'trainingVariantDigest',a.training_variant_digest);
 IF NEW.publication_identity IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Training public round publication identity mismatch'; END IF;
 -- This closed identity contains only scalar strings/nulls and schemaVersion=1.
 -- Lexically ordered, whitespace-free JSON matches CANONICAL_JSON_SHA256_V1.
 SELECT encode(digest(convert_to('{'||string_agg(to_json(key)::text||':'||value::text,',' ORDER BY key COLLATE "C")||'}','UTF8'),'sha256'),'hex')
 INTO expected_hash FROM jsonb_each(expected);
 IF NEW.publication_hash IS DISTINCT FROM expected_hash THEN RAISE EXCEPTION 'Training public round publication hash mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_public_round_guard BEFORE INSERT OR UPDATE OR DELETE ON training_public_rounds FOR EACH ROW EXECUTE FUNCTION training_public_round_guard();
CREATE FUNCTION training_public_token_round_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r training_public_rounds;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.training_round_id IS NOT NULL THEN RAISE EXCEPTION 'Training public round links are retained; revoke instead'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.training_round_id IS DISTINCT FROM NEW.training_round_id
   OR (OLD.training_round_id IS NOT NULL AND (OLD.id,OLD.composite_assessment_id,OLD.token_hash,OLD.token_encrypted,OLD.created_by,OLD.created_at) IS DISTINCT FROM (NEW.id,NEW.composite_assessment_id,NEW.token_hash,NEW.token_encrypted,NEW.created_by,NEW.created_at))) THEN
   RAISE EXCEPTION 'Existing links cannot change or acquire a frozen round'; END IF;
 IF NEW.training_round_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO r FROM training_public_rounds WHERE id=NEW.training_round_id FOR SHARE;
 IF r.id IS NULL OR r.composite_id<>NEW.composite_assessment_id OR NEW.expires_at>r.closes_at
 OR NEW.token_hash IS NULL OR NEW.token IS NOT NULL
 OR (TG_OP='INSERT' AND (statement_timestamp()<r.opens_at OR statement_timestamp()>=r.closes_at)) THEN
   RAISE EXCEPTION 'New public link must retain its real active round and bounded expiry'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_public_token_round_guard BEFORE INSERT OR UPDATE OR DELETE ON composite_assessment_access_tokens FOR EACH ROW EXECUTE FUNCTION training_public_token_round_guard();
CREATE FUNCTION training_public_round_parent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='composite_assessments' THEN
  IF EXISTS(SELECT 1 FROM training_public_rounds WHERE composite_id=OLD.id) AND
   (OLD.id,OLD.created_by,OLD.published_at,OLD.product_kind,OLD.questionnaire_type,OLD.training_flow_frozen,OLD.training_flow_digest,OLD.training_variant_frozen,OLD.training_variant_digest)
   IS DISTINCT FROM
   (NEW.id,NEW.created_by,NEW.published_at,NEW.product_kind,NEW.questionnaire_type,NEW.training_flow_frozen,NEW.training_flow_digest,NEW.training_variant_frozen,NEW.training_variant_digest) THEN
    RAISE EXCEPTION 'Training public round publication identity is retained'; END IF;
 ELSIF TG_TABLE_NAME='courses' THEN
  IF EXISTS(SELECT 1 FROM training_public_rounds WHERE course_id=OLD.id) AND
   (OLD.id,OLD.creator_id,OLD.course_type,OLD.is_library) IS DISTINCT FROM (NEW.id,NEW.creator_id,NEW.course_type,NEW.is_library) THEN
    RAISE EXCEPTION 'Training public round course identity is retained'; END IF;
 ELSE
  -- Serialize BOTH source and destination delivery identities against round freeze.
  IF TG_OP='INSERT' THEN
   PERFORM id FROM composite_assessments WHERE id=NEW.composite_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM training_public_rounds WHERE composite_id=NEW.composite_id) THEN RAISE EXCEPTION 'Training public round delivery binding is retained'; END IF;
   RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
   PERFORM id FROM composite_assessments WHERE id=OLD.composite_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM training_public_rounds WHERE composite_id=OLD.composite_id) THEN RAISE EXCEPTION 'Training public round delivery binding is retained'; END IF;
  ELSE
   PERFORM id FROM composite_assessments WHERE id IN (OLD.composite_id,NEW.composite_id) ORDER BY id FOR UPDATE;
   IF (OLD.composite_id,OLD.course_id) IS DISTINCT FROM (NEW.composite_id,NEW.course_id)
   AND EXISTS(SELECT 1 FROM training_public_rounds WHERE composite_id IN (OLD.composite_id,NEW.composite_id)) THEN
    RAISE EXCEPTION 'Training public round delivery binding is retained'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_public_round_parent_guard BEFORE UPDATE ON composite_assessments FOR EACH ROW EXECUTE FUNCTION training_public_round_parent_guard();
CREATE TRIGGER training_public_round_course_guard BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION training_public_round_parent_guard();
CREATE TRIGGER training_public_round_delivery_guard BEFORE INSERT OR UPDATE OR DELETE ON questionnaire_course_deliveries FOR EACH ROW EXECUTE FUNCTION training_public_round_parent_guard();
CREATE FUNCTION training_public_round_study_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM a.id FROM composite_assessments a JOIN composite_assessment_access_tokens t ON t.composite_assessment_id=a.id
 WHERE t.id=NEW.access_token_id FOR UPDATE OF a;
 IF EXISTS(SELECT 1 FROM composite_assessment_access_tokens t JOIN training_public_rounds r ON r.composite_id=t.composite_assessment_id WHERE t.id=NEW.access_token_id) THEN
   RAISE EXCEPTION 'Training public round does not compose with anonymous study'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_public_round_study_guard BEFORE INSERT OR UPDATE ON anonymous_study_waves FOR EACH ROW EXECUTE FUNCTION training_public_round_study_guard();

-- Attempts bind the real link/round permanently. Never upgrade old admissions
-- into a later round; recovery credential rotation/status updates remain valid.
CREATE FUNCTION training_public_round_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r training_public_rounds;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (OLD.access_token_id,OLD.composite_assessment_id,OLD.user_id,OLD.delivery_course_id)
    IS NOT DISTINCT FROM (NEW.access_token_id,NEW.composite_assessment_id,NEW.user_id,NEW.delivery_course_id) THEN RETURN NEW; END IF;
  IF OLD.access_token_id IS NULL AND NEW.access_token_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM composite_assessment_access_tokens t WHERE t.id IN (OLD.access_token_id,NEW.access_token_id) AND t.training_round_id IS NOT NULL) THEN
   RAISE EXCEPTION 'Training public attempt link, course and anonymous identity are retained'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.access_token_id IS NULL THEN RETURN NEW; END IF;
 SELECT r0.* INTO r FROM composite_assessment_access_tokens t JOIN training_public_rounds r0 ON r0.id=t.training_round_id WHERE t.id=NEW.access_token_id;
 IF r.id IS NOT NULL AND (NEW.user_id IS NOT NULL OR NEW.composite_assessment_id IS DISTINCT FROM r.composite_id OR NEW.delivery_course_id IS DISTINCT FROM r.course_id) THEN
  RAISE EXCEPTION 'Training public attempt requires the exact round course and anonymous link'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_public_round_attempt_guard BEFORE INSERT OR UPDATE OF access_token_id,composite_assessment_id,user_id,delivery_course_id ON composite_assessment_attempts
 FOR EACH ROW EXECUTE FUNCTION training_public_round_attempt_guard();
