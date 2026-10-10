-- PR2 C02. Activity reuses the Course container; no parallel assessment runtime.
ALTER TABLE "courses" ADD CONSTRAINT "courses_id_org_key" UNIQUE ("id","organization_id");

CREATE TABLE "campus_activities" (
  "course_id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "owner_membership_id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'STUDENT_WELLBEING',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "opened_by_user_id" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "opened_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_activities_course_scope_fk" FOREIGN KEY ("course_id","organization_id")
    REFERENCES "courses"("id","organization_id") ON DELETE RESTRICT,
  CONSTRAINT "campus_activities_owner_scope_fk" FOREIGN KEY ("organization_id","owner_membership_id")
    REFERENCES "organization_memberships"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "campus_activities_status_check"
    CHECK ("status" IN ('DRAFT','SUBMITTED','OPEN','PAUSED','CLOSED')),
  CONSTRAINT "campus_activities_purpose_check" CHECK
    ("purpose" IN ('STUDENT_WELLBEING','LEARNING_ADAPTATION','SCHOOL_CLIMATE','FAMILY_SUPPORT')),
  CONSTRAINT "campus_activities_version_check" CHECK ("version">=1),
  CONSTRAINT "campus_activities_org_course_key" UNIQUE ("organization_id","course_id")
);
CREATE INDEX "campus_activities_org_status_idx"
  ON "campus_activities"("organization_id","status","created_at" DESC);

CREATE TABLE "campus_activity_collaborators" (
  "course_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_activity_collaborators_pkey" PRIMARY KEY ("course_id","membership_id"),
  CONSTRAINT "campus_activity_collaborators_activity_fk" FOREIGN KEY ("organization_id","course_id")
    REFERENCES "campus_activities"("organization_id","course_id") ON DELETE RESTRICT,
  CONSTRAINT "campus_activity_collaborators_membership_fk" FOREIGN KEY ("organization_id","membership_id")
    REFERENCES "organization_memberships"("organization_id","id") ON DELETE RESTRICT
);
CREATE INDEX "campus_activity_collaborators_member_idx"
  ON "campus_activity_collaborators"("organization_id","membership_id");

CREATE TABLE "campus_activity_participants" (
  "course_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "selected_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "campus_activity_participants_pkey" PRIMARY KEY ("course_id","membership_id"),
  CONSTRAINT "campus_activity_participants_activity_fk" FOREIGN KEY ("organization_id","course_id")
    REFERENCES "campus_activities"("organization_id","course_id") ON DELETE RESTRICT,
  CONSTRAINT "campus_activity_participants_membership_fk" FOREIGN KEY ("organization_id","membership_id")
    REFERENCES "organization_memberships"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "campus_activity_participants_status_check" CHECK
    (("status"='ACTIVE' AND "revoked_at" IS NULL) OR
     ("status"='REVOKED' AND "revoked_at" IS NOT NULL))
);
CREATE INDEX "campus_activity_participants_member_idx"
  ON "campus_activity_participants"("organization_id","membership_id","status");

CREATE TABLE "campus_activity_allocation_receipts" (
  "course_id" TEXT NOT NULL, "request_key" TEXT NOT NULL, "request_hash" TEXT NOT NULL,
  "allocated_count" INTEGER NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_activity_allocation_receipts_pkey" PRIMARY KEY ("course_id","request_key"),
  CONSTRAINT "campus_activity_allocation_receipts_course_fk"
    FOREIGN KEY ("course_id") REFERENCES "campus_activities"("course_id") ON DELETE RESTRICT,
  CONSTRAINT "campus_activity_allocation_count_check" CHECK ("allocated_count">=0)
);

CREATE TABLE "campus_activity_runs" (
  "course_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL UNIQUE,
  "bound_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_activity_runs_pkey" PRIMARY KEY ("course_id","run_id"),
  CONSTRAINT "campus_activity_runs_activity_fk" FOREIGN KEY ("organization_id","course_id")
    REFERENCES "campus_activities"("organization_id","course_id") ON DELETE RESTRICT,
  CONSTRAINT "campus_activity_runs_run_fk" FOREIGN KEY ("organization_id","run_id")
    REFERENCES "assessment_runs"("organization_id","id") ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION campus_activity_domain_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "courses" c JOIN "organizations" o ON o."id"=c."organization_id"
    WHERE c."id"=NEW."course_id" AND c."organization_id"=NEW."organization_id"
      AND c."course_type"='CAMPUS_ACTIVITY' AND o."product_domain"='SCHOOL'
  ) THEN
    RAISE EXCEPTION 'campus activity must use SCHOOL Course' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER campus_activity_domain_guard
  BEFORE INSERT OR UPDATE OF "course_id","organization_id" ON "campus_activities"
  FOR EACH ROW EXECUTE FUNCTION campus_activity_domain_guard();
