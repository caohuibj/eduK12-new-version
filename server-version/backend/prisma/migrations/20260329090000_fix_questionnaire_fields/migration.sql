-- ========================================
-- 问卷功能字段修复迁移
-- 修复：sort_order -> position, 添加表单题目表
-- ========================================

-- 1. 重命名 questionnaire_scales.sort_order 为 position
-- 先检查是否存在 sort_order 列，如果存在则重命名
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'questionnaire_scales' 
        AND column_name = 'sort_order'
    ) THEN
        ALTER TABLE "questionnaire_scales" RENAME COLUMN "sort_order" TO "position";
    END IF;
END $$;

-- 2. 确保 position 列存在（如果 sort_order 不存在但 position 也不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'questionnaire_scales' 
        AND column_name = 'position'
    ) THEN
        ALTER TABLE "questionnaire_scales" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 3. 为 questionnaire_scales.position 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS "questionnaire_scales_position_idx" ON "questionnaire_scales"("position");

-- 4. 创建 questionnaire_form_items 表（如果不存在）
CREATE TABLE IF NOT EXISTS "questionnaire_form_items" (
    "id" TEXT NOT NULL,
    "questionnaire_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "placeholder" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_form_items_pkey" PRIMARY KEY ("id")
);

-- 4.1 添加 questionnaire_form_items 索引
CREATE INDEX IF NOT EXISTS "questionnaire_form_items_questionnaire_id_position_idx" ON "questionnaire_form_items"("questionnaire_id", "position");

-- 4.2 添加 questionnaire_form_items 外键
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'questionnaire_form_items_questionnaire_id_fkey'
    ) THEN
        ALTER TABLE "questionnaire_form_items" ADD CONSTRAINT "questionnaire_form_items_questionnaire_id_fkey" 
            FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 5. 创建 questionnaire_form_answers 表（如果不存在）
CREATE TABLE IF NOT EXISTS "questionnaire_form_answers" (
    "id" TEXT NOT NULL,
    "questionnaire_assessment_id" TEXT NOT NULL,
    "form_item_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questionnaire_form_answers_pkey" PRIMARY KEY ("id")
);

-- 5.1 添加 questionnaire_form_answers 唯一约束
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'questionnaire_form_answers_questionnaire_assessment_id_form_item_id_key'
    ) THEN
        CREATE UNIQUE INDEX "questionnaire_form_answers_questionnaire_assessment_id_form_item_id_key" 
            ON "questionnaire_form_answers"("questionnaire_assessment_id", "form_item_id");
    END IF;
END $$;

-- 5.2 添加 questionnaire_form_answers 索引
CREATE INDEX IF NOT EXISTS "questionnaire_form_answers_questionnaire_assessment_id_idx" ON "questionnaire_form_answers"("questionnaire_assessment_id");

-- 5.3 添加 questionnaire_form_answers 外键
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'questionnaire_form_answers_questionnaire_assessment_id_fkey'
    ) THEN
        ALTER TABLE "questionnaire_form_answers" ADD CONSTRAINT "questionnaire_form_answers_questionnaire_assessment_id_fkey" 
            FOREIGN KEY ("questionnaire_assessment_id") REFERENCES "questionnaire_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'questionnaire_form_answers_form_item_id_fkey'
    ) THEN
        ALTER TABLE "questionnaire_form_answers" ADD CONSTRAINT "questionnaire_form_answers_form_item_id_fkey" 
            FOREIGN KEY ("form_item_id") REFERENCES "questionnaire_form_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 6. 确保 Questionnaire 表有 formItems 关联（添加关系字段）
-- 这一步在 Prisma 层面自动处理，无需 SQL

-- ========================================
-- 验证步骤
-- ========================================
-- 执行后应检查：
-- 1. questionnaire_scales.position 列存在
-- 2. questionnaire_form_items 表存在
-- 3. questionnaire_form_answers 表存在
-- 4. 所有索引和外键创建成功
