-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "documents" JSONB,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "checkin_submissions" ADD COLUMN     "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "session_id" TEXT,
ADD COLUMN     "token_id" TEXT,
ALTER COLUMN "student_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "checkins" ADD COLUMN     "allow_anonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "documents" JSONB,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "original_cos_key" TEXT,
ADD COLUMN     "original_cos_url" TEXT;

-- CreateIndex
CREATE INDEX "checkin_submissions_is_anonymous_idx" ON "checkin_submissions"("is_anonymous");

-- CreateIndex
CREATE INDEX "checkin_submissions_session_id_idx" ON "checkin_submissions"("session_id");

-- CreateIndex
CREATE INDEX "checkin_submissions_token_id_idx" ON "checkin_submissions"("token_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkin_submissions_checkin_id_session_id_key" ON "checkin_submissions"("checkin_id", "session_id");

-- AddForeignKey
ALTER TABLE "checkin_submissions" ADD CONSTRAINT "checkin_submissions_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "checkin_access_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

