CREATE TEMP TABLE reinterpret_artifact_checks(name text PRIMARY KEY);
CREATE FUNCTION pg_temp.expect_artifact_error(label text,statement text,needle text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failure text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT; END;
 IF failure IS NULL OR position(needle in failure)=0 THEN RAISE EXCEPTION 'Contract % expected %, got %',label,needle,failure; END IF;
 INSERT INTO reinterpret_artifact_checks VALUES(label);
END $$;
INSERT INTO survey_publications(id,project_id,definition_digest,compiled_snapshot,consent_version,version)
VALUES('v08-artifact-publication','v07-project',repeat('a',64),'{}',1,43000);
INSERT INTO survey_wave_finals(id,attempt_id,project_id,wave_id,publication_id,submission_id,payload_hash,definition_digest,results_cipher,results_hash)
VALUES('v08-artifact-final','v08-attempt','v07-project','v08-wave','v08-artifact-publication','v08-artifact-submission',repeat('b',64),repeat('a',64),'synthetic-facts',repeat('c',64));
INSERT INTO survey_interpretation_artifacts(id,final_id,created_by,request_hash,source_final_hash,artifact_cipher,artifact_hash)
VALUES('v08-artifact','v08-artifact-final','v07-owner',repeat('d',64),repeat('c',64),'synthetic-interpretation',repeat('e',64));
SELECT pg_temp.expect_artifact_error('cannot rewrite report',$s$UPDATE survey_interpretation_artifacts SET artifact_cipher='changed' WHERE id='v08-artifact'$s$,'survey interpretation artifacts are immutable');
SELECT pg_temp.expect_artifact_error('cannot erase interpretation',$s$DELETE FROM survey_interpretation_artifacts WHERE id='v08-artifact'$s$,'survey interpretation artifacts are immutable');
SELECT pg_temp.expect_artifact_error('must match actual FINAL hash',$s$INSERT INTO survey_interpretation_artifacts(id,final_id,created_by,request_hash,source_final_hash,artifact_cipher,artifact_hash) VALUES('v08-bad-hash','v08-artifact-final','v07-owner',repeat('d',64),repeat('f',64),'synthetic',repeat('e',64))$s$,'survey interpretation source identity mismatch');
SELECT pg_temp.expect_artifact_error('must have actual FINAL',$s$INSERT INTO survey_interpretation_artifacts(id,final_id,created_by,request_hash,source_final_hash,artifact_cipher,artifact_hash) VALUES('v08-bad-final','nonexistent','v07-owner',repeat('d',64),repeat('c',64),'synthetic',repeat('e',64))$s$,'survey interpretation source identity mismatch');
SELECT pg_temp.expect_artifact_error('must have actual actor',$s$INSERT INTO survey_interpretation_artifacts(id,final_id,created_by,request_hash,source_final_hash,artifact_cipher,artifact_hash) VALUES('v08-bad-actor','v08-artifact-final','nonexistent',repeat('d',64),repeat('c',64),'synthetic',repeat('e',64))$s$,'foreign key constraint');
SELECT pg_temp.expect_artifact_error('valid request hash',$s$INSERT INTO survey_interpretation_artifacts(id,final_id,created_by,request_hash,source_final_hash,artifact_cipher,artifact_hash) VALUES('v08-bad-request','v08-artifact-final','v07-owner','bad',repeat('c',64),'synthetic',repeat('e',64))$s$,'check constraint');
SELECT pg_temp.expect_artifact_error('bounded artifact',$s$INSERT INTO survey_interpretation_artifacts(id,final_id,created_by,request_hash,source_final_hash,artifact_cipher,artifact_hash) VALUES('v08-oversize','v08-artifact-final','v07-owner',repeat('d',64),repeat('c',64),repeat('x',2097153),repeat('e',64))$s$,'check constraint');
INSERT INTO survey_interpretation_artifacts(id,final_id,created_by,request_hash,source_final_hash,artifact_cipher,artifact_hash)
VALUES('v08-artifact','v08-artifact-final','v07-owner',repeat('d',64),repeat('c',64),'synthetic-retry',repeat('e',64)) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF (SELECT count(*) FROM reinterpret_artifact_checks)<>7 OR
    (SELECT artifact_cipher FROM survey_interpretation_artifacts WHERE id='v08-artifact')<>'synthetic-interpretation' OR
    (SELECT results_cipher FROM survey_wave_finals WHERE id='v08-artifact-final')<>'synthetic-facts'
 THEN RAISE EXCEPTION 'artifact constraints or unchanged original facts failed'; END IF;
END $$;
