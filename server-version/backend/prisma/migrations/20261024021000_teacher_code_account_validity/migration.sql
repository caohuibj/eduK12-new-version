ALTER TABLE "teacher_codes" ADD COLUMN "account_validity_days" INTEGER;
ALTER TABLE "teacher_codes" ADD CONSTRAINT "teacher_codes_account_validity_days_check" CHECK ("account_validity_days" IS NULL OR "account_validity_days" BETWEEN 1 AND 3650);
