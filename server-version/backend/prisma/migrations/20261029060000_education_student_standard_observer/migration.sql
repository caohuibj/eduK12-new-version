-- Keep existing approved sources untouched. A newly selected STANDARD student
-- observer source needs both its legal OBSERVER policy and an explicit, exact
-- education administration; a generic observer policy does not suffice.
BEGIN;
CREATE FUNCTION education_student_standard_matches(snapshot jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(snapshot#>>'{definition,respondentType}' IN ('student_report','observer_report')
  AND snapshot#>>'{parts,CONTENT,reference,metadata,applicability,schemaVersion}'='1'
  AND jsonb_typeof(snapshot#>'{parts,CONTENT,reference,metadata,applicability,respondentTypes}')='array'
  AND jsonb_array_length(snapshot#>'{parts,CONTENT,reference,metadata,applicability,respondentTypes}')>0
  AND (snapshot#>'{parts,CONTENT,reference,metadata,applicability,respondentTypes}') ? 'OBSERVER'
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(snapshot#>'{parts,CONTENT,reference,metadata,applicability,respondentTypes}') value
   WHERE value NOT IN ('SELF','PARENT','TEACHER','OBSERVER','CLINICIAN'))
  AND CASE WHEN jsonb_typeof(snapshot#>'{parts,CONTENT,reference,metadata,educationApplicability}')='object'
   AND jsonb_typeof(snapshot#>'{parts,CONTENT,reference,metadata,educationApplicability,administrations}')='array' THEN
   snapshot#>'{parts,CONTENT,reference,metadata,educationApplicability,schemaVersion}'='1'::jsonb
   AND ((snapshot#>'{parts,CONTENT,reference,metadata,educationApplicability}')-ARRAY['schemaVersion','administrations'])='{}'::jsonb
   AND jsonb_array_length(snapshot#>'{parts,CONTENT,reference,metadata,educationApplicability,administrations}') BETWEEN 1 AND 5
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot#>'{parts,CONTENT,reference,metadata,educationApplicability,administrations}') a
    WHERE jsonb_typeof(a)<>'object' OR (a-ARRAY['population','responseMode'])<>'{}'::jsonb
     OR COALESCE(a->>'population','') NOT IN ('STUDENT','TEACHER') OR NOT COALESCE(a->>'responseMode'='SELF'
      OR a->>'population'='STUDENT' AND a->>'responseMode' IN ('PARENT_REPORT','TEACHER_REPORT')
      OR a->>'population'='TEACHER' AND a->>'responseMode'='STUDENT_REPORT',false))
   AND (SELECT count(DISTINCT (a->>'population',a->>'responseMode')) FROM jsonb_array_elements(snapshot#>'{parts,CONTENT,reference,metadata,educationApplicability,administrations}') a)
    =jsonb_array_length(snapshot#>'{parts,CONTENT,reference,metadata,educationApplicability,administrations}')
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot#>'{parts,CONTENT,reference,metadata,educationApplicability,administrations}') a
    WHERE a->>'population'='TEACHER' AND a->>'responseMode'='STUDENT_REPORT')
   ELSE false END,false)
$$;
DO $migration$
DECLARE body text;predecessor text;replacement text;
BEGIN
 body:=pg_get_functiondef('protect_education_composition()'::regprocedure);
 predecessor:=$old$ELSE NOT COALESCE((standard_source.snapshot#>'{parts,CONTENT,reference,metadata,applicability,respondentTypes}') ?
    CASE split_part(variant,':',2) WHEN 'SELF' THEN 'SELF' WHEN 'PARENT_REPORT' THEN 'PARENT' ELSE 'TEACHER' END,false) END$old$;
 replacement:=$new$WHEN variant='TEACHER:STUDENT_REPORT' THEN NOT education_student_standard_matches(standard_source.snapshot)
   ELSE NOT COALESCE((standard_source.snapshot#>'{parts,CONTENT,reference,metadata,applicability,respondentTypes}') ?
    CASE split_part(variant,':',2) WHEN 'SELF' THEN 'SELF' WHEN 'PARENT_REPORT' THEN 'PARENT' ELSE 'TEACHER' END,false) END$new$;
 IF length(body)-length(replace(body,predecessor,''))<>length(predecessor) THEN RAISE EXCEPTION 'Unexpected student STANDARD seal predecessor'; END IF;
 EXECUTE replace(body,predecessor,replacement);
END $migration$;
COMMIT;
