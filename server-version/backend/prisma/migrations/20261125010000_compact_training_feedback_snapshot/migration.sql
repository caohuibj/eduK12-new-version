-- New compact snapshots reference the existing immutable publication policy.
-- Historical V1 snapshots and all identity/update guards remain unchanged.
CREATE OR REPLACE FUNCTION training_feedback_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
   IF (NEW.training_feedback_snapshot->>'schemaVersion' NOT IN ('1','2') OR NEW.training_feedback_snapshot->>'schemaVersion' IS NULL)
    OR NEW.training_feedback_snapshot->>'attemptId' IS DISTINCT FROM NEW.id
    OR NEW.training_feedback_snapshot->>'attemptEpoch' IS DISTINCT FROM NEW.attempt_epoch::text
    OR NEW.training_feedback_snapshot->>'compositeId' IS DISTINCT FROM NEW.composite_assessment_id
    OR NEW.training_feedback_snapshot->>'courseId' IS DISTINCT FROM NEW.delivery_course_id
    OR NEW.training_feedback_snapshot->>'accessTokenId' IS DISTINCT FROM NEW.access_token_id
    OR NEW.training_feedback_snapshot->>'roundId' IS DISTINCT FROM token_round
    OR (NEW.training_feedback_snapshot->>'schemaVersion'='1' AND NEW.training_feedback_snapshot->'policy' IS DISTINCT FROM p.training_feedback_policy)
    OR (NEW.training_feedback_snapshot->>'schemaVersion'='2' AND (
      (NEW.training_feedback_snapshot-ARRAY['schemaVersion','attemptId','attemptEpoch','compositeId','courseId','publicationHash','policyHash','accessTokenId','roundId'])<>'{}'::jsonb
      OR NOT (NEW.training_feedback_snapshot ?& ARRAY['attemptId','attemptEpoch','compositeId','courseId','publicationHash','policyHash','accessTokenId','roundId'])
      OR COALESCE(NEW.training_feedback_snapshot->>'publicationHash','') !~ '^[a-f0-9]{64}$'))
    OR NEW.training_feedback_snapshot->>'policyHash' IS DISTINCT FROM p.training_feedback_policy_hash
    OR p.product_kind IS DISTINCT FROM 'QUESTIONNAIRE' OR p.questionnaire_type::text IS DISTINCT FROM 'COURSE'
    OR NEW.delivery_course_id IS NULL OR NEW.attempt_epoch<1 THEN
    RAISE EXCEPTION 'Training feedback frozen identity mismatch';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
