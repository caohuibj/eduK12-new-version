-- Organization / Reporting V2.1 PR1-C06/C07
-- Personas describe how a member participates; capabilities grant named
-- permissions. Neither is a replacement for PlatformRole or org_role.

CREATE TABLE "organization_persona_grants" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "persona" TEXT NOT NULL,
  "granted_by_user_id" TEXT NOT NULL,
  "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_by_user_id" TEXT,
  "revoked_at" TIMESTAMPTZ,
  CONSTRAINT "organization_persona_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_persona_grants_persona_check"
    CHECK ("persona" IN ('TEACHER', 'STUDENT', 'COUNSELOR', 'CLIENT')),
  CONSTRAINT "organization_persona_grants_interval_check"
    CHECK ("revoked_at" IS NULL OR "revoked_at" > "granted_at"),
  CONSTRAINT "organization_persona_grants_membership_fkey"
    FOREIGN KEY ("organization_id", "membership_id")
    REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_persona_grants_granted_by_fkey"
    FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_persona_grants_revoked_by_fkey"
    FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_persona_grants_current_key"
  ON "organization_persona_grants" ("membership_id", "persona")
  WHERE "revoked_at" IS NULL;
CREATE INDEX "organization_persona_grants_org_membership_idx"
  ON "organization_persona_grants" ("organization_id", "membership_id");

CREATE TABLE "organization_capability_grants" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "capability" TEXT NOT NULL,
  "granted_by_user_id" TEXT NOT NULL,
  "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_by_user_id" TEXT,
  "revoked_at" TIMESTAMPTZ,
  CONSTRAINT "organization_capability_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_capability_grants_capability_check"
    CHECK ("capability" IN ('PSYCHOLOGY_STAFF', 'REPORT_EXPORT', 'REPORT_MEMBER_EXPORT')),
  CONSTRAINT "organization_capability_grants_interval_check"
    CHECK ("revoked_at" IS NULL OR "revoked_at" > "granted_at"),
  CONSTRAINT "organization_capability_grants_membership_fkey"
    FOREIGN KEY ("organization_id", "membership_id")
    REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_capability_grants_granted_by_fkey"
    FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_capability_grants_revoked_by_fkey"
    FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_capability_grants_current_key"
  ON "organization_capability_grants" ("membership_id", "capability")
  WHERE "revoked_at" IS NULL;
CREATE INDEX "organization_capability_grants_org_membership_idx"
  ON "organization_capability_grants" ("organization_id", "membership_id");

-- Explicit deny is a first-class authority fact and outranks SYSTEM_ADMIN,
-- ORG_ADMIN, persona, and capability grants. permission='*' denies all
-- organization access; otherwise it denies the named permission/capability.
CREATE TABLE "organization_access_denies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "denied_by_user_id" TEXT NOT NULL,
  "denied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lifted_by_user_id" TEXT,
  "lifted_at" TIMESTAMPTZ,
  CONSTRAINT "organization_access_denies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_access_denies_interval_check"
    CHECK ("lifted_at" IS NULL OR "lifted_at" > "denied_at"),
  CONSTRAINT "organization_access_denies_org_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_access_denies_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_access_denies_denied_by_fkey"
    FOREIGN KEY ("denied_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_access_denies_lifted_by_fkey"
    FOREIGN KEY ("lifted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_access_denies_current_key"
  ON "organization_access_denies" ("organization_id", "user_id", "permission")
  WHERE "lifted_at" IS NULL;

CREATE TABLE "organization_governance_audits" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "actor_user_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "domain_event_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_governance_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_governance_audits_domain_event_id_key" UNIQUE ("domain_event_id"),
  CONSTRAINT "organization_governance_audits_org_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_governance_audits_actor_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "organization_governance_audits_org_created_idx"
  ON "organization_governance_audits" ("organization_id", "created_at" DESC);

CREATE OR REPLACE FUNCTION "reject_organization_governance_audit_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'organization governance audit rows are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "organization_governance_audits_append_only"
BEFORE UPDATE OR DELETE ON "organization_governance_audits"
FOR EACH ROW EXECUTE FUNCTION "reject_organization_governance_audit_mutation"();

CREATE TABLE "organization_command_receipts" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "organization_id" TEXT,
  "command_key" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_command_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_command_receipts_actor_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_command_receipts_org_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_command_receipts_scope_key"
  ON "organization_command_receipts" (
    "actor_user_id", COALESCE("organization_id", ''), "command_key"
  );
CREATE INDEX "organization_command_receipts_created_idx"
  ON "organization_command_receipts" ("created_at");
