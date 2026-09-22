ALTER TABLE "composite_assessments"
 ADD COLUMN "product_kind" TEXT NOT NULL DEFAULT 'LEGACY_COMPOSITE',
 ADD COLUMN "questionnaire_type" "QuestionnaireType",
 ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "creation_key" TEXT,
 ADD COLUMN "creation_hash" TEXT;
CREATE UNIQUE INDEX "composite_assessments_creation_key_key" ON "composite_assessments"("creation_key");
ALTER TABLE "composite_assessments" ADD CONSTRAINT "questionnaire_collection_only" CHECK (
 ("product_kind" = 'LEGACY_COMPOSITE' AND "questionnaire_type" IS NULL)
 OR ("product_kind" = 'QUESTIONNAIRE' AND "questionnaire_type" IS NOT NULL
 AND "reportPackageKey" IS NULL AND "reportPackageVersion" IS NULL AND "reportPackageSnapshotEncrypted" IS NULL
 AND "analysisProtocolKey" IS NULL AND "analysisProtocolVersion" IS NULL AND "analysisProtocolSnapshotEncrypted" IS NULL));
ALTER TABLE "composite_assessment_attempts" ADD COLUMN "delivery_course_id" TEXT;
CREATE TABLE "questionnaire_course_deliveries" (
 "composite_id" TEXT NOT NULL REFERENCES "composite_assessments"("id") ON DELETE CASCADE,
 "course_id" TEXT NOT NULL REFERENCES "courses"("id") ON DELETE RESTRICT,
 PRIMARY KEY ("composite_id","course_id"));
CREATE INDEX "questionnaire_course_deliveries_course_id_idx" ON "questionnaire_course_deliveries"("course_id");
