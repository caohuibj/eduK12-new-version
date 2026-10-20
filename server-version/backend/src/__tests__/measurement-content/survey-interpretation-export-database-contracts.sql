DO $$
DECLARE selected_format text; failure text;
BEGIN
 FOREACH selected_format IN ARRAY ARRAY['RAW_WAVE','RAW_LONG','RAW_WIDE','SCORE_LONG','SCORE_WIDE','COGNITIVE_TRIAL_LONG','INTERPRETATION_LONG'] LOOP
  INSERT INTO survey_export_tickets(id,project_id,actor_user_id,format,source_digest,artifact_hash,artifact_cipher,expires_at)
  VALUES ('v08-export-'||selected_format,'v07-project','v07-owner',selected_format,repeat('a',64),repeat('b',64),'synthetic-encrypted-export',now()+interval '10 minutes');
 END LOOP;
 BEGIN
  INSERT INTO survey_export_tickets(id,project_id,actor_user_id,format,source_digest,artifact_hash,artifact_cipher,expires_at)
  VALUES ('v08-export-invalid','v07-project','v07-owner','INVALID_FORMAT',repeat('a',64),repeat('b',64),'synthetic-encrypted-export',now()+interval '10 minutes');
 EXCEPTION WHEN check_violation THEN failure=SQLERRM;
 END;
 IF failure IS NULL OR position('survey_export_tickets_format_check' in failure)=0 THEN RAISE EXCEPTION 'invalid format not rejected'; END IF;
 IF (SELECT count(*) FROM survey_export_tickets WHERE id LIKE 'v08-export-%')<>7 THEN RAISE EXCEPTION 'expected seven valid formats'; END IF;
END $$;
