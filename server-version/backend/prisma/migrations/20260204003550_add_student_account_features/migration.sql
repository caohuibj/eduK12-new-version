-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "ended_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_frozen" BOOLEAN NOT NULL DEFAULT false;
