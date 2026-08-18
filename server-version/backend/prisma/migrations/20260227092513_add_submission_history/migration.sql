-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "checkins" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "original_url" TEXT,
ADD COLUMN     "processed_at" TIMESTAMP(3),
ADD COLUMN     "processed_url" TEXT,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "status" "VideoStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "thumbnail_url" TEXT;

-- CreateTable
CREATE TABLE "course_shares" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "shared_by" TEXT NOT NULL,
    "shared_to" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_histories" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "content" TEXT,
    "answers" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_shares_course_id_shared_to_key" ON "course_shares"("course_id", "shared_to");

-- AddForeignKey
ALTER TABLE "course_shares" ADD CONSTRAINT "course_shares_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_shares" ADD CONSTRAINT "course_shares_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_shares" ADD CONSTRAINT "course_shares_shared_to_fkey" FOREIGN KEY ("shared_to") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_histories" ADD CONSTRAINT "submission_histories_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
