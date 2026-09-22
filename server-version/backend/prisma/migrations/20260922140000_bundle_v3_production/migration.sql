
ALTER TYPE "MaterialResourceType" ADD VALUE 'ASSESSMENT_BUNDLE';
ALTER TABLE "composite_assessments" DROP CONSTRAINT "questionnaire_collection_only";
ALTER TABLE "composite_assessments" ADD CONSTRAINT "questionnaire_collection_only" CHECK (
 ("product_kind" = 'LEGACY_COMPOSITE' AND "questionnaire_type" IS NULL)
 OR ("product_kind" IN ('QUESTIONNAIRE','ASSESSMENT_BUNDLE')
 AND (("product_kind" = 'QUESTIONNAIRE' AND "questionnaire_type" IS NOT NULL)
   OR ("product_kind" = 'ASSESSMENT_BUNDLE' AND "questionnaire_type" IS NULL))
 AND "report_package_profile" IS NULL AND "report_package_key" IS NULL AND "report_package_version" IS NULL AND "report_package_snapshot_encrypted" IS NULL
 AND "analysis_protocol_key" IS NULL AND "analysis_protocol_version" IS NULL AND "analysis_protocol_snapshot_encrypted" IS NULL));

CREATE TABLE "bundle_instances" (
 "composite_id" TEXT PRIMARY KEY REFERENCES "composite_assessments"("id") ON DELETE CASCADE,
 "schema_version" INTEGER NOT NULL DEFAULT 1 CHECK ("schema_version" = 1),
 "bundle_key" TEXT NOT NULL, "bundle_version" TEXT NOT NULL,
 "definition_hash" TEXT NOT NULL, "definition_encrypted" TEXT NOT NULL,
 "bindings_encrypted" TEXT NOT NULL, "bindings_hash" TEXT NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "bundle_analyses" (
 "id" TEXT PRIMARY KEY,
 "attempt_id" TEXT NOT NULL REFERENCES "composite_assessment_attempts"("id") ON DELETE CASCADE,
 "attempt_epoch" INTEGER NOT NULL CHECK ("attempt_epoch" > 0),
 "request_key" TEXT NOT NULL,
 "purpose" TEXT NOT NULL CHECK ("purpose" IN ('INITIAL','REANALYSIS')),
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','READY','UNAVAILABLE','FAILED')),
 "parent_input_hash" TEXT NOT NULL,
 "target_definition_hash" TEXT NOT NULL, "target_definition_encrypted" TEXT NOT NULL,
 "aggregate_input_hash" TEXT, "payload_encrypted" TEXT, "facts_hash" TEXT, "error_code" TEXT,
 "generated_by" TEXT, "reason" TEXT, "previous_analysis_id" TEXT,
 "retry_count" INTEGER NOT NULL DEFAULT 0,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "bundle_analysis_output" CHECK (
   ("status" IN ('READY','UNAVAILABLE') AND "payload_encrypted" IS NOT NULL AND "facts_hash" IS NOT NULL AND "aggregate_input_hash" IS NOT NULL)
   OR ("status" IN ('PENDING','FAILED') AND "payload_encrypted" IS NULL AND "facts_hash" IS NULL)),
 CONSTRAINT "bundle_analysis_purpose" CHECK (
   ("purpose" = 'INITIAL' AND "request_key" = 'INITIAL' AND "generated_by" IS NULL)
   OR ("purpose" = 'REANALYSIS' AND "request_key" <> 'INITIAL' AND "generated_by" IS NOT NULL AND "reason" IS NOT NULL))
);
CREATE UNIQUE INDEX "bundle_analyses_attempt_id_attempt_epoch_request_key_key" ON "bundle_analyses"("attempt_id","attempt_epoch","request_key");
CREATE INDEX "bundle_analyses_attempt_id_created_at_idx" ON "bundle_analyses"("attempt_id","created_at");
