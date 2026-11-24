-- Phase 2 storage convergence (WHOLE_V2):
-- Deduplicates repeated per-attempt `training_content_binding` static payloads into
-- content-addressed `assessment_public_templates` (`TRAINING_CONTENT_BINDING_PLAN`),
-- storing `{ "schemaVersion": 2, "templateHash": "<sha256>" }` (~96 B) on WHOLE_V2
-- rows while retaining exact canonical `training_content_binding_hash` semantics and
-- full V1 backwards compatibility.

CREATE OR REPLACE FUNCTION guard_training_content_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE publication composite_assessments;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF (OLD.training_content_binding,OLD.training_content_binding_hash)
     IS DISTINCT FROM (NEW.training_content_binding,NEW.training_content_binding_hash) THEN
     RAISE EXCEPTION 'Training content binding is immutable, including legacy null';
   END IF;
   IF OLD.training_content_binding IS NOT NULL AND
      (OLD.id,OLD.composite_assessment_id,OLD.attempt_epoch)
      IS DISTINCT FROM (NEW.id,NEW.composite_assessment_id,NEW.attempt_epoch) THEN
     RAISE EXCEPTION 'Training content binding requires a new attempt identity';
   END IF;
 END IF;
 IF NEW.training_content_binding IS NOT NULL THEN
   SELECT * INTO STRICT publication FROM composite_assessments
     WHERE id=NEW.composite_assessment_id FOR SHARE;
   IF NEW.training_content_binding->>'schemaVersion'='2' AND NOT (NEW.training_content_binding ? 'units') THEN
     IF NEW.publication_hash IS NULL
        OR jsonb_typeof(NEW.training_content_binding) IS DISTINCT FROM 'object'
        OR (NEW.training_content_binding->'schemaVersion') IS DISTINCT FROM '2'::jsonb
        OR (NEW.training_content_binding - 'schemaVersion' - 'templateHash') IS DISTINCT FROM '{}'::jsonb
        OR COALESCE(NEW.training_content_binding->>'templateHash','') !~ '^[a-f0-9]{64}$'
        OR publication.training_content_snapshot IS NULL
        OR COALESCE(publication.training_content_snapshot_hash,'') !~ '^[a-f0-9]{64}$'
        OR jsonb_typeof(publication.training_content_snapshot->'units') IS DISTINCT FROM 'array' THEN
       RAISE EXCEPTION 'Training content binding publication mismatch';
     END IF;
     IF NOT EXISTS (
       SELECT 1 FROM assessment_public_templates t
       WHERE t.template_hash=NEW.training_content_binding->>'templateHash'
         AND t.template_kind='TRAINING_CONTENT_BINDING_PLAN'
     ) THEN
       RAISE EXCEPTION 'Training attempt compact binding template not committed';
     END IF;
   ELSE
     IF ((NEW.training_content_binding->>'attemptId'=NEW.id)
        AND (NEW.training_content_binding->>'compositeId'=NEW.composite_assessment_id)
        AND (NEW.training_content_binding->>'epoch'=NEW.attempt_epoch::text)
        AND (NEW.training_content_binding->>'publicationHash'=publication.training_content_snapshot_hash)) IS NOT TRUE THEN
       RAISE EXCEPTION 'Training content binding publication mismatch';
     END IF;
     IF jsonb_typeof(NEW.training_content_binding->'units') IS DISTINCT FROM 'array'
        OR jsonb_typeof(publication.training_content_snapshot->'units') IS DISTINCT FROM 'array' THEN
       RAISE EXCEPTION 'Training content units must be explicit arrays';
     END IF;
     IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.training_content_binding->'units') unit
       WHERE (publication.training_content_snapshot->'units' @> jsonb_build_array(unit)) IS NOT TRUE) THEN
       RAISE EXCEPTION 'Training attempt unit is not in its frozen publication';
     END IF;
     IF (SELECT COUNT(*) FROM jsonb_array_elements(NEW.training_content_binding->'units')) <>
        (SELECT COUNT(DISTINCT unit->>'itemId') FROM jsonb_array_elements(NEW.training_content_binding->'units') unit) THEN
       RAISE EXCEPTION 'Training attempt contains duplicate or missing item identities';
     END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_training_reference_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected JSONB; content_unit JSONB; slot JSONB; binding_units JSONB; pub_snapshot JSONB; is_compact BOOLEAN;
