-- Only explicit materialization records establish quota lineage. Historical
-- bindings remain untouched: equal config hashes do not prove a shared source.
ALTER TABLE "cognitive_assignments" ADD COLUMN "quota_source_assignment_id" TEXT;
CREATE INDEX "cognitive_assignments_quota_source_assignment_id_idx"
  ON "cognitive_assignments"("quota_source_assignment_id");
ALTER TABLE "cognitive_assignments" ADD CONSTRAINT "cognitive_assignments_quota_source_assignment_id_fkey"
  FOREIGN KEY ("quota_source_assignment_id") REFERENCES "cognitive_assignments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
