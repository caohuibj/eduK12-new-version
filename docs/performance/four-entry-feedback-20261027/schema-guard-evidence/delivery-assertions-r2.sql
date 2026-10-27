CREATE FUNCTION expect_error(statement text,pattern text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=MESSAGE_TEXT; END;
 IF actual IS NULL OR actual NOT LIKE '%'||pattern||'%' THEN RAISE EXCEPTION 'Expected %, got %',pattern,actual; END IF;
END $$;
INSERT INTO education_assessment_deliveries(id,product,organization_id,family,source_composite_id,runtime_composite_id,entry,entry_hash,created_by_user_id,created_authority)
VALUES ('delivery','TEACHER','org','COGNITIVE','source','runtime',
 '{"releaseStatus":"DRAFT","educationOrigin":{"resourceId":"delivery","product":"TEACHER","organizationId":"org","family":"COGNITIVE","sourceCompositeId":"source","runtimeCompositeId":"runtime"},"launchTarget":{"compositeAssessmentId":"runtime"}}',repeat('a',64),'author','{"kind":"SYSTEM_ADMIN","actorId":"author"}');
SELECT expect_error($q$UPDATE education_assessment_deliveries SET family='BUNDLE' WHERE id='delivery'$q$,'identity is immutable');
SELECT expect_error($q$UPDATE education_assessment_deliveries SET status='PUBLISHED' WHERE id='delivery'$q$,'Invalid education delivery transition');
SELECT expect_error($q$UPDATE education_assessment_deliveries SET status='REVIEWED',reviewed_by_user_id='author',reviewed_at=now(),reviewed_authority='{"kind":"SYSTEM_ADMIN","actorId":"author"}' WHERE id='delivery'$q$,'check constraint');
UPDATE education_assessment_deliveries SET status='REVIEWED',reviewed_by_user_id='reviewer',reviewed_at=now(),reviewed_authority='{"kind":"PRODUCT_ADMIN","actorId":"reviewer","grantId":"original"}' WHERE id='delivery';
SELECT expect_error($q$UPDATE education_assessment_deliveries SET status='PUBLISHED',entry=jsonb_set(entry,'{releaseStatus}','"PUBLISHED"'),reviewed_at=now()+interval '1 second',published_by_user_id='reviewer',published_at=now(),published_authority='{"kind":"SYSTEM_ADMIN","actorId":"reviewer"}' WHERE id='delivery'$q$,'review is immutable');
SELECT expect_error($q$UPDATE education_assessment_deliveries SET status='PUBLISHED',reviewed_authority=jsonb_set(reviewed_authority,'{grantId}','"replacement"') WHERE id='delivery'$q$,'review is immutable');
UPDATE education_assessment_deliveries SET status='PUBLISHED',entry=jsonb_set(entry,'{releaseStatus}','"PUBLISHED"'),entry_hash=repeat('b',64),published_by_user_id='reviewer',published_at=now(),published_authority='{"kind":"SYSTEM_ADMIN","actorId":"reviewer"}' WHERE id='delivery';
SELECT expect_error($q$DELETE FROM education_assessment_deliveries WHERE id='delivery'$q$,'history is immutable');
UPDATE education_assessment_deliveries SET status='RETIRED',retired_by_user_id='reviewer',retired_at=now() WHERE id='delivery';
SELECT expect_error($q$UPDATE education_assessment_deliveries SET status='PUBLISHED' WHERE id='delivery'$q$,'Invalid education delivery transition');
SELECT expect_error($q$INSERT INTO education_assessment_deliveries SELECT * FROM education_assessment_deliveries$q$,'must begin as an unapproved draft');
SELECT '8 rejection assertions and DRAFT->REVIEWED->PUBLISHED->RETIRED transitions passed' AS result;
