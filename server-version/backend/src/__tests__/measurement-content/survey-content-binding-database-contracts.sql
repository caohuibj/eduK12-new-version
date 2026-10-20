CREATE TEMP TABLE binding_contract_checks(name text PRIMARY KEY);
CREATE FUNCTION pg_temp.expect_binding_error(label text,statement text,needle text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failure text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT; END;
 IF failure IS NULL OR position(needle in failure)=0 THEN RAISE EXCEPTION 'Contract % expected %, got %',label,needle,failure; END IF;
 INSERT INTO binding_contract_checks VALUES(label);
END $$;
INSERT INTO survey_waves(id,project_id,ordinal,title,consent_text) VALUES ('v08-wave','v07-project',1,'Synthetic binding wave','Synthetic consent only');
INSERT INTO survey_wave_attempts(id,project_id,wave_id,session_hash) VALUES ('v08-attempt','v07-project','v08-wave','synthetic-session');
SELECT pg_temp.expect_binding_error('cipher pair required',$s$UPDATE survey_wave_attempts SET content_binding_cipher='encrypted' WHERE id='v08-attempt'$s$,'check constraint');
SELECT pg_temp.expect_binding_error('hash pair required',$s$UPDATE survey_wave_attempts SET content_binding_hash=repeat('a',64) WHERE id='v08-attempt'$s$,'check constraint');
SELECT pg_temp.expect_binding_error('hash format',$s$UPDATE survey_wave_attempts SET content_binding_cipher='encrypted',content_binding_hash='bad' WHERE id='v08-attempt'$s$,'check constraint');
UPDATE survey_wave_attempts SET content_binding_cipher='synthetic-encrypted-binding',content_binding_hash=repeat('a',64) WHERE id='v08-attempt';
SELECT pg_temp.expect_binding_error('binding immutable',$s$UPDATE survey_wave_attempts SET content_binding_cipher='changed' WHERE id='v08-attempt'$s$,'SURVEY_ATTEMPT_CONTENT_BINDING_IMMUTABLE');
SELECT pg_temp.expect_binding_error('binding cannot clear',$s$UPDATE survey_wave_attempts SET content_binding_cipher=NULL,content_binding_hash=NULL WHERE id='v08-attempt'$s$,'SURVEY_ATTEMPT_CONTENT_BINDING_IMMUTABLE');
SELECT pg_temp.expect_binding_error('bound scope immutable',$s$UPDATE survey_wave_attempts SET project_id='other' WHERE id='v08-attempt'$s$,'SURVEY_ATTEMPT_CONTENT_BINDING_IMMUTABLE');
UPDATE survey_wave_attempts SET status='COMPLETED',completed_at=now() WHERE id='v08-attempt';
DO $$ BEGIN IF (SELECT count(*) FROM binding_contract_checks)<>6 THEN RAISE EXCEPTION 'expected six binding constraints'; END IF; END $$;
