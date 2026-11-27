BEGIN;
-- Keep the existing publication seal and teach its standard-scale projection
-- to consume the exact report policy. Existing snapshots retain their JSON shape.
DO $migration$
DECLARE body text; old_text text; new_text text;
BEGIN
  body:=pg_get_functiondef('protect_education_composition()'::regprocedure);

  old_text:=$old$'respondentDisclosure',jsonb_build_object('numericScores',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,numericScores}')::boolean,false),'references',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,references}')::boolean,false),'individualInterpretations',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,individualInterpretations}')::boolean,false),'scoreDerivedLabels',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,scoreDerivedLabels}')::boolean,false),'resultQualityDetails',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,resultQualityDetails}')::boolean,false),'rawAnswers',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,rawAnswers}')::boolean,false),'itemScores',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,itemScores}')::boolean,false),'methods',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,methods}')::boolean,false),'educationalContent',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,educationalContent}')::boolean,false)))),$old$;
  new_text:=$new$'respondentDisclosure',
       CASE WHEN standard_source.snapshot ? 'effectiveDisclosure'
        THEN standard_source.snapshot#>'{effectiveDisclosure,audiences,respondent}'
        ELSE jsonb_build_object('numericScores',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,numericScores}')::boolean,false),'references',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,references}')::boolean,false),'individualInterpretations',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,individualInterpretations}')::boolean,false),'scoreDerivedLabels',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,scoreDerivedLabels}')::boolean,false),'resultQualityDetails',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,resultQualityDetails}')::boolean,false),'rawAnswers',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,rawAnswers}')::boolean,false),'itemScores',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,itemScores}')::boolean,false),'methods',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,methods}')::boolean,false),'educationalContent',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,educationalContent}')::boolean,false))
       END)),
$new$;
  IF length(body)-length(replace(body,old_text,''))<>length(old_text) THEN
    RAISE EXCEPTION 'Unexpected standard respondent disclosure seal predecessor';
  END IF;
  body:=replace(body,old_text,new_text);

  old_text:=$old$'generatorVersion','DECLARATIVE_REPORT_V1','template',standard_source.snapshot->'template');$old$;
  new_text:=$new$'generatorVersion','DECLARATIVE_REPORT_V1','template',standard_source.snapshot->'template')
      || CASE WHEN standard_source.snapshot ? 'effectiveDisclosure'
       THEN jsonb_build_object('effectiveDisclosure',standard_source.snapshot->'effectiveDisclosure') ELSE '{}'::jsonb END;$new$;
  IF length(body)-length(replace(body,old_text,''))<>length(old_text) THEN
    RAISE EXCEPTION 'Unexpected standard report content seal predecessor';
  END IF;
  body:=replace(body,old_text,new_text);

  old_text:=$old$IF (scale_source.code=standard_source.snapshot->>'toolKey' AND scale_source.instrument_version=standard_source.snapshot->>'instrumentVersion'
     AND scale_source.status='PUBLISHED' AND scale_source.instrument_class='STANDARD' AND scale_source.library_entry_id IS NULL
     AND (scale_source.definition-ARRAY['source','license','report','referencePolicy'])=standard_source.snapshot#>'{parts,CONTENT,payload}'$old$;
  new_text:=$new$IF (
     CASE WHEN standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,databaseSource,kind}'='DB_IMPORTED'
      THEN scale_source.standard_source_kind='DB_IMPORTED'
       AND scale_source.standard_tool_key=standard_source.snapshot->>'toolKey'
       AND scale_source.id=standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,databaseSource,scaleId}'
      ELSE scale_source.code=standard_source.snapshot->>'toolKey' AND scale_source.standard_source_kind<>'DB_IMPORTED' END
     AND scale_source.instrument_version=standard_source.snapshot->>'instrumentVersion'
     AND scale_source.status='PUBLISHED' AND scale_source.instrument_class='STANDARD' AND scale_source.library_entry_id IS NULL
     AND (scale_source.definition-ARRAY['source','license','report','referencePolicy'])=
      CASE WHEN standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,databaseSource,kind}'='DB_IMPORTED'
       THEN standard_source.snapshot#>'{parts,CONTENT,payload,measurement}'
       ELSE (standard_source.snapshot#>'{parts,CONTENT,payload}')-'dataCeiling' END$new$;
  IF length(body)-length(replace(body,old_text,''))<>length(old_text) THEN
    RAISE EXCEPTION 'Unexpected standard content seal predecessor';
  END IF;
  body:=replace(body,old_text,new_text);

  old_text:=$old$AND derived.asset_refs='[]'::jsonb
      AND derived.provenance=jsonb_build_object('standardCombinationId',standard_source.id,'combinationHash',standard_source.combination_hash,
       'parametersAxisHash',standard_source.snapshot#>>'{parts,PARAMETERS,hash}','reportAxisHash',standard_source.snapshot#>>'{parts,REPORT,hash}')
      AND derived.content=expected_report$old$;
  new_text:=$new$AND derived.asset_refs=COALESCE(standard_source.snapshot#>'{parts,REPORT,payload,assetRefs}','[]'::jsonb)
      AND derived.provenance=jsonb_build_object('standardCombinationId',standard_source.id,'combinationHash',standard_source.combination_hash,
       'parametersAxisHash',standard_source.snapshot#>>'{parts,PARAMETERS,hash}','reportAxisHash',standard_source.snapshot#>>'{parts,REPORT,hash}')
      AND derived.content=expected_report$new$;
  IF length(body)-length(replace(body,old_text,''))<>length(old_text) THEN
    RAISE EXCEPTION 'Unexpected standard report assets seal predecessor';
  END IF;
  EXECUTE replace(body,old_text,new_text);
END $migration$;
COMMIT;
