-- Additive, default-disabled Parent portal. No backfill or new disclosure grants.
CREATE TABLE "parent_portal_audit" (
  "id" TEXT PRIMARY KEY, "actor_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL, "relationship_id" TEXT REFERENCES "parent_student_relationships"("id") ON DELETE RESTRICT,
  "artifact_id" TEXT, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "parent_report_consents" (
  "id" TEXT PRIMARY KEY, "relationship_id" TEXT NOT NULL REFERENCES "parent_student_relationships"("id") ON DELETE RESTRICT,
  "student_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "parent_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "source_artifact_id" TEXT NOT NULL REFERENCES "reporting_analysis_artifacts"("id") ON DELETE RESTRICT,
  "source_hash" TEXT NOT NULL CHECK ("source_hash" ~ '^[0-9a-f]{64}$'),
  "consent_version" TEXT NOT NULL, "consent_hash" TEXT NOT NULL CHECK ("consent_hash" ~ '^[0-9a-f]{64}$'),
  "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "valid_until" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6), "command_key" TEXT NOT NULL,
  UNIQUE ("student_user_id", "command_key"), UNIQUE ("id", "relationship_id", "source_artifact_id"),
  CHECK ("valid_until" > "accepted_at")
);
CREATE TABLE "parent_report_disclosure_grants" (
  "id" TEXT PRIMARY KEY, "relationship_id" TEXT NOT NULL REFERENCES "parent_student_relationships"("id") ON DELETE RESTRICT,
  "student_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "parent_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "source_artifact_id" TEXT NOT NULL REFERENCES "reporting_analysis_artifacts"("id") ON DELETE RESTRICT,
  "source_hash" TEXT NOT NULL CHECK ("source_hash" ~ '^[0-9a-f]{64}$'),
  "source_policy_key" TEXT NOT NULL, "source_policy_version" TEXT NOT NULL,
  "source_policy_hash" TEXT NOT NULL CHECK ("source_policy_hash" ~ '^[0-9a-f]{64}$'),
  "projection_mode" TEXT NOT NULL CHECK ("projection_mode" IN ('COMPLETION_ONLY','EDUCATIONAL_SUMMARY')),
  "projection_payload" JSONB NOT NULL, "projection_hash" TEXT NOT NULL CHECK ("projection_hash" ~ '^[0-9a-f]{64}$'),
  "consent_id" TEXT NOT NULL, "consent_version" TEXT NOT NULL, "consent_hash" TEXT NOT NULL,
  "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "valid_until" TIMESTAMPTZ(6) NOT NULL,
  "approved_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "revoked_by_user_id" TEXT REFERENCES "users"("id") ON DELETE RESTRICT, "revoked_at" TIMESTAMPTZ(6), "revoke_reason" TEXT,
  "command_key" TEXT NOT NULL, UNIQUE ("approved_by_user_id","command_key"),
  FOREIGN KEY ("consent_id","relationship_id","source_artifact_id") REFERENCES "parent_report_consents"("id","relationship_id","source_artifact_id") ON DELETE RESTRICT,
  CHECK ("valid_until" > "valid_from")
);
CREATE INDEX "parent_report_grants_parent_child_idx" ON "parent_report_disclosure_grants"("parent_user_id","student_user_id","valid_until");
CREATE INDEX "parent_report_consents_relation_idx" ON "parent_report_consents"("relationship_id","source_artifact_id");
CREATE INDEX "parent_portal_audit_relation_idx" ON "parent_portal_audit"("relationship_id","created_at");

CREATE FUNCTION "guard_parent_report_evidence"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'parent disclosure evidence cannot be deleted'; END IF;
  IF (to_jsonb(OLD) - ARRAY['revoked_at','revoked_by_user_id','revoke_reason']) IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['revoked_at','revoked_by_user_id','revoke_reason']) THEN
    RAISE EXCEPTION 'parent disclosure bindings are immutable';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'parent disclosure revocation is final'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "parent_report_grants_evidence" BEFORE UPDATE OR DELETE ON "parent_report_disclosure_grants" FOR EACH ROW EXECUTE FUNCTION "guard_parent_report_evidence"();
CREATE TRIGGER "parent_report_consents_evidence" BEFORE UPDATE OR DELETE ON "parent_report_consents" FOR EACH ROW EXECUTE FUNCTION "guard_parent_report_evidence"();
CREATE TRIGGER "parent_portal_audit_immutable" BEFORE UPDATE OR DELETE ON "parent_portal_audit" FOR EACH ROW EXECUTE FUNCTION "reject_reporting_snapshot_mutation"();

ALTER TABLE "organization_capability_grants" DROP CONSTRAINT "organization_capability_grants_capability_check";
ALTER TABLE "organization_capability_grants" ADD CONSTRAINT "organization_capability_grants_capability_check" CHECK ("capability" IN ('PSYCHOLOGY_STAFF','REPORT_EXPORT','REPORT_MEMBER_EXPORT','PARENT_REPORT_DISCLOSURE'));
