-- Run after 20261020042000 in an isolated synthetic database/session.
-- Single-session constraints only; no concurrency or real-data access proof.
CREATE TEMP TABLE reinterpret_authority_checks(name text PRIMARY KEY);
CREATE OR REPLACE FUNCTION pg_temp.expect_error(label text,statement text,needle text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failure text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT; END;
  IF failure IS NULL OR position(needle in failure)=0 THEN RAISE EXCEPTION 'Contract % expected %, got %',label,needle,failure; END IF;
  INSERT INTO reinterpret_authority_checks VALUES(label);
END $$;
INSERT INTO users(id,username,password_hash,updated_at)
VALUES ('test-analyst','test-analyst','synthetic-no-login',now()),('test-reviewer','test-reviewer','synthetic-no-login',now())
ON CONFLICT(id) DO NOTHING;
INSERT INTO content_capability_grants
  (id,subject_id,issuer_id,product,scope_kind,scope_id,resource_kind,resource_keys,capabilities,
   delegable_capabilities,remaining_delegation_depth,valid_from,expires_at,ancestry)
VALUES ('v08-data-root','test-analyst','test-reviewer','SURVEY','PROJECT','v08-data-project','data',ARRAY['v08-final-a','v08-final-b'],
  ARRAY['data.reinterpret'],ARRAY['data.reinterpret'],1,now()-interval '1 hour',now()+interval '1 day',ARRAY['v08-data-root']);
CREATE FUNCTION pg_temp.v08_data_grant(new_id text, overrides jsonb DEFAULT '{}', as_root boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE base jsonb;
BEGIN
  SELECT to_jsonb(g) INTO base FROM content_capability_grants g WHERE id='v08-data-root';
  base := base || jsonb_build_object('id',new_id,'version',1,'revoked_at',NULL,'revoked_by',NULL,'revoke_reason',NULL);
  IF as_root THEN base := base || jsonb_build_object('ancestry',jsonb_build_array(new_id));
  ELSE base := base || jsonb_build_object('subject_id','test-reviewer','issuer_id','test-analyst',
    'parent_grant_id','v08-data-root','resource_keys',jsonb_build_array('v08-final-a'),
    'delegable_capabilities','[]'::jsonb,'remaining_delegation_depth',0,'ancestry',jsonb_build_array('v08-data-root',new_id));
  END IF;
  INSERT INTO content_capability_grants SELECT * FROM jsonb_populate_record(NULL::content_capability_grants,base || overrides);
END $$;
SELECT pg_temp.v08_data_grant('v08-data-child');
SELECT pg_temp.expect_error('exact FINAL bound',$s$SELECT pg_temp.v08_data_grant('v08-bad-final','{"resource_keys":["v08-foreign-final"]}')$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('exact project bound',$s$SELECT pg_temp.v08_data_grant('v08-bad-project','{"scope_id":"v08-foreign-project"}')$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('expiry bound',$s$SELECT pg_temp.v08_data_grant('v08-bad-expiry',jsonb_build_object('expires_at',now()+interval '2 days'))$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('depth bound',$s$SELECT pg_temp.v08_data_grant('v08-bad-depth','{"remaining_delegation_depth":1}')$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('report publish is not reinterpret',$s$SELECT pg_temp.v08_data_grant('v08-bad-report','{"capabilities":["report.publish"]}')$s$,'invalid content grant contract');
SELECT pg_temp.expect_error('no implicit data read',$s$SELECT pg_temp.v08_data_grant('v08-bad-read','{"capabilities":["data.read"],"delegable_capabilities":[]}',true)$s$,'content_capability_grants_capabilities_check');
SELECT pg_temp.expect_error('no implicit data export',$s$SELECT pg_temp.v08_data_grant('v08-bad-export','{"capabilities":["data.export"],"delegable_capabilities":[]}',true)$s$,'content_capability_grants_capabilities_check');
SELECT pg_temp.expect_error('no platform data scope',$s$SELECT pg_temp.v08_data_grant('v08-bad-platform','{"scope_kind":"PLATFORM"}',true)$s$,'content_capability_grants_data_project_check');
SELECT pg_temp.expect_error('no unknown resource kind',$s$SELECT pg_temp.v08_data_grant('v08-bad-domain','{"resource_kind":"answer","capabilities":["answer.read"],"delegable_capabilities":[]}',true)$s$,'check constraint');
SELECT pg_temp.expect_error('immutable FINAL scope',$s$UPDATE content_capability_grants SET resource_keys=ARRAY['v08-final-b'] WHERE id='v08-data-child'$s$,'content grant is immutable');
UPDATE content_capability_grants SET revoked_at=now(),revoked_by='test-reviewer',revoke_reason='Synthetic revoke',version=version+1
WHERE id='v08-data-root' AND version=1 AND revoked_at IS NULL;
SELECT pg_temp.expect_error('revoked parent cannot delegate',$s$SELECT pg_temp.v08_data_grant('v08-data-after-revoke')$s$,'content delegation exceeds parent grant');
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM content_capability_grants leaf JOIN content_capability_grants ancestor ON ancestor.id=ANY(leaf.ancestry)
    WHERE leaf.id='v08-data-child' AND leaf.resource_keys=ARRAY['v08-final-a'] AND leaf.revoked_at IS NULL
    AND ancestor.id='v08-data-root' AND ancestor.revoked_at IS NOT NULL AND ancestor.version=2)
  THEN RAISE EXCEPTION 'legal child or revoked ancestor missing'; END IF;
  INSERT INTO reinterpret_authority_checks VALUES('bounded child persists with current revoked ancestor');
END $$;
SELECT count(*) AS data_reinterpret_authority_contracts_passed FROM reinterpret_authority_checks;
