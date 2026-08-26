-- Admin library courses, copyable composite templates, and standalone-hidden cognitive shells.
ALTER TABLE "courses" ADD COLUMN "is_library" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "courses_is_library_idx" ON "courses"("is_library");

ALTER TABLE "composite_assessments" ADD COLUMN "copyable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "composite_assessments" ADD COLUMN "copied_from_id" TEXT;
CREATE INDEX "composite_assessments_copyable_status_idx" ON "composite_assessments"("copyable", "status");
ALTER TABLE "composite_assessments" ADD CONSTRAINT "composite_assessments_copied_from_id_fkey" FOREIGN KEY ("copied_from_id") REFERENCES "composite_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cognitive_assignments" ADD COLUMN "listed_standalone" BOOLEAN NOT NULL DEFAULT true;
