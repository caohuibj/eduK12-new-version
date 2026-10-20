CREATE TEMP TABLE contract_checks(name text PRIMARY KEY);
CREATE FUNCTION pg_temp.expect_error(label text,statement text,needle text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failure text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT; END;
  IF failure IS NULL OR position(needle in failure)=0 THEN RAISE EXCEPTION 'Contract % expected %, got %',label,needle,failure; END IF;
  INSERT INTO contract_checks VALUES(label);
END $$;
INSERT INTO users(id,username,password_hash,updated_at) VALUES ('test-analyst','test-analyst','synthetic-no-login',now()),('test-reviewer','test-reviewer','synthetic-no-login',now());
INSERT INTO measurement_content_releases(id,layer,family,content_key,version,hash_scheme,content_hash,content,scope,asset_refs,published_by)
VALUES ('test-measurement','MEASUREMENT','SCALE','test-scale','1','MEASUREMENT_CONTENT_CANONICAL_V1',repeat('a',64),'{}','{"kind":"PLATFORM"}','[]','test-analyst');
SELECT pg_temp.expect_error('release identity uniqueness',$s$INSERT INTO measurement_content_releases SELECT 'test-duplicate',layer,family,content_key,version,hash_scheme,content_hash,content,scope,asset_refs,source_release_id,published_by,published_at,status,provenance FROM measurement_content_releases WHERE id='test-measurement'$s$,'measurement_content_release_identity_key');
SELECT pg_temp.expect_error('release scientific bytes immutable',$s$UPDATE measurement_content_releases SET content='{"changed":true}' WHERE id='test-measurement'$s$,'CONTENT_RELEASE_IMMUTABLE');
SELECT pg_temp.expect_error('release provenance immutable',$s$UPDATE measurement_content_releases SET provenance='{"changed":true}' WHERE id='test-measurement'$s$,'CONTENT_RELEASE_IMMUTABLE');
UPDATE measurement_content_releases SET status='SUPERSEDED' WHERE id='test-measurement';
SELECT pg_temp.expect_error('lifecycle cannot reactivate',$s$UPDATE measurement_content_releases SET status='PUBLISHED' WHERE id='test-measurement'$s$,'CONTENT_LIFECYCLE_INVALID');
UPDATE measurement_content_releases SET status='RETIRED' WHERE id='test-measurement';
UPDATE measurement_content_releases SET status='REVOKED' WHERE id='test-measurement';
SELECT pg_temp.expect_error('revoked cannot reopen',$s$UPDATE measurement_content_releases SET status='SUPERSEDED' WHERE id='test-measurement'$s$,'CONTENT_LIFECYCLE_INVALID');
SELECT pg_temp.expect_error('release cannot delete',$s$DELETE FROM measurement_content_releases WHERE id='test-measurement'$s$,'CONTENT_RELEASE_DELETE_FORBIDDEN');
INSERT INTO measurement_content_release_events(id,release_id,from_status,to_status,actor_id,reason) VALUES ('test-event','test-measurement','RETIRED','REVOKED','test-reviewer','synthetic test');
SELECT pg_temp.expect_error('event immutable',$s$UPDATE measurement_content_release_events SET reason='rewrite' WHERE id='test-event'$s$,'CONTENT_EVENT_IMMUTABLE');
INSERT INTO measurement_reference_candidates(id,candidate_hash,measurement_release_id,analyzer_id,payload)
VALUES ('test-candidate',repeat('b',64),'test-measurement','test-analyst',jsonb_build_object('candidateHash',repeat('b',64),'analyzerId','test-analyst','measurement',jsonb_build_object('releaseId','test-measurement'),'scope',jsonb_build_object('kind','PLATFORM'),'definition',jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('referenceKind','normative_distribution')))));
SELECT pg_temp.expect_error('candidate actor must exist',$s$INSERT INTO measurement_reference_candidates(id,candidate_hash,measurement_release_id,analyzer_id,payload) SELECT 'fake-actor',repeat('c',64),measurement_release_id,'missing',jsonb_set(jsonb_set(payload,'{candidateHash}',to_jsonb(repeat('c',64))),'{analyzerId}','"missing"') FROM measurement_reference_candidates WHERE id='test-candidate'$s$,'foreign key constraint');
SELECT pg_temp.expect_error('candidate null identity rejected',$s$INSERT INTO measurement_reference_candidates(id,candidate_hash,measurement_release_id,analyzer_id,payload) VALUES ('null-identity',repeat('d',64),'test-measurement','test-analyst','{}')$s$,'check constraint');
SELECT pg_temp.expect_error('formal norm cannot self-review',$s$INSERT INTO measurement_reference_reviews(id,candidate_id,candidate_hash,reviewer_id,decision,statement) VALUES ('self','test-candidate',repeat('b',64),'test-analyst','APPROVED','Self review')$s$,'REFERENCE_INDEPENDENT_REVIEW_REQUIRED');
SELECT pg_temp.expect_error('review hash must match candidate',$s$INSERT INTO measurement_reference_reviews(id,candidate_id,candidate_hash,reviewer_id,decision,statement) VALUES ('stale','test-candidate',repeat('e',64),'test-reviewer','APPROVED','Stale review')$s$,'REFERENCE_REVIEW_STALE');
SELECT pg_temp.expect_error('reviewer must exist',$s$INSERT INTO measurement_reference_reviews(id,candidate_id,candidate_hash,reviewer_id,decision,statement) VALUES ('unknown','test-candidate',repeat('b',64),'missing','APPROVED','Unknown actor')$s$,'foreign key constraint');
INSERT INTO measurement_reference_reviews(id,candidate_id,candidate_hash,reviewer_id,decision,statement) VALUES ('test-review','test-candidate',repeat('b',64),'test-reviewer','APPROVED','Independent synthetic review');
SELECT pg_temp.expect_error('candidate immutable',$s$UPDATE measurement_reference_candidates SET payload=jsonb_set(payload,'{scope,kind}','"PRIVATE"') WHERE id='test-candidate'$s$,'CONTENT_EVENT_IMMUTABLE');
SELECT pg_temp.expect_error('review immutable',$s$UPDATE measurement_reference_reviews SET decision='REJECTED' WHERE id='test-review'$s$,'CONTENT_EVENT_IMMUTABLE');
SELECT pg_temp.expect_error('review cannot delete',$s$DELETE FROM measurement_reference_reviews WHERE id='test-review'$s$,'CONTENT_EVENT_IMMUTABLE');
SELECT pg_temp.expect_error('candidate cannot delete',$s$DELETE FROM measurement_reference_candidates WHERE id='test-candidate'$s$,'CONTENT_EVENT_IMMUTABLE');
INSERT INTO measurement_reference_candidates(id,candidate_hash,measurement_release_id,analyzer_id,payload)
SELECT 'test-private',repeat('f',64),measurement_release_id,analyzer_id,jsonb_set(jsonb_set(jsonb_set(payload,'{candidateHash}',to_jsonb(repeat('f',64))),'{scope,kind}','"PRIVATE"'),'{definition,entries}','[{"referenceKind":"descriptive_sample"}]') FROM measurement_reference_candidates WHERE id='test-candidate';
INSERT INTO measurement_reference_reviews(id,candidate_id,candidate_hash,reviewer_id,decision,statement) VALUES ('private-self','test-private',repeat('f',64),'test-analyst','APPROVED','Private descriptive responsibility');
SELECT count(*) AS expected_rejections_passed FROM contract_checks;
SELECT count(*) AS successful_reviews FROM measurement_reference_reviews;
