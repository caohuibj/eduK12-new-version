-- Additive management metadata only. No answers, snapshots or publication policy changes.
ALTER TABLE "questionnaires" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "composite_assessments" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "cognitive_assignments" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "assignments_course_id_created_at_id_idx" ON "assignments" ("course_id", "created_at" DESC, "id" DESC);
CREATE INDEX "assignments_tags_idx" ON "assignments" USING GIN ("tags");
CREATE INDEX "checkins_course_id_created_at_id_idx" ON "checkins" ("course_id", "created_at" DESC, "id" DESC);
CREATE INDEX "checkins_tags_idx" ON "checkins" USING GIN ("tags");
CREATE INDEX "questionnaires_creator_id_created_at_id_idx" ON "questionnaires" ("creator_id", "created_at" DESC, "id" DESC);
CREATE INDEX "questionnaires_tags_idx" ON "questionnaires" USING GIN ("tags");
CREATE INDEX "composite_assessments_created_by_created_at_id_idx" ON "composite_assessments" ("created_by", "created_at" DESC, "id" DESC);
CREATE INDEX "composite_assessments_tags_idx" ON "composite_assessments" USING GIN ("tags");
CREATE INDEX "cognitive_assignments_course_id_created_at_id_idx" ON "cognitive_assignments" ("course_id", "created_at" DESC, "id" DESC);
CREATE INDEX "cognitive_assignments_tags_idx" ON "cognitive_assignments" USING GIN ("tags");
CREATE INDEX "scales_creator_id_created_at_id_idx" ON "scales" ("creator_id", "created_at" DESC, "id" DESC);
CREATE INDEX "scales_tags_idx" ON "scales" USING GIN ("tags");
