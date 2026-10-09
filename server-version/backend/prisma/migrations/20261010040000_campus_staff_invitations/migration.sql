CREATE TABLE "campus_staff_invitations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "token_hash" TEXT NOT NULL,
  "persona" TEXT NOT NULL,
  "admin_role" BOOLEAN NOT NULL DEFAULT FALSE,
  "psychology_staff" BOOLEAN NOT NULL DEFAULT FALSE,
  "invited_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "consumed_by_user_id" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_staff_invitations_persona_check" CHECK ("persona" IN ('TEACHER','COUNSELOR')),
  CONSTRAINT "campus_staff_invitations_state_check"
    CHECK (("consumed_at" IS NULL)=("consumed_by_user_id" IS NULL)),
  CONSTRAINT "campus_staff_invitations_token_hash_key" UNIQUE ("token_hash")
);
CREATE INDEX "campus_staff_invitations_org_idx"
  ON "campus_staff_invitations" ("organization_id","expires_at");
