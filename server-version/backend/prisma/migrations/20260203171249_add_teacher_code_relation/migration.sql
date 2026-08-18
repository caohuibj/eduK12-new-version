-- AlterTable
ALTER TABLE "users" ADD COLUMN     "teacher_code_id" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_teacher_code_id_fkey" FOREIGN KEY ("teacher_code_id") REFERENCES "teacher_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
