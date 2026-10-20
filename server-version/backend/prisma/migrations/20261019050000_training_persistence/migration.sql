-- Additive C23: no old policy, attempt, scientific fact or C21 round is rewritten.
ALTER TABLE composite_assessments ADD COLUMN training_persistence_policy JSONB,
 ADD COLUMN training_persistence_policy_hash TEXT;
ALTER TABLE composite_assessment_attempts ADD COLUMN training_persistence_snapshot JSONB,
 ADD COLUMN training_persistence_snapshot_hash TEXT;
ALTER TABLE composite_assessments ADD CONSTRAINT training_persistence_policy_pair CHECK
 ((training_persistence_policy IS NULL)=(training_persistence_policy_hash IS NULL)
 AND (training_persistence_policy_hash IS NULL OR training_persistence_policy_hash ~ '^[0-9a-f]{64}$'));
ALTER TABLE composite_assessment_attempts ADD CONSTRAINT training_persistence_snapshot_pair CHECK
 ((training_persistence_snapshot IS NULL)=(training_persistence_snapshot_hash IS NULL)
 AND (training_persistence_snapshot_hash IS NULL OR training_persistence_snapshot_hash ~ '^[0-9a-f]{64}$'));
CREATE TABLE training_attempt_checkpoints (
 attempt_id TEXT PRIMARY KEY REFERENCES composite_assessment_attempts(id) ON DELETE RESTRICT,
 snapshot_hash TEXT NOT NULL CHECK(snapshot_hash ~ '^[0-9a-f]{64}$'),
 definition_hash TEXT NOT NULL CHECK(definition_hash ~ '^[0-9a-f]{64}$'),
 attempt_epoch INTEGER NOT NULL CHECK(attempt_epoch>0),
 round_id TEXT REFERENCES training_public_rounds(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 successful_save_count INTEGER NOT NULL DEFAULT 0 CHECK(successful_save_count BETWEEN 0 AND 100),
 payload_encrypted TEXT,
 payload_hash TEXT,
 expires_at TIMESTAMP(3),
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT training_checkpoint_payload_pair CHECK
 ((payload_encrypted IS NULL)=(payload_hash IS NULL) AND (payload_encrypted IS NULL)=(expires_at IS NULL)
 AND (payload_hash IS NULL OR payload_hash ~ '^[0-9a-f]{64}$'))
);
-- Small candidate-only index: no payload fetch or repeated already-cleared work.
CREATE INDEX training_checkpoint_expiry_idx ON training_attempt_checkpoints(expires_at,attempt_id) WHERE payload_encrypted IS NOT NULL;
CREATE FUNCTION training_persistence_parent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status::text<>'DRAFT' AND (OLD.training_persistence_policy,OLD.training_persistence_policy_hash)
 IS DISTINCT FROM (NEW.training_persistence_policy,NEW.training_persistence_policy_hash) THEN
  RAISE EXCEPTION 'Published Training persistence policy is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_persistence_parent_guard BEFORE UPDATE ON composite_assessments FOR EACH ROW EXECUTE FUNCTION training_persistence_parent_guard();
CREATE FUNCTION training_persistence_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.training_persistence_snapshot,OLD.training_persistence_snapshot_hash)
 IS DISTINCT FROM (NEW.training_persistence_snapshot,NEW.training_persistence_snapshot_hash) THEN
  RAISE EXCEPTION 'Training persistence attempt snapshot is immutable, including historical null';
 END IF;
 IF OLD.training_persistence_snapshot IS NOT NULL AND
 (OLD.id,OLD.composite_assessment_id,OLD.user_id,OLD.access_token_id,OLD.delivery_course_id,OLD.attempt_epoch)
 IS DISTINCT FROM (NEW.id,NEW.composite_assessment_id,NEW.user_id,NEW.access_token_id,NEW.delivery_course_id,NEW.attempt_epoch) THEN
  RAISE EXCEPTION 'Training persistence identity requires a new attempt';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_persistence_attempt_guard BEFORE UPDATE ON composite_assessment_attempts FOR EACH ROW EXECUTE FUNCTION training_persistence_attempt_guard();
