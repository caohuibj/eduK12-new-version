-- Legacy ptool import bookkeeping (operator-run migration tooling only).
-- These tables are never read by application runtime code.
CREATE TABLE "_legacy_import_batches" (
  "id" TEXT PRIMARY KEY,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('dry_run','apply','verify')),
  "status" TEXT NOT NULL DEFAULT 'RUNNING' CHECK ("status" IN ('RUNNING','DONE','FAILED')),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "counts" JSONB,
  "summary" JSONB,
  "error" TEXT
);
CREATE TABLE "_legacy_import_id_map" (
  "id" TEXT PRIMARY KEY,
  "entity" TEXT NOT NULL,
  "legacy_id" TEXT NOT NULL,
  "new_id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL REFERENCES "_legacy_import_batches"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "_legacy_import_id_map_entity_legacy_id_key" ON "_legacy_import_id_map"("entity", "legacy_id");
CREATE INDEX "_legacy_import_id_map_batch_id_idx" ON "_legacy_import_id_map"("batch_id");
