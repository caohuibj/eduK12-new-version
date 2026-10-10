-- CAMPUS peer evaluation is opt-in, same-class and privacy-thresholded.
-- Peer responses never become individual teacher/parent disclosures by virtue
-- of this allocation. Science/content authority remains canonical Run.
CREATE TABLE "campus_peer_consents" (
  "course_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "assented_at" TIMESTAMPTZ(6) NOT NULL,
  "guardian_relationship_id" TEXT,
  "guardian_consented_at" TIMESTAMPTZ(6),
  "consent_version" TEXT NOT NULL,
  "withdrawn_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "campus_peer_consents_pkey" PRIMARY KEY ("course_id","membership_id"),
  CONSTRAINT "campus_peer_consents_activity_fk" FOREIGN KEY ("organization_id","course_id")
    REFERENCES "campus_activities"("organization_id","course_id") ON DELETE RESTRICT,
  CONSTRAINT "campus_peer_consents_membership_fk" FOREIGN KEY ("organization_id","membership_id")
    REFERENCES "organization_memberships"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "campus_peer_consents_guardian_fk" FOREIGN KEY ("guardian_relationship_id")
    REFERENCES "parent_student_relationships"("id") ON DELETE RESTRICT,
  CONSTRAINT "campus_peer_consents_guardian_state_check"
    CHECK (("guardian_consented_at" IS NULL) = ("guardian_relationship_id" IS NULL))
);
CREATE INDEX "campus_peer_consents_member_idx"
 ON "campus_peer_consents"("organization_id","membership_id","withdrawn_at");

CREATE TABLE "campus_peer_assignments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "course_id" TEXT NOT NULL,
  "class_unit_id" TEXT NOT NULL,
  "subject_membership_id" TEXT NOT NULL,
  "respondent_membership_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "campus_peer_assignments_activity_fk" FOREIGN KEY ("organization_id","course_id")
    REFERENCES "campus_activities"("organization_id","course_id") ON DELETE RESTRICT,
  CONSTRAINT "campus_peer_assignments_class_fk" FOREIGN KEY ("organization_id","class_unit_id")
    REFERENCES "campus_class_admissions"("organization_id","class_unit_id") ON DELETE RESTRICT,
  CONSTRAINT "campus_peer_assignments_subject_fk" FOREIGN KEY ("organization_id","subject_membership_id")
    REFERENCES "organization_memberships"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "campus_peer_assignments_respondent_fk" FOREIGN KEY ("organization_id","respondent_membership_id")
    REFERENCES "organization_memberships"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "campus_peer_assignments_distinct_check"
    CHECK ("subject_membership_id" <> "respondent_membership_id"),
  CONSTRAINT "campus_peer_assignments_state_check"
    CHECK (("status"='ACTIVE' AND "revoked_at" IS NULL)
      OR ("status"='REVOKED' AND "revoked_at" IS NOT NULL)),
  CONSTRAINT "campus_peer_assignments_unique" UNIQUE
    ("course_id","respondent_membership_id","subject_membership_id")
);
CREATE INDEX "campus_peer_assignments_respondent_idx"
 ON "campus_peer_assignments"("course_id","respondent_membership_id","status");
CREATE INDEX "campus_peer_assignments_subject_idx"
 ON "campus_peer_assignments"("course_id","subject_membership_id","status");
