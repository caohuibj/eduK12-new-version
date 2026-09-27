CREATE TABLE "export_batches" (
  "id" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "anonymized" BOOLEAN NOT NULL DEFAULT true,
  "formats" TEXT[] NOT NULL,
  "options" JSONB NOT NULL,
  "request_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status" "ExportArtifactStatus" NOT NULL DEFAULT 'PROCESSING',
  "generation" INTEGER NOT NULL DEFAULT 0,
  "processing_job_id" TEXT,
  "processing_started_at" TIMESTAMP(3),
  "error_code" TEXT,
  "record_count" INTEGER NOT NULL,
  "field_count" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "export_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "export_batches_created_by_request_key_key"
  ON "export_batches"("created_by", "request_key");
CREATE INDEX "export_batches_resource_type_resource_id_idx"
  ON "export_batches"("resource_type", "resource_id");
CREATE INDEX "export_batches_status_updated_at_idx"
  ON "export_batches"("status", "updated_at");
CREATE INDEX "export_batches_expires_at_idx"
  ON "export_batches"("expires_at");
