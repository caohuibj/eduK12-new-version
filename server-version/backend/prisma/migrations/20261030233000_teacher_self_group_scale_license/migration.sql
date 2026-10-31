-- Preserve original personal resources and grants. Organization Run licenses
-- may additionally name an independently published explicit SELF GROUP v2.
-- No table/column or historical resource/license is rewritten.
CREATE OR REPLACE FUNCTION guard_teacher_scale_license() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status"='ACTIVE' AND (NOT EXISTS (
    SELECT 1 FROM "organizations" o
    JOIN "education_product_entitlements" e
      ON e."organization_id"=o."id" AND e."product"='HUITEACHER'
      AND e."status"='ACTIVE'
    WHERE o."id"=NEW."organization_id" AND o."product_domain"='SCHOOL'
      AND o."status"='ACTIVE'
  ) OR NOT EXISTS (
    SELECT 1 FROM "registered_assessment_resources" r
    WHERE r."id"=NEW."resource_id" AND r."status"='PUBLISHED'
      AND (r."resource_key" LIKE 'teacher-scale:%:INDIVIDUAL' OR (
        r."resource_key" LIKE 'teacher-scale:%:GROUP'
        AND r."entry"->'applicability'->>'analysisMode'='COHORT_AGGREGATE'
        AND r."entry"->'applicability'->'subjectRoles'='["TEACHER"]'::jsonb
        AND r."entry"->'applicability'->'respondentRoles'='["TEACHER"]'::jsonb
        AND r."entry"->'applicability'->'relationshipKinds'='["SELF"]'::jsonb
        AND r."entry"->'applicability'->'perspectives'='["SELF_REPORT"]'::jsonb
        AND r."entry"->'resultDisclosure'->>'policyKey'='EDUCATION_SELF_GROUP_V2'
        AND r."entry"->'cohortAnalysisPolicy'->>'policyKey'='EDUCATION_SELF_GROUP_V2'
        AND r."entry"->'cohortAnalysisPolicy'->>'policyVersion'='2.0.0'
        AND (r."entry"->'applicability'->>'minimumRespondents')::int>=3
        AND r."entry"->'applicability'->'minimumRespondents'=r."entry"->'resultDisclosure'->'minimumRespondents'
        AND r."entry"->'applicability'->'minimumRespondents'=r."entry"->'cohortAnalysisPolicy'->'minimumRespondents'
        AND r."entry"->'resultDisclosure'->'audiences'->'ORGANIZATION'->>'mode' LIKE '%AGGREGATE%'
        AND r."reviewed_by_user_id" IS NOT NULL AND r."reviewed_at" IS NOT NULL AND r."published_at" IS NOT NULL
        AND r."reviewed_by_user_id"<>r."created_by_user_id"
        AND EXISTS(SELECT 1 FROM scales s WHERE s.id=r.scale_id
          AND s.status='PUBLISHED' AND s.definition_hash=r.definition_hash AND s.creator_id<>r.reviewed_by_user_id)
      ))
  )) THEN
    RAISE EXCEPTION 'Teacher Scale licensing requires released adult-self resource and enabled school'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