CREATE FUNCTION training_checkpoint_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a composite_assessment_attempts;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Training checkpoint identity and save budget are retained'; END IF;
 IF TG_OP='INSERT' AND (NEW.revision<>1 OR (NEW.payload_encrypted IS NULL AND NEW.successful_save_count<>0) OR (NEW.payload_encrypted IS NOT NULL AND NEW.successful_save_count<>1)) THEN
  RAISE EXCEPTION 'Training checkpoint must start with first save or explicit clear';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (OLD.attempt_id,OLD.snapshot_hash,OLD.definition_hash,OLD.attempt_epoch,OLD.round_id)
    IS DISTINCT FROM (NEW.attempt_id,NEW.snapshot_hash,NEW.definition_hash,NEW.attempt_epoch,NEW.round_id)
    OR NEW.revision<>OLD.revision+1 OR NEW.successful_save_count<OLD.successful_save_count
    OR NEW.successful_save_count>OLD.successful_save_count+1
    OR (NEW.payload_encrypted IS NOT NULL AND NEW.successful_save_count<>OLD.successful_save_count+1
      AND NOT (NEW.successful_save_count=OLD.successful_save_count AND (NEW.payload_encrypted,NEW.payload_hash) IS NOT DISTINCT FROM (OLD.payload_encrypted,OLD.payload_hash) AND NEW.expires_at<=OLD.expires_at))
    OR (NEW.payload_encrypted IS NULL AND NEW.successful_save_count<>OLD.successful_save_count) THEN
    RAISE EXCEPTION 'Training checkpoint identity/revision/cumulative budget violation';
  END IF;
 END IF;
 SELECT * INTO a FROM composite_assessment_attempts WHERE id=NEW.attempt_id;
 IF a.training_persistence_snapshot_hash IS DISTINCT FROM NEW.snapshot_hash
 OR a.frozen_active_slot_set_hash IS DISTINCT FROM NEW.definition_hash OR a.attempt_epoch<>NEW.attempt_epoch
 OR (a.training_persistence_snapshot->>'roundId') IS DISTINCT FROM NEW.round_id THEN
  RAISE EXCEPTION 'Training checkpoint frozen identity mismatch';
 END IF;
 IF NEW.payload_encrypted IS NOT NULL AND a.status::text<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Terminal Training attempts cannot retain checkpoint payload'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_checkpoint_guard BEFORE INSERT OR UPDATE OR DELETE ON training_attempt_checkpoints FOR EACH ROW EXECUTE FUNCTION training_checkpoint_guard();
-- All parent FINAL/restart/cancellation paths clear in the SAME transaction.
CREATE FUNCTION training_checkpoint_terminal_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status::text<>'IN_PROGRESS' THEN
  UPDATE training_attempt_checkpoints SET payload_encrypted=NULL,payload_hash=NULL,expires_at=NULL,
   revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE attempt_id=NEW.id AND payload_encrypted IS NOT NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_checkpoint_terminal_cleanup AFTER UPDATE OF status ON composite_assessment_attempts FOR EACH ROW WHEN (OLD.training_persistence_snapshot IS NOT NULL) EXECUTE FUNCTION training_checkpoint_terminal_cleanup();
-- A child FINAL invalidates stale CAS without deleting drafts for other units.
-- Read projects away accepted terminal slots from the retained encrypted envelope.
CREATE FUNCTION training_checkpoint_unit_final_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.composite_attempt_id IS NOT NULL THEN
  UPDATE training_attempt_checkpoints SET revision=revision+1,updated_at=CURRENT_TIMESTAMP
  WHERE attempt_id=NEW.composite_attempt_id AND payload_encrypted IS NOT NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_checkpoint_unit_final_revision AFTER INSERT ON assessment_unit_snapshots FOR EACH ROW EXECUTE FUNCTION training_checkpoint_unit_final_revision();
