-- 综合测评模板、匿名恢复凭证与认知公开链接。

CREATE TYPE "CompositeAssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "CompositeAssessmentItemType" AS ENUM ('SCALE', 'COGNITIVE', 'FORM');
CREATE TYPE "CompositeAssessmentAttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

CREATE TABLE "composite_assessments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instruction" TEXT,
    "status" "CompositeAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "course_id" TEXT,
    "created_by" TEXT,
    "opens_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "public_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "composite_assessments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "composite_assessments_code_key" ON "composite_assessments"("code");
CREATE INDEX "composite_assessments_course_id_status_idx" ON "composite_assessments"("course_id", "status");
CREATE INDEX "composite_assessments_created_by_status_idx" ON "composite_assessments"("created_by", "status");

CREATE TABLE "composite_assessment_items" (
    "id" TEXT NOT NULL,
    "composite_assessment_id" TEXT NOT NULL,
    "type" "CompositeAssessmentItemType" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "scale_id" TEXT,
    "cognitive_assignment_id" TEXT,
    "form_type" TEXT,
    "form_label" TEXT,
    "form_placeholder" TEXT,
    "form_options" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composite_assessment_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "composite_assessment_items_composite_assessment_id_position_key"
    ON "composite_assessment_items"("composite_assessment_id", "position");
CREATE INDEX "composite_assessment_items_scale_id_idx" ON "composite_assessment_items"("scale_id");
CREATE INDEX "composite_assessment_items_cognitive_assignment_id_idx" ON "composite_assessment_items"("cognitive_assignment_id");

CREATE TABLE "composite_assessment_access_tokens" (
    "id" TEXT NOT NULL,
    "composite_assessment_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 0,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "composite_assessment_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "composite_assessment_access_tokens_token_key" ON "composite_assessment_access_tokens"("token");
CREATE INDEX "composite_assessment_access_tokens_composite_assessment_id_idx" ON "composite_assessment_access_tokens"("composite_assessment_id");
CREATE INDEX "composite_assessment_access_tokens_is_active_expires_at_idx" ON "composite_assessment_access_tokens"("is_active", "expires_at");

CREATE TABLE "composite_assessment_attempts" (
    "id" TEXT NOT NULL,
    "composite_assessment_id" TEXT NOT NULL,
    "user_id" TEXT,
    "access_token_id" TEXT,
    "recovery_token_hash" TEXT,
    "participant_key" TEXT NOT NULL,
    "anonymous_code" TEXT,
    "attempt_no" INTEGER NOT NULL DEFAULT 1,
    "status" "CompositeAssessmentAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed_items" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "total_time" INTEGER,

    CONSTRAINT "composite_assessment_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "composite_assessment_attempts_recovery_token_hash_key"
    ON "composite_assessment_attempts"("recovery_token_hash");
CREATE INDEX "composite_assessment_attempts_composite_assessment_id_status_idx"
    ON "composite_assessment_attempts"("composite_assessment_id", "status");
CREATE INDEX "composite_assessment_attempts_user_id_status_idx" ON "composite_assessment_attempts"("user_id", "status");
CREATE INDEX "composite_assessment_attempts_participant_key_idx" ON "composite_assessment_attempts"("participant_key");
CREATE INDEX "composite_assessment_attempts_access_token_id_idx" ON "composite_assessment_attempts"("access_token_id");

CREATE TABLE "composite_form_answers" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composite_form_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "composite_form_answers_attempt_id_item_id_key" ON "composite_form_answers"("attempt_id", "item_id");
CREATE INDEX "composite_form_answers_attempt_id_idx" ON "composite_form_answers"("attempt_id");

CREATE TABLE "cognitive_access_tokens" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 0,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cognitive_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cognitive_access_tokens_token_key" ON "cognitive_access_tokens"("token");
CREATE INDEX "cognitive_access_tokens_assignment_id_idx" ON "cognitive_access_tokens"("assignment_id");
CREATE INDEX "cognitive_access_tokens_is_active_expires_at_idx" ON "cognitive_access_tokens"("is_active", "expires_at");

ALTER TABLE "assessments" ADD COLUMN "composite_attempt_id" TEXT;
ALTER TABLE "assessments" ADD COLUMN "composite_item_id" TEXT;
CREATE INDEX "assessments_composite_attempt_id_idx" ON "assessments"("composite_attempt_id");
CREATE INDEX "assessments_composite_item_id_idx" ON "assessments"("composite_item_id");

ALTER TABLE "cognitive_sessions" ADD COLUMN "composite_attempt_id" TEXT;
ALTER TABLE "cognitive_sessions" ADD COLUMN "composite_item_id" TEXT;
ALTER TABLE "cognitive_sessions" ADD COLUMN "access_token_id" TEXT;
ALTER TABLE "cognitive_sessions" ADD COLUMN "recovery_token_hash" TEXT;
ALTER TABLE "cognitive_sessions" ADD COLUMN "anonymous_code" TEXT;
CREATE UNIQUE INDEX "cognitive_sessions_recovery_token_hash_key" ON "cognitive_sessions"("recovery_token_hash");
CREATE INDEX "cognitive_sessions_composite_attempt_id_idx" ON "cognitive_sessions"("composite_attempt_id");
CREATE INDEX "cognitive_sessions_composite_item_id_idx" ON "cognitive_sessions"("composite_item_id");
CREATE INDEX "cognitive_sessions_access_token_id_idx" ON "cognitive_sessions"("access_token_id");
CREATE INDEX "cognitive_sessions_recovery_token_hash_idx" ON "cognitive_sessions"("recovery_token_hash");

ALTER TABLE "composite_assessments"
    ADD CONSTRAINT "composite_assessments_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "composite_assessments"
    ADD CONSTRAINT "composite_assessments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "composite_assessment_items"
    ADD CONSTRAINT "composite_assessment_items_composite_assessment_id_fkey"
    FOREIGN KEY ("composite_assessment_id") REFERENCES "composite_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "composite_assessment_items"
    ADD CONSTRAINT "composite_assessment_items_scale_id_fkey"
    FOREIGN KEY ("scale_id") REFERENCES "scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "composite_assessment_items"
    ADD CONSTRAINT "composite_assessment_items_cognitive_assignment_id_fkey"
    FOREIGN KEY ("cognitive_assignment_id") REFERENCES "cognitive_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "composite_assessment_access_tokens"
    ADD CONSTRAINT "composite_assessment_access_tokens_composite_assessment_id_fkey"
    FOREIGN KEY ("composite_assessment_id") REFERENCES "composite_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "composite_assessment_access_tokens"
    ADD CONSTRAINT "composite_assessment_access_tokens_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "composite_assessment_attempts"
    ADD CONSTRAINT "composite_assessment_attempts_composite_assessment_id_fkey"
    FOREIGN KEY ("composite_assessment_id") REFERENCES "composite_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "composite_assessment_attempts"
    ADD CONSTRAINT "composite_assessment_attempts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "composite_assessment_attempts"
    ADD CONSTRAINT "composite_assessment_attempts_access_token_id_fkey"
    FOREIGN KEY ("access_token_id") REFERENCES "composite_assessment_access_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "composite_form_answers"
    ADD CONSTRAINT "composite_form_answers_attempt_id_fkey"
    FOREIGN KEY ("attempt_id") REFERENCES "composite_assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "composite_form_answers"
    ADD CONSTRAINT "composite_form_answers_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "composite_assessment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cognitive_access_tokens"
    ADD CONSTRAINT "cognitive_access_tokens_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "cognitive_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cognitive_access_tokens"
    ADD CONSTRAINT "cognitive_access_tokens_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments"
    ADD CONSTRAINT "assessments_composite_attempt_id_fkey"
    FOREIGN KEY ("composite_attempt_id") REFERENCES "composite_assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessments"
    ADD CONSTRAINT "assessments_composite_item_id_fkey"
    FOREIGN KEY ("composite_item_id") REFERENCES "composite_assessment_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cognitive_sessions"
    ADD CONSTRAINT "cognitive_sessions_composite_attempt_id_fkey"
    FOREIGN KEY ("composite_attempt_id") REFERENCES "composite_assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cognitive_sessions"
    ADD CONSTRAINT "cognitive_sessions_composite_item_id_fkey"
    FOREIGN KEY ("composite_item_id") REFERENCES "composite_assessment_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cognitive_sessions"
    ADD CONSTRAINT "cognitive_sessions_access_token_id_fkey"
    FOREIGN KEY ("access_token_id") REFERENCES "cognitive_access_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
