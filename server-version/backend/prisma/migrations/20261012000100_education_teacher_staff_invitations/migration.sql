-- Huiteacher PR1: one-use invitations to a shared education User identity.
-- No User copy; existing SCHOOL logins can accept the same invite.
CREATE TABLE "education_teacher_staff_invitations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "invited_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "consumed_by_user_id" TEXT,
  CONSTRAINT "education_teacher_staff_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "education_teacher_staff_invitations_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "education_teacher_staff_invitations_org_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "education_teacher_staff_invitations_inviter_fkey" FOREIGN KEY ("invited_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "education_teacher_staff_invitations_consumer_fkey" FOREIGN KEY ("consumed_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "education_teacher_staff_invitations_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "education_teacher_staff_invitations_consume_check"
    CHECK (("consumed_at" IS NULL) = ("consumed_by_user_id" IS NULL))
);
CREATE INDEX "education_teacher_staff_invitations_org_idx"
  ON "education_teacher_staff_invitations"("organization_id","expires_at");
