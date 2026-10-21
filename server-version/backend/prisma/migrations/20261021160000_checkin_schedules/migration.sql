CREATE TABLE "checkin_schedules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "course_id" TEXT NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "creator_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "template" JSONB NOT NULL,
  "interval_days" INTEGER NOT NULL CHECK ("interval_days" BETWEEN 1 AND 365),
  "duration_hours" INTEGER NOT NULL CHECK ("duration_hours" BETWEEN 1 AND 8760),
  "first_publish_at" TIMESTAMP(3) NOT NULL,
  "next_publish_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "timezone" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "published_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CHECK ("ends_at" IS NULL OR "ends_at" >= "first_publish_at")
);
CREATE INDEX "checkin_schedules_active_next_publish_at_idx" ON "checkin_schedules"("active", "next_publish_at");
CREATE INDEX "checkin_schedules_course_id_created_at_idx" ON "checkin_schedules"("course_id", "created_at" DESC);
ALTER TABLE "checkins" ADD COLUMN "schedule_id" TEXT, ADD COLUMN "scheduled_for" TIMESTAMP(3);
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "checkin_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "checkins_schedule_id_scheduled_for_key" ON "checkins"("schedule_id", "scheduled_for");
