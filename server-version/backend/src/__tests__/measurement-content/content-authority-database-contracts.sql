-- Synthetic single-session contracts only. Not a concurrent revoke/write proof.
CREATE TEMP TABLE v05_content_authority_checks(name text PRIMARY KEY);
CREATE OR REPLACE FUNCTION pg_temp.expect_error(label text,statement text,needle text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failure text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT; END;
  IF failure IS NULL OR position(needle in failure)=0 THEN RAISE EXCEPTION 'Contract % expected %, got %',label,needle,failure; END IF;
  INSERT INTO v05_content_authority_checks VALUES(label);
END $$;
INSERT INTO users(id,username,password_hash,updated_at)
VALUES ('test-analyst','test-analyst','synthetic-no-login',now()),('test-reviewer','test-reviewer','synthetic-no-login',now())
ON CONFLICT(id) DO NOTHING;
INSERT INTO content_capability_grants
  (id,subject_id,issuer_id,product,scope_kind,scope_id,resource_kind,resource_keys,capabilities,
   delegable_capabilities,remaining_delegation_depth,valid_from,expires_at,ancestry)
VALUES ('v05-root','test-analyst','test-reviewer','SURVEY','PROJECT','v05-project','report',ARRAY['v05-a','v05-b'],
  ARRAY['report.edit','report.publish'],ARRAY['report.edit'],1,now()-interval '1 hour',now()+interval '1 day',ARRAY['v05-root']);
-- Keep child construction identical across negative cases; each override is the isolated fault.
CREATE FUNCTION pg_temp.v05_child(child_id text,overrides jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql AS $$
DECLARE parent_json jsonb;
BEGIN
  SELECT to_jsonb(g) INTO parent_json FROM content_capability_grants g WHERE id='v05-root';
  INSERT INTO content_capability_grants SELECT * FROM jsonb_populate_record(NULL::content_capability_grants,
    parent_json || jsonb_build_object('id',child_id,'subject_id','test-reviewer','issuer_id','test-analyst',
      'parent_grant_id','v05-root','resource_keys',jsonb_build_array('v05-a'),
      'capabilities',jsonb_build_array('report.edit'),'delegable_capabilities','[]'::jsonb,
      'remaining_delegation_depth',0,'ancestry',jsonb_build_array('v05-root',child_id)) || overrides);
END $$;
SELECT pg_temp.v05_child('v05-child');
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM content_capability_grants WHERE id='v05-child' AND parent_grant_id='v05-root'
    AND subject_id='test-reviewer' AND remaining_delegation_depth=0 AND ancestry=ARRAY['v05-root','v05-child']) THEN
    RAISE EXCEPTION 'legal child not persisted';
  END IF;
  INSERT INTO v05_content_authority_checks VALUES('v05 legal root and child persisted');
END $$;
SELECT pg_temp.expect_error('v05 resource bound',$s$SELECT pg_temp.v05_child('v05-bad-resource','{"resource_keys":["foreign-resource"]}')$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('v05 product bound',$s$SELECT pg_temp.v05_child('v05-bad-product','{"product":"TRAINING"}')$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('v05 project bound',$s$SELECT pg_temp.v05_child('v05-bad-project','{"scope_id":"foreign-project"}')$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('v05 delegated capability bound',$s$SELECT pg_temp.v05_child('v05-bad-capability','{"capabilities":["report.publish"]}')$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('v05 source use is not report right',$s$SELECT pg_temp.v05_child('v05-bad-domain','{"capabilities":["material.use"]}')$s$,'invalid content grant contract');
SELECT pg_temp.expect_error('v05 expiry bound',$s$SELECT pg_temp.v05_child('v05-bad-expiry',jsonb_build_object('expires_at',now()+interval '2 days'))$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('v05 start bound',$s$SELECT pg_temp.v05_child('v05-bad-start',jsonb_build_object('valid_from',now()-interval '2 hours'))$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('v05 depth bound',$s$SELECT pg_temp.v05_child('v05-bad-depth','{"remaining_delegation_depth":1,"delegable_capabilities":["report.edit"]}')$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('v05 actor cannot delegate another holder grant',$s$SELECT pg_temp.v05_child('v05-bad-issuer','{"issuer_id":"test-reviewer"}')$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('v05 recipient must be real User',$s$SELECT pg_temp.v05_child('v05-missing-user','{"subject_id":"v05-no-such-user"}')$s$,'foreign key constraint');
SELECT pg_temp.expect_error('v05 path cannot omit parent',$s$SELECT pg_temp.v05_child('v05-bad-path','{"ancestry":["v05-bad-path"]}')$s$,'content delegation exceeds parent grant');
SELECT pg_temp.expect_error('v05 scope immutable',$s$UPDATE content_capability_grants SET scope_id='foreign-project' WHERE id='v05-child'$s$,'content grant is immutable');
SELECT pg_temp.expect_error('v05 capability immutable',$s$UPDATE content_capability_grants SET capabilities=ARRAY['report.publish'] WHERE id='v05-child'$s$,'content grant is immutable');
SELECT pg_temp.expect_error('v05 parent immutable',$s$UPDATE content_capability_grants SET parent_grant_id=NULL,ancestry=ARRAY['v05-child'] WHERE id='v05-child'$s$,'content grant is immutable');
SELECT pg_temp.expect_error('v05 cannot delete grant',$s$DELETE FROM content_capability_grants WHERE id='v05-child'$s$,'content grants are retained');
SELECT pg_temp.expect_error('v05 revocation requires next version',$s$UPDATE content_capability_grants SET revoked_at=now(),revoked_by='test-reviewer',revoke_reason='Synthetic revoke',version=3 WHERE id='v05-child'$s$,'content grant is immutable');
SELECT pg_temp.expect_error('v05 revoker must be real User',$s$UPDATE content_capability_grants SET revoked_at=now(),revoked_by='v05-no-such-user',revoke_reason='Synthetic revoke',version=2 WHERE id='v05-child'$s$,'foreign key constraint');
SELECT pg_temp.expect_error('v05 revocation reason required',$s$UPDATE content_capability_grants SET revoked_at=now(),revoked_by='test-reviewer',revoke_reason=NULL,version=2 WHERE id='v05-child'$s$,'check constraint');
DO $$ DECLARE changed integer;
BEGIN
  UPDATE content_capability_grants SET revoked_at=now(),revoked_by='test-reviewer',revoke_reason='Synthetic revoke',version=version+1
  WHERE id='v05-root' AND version=99 AND revoked_at IS NULL;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed <> 0 OR NOT EXISTS(SELECT 1 FROM content_capability_grants WHERE id='v05-root' AND version=1 AND revoked_at IS NULL)
    THEN RAISE EXCEPTION 'stale revoke CAS mutated root'; END IF;
  INSERT INTO v05_content_authority_checks VALUES('v05 stale revoke CAS changes no row');
  UPDATE content_capability_grants SET revoked_at=now(),revoked_by='test-reviewer',revoke_reason='Synthetic revoke',version=version+1
  WHERE id='v05-root' AND version=1 AND revoked_at IS NULL;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'current revoke CAS did not change exactly one row'; END IF;
  INSERT INTO v05_content_authority_checks VALUES('v05 current revoke CAS changes one row');
END $$;
SELECT pg_temp.expect_error('v05 duplicate revoke forbidden',$s$UPDATE content_capability_grants SET revoked_at=now(),revoked_by='test-reviewer',revoke_reason='Duplicate revoke',version=version+1 WHERE id='v05-root'$s$,'content grant is immutable');
-- Reset inherited revocation fields explicitly so this tests parent validity, not row initialization.
SELECT pg_temp.expect_error('v05 revoked parent cannot delegate',$s$SELECT pg_temp.v05_child('v05-after-revoke','{"version":1,"revoked_at":null,"revoked_by":null,"revoke_reason":null}')$s$,'content delegation exceeds parent grant');
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM content_capability_grants WHERE id='v05-child' AND revoked_at IS NULL AND version=1)
    THEN RAISE EXCEPTION 'root revoke must retain unchanged child'; END IF;
  IF NOT EXISTS(SELECT 1 FROM content_capability_grants leaf JOIN content_capability_grants ancestor ON ancestor.id=ANY(leaf.ancestry)
    WHERE leaf.id='v05-child' AND ancestor.id='v05-root' AND ancestor.revoked_at IS NOT NULL AND ancestor.version=2)
    THEN RAISE EXCEPTION 'child authority read must see revoked ancestor'; END IF;
  INSERT INTO v05_content_authority_checks VALUES('v05 root revoke visible without descendant rewrite');
END $$;
SELECT count(*) AS v05_content_authority_contracts_passed FROM v05_content_authority_checks;
