-- PR1 additive preference storage. No current report policies, legacy ledgers,
-- assessment answers, or FINAL paths are updated by this migration.
CREATE TABLE "education_report_privacy_preferences" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "product" TEXT NOT NULL,
  "scenario" TEXT NOT NULL,
  "owner_scope_kind" TEXT NOT NULL,
  "owner_user_id" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "preset" TEXT,
  "options" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updated_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "education_report_privacy_preferences_product_check"
    CHECK ("product" IN ('HUISCHOOL','HUITEACHER')),
  CONSTRAINT "education_report_privacy_preferences_scenario_check"
    CHECK (("product"='HUITEACHER' AND "scenario" IN
      ('TEACHER_STUDENT_EVALUATION','TEACHER_ADULT_FORM_GROUP'))
      OR ("product"='HUISCHOOL' AND "scenario" IN
      ('SCHOOL_GENERAL_EDUCATION_GROUP','SCHOOL_SENSITIVE_WELLBEING_GROUP'))),
  CONSTRAINT "education_report_privacy_preferences_scope_check"
    CHECK (("owner_scope_kind"='PUBLISHER' AND "owner_user_id" IS NOT NULL
      AND "preset" IN ('STANDARD','ENHANCED','CUSTOM'))
      OR ("owner_scope_kind" IN ('SCHOOL_DEFAULT','SCHOOL_MINIMUM')
        AND "owner_user_id" IS NULL
        AND (("owner_scope_kind"='SCHOOL_MINIMUM' AND "preset" IS NULL)
          OR ("owner_scope_kind"='SCHOOL_DEFAULT'
            AND "preset" IN ('STANDARD','ENHANCED','CUSTOM'))))),
  CONSTRAINT "education_report_privacy_preferences_revision_check" CHECK ("revision">=1),
  CONSTRAINT "education_report_privacy_preferences_schema_check"
    CHECK ("schema_version"=1 AND jsonb_typeof("options")='object')
);
-- PostgreSQL treats NULL as distinct; explicit partial unique indexes are required.
CREATE UNIQUE INDEX "education_report_privacy_preferences_school_unique"
  ON "education_report_privacy_preferences"("organization_id","product","scenario","owner_scope_kind")
  WHERE "owner_scope_kind" IN ('SCHOOL_DEFAULT','SCHOOL_MINIMUM');
CREATE UNIQUE INDEX "education_report_privacy_preferences_publisher_unique"
  ON "education_report_privacy_preferences"("organization_id","product","scenario","owner_user_id")
  WHERE "owner_scope_kind"='PUBLISHER';
CREATE INDEX "education_report_privacy_preferences_read_idx"
  ON "education_report_privacy_preferences"
  ("organization_id","product","scenario","owner_scope_kind","owner_user_id");

