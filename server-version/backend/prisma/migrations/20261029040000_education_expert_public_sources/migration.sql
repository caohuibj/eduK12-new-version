-- New explicit expert declarations on immutable approved public/library
-- sources. Existing V1 applicability, real source data and grants stay intact.
BEGIN;
CREATE FUNCTION education_expert_applicability_matches(declaration jsonb,target_kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(CASE WHEN jsonb_typeof(declaration)='object' AND jsonb_typeof(declaration->'administrations')='array' THEN
  declaration->'schemaVersion'='2'::jsonb AND (declaration-ARRAY['schemaVersion','administrations'])='{}'::jsonb
  AND jsonb_array_length(declaration->'administrations') BETWEEN 1 AND 6
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(declaration->'administrations') a
   WHERE jsonb_typeof(a)<>'object' OR (a-ARRAY['population','responseMode','targetKind'])<>'{}'::jsonb
    OR a->>'population' IS DISTINCT FROM 'TEACHER' OR a->>'responseMode' IS DISTINCT FROM 'EXPERT_REPORT'
    OR a->>'targetKind' IS NULL OR a->>'targetKind' NOT IN ('PERSON','TEAM','ORGANIZATION','ACTIVITY','ARTIFACT','PROJECT'))
  AND (SELECT count(DISTINCT a->>'targetKind') FROM jsonb_array_elements(declaration->'administrations') a)=jsonb_array_length(declaration->'administrations')
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(declaration->'administrations') a WHERE a->>'targetKind'=target_kind)
 ELSE false END,false)
$$;
CREATE FUNCTION education_expert_library_matches(snapshot jsonb,target_kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(education_expert_applicability_matches(snapshot->'educationExpertApplicability',target_kind)
  AND snapshot->>'educationExpertApplicabilityCompilerVersion'='EDUCATION_EXPERT_APPLICABILITY_V2'
  AND snapshot->>'educationExpertApplicabilityHash'=education_composition_binding_hash(jsonb_build_object(
   'compilerVersion','EDUCATION_EXPERT_APPLICABILITY_V2','declaration',snapshot->'educationExpertApplicability')),false)
$$;

-- Replace only the exact previous branch fragments. All native C/P/R,
-- measurement/media/source and immutable child guards remain in place.
DO $migration$
DECLARE body text;old_text text;new_text text;
BEGIN
 body:=pg_get_functiondef('protect_education_composition()'::regprocedure);
 FOR old_text,new_text IN SELECT * FROM (VALUES
 ($old$WHERE expert_block#>>'{source,provider}' IS DISTINCT FROM 'PRIVATE_VERSION'
       OR (expert_block#>>'{source,kind}'='SCALE' AND (v.definition#>>'{administration,targetKind}'<>'PERSON'
        OR expert_leaf.definition->>'respondentType' IS DISTINCT FROM 'expert_report'))$old$,
  $new$WHERE expert_block#>>'{source,kind}'='SCALE' AND (v.definition#>>'{administration,targetKind}'<>'PERSON'
        OR (expert_block#>>'{source,provider}'='PRIVATE_VERSION' AND expert_leaf.definition->>'respondentType' IS DISTINCT FROM 'expert_report'))$new$),
 ($old$IF NOT FOUND OR NOT COALESCE((standard_source.snapshot#>'{parts,CONTENT,reference,metadata,applicability,respondentTypes}') ?
    CASE split_part(variant,':',2) WHEN 'SELF' THEN 'SELF' WHEN 'PARENT_REPORT' THEN 'PARENT' ELSE 'TEACHER' END,false)$old$,
  $new$IF NOT FOUND OR CASE WHEN variant='TEACHER:EXPERT_REPORT' THEN
    NOT education_expert_applicability_matches(standard_source.snapshot#>'{parts,CONTENT,reference,metadata,educationExpertApplicability}',origin->>'targetKind')
    OR origin->>'targetKind'<>'PERSON' OR NOT COALESCE(standard_source.snapshot#>>'{definition,respondentType}' IN ('expert_report','observer_report'),false)
    OR NOT COALESCE((standard_source.snapshot#>'{parts,CONTENT,reference,metadata,applicability,respondentTypes}') ? 'OBSERVER',false)
   ELSE NOT COALESCE((standard_source.snapshot#>'{parts,CONTENT,reference,metadata,applicability,respondentTypes}') ?
    CASE split_part(variant,':',2) WHEN 'SELF' THEN 'SELF' WHEN 'PARENT_REPORT' THEN 'PARENT' ELSE 'TEACHER' END,false) END$new$),
 ($old$OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public_form.snapshot#>'{reference,metadata,annotations,educationApplicability,administrations}') administration
     WHERE administration->>'population'=split_part(variant,':',1) AND administration->>'responseMode'=split_part(variant,':',2))$old$,
  $new$OR CASE WHEN variant='TEACHER:EXPERT_REPORT' THEN
     NOT education_expert_applicability_matches(public_form.snapshot#>'{reference,metadata,annotations,educationExpertApplicability}',origin->>'targetKind')
    ELSE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public_form.snapshot#>'{reference,metadata,annotations,educationApplicability,administrations}') administration
     WHERE administration->>'population'=split_part(variant,':',1) AND administration->>'responseMode'=split_part(variant,':',2)) END$new$),
 ($old$AND EXISTS(SELECT 1 FROM jsonb_array_elements(library_submission.snapshot#>'{educationApplicability,administrations}') administration
      WHERE administration->>'population'=split_part(variant,':',1) AND administration->>'responseMode'=split_part(variant,':',2))$old$,
  $new$AND CASE WHEN variant='TEACHER:EXPERT_REPORT' THEN origin->>'targetKind'='PERSON'
      AND source_definition->>'respondentType' IN ('expert_report','observer_report')
      AND education_expert_library_matches(library_submission.snapshot,origin->>'targetKind')
     ELSE EXISTS(SELECT 1 FROM jsonb_array_elements(library_submission.snapshot#>'{educationApplicability,administrations}') administration
      WHERE administration->>'population'=split_part(variant,':',1) AND administration->>'responseMode'=split_part(variant,':',2)) END$new$)
 ) replacements(old_text,new_text) LOOP
  IF length(body)-length(replace(body,old_text,''))<>length(old_text) THEN RAISE EXCEPTION 'Unexpected expert public-source seal predecessor'; END IF;
  body:=replace(body,old_text,new_text);
 END LOOP;
 EXECUTE body;
END $migration$;
COMMIT;
