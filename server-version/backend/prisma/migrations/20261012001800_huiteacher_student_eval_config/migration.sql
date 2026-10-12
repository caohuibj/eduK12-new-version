-- Huiteacher PR5-C1. A student evaluation campaign freezes the exact
-- class + school-verified teacher appointment + PERSON target + released Form.
-- It stores NO School psychology assessment, student responses or grades.
-- Canonical Assessment Run will freeze per-student identities at publication.
CREATE TABLE "huiteacher_student_eval_configs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "class_unit_id" TEXT NOT NULL,
  "staff_assignment_id" TEXT NOT NULL,
  "form_id" TEXT NOT NULL,
  "definition_digest" TEXT NOT NULL,
  "configured_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "huiteacher_student_eval_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "huiteacher_student_eval_configs_event_key" UNIQUE ("organization_id","event_id"),
  CONSTRAINT "huiteacher_student_eval_configs_event_fk"
    FOREIGN KEY ("organization_id","event_id")
    REFERENCES "huiteacher_evaluation_events"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_student_eval_configs_class_fk"
    FOREIGN KEY ("organization_id","class_unit_id")
    REFERENCES "organization_units"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_student_eval_configs_form_fk"
    FOREIGN KEY ("organization_id","form_id")
    REFERENCES "huiteacher_form_instruments"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_student_eval_configs_staff_fk"
    FOREIGN KEY ("staff_assignment_id")
    REFERENCES "organization_staff_class_assignments"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_student_eval_configs_actor_fk"
    FOREIGN KEY ("configured_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_student_eval_configs_digest_check"
    CHECK ("definition_digest" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "huiteacher_student_eval_configs_org_class_idx"
  ON "huiteacher_student_eval_configs"("organization_id","class_unit_id","created_at" DESC);

-- Defense-in-depth: direct DB writes must not bind an unrelated class or
-- make a generic meeting event into a student evaluation. No duplicate
-- student or teacher account is created by this schema.
CREATE OR REPLACE FUNCTION guard_huiteacher_student_eval_config()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' OR TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Student evaluation target configuration is immutable'
    USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM "huiteacher_evaluation_events" e
  JOIN "huiteacher_evaluation_targets" t
    ON t."organization_id"=e."organization_id" AND t."id"=e."target_id"
    AND t."kind"='PERSON' AND t."status"='ACTIVE'
    AND t."subject_user_id" IS NOT NULL
  JOIN "organization_staff_class_assignments" staff
    ON staff."id"=NEW."staff_assignment_id"
    AND staff."organization_id"=e."organization_id"
    AND staff."class_unit_id"=NEW."class_unit_id"
    AND staff."valid_from"<=statement_timestamp()
    AND (staff."valid_until" IS NULL OR staff."valid_until">statement_timestamp())
  JOIN "organization_memberships" teacher
    ON teacher."id"=staff."membership_id"
    AND teacher."organization_id"=staff."organization_id"
    AND teacher."user_id"=t."subject_user_id"
    AND teacher."valid_from"<=statement_timestamp()
    AND (teacher."valid_until" IS NULL OR teacher."valid_until">statement_timestamp())
  JOIN "organization_persona_grants" persona
    ON persona."organization_id"=teacher."organization_id"
    AND persona."membership_id"=teacher."id"
    AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
  JOIN "organization_units" unit
    ON unit."organization_id"=e."organization_id"
    AND unit."id"=NEW."class_unit_id" AND unit."unit_kind"='CLASS'
  JOIN "huiteacher_form_instruments" form
    ON form."organization_id"=e."organization_id"
    AND form."id"=NEW."form_id" AND form."status"='PUBLISHED'
    AND form."definition_digest"=NEW."definition_digest"
  JOIN "education_product_entitlements" product
    ON product."organization_id"=e."organization_id"
    AND product."product"='HUITEACHER' AND product."status"='ACTIVE'
  JOIN "organizations" org ON org."id"=e."organization_id"
    AND org."product_domain"='SCHOOL' AND org."status"='ACTIVE'
  WHERE e."organization_id"=NEW."organization_id"
    AND e."id"=NEW."event_id" AND e."kind"='ASSESSMENT'
    AND e."status"='DRAFT'
    AND staff."staff_role" IN ('HOMEROOM','TEACHING')
 ) THEN
  RAISE EXCEPTION 'Student feedback requires draft Teacher evaluation, verified class teacher and released Form'
    USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_student_eval_config_guard"
 BEFORE INSERT OR UPDATE OR DELETE ON "huiteacher_student_eval_configs"
 FOR EACH ROW EXECUTE FUNCTION guard_huiteacher_student_eval_config();
