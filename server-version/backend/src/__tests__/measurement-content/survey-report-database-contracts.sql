CREATE TEMP TABLE report_contract_checks(name text PRIMARY KEY);
CREATE FUNCTION pg_temp.expect_report_error(label text,statement text,needle text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failure text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT; END;
  IF failure IS NULL OR position(needle in failure)=0 THEN RAISE EXCEPTION 'Contract % expected %, got %',label,needle,failure; END IF;
  INSERT INTO report_contract_checks VALUES(label);
END $$;
INSERT INTO users(id,username,password_hash,account_domain,updated_at) VALUES ('v07-owner','v07-owner','synthetic-no-login','SURVEY',now());
INSERT INTO survey_accounts(user_id,login_name,normalized_login) VALUES ('v07-owner','v07-owner','v07-owner');
INSERT INTO survey_projects(id,owner_user_id,title,collection_mode) VALUES ('v07-project','v07-owner','Synthetic report project','SINGLE_UNLINKED');
INSERT INTO measurement_content_releases(id,layer,family,content_key,version,hash_scheme,content_hash,content,scope,asset_refs,published_by)
VALUES ('v07-report-release','REPORT','SCALE','v07-report','1','MEASUREMENT_CONTENT_CANONICAL_V1',repeat('7',64),'{}','{"kind":"PRIVATE","product":"SURVEY","resourceId":"v07-project","ownerId":"v07-owner"}','[]','v07-owner');
INSERT INTO survey_report_drafts(id,project_id,owner_id,report_key,version,payload) VALUES ('v07-draft','v07-project','v07-owner','feedback','1','{}');
SELECT pg_temp.expect_report_error('report same project key/version unique',$s$INSERT INTO survey_report_drafts(id,project_id,owner_id,report_key,version,payload) VALUES ('v07-duplicate','v07-project','v07-owner','feedback','1','{}')$s$,'unique constraint');
SELECT pg_temp.expect_report_error('report identity immutable',$s$UPDATE survey_report_drafts SET version='2' WHERE id='v07-draft'$s$,'REPORT_DRAFT_IDENTITY_IMMUTABLE');
SELECT pg_temp.expect_report_error('published pointer required',$s$UPDATE survey_report_drafts SET state='PUBLISHED' WHERE id='v07-draft'$s$,'check constraint');
SELECT pg_temp.expect_report_error('release pointer must exist',$s$UPDATE survey_report_drafts SET state='PUBLISHED',published_release_id='missing' WHERE id='v07-draft'$s$,'foreign key constraint');
UPDATE survey_report_drafts SET payload='{"title":"updated"}',revision=revision+1 WHERE id='v07-draft';
UPDATE survey_report_drafts SET state='PUBLISHED',published_release_id='v07-report-release' WHERE id='v07-draft';
SELECT pg_temp.expect_report_error('published payload immutable',$s$UPDATE survey_report_drafts SET payload='{}' WHERE id='v07-draft'$s$,'REPORT_PUBLISHED_DRAFT_IMMUTABLE');
SELECT pg_temp.expect_report_error('published draft retained',$s$DELETE FROM survey_report_drafts WHERE id='v07-draft'$s$,'REPORT_PUBLISHED_DRAFT_IMMUTABLE');
DO $$ BEGIN IF (SELECT count(*) FROM report_contract_checks) <> 6 THEN RAISE EXCEPTION 'expected six report constraints'; END IF; END $$;
