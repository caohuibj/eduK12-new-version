-- Campus parent registration is deliberately independent of TRAINING accounts.
-- A current PENDING link still needs the child's explicit confirmation.
-- Parent acknowledgement alone never grants visibility of student reports.
CREATE TABLE "campus_parent_registrations" (
  "parent_user_id" TEXT NOT NULL PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT,
  "student_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "relationship_id" TEXT NOT NULL UNIQUE REFERENCES "parent_student_relationships"("id") ON DELETE RESTRICT,
  "terms_version" TEXT NOT NULL,
  "terms_hash" TEXT NOT NULL,
  "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_parent_registration_distinct" CHECK ("parent_user_id" <> "student_user_id")
);
CREATE INDEX "campus_parent_registrations_scope_idx"
 ON "campus_parent_registrations" ("organization_id", "student_user_id");
