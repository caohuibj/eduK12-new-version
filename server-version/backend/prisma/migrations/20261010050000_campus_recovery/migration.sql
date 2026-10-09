-- Separate student offline identity recovery from legacy Course passwords.
CREATE TABLE "campus_student_recoveries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "class_unit_id" TEXT NOT NULL REFERENCES "campus_class_admissions"("class_unit_id") ON DELETE RESTRICT,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "token_hash" TEXT NOT NULL,
  "requested_by_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reason_code" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_student_recoveries_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "campus_student_recoveries_reason_check" CHECK
    ("reason_code" IN ('FORGOT_PASSWORD','FORGOT_LOGIN','INCIDENT_CORRECTION'))
);
CREATE INDEX "campus_student_recoveries_scope_idx"
  ON "campus_student_recoveries" ("organization_id","class_unit_id","user_id");
CREATE UNIQUE INDEX "campus_student_recoveries_active_user_key"
  ON "campus_student_recoveries" ("user_id") WHERE "used_at" IS NULL;

CREATE TABLE "campus_mfa_reset_requests" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "target_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "requested_by_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "approved_by_id" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason_code" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "decided_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_mfa_resets_status_check" CHECK
    ("status" IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
  CONSTRAINT "campus_mfa_resets_reason_check" CHECK ("reason_code" IN ('DEVICE_LOST','SECURITY_INCIDENT')),
  CONSTRAINT "campus_mfa_resets_separate_approver_check" CHECK
    ("approved_by_id" IS NULL OR "approved_by_id" <> "requested_by_id"),
  CONSTRAINT "campus_mfa_resets_decision_check" CHECK
    (("status" = 'PENDING' AND "decided_at" IS NULL AND "approved_by_id" IS NULL)
     OR ("status" <> 'PENDING' AND "decided_at" IS NOT NULL))
);
CREATE INDEX "campus_mfa_resets_target_idx"
  ON "campus_mfa_reset_requests" ("organization_id","target_user_id","status");
CREATE UNIQUE INDEX "campus_mfa_resets_pending_target_key"
  ON "campus_mfa_reset_requests" ("organization_id","target_user_id")
  WHERE "status" = 'PENDING';
