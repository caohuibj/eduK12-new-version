-- Huiteacher PR2-C1: product-owned evaluation subjects and events.
-- Organizational/subject IDs are shared identity only; these records are NOT
-- writable or readable by School psychology, Training or Survey APIs.
CREATE TABLE "huiteacher_evaluation_targets" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "subject_user_id" TEXT,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "huiteacher_evaluation_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "huiteacher_evaluation_targets_org_id_key" UNIQUE ("organization_id","id"),
  CONSTRAINT "huiteacher_evaluation_targets_org_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_evaluation_targets_user_fkey" FOREIGN KEY ("subject_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_evaluation_targets_creator_fkey" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_evaluation_targets_kind_check" CHECK
    ("kind" IN ('PERSON','TEAM','ORGANIZATION','ACTIVITY','ARTIFACT','PROJECT')),
  CONSTRAINT "huiteacher_evaluation_targets_status_check" CHECK
    ("status" IN ('ACTIVE','ARCHIVED')),
  CONSTRAINT "huiteacher_evaluation_targets_person_check" CHECK
    ("kind"='PERSON' OR "subject_user_id" IS NULL),
  CONSTRAINT "huiteacher_evaluation_targets_name_check" CHECK
    (length(btrim("name")) BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX "huiteacher_evaluation_targets_org_active_idx"
  ON "huiteacher_evaluation_targets"("organization_id")
  WHERE "kind"='ORGANIZATION' AND "status"='ACTIVE';
CREATE UNIQUE INDEX "huiteacher_evaluation_targets_person_user_idx"
  ON "huiteacher_evaluation_targets"("organization_id","subject_user_id")
  WHERE "kind"='PERSON' AND "status"='ACTIVE' AND "subject_user_id" IS NOT NULL;
CREATE INDEX "huiteacher_evaluation_targets_list_idx"
  ON "huiteacher_evaluation_targets"("organization_id","status","kind","created_at" DESC);

CREATE TABLE "huiteacher_evaluation_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "scheduled_at" TIMESTAMPTZ(6),
  "opened_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "huiteacher_evaluation_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "huiteacher_evaluation_events_org_id_key" UNIQUE ("organization_id","id"),
  CONSTRAINT "huiteacher_evaluation_events_target_fkey" FOREIGN KEY ("organization_id","target_id")
    REFERENCES "huiteacher_evaluation_targets"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_evaluation_events_creator_fkey" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_evaluation_events_kind_check" CHECK
    ("kind" IN ('ASSESSMENT','CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT','OTHER')),
  CONSTRAINT "huiteacher_evaluation_events_status_check" CHECK
    ("status" IN ('DRAFT','OPEN','CLOSED','CANCELLED')),
  CONSTRAINT "huiteacher_evaluation_events_version_check" CHECK("version">=1),
  CONSTRAINT "huiteacher_evaluation_events_title_check"
    CHECK(length(btrim("title")) BETWEEN 1 AND 200),
  CONSTRAINT "huiteacher_evaluation_events_times_check" CHECK
    (("status"='DRAFT' AND "opened_at" IS NULL AND "closed_at" IS NULL)
     OR ("status"='OPEN' AND "opened_at" IS NOT NULL AND "closed_at" IS NULL)
     OR ("status"='CLOSED' AND "opened_at" IS NOT NULL AND "closed_at" IS NOT NULL)
     OR ("status"='CANCELLED' AND "closed_at" IS NOT NULL))
);
CREATE INDEX "huiteacher_evaluation_events_list_idx"
  ON "huiteacher_evaluation_events"("organization_id","status","created_at" DESC);
CREATE INDEX "huiteacher_evaluation_events_target_idx"
  ON "huiteacher_evaluation_events"("organization_id","target_id","created_at" DESC);

-- Fail closed for new Teacher evaluation writes in inactive schools, while
-- preserving historical records on later product suspension.
CREATE OR REPLACE FUNCTION teacher_evaluation_school_admission() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM "organizations" o JOIN "education_product_entitlements" e
     ON e."organization_id"=o."id" AND e."product"='HUITEACHER' AND e."status"='ACTIVE'
   WHERE o."id"=NEW."organization_id" AND o."status"='ACTIVE'
     AND o."product_domain"='SCHOOL'
 ) THEN
   RAISE EXCEPTION 'Teacher evaluation requires active product school' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "huiteacher_evaluation_targets_school_guard"
  BEFORE INSERT ON "huiteacher_evaluation_targets"
  FOR EACH ROW EXECUTE FUNCTION teacher_evaluation_school_admission();
CREATE TRIGGER "huiteacher_evaluation_events_school_guard"
  BEFORE INSERT ON "huiteacher_evaluation_events"
  FOR EACH ROW EXECUTE FUNCTION teacher_evaluation_school_admission();
