-- Preserve the published Training round's integrity checks while replacing
-- historical ADMIN shortcuts with current, independently scoped authority.
CREATE OR REPLACE FUNCTION training_public_round_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a composite_assessments; expected JSONB; expected_hash TEXT;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Training public round identity and window are immutable'; END IF;
 SELECT * INTO a FROM composite_assessments WHERE id=NEW.composite_id FOR SHARE;
 IF a.id IS NULL OR a.status::text<>'PUBLISHED' OR NOT a.public_enabled OR a.product_kind::text<>'QUESTIONNAIRE'
 OR a.questionnaire_type::text<>'COURSE' OR a.published_at IS DISTINCT FROM NEW.published_at
 OR (a.opens_at IS NOT NULL AND a.opens_at>NEW.opens_at)
 OR (a.expires_at IS NOT NULL AND a.expires_at<NEW.closes_at)
 OR NEW.opens_at>statement_timestamp() OR NEW.opens_at<statement_timestamp()-interval '5 minutes'
 OR (SELECT count(*) FROM questionnaire_course_deliveries WHERE composite_id=a.id)<>1 THEN
   RAISE EXCEPTION 'Training public round requires the exact active published course questionnaire'; END IF;
 PERFORM 1 FROM courses c JOIN questionnaire_course_deliveries q ON q.course_id=c.id AND q.composite_id=a.id
 JOIN users owner ON owner.id=a.created_by JOIN users actor ON actor.id=NEW.created_by
 WHERE c.id=NEW.course_id AND (c.ended_at IS NULL OR c.ended_at>=NEW.closes_at) AND c.course_type='TRAINING_COURSE' AND NOT c.is_library
 AND owner.account_domain IN ('LEGACY','TRAINING') AND owner.is_active AND NOT owner.is_frozen AND NOT owner.must_change_password
 AND (owner.expires_at IS NULL OR owner.expires_at>statement_timestamp())
 AND (EXISTS(SELECT 1 FROM admin_entry_grants g WHERE g.user_id=owner.id AND g.entry='TRAINING' AND g.revoked_at IS NULL)
   OR (owner.role::text='TEACHER' AND owner.teacher_approved AND c.creator_id=owner.id))
 AND actor.account_domain IN ('LEGACY','TRAINING') AND actor.is_active AND NOT actor.is_frozen AND NOT actor.must_change_password
 AND (actor.expires_at IS NULL OR actor.expires_at>statement_timestamp())
 AND (EXISTS(SELECT 1 FROM admin_entry_grants g WHERE g.user_id=actor.id AND g.entry='TRAINING' AND g.revoked_at IS NULL)
   OR (actor.role::text='TEACHER' AND actor.teacher_approved AND actor.id=a.created_by))
 FOR SHARE OF c,q,owner,actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Training public round course/author mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM anonymous_study_waves w JOIN composite_assessment_access_tokens t ON t.composite_assessment_id=a.id WHERE t.id=w.access_token_id) THEN
   RAISE EXCEPTION 'Training public round does not compose with anonymous study'; END IF;
 IF NEW.group_ip_policy IS DISTINCT FROM jsonb_build_object('schemaVersion',1,'timeZone',NEW.group_ip_policy->>'timeZone','activationDate',NEW.group_ip_policy->>'activationDate')
 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.group_ip_policy->>'timeZone')
 OR to_char(NEW.opens_at AT TIME ZONE 'UTC' AT TIME ZONE (NEW.group_ip_policy->>'timeZone'),'YYYY-MM-DD') IS DISTINCT FROM NEW.group_ip_policy->>'activationDate' THEN
   RAISE EXCEPTION 'Training public round requires server activation date in a valid time zone'; END IF;
 expected=jsonb_build_object('schemaVersion',1,'compositeId',a.id,'courseId',NEW.course_id,
  'publishedAt',to_char(a.published_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'productKind',a.product_kind,
  'questionnaireType',a.questionnaire_type,'trainingFlowDigest',a.training_flow_digest,'trainingVariantDigest',a.training_variant_digest);
 IF NEW.publication_identity IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Training public round publication identity mismatch'; END IF;
 SELECT encode(digest(convert_to('{'||string_agg(to_json(key)::text||':'||value::text,',' ORDER BY key COLLATE "C")||'}','UTF8'),'sha256'),'hex')
 INTO expected_hash FROM jsonb_each(expected);
 IF NEW.publication_hash IS DISTINCT FROM expected_hash THEN RAISE EXCEPTION 'Training public round publication hash mismatch'; END IF;
 RETURN NEW;
END $$;