CREATE TABLE "education_report_policy_snapshots" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "scenario" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "policy_version" INTEGER NOT NULL DEFAULT 1,
  "effective_json" JSONB NOT NULL,
  "effective_hash" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "school_default_revision" INTEGER NOT NULL DEFAULT 0,
  "school_minimum_revision" INTEGER NOT NULL DEFAULT 0,
  "publisher_revision" INTEGER NOT NULL DEFAULT 0,
  "published_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "education_report_policy_snapshots_run_unique" UNIQUE ("organization_id","run_id"),
  CONSTRAINT "education_report_policy_snapshots_org_id_unique" UNIQUE ("organization_id","id"),
  CONSTRAINT "education_report_policy_snapshots_org_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "education_report_policy_snapshots_run_fk"
    FOREIGN KEY ("organization_id","run_id")
    REFERENCES "assessment_runs"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "education_report_policy_snapshots_version_check"
    CHECK ("policy_version"=1),
  CONSTRAINT "education_report_policy_snapshots_hash_check"
    CHECK ("effective_hash" ~ '^[a-f0-9]{64}$'
      AND "fingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "education_report_policy_snapshots_effective_check"
    CHECK (jsonb_typeof("effective_json")='object')
);
CREATE TABLE "education_report_release_records" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "report_scope_key" TEXT NOT NULL CHECK ("report_scope_key" ~ '^[a-f0-9]{64}
  "policy_snapshot_id" TEXT NOT NULL,
  "source_run_id" TEXT NOT NULL,
  "source_spec_id" TEXT,
  "report_kind" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "report_digest" TEXT NOT NULL,
  "effective_population_digest" TEXT,
  "legacy_source" TEXT,
  "released_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "released_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "education_report_release_records_org_scope_unique"
    UNIQUE("organization_id","report_scope_key"),
  CONSTRAINT "education_report_release_records_snapshot_fk"
    FOREIGN KEY ("organization_id","policy_snapshot_id")
    REFERENCES "education_report_policy_snapshots"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "education_report_release_records_run_fk"
    FOREIGN KEY ("organization_id","source_run_id")
    REFERENCES "assessment_runs"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "education_report_release_records_hash_check"
    CHECK ("report_digest" ~ '^[a-f0-9]{64}$'
      AND ("effective_population_digest" IS NULL
        OR "effective_population_digest" ~ '^[a-f0-9]{64}$'))
);
CREATE INDEX "education_report_release_records_source_idx"
  ON "education_report_release_records"("organization_id","source_run_id","report_kind");

-- A report and its binding to a frozen policy cannot be silently changed or deleted.
CREATE OR REPLACE FUNCTION protect_education_report_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'report privacy snapshot/release history is immutable'
    USING ERRCODE='23514';
END $$;
CREATE TRIGGER "education_report_policy_snapshots_immutable"
  BEFORE UPDATE OR DELETE ON "education_report_policy_snapshots"
  FOR EACH ROW EXECUTE FUNCTION protect_education_report_evidence();
CREATE TRIGGER "education_report_release_records_immutable"
  BEFORE UPDATE OR DELETE ON "education_report_release_records"
  FOR EACH ROW EXECUTE FUNCTION protect_education_report_evidence();
),
  "policy_snapshot_id" TEXT NOT NULL,
  "source_run_id" TEXT NOT NULL,
  "source_spec_id" TEXT,
  "report_kind" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "report_digest" TEXT NOT NULL,
  "effective_population_digest" TEXT,
  "legacy_source" TEXT,
  "released_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "released_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "education_report_release_records_org_scope_unique"
    UNIQUE("organization_id","report_scope_key"),
  CONSTRAINT "education_report_release_records_snapshot_fk"
    FOREIGN KEY ("organization_id","policy_snapshot_id")
    REFERENCES "education_report_policy_snapshots"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "education_report_release_records_run_fk"
    FOREIGN KEY ("organization_id","source_run_id")
    REFERENCES "assessment_runs"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "education_report_release_records_hash_check"
    CHECK ("report_digest" ~ '^[a-f0-9]{64}$'
      AND ("effective_population_digest" IS NULL
        OR "effective_population_digest" ~ '^[a-f0-9]{64}$'))
);
CREATE INDEX "education_report_release_records_source_idx"
  ON "education_report_release_records"("organization_id","source_run_id","report_kind");

-- A report and its binding to a frozen policy cannot be silently changed or deleted.
CREATE OR REPLACE FUNCTION protect_education_report_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'report privacy snapshot/release history is immutable'
    USING ERRCODE='23514';
END $$;
CREATE TRIGGER "education_report_policy_snapshots_immutable"
  BEFORE UPDATE OR DELETE ON "education_report_policy_snapshots"
  FOR EACH ROW EXECUTE FUNCTION protect_education_report_evidence();
CREATE TRIGGER "education_report_release_records_immutable"
  BEFORE UPDATE OR DELETE ON "education_report_release_records"
  FOR EACH ROW EXECUTE FUNCTION protect_education_report_evidence();
