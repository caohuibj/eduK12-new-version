-- Recheck current School product access for fresh Campus task writes, including
-- delayed submissions that passed an earlier application preflight. Existing
-- triggers keep calling the same function; historical rows are not rewritten.
CREATE OR REPLACE FUNCTION campus_submission_is_authorized(
  p_course_id TEXT, p_student_id TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_campus BOOLEAN; v_status TEXT;
BEGIN
  SELECT c."course_type"='CAMPUS_ACTIVITY' INTO v_campus
  FROM "courses" c WHERE c."id"=p_course_id;
  IF NOT COALESCE(v_campus,FALSE) THEN RETURN TRUE; END IF;
  SELECT a."status" INTO v_status
  FROM "campus_activities" a WHERE a."course_id"=p_course_id FOR SHARE;
  IF v_status IS DISTINCT FROM 'OPEN' OR p_student_id IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS(
    SELECT 1 FROM "campus_activity_participants" p
    JOIN "organization_memberships" m ON m."id"=p."membership_id"
      AND m."organization_id"=p."organization_id"
      AND m."user_id"=p_student_id
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    JOIN "organizations" o ON o."id"=m."organization_id"
      AND o."product_domain"='SCHOOL' AND o."status"='ACTIVE'
    JOIN "education_product_entitlements" ent ON ent."organization_id"=o."id"
      AND ent."product"='HUISCHOOL' AND ent."status"='ACTIVE'
    JOIN "campus_student_enrollments" e ON e."user_id"=m."user_id"
      AND e."organization_id"=m."organization_id" AND e."status"='APPROVED'
    JOIN "campus_class_admissions" ca ON ca."class_unit_id"=e."class_unit_id"
      AND ca."organization_id"=e."organization_id" AND ca."status"='APPROVED'
    JOIN "organization_student_class_assignments" sc
      ON sc."membership_id"=m."id" AND sc."organization_id"=m."organization_id"
      AND sc."class_unit_id"=e."class_unit_id"
      AND sc."valid_from"<=statement_timestamp()
      AND (sc."valid_until" IS NULL OR sc."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" pg
      ON pg."organization_id"=m."organization_id"
      AND pg."membership_id"=m."id" AND pg."persona"='STUDENT'
      AND pg."revoked_at" IS NULL AND pg."granted_at"<=statement_timestamp()
    JOIN "users" u ON u."id"=m."user_id" AND u."account_domain"='SCHOOL'
      AND u."role"='STUDENT' AND u."is_active"=TRUE
      AND u."is_frozen"=FALSE AND u."must_change_password"=FALSE
    WHERE p."course_id"=p_course_id AND p."status"='ACTIVE'
      AND NOT EXISTS(SELECT 1 FROM "organization_access_denies" d
        WHERE d."organization_id"=o."id" AND d."user_id"=p_student_id
          AND d."lifted_at" IS NULL
          AND d."permission" IN ('*','EDUCATION_ACCESS','HUISCHOOL_ACCESS','ACTIVITY_READ','RUN_START'))
  );
END $$;
