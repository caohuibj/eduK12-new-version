-- PR3 personal Teacher Scale without synthetic schools. Reuses canonical
-- standalone assessments; no duplicate answers, scorer or report database.
CREATE TABLE "huiteacher_personal_scale_grants" (
 "user_id" TEXT NOT NULL,
 "resource_id" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'ACTIVE',
 "granted_by_user_id" TEXT NOT NULL,
 "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 "revoked_at" TIMESTAMPTZ(6),
 "revision" INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY ("user_id","resource_id"),
 FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
 FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
 FOREIGN KEY ("resource_id") REFERENCES "registered_assessment_resources"("id") ON DELETE RESTRICT,
 CHECK (("status"='ACTIVE' AND "revoked_at" IS NULL) OR
        ("status"='REVOKED' AND "revoked_at" IS NOT NULL)),
 CHECK ("revision">=1)
);
CREATE INDEX "huiteacher_personal_scale_grants_resource_idx"
 ON "huiteacher_personal_scale_grants"("resource_id","status");

CREATE TABLE "huiteacher_personal_scale_attempts" (
 "assessment_id" TEXT PRIMARY KEY,
 "user_id" TEXT NOT NULL,
 "resource_id" TEXT NOT NULL,
 "definition_hash" TEXT NOT NULL,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT,
 FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
 FOREIGN KEY ("resource_id") REFERENCES "registered_assessment_resources"("id") ON DELETE RESTRICT,
 CHECK ("definition_hash" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "huiteacher_personal_scale_attempts_user_time_idx"
 ON "huiteacher_personal_scale_attempts"("user_id","created_at" DESC);

CREATE OR REPLACE FUNCTION guard_teacher_personal_scale_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='huiteacher_personal_scale_grants' THEN
  IF NEW."status"='ACTIVE' AND (
    NOT EXISTS(SELECT 1 FROM "users" u WHERE u."id"=NEW."user_id"
      AND u."account_domain"='SCHOOL' AND u."role" IN ('TEACHER','ADMIN')
      AND u."teacher_approved"=TRUE AND u."is_active"=TRUE
      AND u."is_frozen"=FALSE AND u."must_change_password"=FALSE)
    OR NOT EXISTS(SELECT 1 FROM "registered_assessment_resources" r
      WHERE r."id"=NEW."resource_id"
        AND r."resource_key" LIKE 'teacher-scale:%:INDIVIDUAL'
        AND r."status"='PUBLISHED')
  ) THEN
   RAISE EXCEPTION 'Teacher personal Scale grant requires adult education identity and released pilot'
    USING ERRCODE='23514';
  END IF;
 ELSE
  IF NOT EXISTS (
   SELECT 1 FROM "assessments" a
   JOIN "registered_assessment_resources" r
     ON r."id"=NEW."resource_id" AND r."scale_id"=a."scale_id"
       AND r."definition_hash"=NEW."definition_hash"
   JOIN "huiteacher_personal_scale_grants" g
     ON g."user_id"=NEW."user_id" AND g."resource_id"=r."id"
       AND g."status"='ACTIVE'
   WHERE a."id"=NEW."assessment_id" AND a."user_id"=NEW."user_id"
    AND a."questionnaire_assessment_id" IS NULL
    AND a."composite_attempt_id" IS NULL
    AND a."runtime_generation"='UNIFIED_V1'
    AND a."delivery_mode"='FINAL_ONLY' AND r."status"='PUBLISHED'
  ) THEN
   RAISE EXCEPTION 'Teacher personal attempt must bind an exact standalone Scale'
    USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_personal_scale_grants_guard"
 BEFORE INSERT OR UPDATE OF "user_id","resource_id","status"
 ON "huiteacher_personal_scale_grants" FOR EACH ROW
 EXECUTE FUNCTION guard_teacher_personal_scale_scope();
CREATE TRIGGER "huiteacher_personal_scale_attempts_guard"
 BEFORE INSERT OR UPDATE OF "assessment_id","user_id","resource_id","definition_hash"
 ON "huiteacher_personal_scale_attempts" FOR EACH ROW
 EXECUTE FUNCTION guard_teacher_personal_scale_scope();
