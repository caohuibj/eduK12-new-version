ALTER TABLE "videos"
  ADD COLUMN "processing_job_id" TEXT,
  ADD COLUMN "processing_started_at" TIMESTAMP(3);

CREATE INDEX "videos_status_processing_started_at_idx"
  ON "videos"("status", "processing_started_at");
