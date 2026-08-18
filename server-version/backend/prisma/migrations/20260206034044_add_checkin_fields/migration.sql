-- AlterTable
ALTER TABLE "checkins" ADD COLUMN     "allow_view_others" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "end_time" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