BEGIN
 IF TG_OP='UPDATE' AND OLD.training_reference_binding IS NOT NULL AND
    (OLD.training_reference_binding,OLD.training_reference_binding_hash)
    IS DISTINCT FROM (NEW.training_reference_binding,NEW.training_reference_binding_hash) THEN
   RAISE EXCEPTION 'Training reference selection is immutable';
 END IF;
 IF NEW.training_reference_binding IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.training_reference_binding IS NULL AND OLD.status::text<>'IN_PROGRESS' THEN
   RAISE EXCEPTION 'Training reference selection cannot backfill completed history';
 END IF;
 IF NEW.training_content_binding IS NULL THEN
   RAISE EXCEPTION 'Training reference selection context identity mismatch';
 END IF;
 is_compact := (NEW.training_content_binding->>'schemaVersion'='2' AND NOT (NEW.training_content_binding ? 'units'));
 IF is_compact THEN
   SELECT training_content_snapshot INTO pub_snapshot FROM composite_assessments
     WHERE id=NEW.composite_assessment_id FOR SHARE;
   binding_units := pub_snapshot->'units';
 ELSE
   binding_units := NEW.training_content_binding->'units';
 END IF;
 IF ((NEW.training_reference_binding->>'schemaVersion'='1')
     AND (NEW.training_reference_binding->>'attemptId'=NEW.id)
     AND (NEW.training_reference_binding->>'epoch'=NEW.attempt_epoch::text)
     AND (NEW.training_reference_binding->>'contentBindingHash'=NEW.training_content_binding_hash)) IS NOT TRUE
    OR (NEW.training_reference_binding->>'contextHash') IS DISTINCT FROM NEW.context_snapshot_hash
    OR jsonb_typeof(NEW.training_reference_binding->'units') IS DISTINCT FROM 'array'
    OR jsonb_typeof(binding_units) IS DISTINCT FROM 'array'
    OR (
      CASE WHEN is_compact AND NEW.training_variant_allocation_encrypted IS NOT NULL
        THEN jsonb_array_length(NEW.training_reference_binding->'units')>jsonb_array_length(binding_units)
        ELSE jsonb_array_length(NEW.training_reference_binding->'units')<>jsonb_array_length(binding_units)
      END
    ) THEN
   RAISE EXCEPTION 'Training reference selection context identity mismatch';
 END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(NEW.training_reference_binding->'units')) <>
    (SELECT count(DISTINCT u->>'itemId') FROM jsonb_array_elements(NEW.training_reference_binding->'units') u) THEN
   RAISE EXCEPTION 'Training reference selection duplicate items';
 END IF;
 FOR selected IN SELECT * FROM jsonb_array_elements(NEW.training_reference_binding->'units') LOOP
   SELECT u INTO content_unit FROM jsonb_array_elements(binding_units) u WHERE u->>'itemId'=selected->>'itemId';
   IF content_unit IS NULL OR jsonb_typeof(selected->'references') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'Training reference selection unknown unit';
   END IF;
   FOR slot IN SELECT * FROM jsonb_array_elements(selected->'references') LOOP
     IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(content_unit->'referencePolicy'->'choices','[]'::jsonb)) c
       WHERE c->>'metricKey'=slot->>'metricKey' AND c->>'referenceKind'=slot->>'referenceKind'
        AND (slot->>'status'='UNAVAILABLE' OR (slot->>'status'='SELECTED' AND c->>'releaseId'=slot->>'releaseId'
          AND c->>'contentHash'=slot->>'contentHash' AND c->>'entryKey'=slot->>'entryKey'))) THEN
       RAISE EXCEPTION 'Training reference selection is outside frozen publication';
     END IF;
   END LOOP;
 END LOOP;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_training_interpretation_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'training interpretation artifacts are immutable'; END IF;
 PERFORM 1 FROM composite_assessment_attempts a
  JOIN composite_assessments c ON c.id=a.composite_assessment_id
  WHERE a.id=NEW.attempt_id AND a.composite_assessment_id=NEW.composite_id AND a.delivery_course_id=NEW.course_id
   AND a.attempt_epoch=NEW.attempt_epoch AND a.status='COMPLETED' AND a.delivery_mode='FINAL_ONLY' AND a.runtime_generation='UNIFIED_V1'
   AND a.aggregate_input_hash=NEW.source_aggregate_hash AND a.training_content_binding_hash=NEW.source_binding_hash
   AND a.training_content_interpretation_hash=NEW.source_receipt_hash
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(
     CASE WHEN a.training_content_binding->>'schemaVersion'='2' AND NOT (a.training_content_binding ? 'units')
       THEN c.training_content_snapshot->'units'
       ELSE a.training_content_binding->'units'
     END
   ) u WHERE u->>'itemId'=NEW.item_id) FOR SHARE OF a;
 IF NOT FOUND THEN RAISE EXCEPTION 'training interpretation source identity mismatch'; END IF;
 IF NEW.previous_artifact_id IS NOT NULL THEN
  PERFORM 1 FROM training_interpretation_artifacts p WHERE p.id=NEW.previous_artifact_id
   AND p.attempt_id=NEW.attempt_id AND p.attempt_epoch=NEW.attempt_epoch AND p.course_id=NEW.course_id
   AND p.composite_id=NEW.composite_id AND p.item_id=NEW.item_id AND p.source_receipt_hash=NEW.source_receipt_hash FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'training interpretation predecessor identity mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
