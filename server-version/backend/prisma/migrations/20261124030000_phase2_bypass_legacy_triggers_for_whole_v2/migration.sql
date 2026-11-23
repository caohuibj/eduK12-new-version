-- Phase 2 PR 4:
-- 1. Skip legacy per-row JSONB/snapshot triggers on WHOLE_V2 rows
--    (`publication_hash IS NOT NULL`), eliminating PL/pgSQL trigger overhead on
--    single-row FINAL composite attempts while preserving legacy trigger checks
--    for pre-cutover rows (`publication_hash IS NULL`).
-- 2. Extend `huiteacher_field_final_digest` so WHOLE_V2 field evidence anchors
--    directly to `composite_attempt_finals.aggregate_hash`.

DROP TRIGGER IF EXISTS training_content_attempt_guard ON composite_assessment_attempts;
CREATE TRIGGER training_content_attempt_guard
  BEFORE INSERT OR UPDATE OF
    training_content_binding, training_content_binding_hash, id, composite_assessment_id, attempt_epoch
  ON composite_assessment_attempts
  FOR EACH ROW
  WHEN (NEW.publication_hash IS NULL)
  EXECUTE FUNCTION guard_training_content_attempt();

DROP TRIGGER IF EXISTS training_reference_binding_guard ON composite_assessment_attempts;
CREATE TRIGGER training_reference_binding_guard
  BEFORE INSERT OR UPDATE OF
    training_reference_binding, training_reference_binding_hash, training_content_binding, context_snapshot_hash
  ON composite_assessment_attempts
  FOR EACH ROW
  WHEN (NEW.publication_hash IS NULL)
  EXECUTE FUNCTION guard_training_reference_binding();

DROP TRIGGER IF EXISTS training_feedback_attempt_guard ON composite_assessment_attempts;
CREATE TRIGGER training_feedback_attempt_guard
  BEFORE INSERT OR UPDATE OF
    training_feedback_snapshot, training_feedback_snapshot_hash, id, composite_assessment_id, user_id, delivery_course_id, access_token_id, attempt_epoch
  ON composite_assessment_attempts
  FOR EACH ROW
  WHEN (NEW.publication_hash IS NULL)
  EXECUTE FUNCTION training_feedback_attempt_guard();

DROP TRIGGER IF EXISTS training_content_interpretation_guard ON composite_assessment_attempts;
CREATE TRIGGER training_content_interpretation_guard
  BEFORE INSERT OR UPDATE OF
    training_content_interpretation_encrypted, training_content_interpretation_hash, aggregate_input_hash, status, training_content_binding, attempt_epoch, id
  ON composite_assessment_attempts
  FOR EACH ROW
  WHEN (NEW.publication_hash IS NULL)
  EXECUTE FUNCTION guard_training_content_interpretation();

DROP TRIGGER IF EXISTS training_persistence_attempt_guard ON composite_assessment_attempts;
CREATE TRIGGER training_persistence_attempt_guard
  BEFORE UPDATE OF
    training_persistence_snapshot, training_persistence_snapshot_hash, id, composite_assessment_id, user_id, access_token_id, delivery_course_id, attempt_epoch
  ON composite_assessment_attempts
  FOR EACH ROW
  WHEN (NEW.publication_hash IS NULL)
  EXECUTE FUNCTION training_persistence_attempt_guard();

CREATE OR REPLACE FUNCTION huiteacher_field_final_digest(parent_id text, epoch integer) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p.publication_hash IS NOT NULL THEN (
      SELECT f.aggregate_hash
      FROM composite_attempt_finals f
      WHERE f.attempt_id = p.id AND f.attempt_epoch = p.attempt_epoch
      LIMIT 1
    )
    ELSE education_composition_binding_hash(jsonb_build_object(
      'kind', 'FIELD_FINAL_RECEIPT_DIGEST_V1',
      'attemptId', p.id,
      'attemptEpoch', p.attempt_epoch,
      'slotsHash', p.frozen_active_slot_set_hash,
      'receipts', (
        SELECT jsonb_agg(jsonb_build_object(
          'slotKey', s.slot_key,
          'unitType', s.unit_type,
          'sourceType', s.source_type,
          'sourceAttemptId', s.source_attempt_id,
          'sourceSubmissionId', s.source_submission_id,
          'sourceDefinitionHash', s.source_definition_hash,
          'compiledRuntimeHash', s.compiled_runtime_hash,
          'payloadHash', encode(sha256(convert_to(
            CASE WHEN s.unit_type = 'SCALE' THEN s.canonical_result_encrypted ELSE s.collection_facts_encrypted END,
            'UTF8'
          )), 'hex')
        ) ORDER BY s.slot_key)
        FROM assessment_unit_snapshots s
        WHERE s.composite_attempt_id = p.id
          AND s.attempt_epoch = p.attempt_epoch
          AND s.terminal_state = 'COMPLETED'
      )
    ))
  END
  FROM composite_assessment_attempts p
  WHERE p.id = parent_id AND p.attempt_epoch = epoch AND p.status = 'COMPLETED'
$$;
