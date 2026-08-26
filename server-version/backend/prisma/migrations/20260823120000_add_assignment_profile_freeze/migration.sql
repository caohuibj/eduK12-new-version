-- Freeze profile + resolved config at assignment publish. Session start copies the snapshot.
ALTER TABLE "cognitive_assignments" ADD COLUMN "profile" TEXT;
ALTER TABLE "cognitive_assignments" ADD COLUMN "profile_definition_version" TEXT;
ALTER TABLE "cognitive_assignments" ADD COLUMN "resolved_config_snapshot_encrypted" TEXT;
ALTER TABLE "cognitive_assignments" ADD COLUMN "resolved_config_hash" TEXT;
