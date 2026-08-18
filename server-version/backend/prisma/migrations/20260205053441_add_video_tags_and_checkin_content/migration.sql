-- AlterTable
ALTER TABLE "checkins" ADD COLUMN     "content" TEXT,
ADD COLUMN     "images" JSONB,
ADD COLUMN     "videos" JSONB;

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
