-- 添加进度缓存字段到问卷测评表
-- 用于优化状态查询性能，避免每次都查询所有量表测评和表单答案

ALTER TABLE "questionnaires_assessments" ADD COLUMN "completed_scales" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "questionnaires_assessments" ADD COLUMN "completed_forms" INTEGER NOT NULL DEFAULT 0;

-- 添加注释
COMMENT ON COLUMN "questionnaires_assessments"."completed_scales" IS '已完成量表数量（缓存）';
COMMENT ON COLUMN "questionnaires_assessments"."completed_forms" IS '已完成表单数量（缓存）';
