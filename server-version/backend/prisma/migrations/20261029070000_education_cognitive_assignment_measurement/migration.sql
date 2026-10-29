-- Keep the original Training pointer contract. Education's internal native
-- wrapper attaches its exact M before its final Composite root is inserted.
-- The existing protect_education_composition -> education_native_composition_unit
-- seal already validates that final root's entry/org/owner/source/profile,
-- complete manifest and child mapping; do not add another root admission gate.
BEGIN;
CREATE OR REPLACE FUNCTION guard_assignment_measurement_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.measurement_release_id IS NOT NULL AND
  (OLD.measurement_release_id,OLD.config_id,OLD.created_by,OLD.profile,OLD.profile_definition_version,
   OLD.resolved_config_snapshot_encrypted,OLD.resolved_config_hash)
  IS DISTINCT FROM (NEW.measurement_release_id,NEW.config_id,NEW.created_by,NEW.profile,NEW.profile_definition_version,
   NEW.resolved_config_snapshot_encrypted,NEW.resolved_config_hash) THEN
  RAISE EXCEPTION 'ASSIGNMENT_MEASUREMENT_IDENTITY_IMMUTABLE';
 END IF;
 IF NEW.measurement_release_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM measurement_content_releases r
  WHERE r.id=NEW.measurement_release_id AND r.layer='MEASUREMENT' AND r.family='COGNITIVE'
   AND r.scope->>'kind'='PRIVATE'
   AND r.scope->>'ownerId'=NEW.created_by AND r.scope->>'resourceId'=NEW.id
   AND (r.scope->>'product'='TRAINING' OR (
    r.scope->>'product' IN ('SCHOOL','TEACHER')
    AND r.scope=jsonb_build_object('kind','PRIVATE','product',r.scope->>'product','ownerId',NEW.created_by,'resourceId',NEW.id)
    AND NEW.course_id IS NULL AND NOT NEW.listed_standalone AND NEW.required
    AND NEW.quota_source_assignment_id IS NULL AND NEW.max_attempts=1
    AND NEW.opens_at IS NULL AND NEW.due_at IS NULL AND NEW.published_at IS NOT NULL
    AND NEW.profile IN ('experience','standard','research') AND NEW.profile_definition_version<>''
    AND NEW.resolved_config_hash ~ '^[0-9a-f]{64}$'
    AND NEW.resolved_config_snapshot_encrypted IS NOT NULL AND NEW.resolved_report_snapshot_encrypted IS NOT NULL
    AND r.provenance#>>'{educationNative,reportHash}' ~ '^[0-9a-f]{64}$'
    AND EXISTS(SELECT 1 FROM cognitive_test_configs config
     JOIN measurement_content_releases original ON original.id=config.measurement_release_id
      AND original.layer='MEASUREMENT' AND original.family='COGNITIVE' AND original.scope->>'kind'='PLATFORM'
     WHERE config.id=NEW.config_id
      AND r.content->>'runnerKey'=config.test_type AND r.content->>'runnerVersion'=config.engine_version
      AND r.content->>'scoringVersion'=config.scoring_version AND r.content->>'instrumentVersion'=config.config_version
      AND r.provenance=jsonb_build_object('configId',NEW.config_id,'assignmentId',NEW.id,
       'educationNative',jsonb_build_object('provider','COGNITIVE_CONFIG','sourceId',config.id,
        'contentHash',original.content_hash,'sourceMeasurementReleaseId',original.id,
        'profile',NEW.profile,'profileDefinitionVersion',NEW.profile_definition_version,
        'resolvedConfigHash',NEW.resolved_config_hash,'reportHash',r.provenance#>>'{educationNative,reportHash}')))
   ))) THEN
  RAISE EXCEPTION 'ASSIGNMENT_MEASUREMENT_SCOPE_MISMATCH';
 END IF;
 RETURN NEW;
END $$;
COMMIT;
