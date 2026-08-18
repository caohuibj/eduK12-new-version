-- ========================================
-- 问卷功能泛化迁移（稳健模式）
-- 向后兼容：所有改动均不影响现有数据
-- ========================================

-- 1. 新增问卷类型枚举
CREATE TYPE "QuestionnaireType" AS ENUM ('COURSE', 'GENERAL');

-- 2. Questionnaire 表添加 type 字段（默认值保证向后兼容）
ALTER TABLE "questionnaires" ADD COLUMN "type" "QuestionnaireType" NOT NULL DEFAULT 'COURSE';

-- 3. QuestionnaireAssessment 表修改（支持匿名）
-- 3.1 userId 改为可选
ALTER TABLE "questionnaire_assessments" ALTER COLUMN "user_id" DROP NOT NULL;

-- 3.2 添加 tokenId 和 sessionId 字段
ALTER TABLE "questionnaire_assessments" ADD COLUMN "token_id" TEXT;
ALTER TABLE "questionnaire_assessments" ADD COLUMN "session_id" TEXT UNIQUE;

-- 3.3 添加索引（性能优化）
CREATE INDEX "questionnaire_assessments_token_id_idx" ON "questionnaire_assessments"("token_id");
CREATE INDEX "questionnaire_assessments_session_id_idx" ON "questionnaire_assessments"("session_id");

-- 4. 创建访问令牌表
CREATE TABLE "questionnaire_access_tokens" (
    "id" TEXT NOT NULL,
    "questionnaire_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 0,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questionnaire_access_tokens_pkey" PRIMARY KEY ("id")
);

-- 4.1 添加唯一约束
CREATE UNIQUE INDEX "questionnaire_access_tokens_token_key" ON "questionnaire_access_tokens"("token");

-- 4.2 添加索引
CREATE INDEX "questionnaire_access_tokens_questionnaire_id_idx" ON "questionnaire_access_tokens"("questionnaire_id");
CREATE INDEX "questionnaire_access_tokens_expires_at_idx" ON "questionnaire_access_tokens"("expires_at");

-- 4.3 添加外键约束
ALTER TABLE "questionnaire_access_tokens" ADD CONSTRAINT "questionnaire_access_tokens_questionnaire_id_fkey" 
    FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "questionnaire_access_tokens" ADD CONSTRAINT "questionnaire_access_tokens_created_by_fkey" 
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4.4 添加 QuestionnaireAssessment 与 Token 的外键
ALTER TABLE "questionnaire_assessments" ADD CONSTRAINT "questionnaire_assessments_token_id_fkey" 
    FOREIGN KEY ("token_id") REFERENCES "questionnaire_access_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ========================================
-- 验证步骤（执行后应检查）
-- ========================================
-- 1. 检查 questionnaires.type 是否默认为 'COURSE'
-- 2. 检查 questionnaire_assessments 现有记录 user_id 不为空
-- 3. 检查 questionnaire_access_tokens 表创建成功
-- 4. 检查所有索引创建成功

-- ========================================
-- 回滚方案（如需要）
-- ========================================
-- ALTER TABLE "questionnaires" DROP COLUMN "type";
-- DROP TYPE "QuestionnaireType";
-- ALTER TABLE "questionnaire_assessments" ALTER COLUMN "user_id" SET NOT NULL;
-- ALTER TABLE "questionnaire_assessments" DROP COLUMN "token_id";
-- ALTER TABLE "questionnaire_assessments" DROP COLUMN "session_id";
-- DROP INDEX "questionnaire_assessments_token_id_idx";
-- DROP INDEX "questionnaire_assessments_session_id_idx";
-- DROP TABLE "questionnaire_access_tokens";
