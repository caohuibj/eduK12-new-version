-- C22 is additive: historical policies/snapshots remain NULL. C21/C23 triggers
-- are neither replaced nor disabled. Release never changes scientific facts.
ALTER TABLE composite_assessments ADD COLUMN training_feedback_policy JSONB,
 ADD COLUMN training_feedback_policy_hash TEXT;
ALTER TABLE composite_assessment_attempts ADD COLUMN training_feedback_snapshot JSONB,
 ADD COLUMN training_feedback_snapshot_hash TEXT;
ALTER TABLE composite_assessments ADD CONSTRAINT training_feedback_policy_pair CHECK
 ((training_feedback_policy IS NULL)=(training_feedback_policy_hash IS NULL)
 AND (training_feedback_policy_hash IS NULL OR training_feedback_policy_hash ~ '^[0-9a-f]{64}$'));
ALTER TABLE composite_assessment_attempts ADD CONSTRAINT training_feedback_snapshot_pair CHECK
 ((training_feedback_snapshot IS NULL)=(training_feedback_snapshot_hash IS NULL)
 AND (training_feedback_snapshot_hash IS NULL OR training_feedback_snapshot_hash ~ '^[0-9a-f]{64}$'));

CREATE FUNCTION training_feedback_parent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.training_feedback_policy IS NOT NULL AND OLD.published_at IS NOT NULL
  AND (OLD.published_at IS DISTINCT FROM NEW.published_at OR NEW.status::text='DRAFT') THEN
  RAISE EXCEPTION 'Published Training feedback publication identity cannot be reset';
 END IF;
 IF (OLD.published_at IS NOT NULL OR OLD.status::text<>'DRAFT') AND (OLD.training_feedback_policy,OLD.training_feedback_policy_hash)
 IS DISTINCT FROM (NEW.training_feedback_policy,NEW.training_feedback_policy_hash) THEN
  RAISE EXCEPTION 'Published Training feedback policy is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_feedback_parent_guard BEFORE UPDATE ON composite_assessments FOR EACH ROW EXECUTE FUNCTION training_feedback_parent_guard();

CREATE FUNCTION training_feedback_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p composite_assessments; token_round TEXT;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (OLD.training_feedback_snapshot,OLD.training_feedback_snapshot_hash)
   IS DISTINCT FROM (NEW.training_feedback_snapshot,NEW.training_feedback_snapshot_hash) THEN
   RAISE EXCEPTION 'Training feedback attempt snapshot is immutable, including historical null';
  END IF;
  IF OLD.training_feedback_snapshot IS NOT NULL AND
   (OLD.id,OLD.composite_assessment_id,OLD.user_id,OLD.access_token_id,OLD.delivery_course_id,OLD.attempt_epoch)
   IS DISTINCT FROM (NEW.id,NEW.composite_assessment_id,NEW.user_id,NEW.access_token_id,NEW.delivery_course_id,NEW.attempt_epoch) THEN
   RAISE EXCEPTION 'Training feedback identity requires a new attempt';
  END IF;
 ELSE
  -- New attempts cannot silently bypass a configured publication, including
  -- when an older application binary is used for rollback.
  SELECT * INTO p FROM composite_assessments WHERE id=NEW.composite_assessment_id FOR SHARE;
  IF (p.training_feedback_policy IS NULL) IS DISTINCT FROM (NEW.training_feedback_snapshot IS NULL) THEN
   RAISE EXCEPTION 'Training feedback publication and attempt configuration mismatch';
  END IF;
  IF NEW.training_feedback_snapshot IS NOT NULL THEN
   SELECT training_round_id INTO token_round FROM composite_assessment_access_tokens WHERE id=NEW.access_token_id;
   IF NEW.training_feedback_snapshot->>'schemaVersion' IS DISTINCT FROM '1'
    OR NEW.training_feedback_snapshot->>'attemptId' IS DISTINCT FROM NEW.id
    OR NEW.training_feedback_snapshot->>'attemptEpoch' IS DISTINCT FROM NEW.attempt_epoch::text
    OR NEW.training_feedback_snapshot->>'compositeId' IS DISTINCT FROM NEW.composite_assessment_id
    OR NEW.training_feedback_snapshot->>'courseId' IS DISTINCT FROM NEW.delivery_course_id
    OR NEW.training_feedback_snapshot->>'roundId' IS DISTINCT FROM token_round
    OR NEW.training_feedback_snapshot->'policy' IS DISTINCT FROM p.training_feedback_policy
    OR NEW.training_feedback_snapshot->>'policyHash' IS DISTINCT FROM p.training_feedback_policy_hash
    OR p.product_kind IS DISTINCT FROM 'QUESTIONNAIRE' OR p.questionnaire_type::text IS DISTINCT FROM 'COURSE'
    OR NEW.delivery_course_id IS NULL OR NEW.attempt_epoch<1 THEN
    RAISE EXCEPTION 'Training feedback frozen identity mismatch';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_feedback_attempt_guard BEFORE INSERT OR UPDATE ON composite_assessment_attempts FOR EACH ROW EXECUTE FUNCTION training_feedback_attempt_guard();
