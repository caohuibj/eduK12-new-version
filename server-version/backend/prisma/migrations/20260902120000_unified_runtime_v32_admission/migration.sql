-- V32-3 Frozen Unit Admission: additive child-attempt snapshot. Historical
-- UNIFIED_V1 rows stay nullable; submit activates once or fail-closes.
ALTER TABLE "assessments" ADD COLUMN "frozen_admission_snapshot_encrypted" TEXT;
ALTER TABLE "assessments" ADD COLUMN "frozen_admission_snapshot_hash" TEXT;
