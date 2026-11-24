-- Phase 2 PR 4:
-- 1. Keep parent-row governance integrity triggers (`training_content_attempt_guard`,
--    `training_feedback_attempt_guard`, `training_persistence_attempt_guard`) active
--    for WHOLE_V2 rows as well (since V2 START persists those parent snapshots).
--    Only scope legacy outbox-only triggers (`training_reference_binding_guard`,
--    `training_content_interpretation_guard`) to pre-V2 rows (`publication_hash IS NULL`),
--    because WHOLE_V2 anchors immutable results directly in `composite_attempt_finals`.
-- 2. Extend `huiteacher_field_final_digest` so WHOLE_V2 field evidence anchors
--    directly to `composite_attempt_finals.aggregate_hash`.

DROP TRIGGER IF EXISTS training_reference_binding_guard ON composite_assessment_attempts;
CREATE TRIGGER training_reference_binding_guard
  BEFORE INSERT OR UPDATE OF
    training_reference_binding, training_reference_binding_hash, training_content_binding, context_snapshot_hash
  ON composite_assessment_attempts
  FOR EACH ROW
  WHEN (NEW.publication_hash IS NULL)
  EXECUTE FUNCTION guard_training_reference_binding();

DROP TRIGGER IF EXISTS training_content_interpretation_guard ON composite_assessment_attempts;
CREATE TRIGGER training_content_interpretation_guard
  BEFORE INSERT OR UPDATE OF
    training_content_interpretation_encrypted, training_content_interpretation_hash, aggregate_input_hash, status, training_content_binding, attempt_epoch, id
  ON composite_assessment_attempts
  FOR EACH ROW
  WHEN (NEW.publication_hash IS NULL)
  EXECUTE FUNCTION guard_training_content_interpretation();

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
