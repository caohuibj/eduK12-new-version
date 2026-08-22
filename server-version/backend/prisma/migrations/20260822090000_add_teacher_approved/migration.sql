-- 教师注册后需管理员审核。已有账号默认视为已通过。
ALTER TABLE "users" ADD COLUMN "teacher_approved" BOOLEAN NOT NULL DEFAULT true;
