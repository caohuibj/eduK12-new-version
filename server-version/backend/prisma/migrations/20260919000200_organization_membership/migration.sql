-- Organization / Reporting V2.1 PR1-C03
-- Organization and temporal membership are new authorities. Legacy Course is
-- intentionally not referenced or inferred here.

CREATE TABLE "organizations" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" TEXT NOT NULL,
  "suspended_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organizations_status_check" CHECK ("status" IN ('ACTIVE', 'SUSPENDED')),
  CONSTRAINT "organizations_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "organization_memberships" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "org_role" TEXT NOT NULL DEFAULT 'MEMBER',
  "valid_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_until" TIMESTAMPTZ,
  "ended_by_user_id" TEXT,
  "end_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_memberships_org_role_check" CHECK ("org_role" IN ('MEMBER', 'ORG_ADMIN')),
  CONSTRAINT "organization_memberships_interval_check" CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from"),
  CONSTRAINT "organization_memberships_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_memberships_ended_by_user_id_fkey"
    FOREIGN KEY ("ended_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_memberships_org_id_id_key" UNIQUE ("organization_id", "id")
);

-- An episode ends by setting valid_until. Rejoin must create a new membership
-- id; an ended row can never be resurrected into the current slot.
CREATE UNIQUE INDEX "organization_memberships_current_user_org_key"
  ON "organization_memberships" ("organization_id", "user_id")
  WHERE "valid_until" IS NULL;

CREATE INDEX "organization_memberships_user_history_idx"
  ON "organization_memberships" ("user_id", "organization_id", "valid_from" DESC);

CREATE INDEX "organization_memberships_org_current_role_idx"
  ON "organization_memberships" ("organization_id", "org_role")
  WHERE "valid_until" IS NULL;
