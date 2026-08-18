-- CreateEnum
CREATE TYPE "ScaleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ScaleVisibility" AS ENUM ('HIDDEN', 'COURSE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "QuestionnaireStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "QuestionnaireType" AS ENUM ('COURSE', 'GENERAL');

-- CreateEnum
CREATE TYPE "ClassroomStatus" AS ENUM ('PREPARING', 'ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "scales" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ScaleStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "ScaleVisibility" NOT NULL DEFAULT 'HIDDEN',
    "config" JSONB,
    "estimated_time" INTEGER,
    "instruction" TEXT,
    "creator_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scale_items" (
    "id" TEXT NOT NULL,
    "scale_id" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'single',
    "reverse" BOOLEAN NOT NULL DEFAULT false,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "weight" DECIMAL(65,30) NOT NULL DEFAULT 1.0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB,
    "randomize_options" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "scale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dimensions" (
    "id" TEXT NOT NULL,
    "scale_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scoring_method" TEXT NOT NULL DEFAULT 'sum',
    "weight" DECIMAL(65,30) NOT NULL DEFAULT 1.0,
    "min_score" DECIMAL(65,30),
    "max_score" DECIMAL(65,30),
    "level_feedback" JSONB,

    CONSTRAINT "dimensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_dimensions" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "dimension_id" TEXT NOT NULL,
    "weight" DECIMAL(65,30) NOT NULL DEFAULT 1.0,
    "reverse" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "item_dimensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "scale_id" TEXT NOT NULL,
    "user_id" TEXT,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "answers" JSONB,
    "scores" JSONB,
    "feedback" JSONB,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "total_time" INTEGER,
    "questionnaire_assessment_id" TEXT,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_scales" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "scale_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaires" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instruction" TEXT,
    "status" "QuestionnaireStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "QuestionnaireType" NOT NULL DEFAULT 'COURSE',
    "visibility" "ScaleVisibility" NOT NULL DEFAULT 'HIDDEN',
    "estimated_time" INTEGER,
    "creator_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_scales" (
    "id" TEXT NOT NULL,
    "questionnaire_id" TEXT NOT NULL,
    "scale_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "questionnaire_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_assessments" (
    "id" TEXT NOT NULL,
    "questionnaire_id" TEXT NOT NULL,
    "user_id" TEXT,
    "token_id" TEXT,
    "session_id" TEXT,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed_scales" INTEGER NOT NULL DEFAULT 0,
    "completed_forms" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "total_time" INTEGER,
    "aggregate_report" JSONB,

    CONSTRAINT "questionnaire_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "course_questionnaires" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "questionnaire_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_questionnaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_form_items" (
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

-- CreateTable
CREATE TABLE "questionnaire_form_answers" (
    "id" TEXT NOT NULL,
    "questionnaire_assessment_id" TEXT NOT NULL,
    "form_item_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questionnaire_form_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
    "teacher_id" TEXT NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "page_count" INTEGER,
    "cos_url" TEXT,
    "cos_key" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classrooms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "status" "ClassroomStatus" NOT NULL DEFAULT 'PREPARING',
    "questionnaire_id" TEXT,
    "creator_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_sessions" (
    "id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "is_temporary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "classroom_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_questions" (
    "id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "form_item_id" TEXT,
    "question_index" INTEGER NOT NULL,
    "questionContent" JSONB NOT NULL,
    "time_limit" INTEGER,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "classroom_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_answers" (
    "id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classroom_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_access_tokens" (
    "id" TEXT NOT NULL,
    "checkin_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 0,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scales_code_key" ON "scales"("code");

-- CreateIndex
CREATE INDEX "scale_items_sort_order_idx" ON "scale_items"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "item_dimensions_item_id_dimension_id_key" ON "item_dimensions"("item_id", "dimension_id");

-- CreateIndex
CREATE INDEX "assessments_user_id_status_idx" ON "assessments"("user_id", "status");

-- CreateIndex
CREATE INDEX "assessments_scale_id_status_idx" ON "assessments"("scale_id", "status");

-- CreateIndex
CREATE INDEX "assessments_started_at_idx" ON "assessments"("started_at");

-- CreateIndex
CREATE INDEX "assessments_questionnaire_assessment_id_idx" ON "assessments"("questionnaire_assessment_id");

-- CreateIndex
CREATE INDEX "assessments_status_started_at_idx" ON "assessments"("status", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "course_scales_course_id_scale_id_key" ON "course_scales"("course_id", "scale_id");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaires_code_key" ON "questionnaires"("code");

-- CreateIndex
CREATE INDEX "questionnaire_scales_questionnaire_id_position_idx" ON "questionnaire_scales"("questionnaire_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_scales_questionnaire_id_scale_id_key" ON "questionnaire_scales"("questionnaire_id", "scale_id");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_assessments_session_id_key" ON "questionnaire_assessments"("session_id");

-- CreateIndex
CREATE INDEX "questionnaire_assessments_user_id_status_idx" ON "questionnaire_assessments"("user_id", "status");

-- CreateIndex
CREATE INDEX "questionnaire_assessments_questionnaire_id_status_idx" ON "questionnaire_assessments"("questionnaire_id", "status");

-- CreateIndex
CREATE INDEX "questionnaire_assessments_started_at_idx" ON "questionnaire_assessments"("started_at");

-- CreateIndex
CREATE INDEX "questionnaire_assessments_token_id_idx" ON "questionnaire_assessments"("token_id");

-- CreateIndex
CREATE INDEX "questionnaire_assessments_session_id_idx" ON "questionnaire_assessments"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_access_tokens_token_key" ON "questionnaire_access_tokens"("token");

-- CreateIndex
CREATE INDEX "questionnaire_access_tokens_token_idx" ON "questionnaire_access_tokens"("token");

-- CreateIndex
CREATE INDEX "questionnaire_access_tokens_questionnaire_id_idx" ON "questionnaire_access_tokens"("questionnaire_id");

-- CreateIndex
CREATE INDEX "questionnaire_access_tokens_expires_at_idx" ON "questionnaire_access_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "questionnaire_access_tokens_is_active_expires_at_idx" ON "questionnaire_access_tokens"("is_active", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "course_questionnaires_course_id_questionnaire_id_key" ON "course_questionnaires"("course_id", "questionnaire_id");

-- CreateIndex
CREATE INDEX "questionnaire_form_items_questionnaire_id_position_idx" ON "questionnaire_form_items"("questionnaire_id", "position");

-- CreateIndex
CREATE INDEX "questionnaire_form_answers_questionnaire_assessment_id_idx" ON "questionnaire_form_answers"("questionnaire_assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_form_answers_questionnaire_assessment_id_form_key" ON "questionnaire_form_answers"("questionnaire_assessment_id", "form_item_id");

-- CreateIndex
CREATE INDEX "documents_created_at_idx" ON "documents"("created_at");

-- CreateIndex
CREATE INDEX "documents_teacher_id_idx" ON "documents"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_code_key" ON "classrooms"("code");

-- CreateIndex
CREATE INDEX "classrooms_code_idx" ON "classrooms"("code");

-- CreateIndex
CREATE INDEX "classrooms_course_id_idx" ON "classrooms"("course_id");

-- CreateIndex
CREATE INDEX "classrooms_status_idx" ON "classrooms"("status");

-- CreateIndex
CREATE INDEX "classrooms_creator_id_idx" ON "classrooms"("creator_id");

-- CreateIndex
CREATE INDEX "classroom_sessions_classroom_id_idx" ON "classroom_sessions"("classroom_id");

-- CreateIndex
CREATE INDEX "classroom_sessions_student_id_idx" ON "classroom_sessions"("student_id");

-- CreateIndex
CREATE INDEX "classroom_sessions_is_temporary_idx" ON "classroom_sessions"("is_temporary");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_sessions_classroom_id_student_id_key" ON "classroom_sessions"("classroom_id", "student_id");

-- CreateIndex
CREATE INDEX "classroom_questions_classroom_id_idx" ON "classroom_questions"("classroom_id");

-- CreateIndex
CREATE INDEX "classroom_questions_classroom_id_question_index_idx" ON "classroom_questions"("classroom_id", "question_index");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_questions_classroom_id_question_index_key" ON "classroom_questions"("classroom_id", "question_index");

-- CreateIndex
CREATE INDEX "classroom_answers_classroom_id_idx" ON "classroom_answers"("classroom_id");

-- CreateIndex
CREATE INDEX "classroom_answers_question_id_idx" ON "classroom_answers"("question_id");

-- CreateIndex
CREATE INDEX "classroom_answers_session_id_idx" ON "classroom_answers"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_answers_question_id_session_id_key" ON "classroom_answers"("question_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkin_access_tokens_token_key" ON "checkin_access_tokens"("token");

-- CreateIndex
CREATE INDEX "checkin_access_tokens_checkin_id_idx" ON "checkin_access_tokens"("checkin_id");

-- CreateIndex
CREATE INDEX "checkin_access_tokens_expires_at_idx" ON "checkin_access_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "checkin_access_tokens_is_active_expires_at_idx" ON "checkin_access_tokens"("is_active", "expires_at");

-- CreateIndex
CREATE INDEX "checkin_access_tokens_token_idx" ON "checkin_access_tokens"("token");

-- AddForeignKey
ALTER TABLE "scales" ADD CONSTRAINT "scales_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scale_items" ADD CONSTRAINT "scale_items_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dimensions" ADD CONSTRAINT "dimensions_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_dimensions" ADD CONSTRAINT "item_dimensions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "scale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_dimensions" ADD CONSTRAINT "item_dimensions_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "dimensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_questionnaire_assessment_id_fkey" FOREIGN KEY ("questionnaire_assessment_id") REFERENCES "questionnaire_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_scales" ADD CONSTRAINT "course_scales_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_scales" ADD CONSTRAINT "course_scales_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_scales" ADD CONSTRAINT "questionnaire_scales_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_scales" ADD CONSTRAINT "questionnaire_scales_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_assessments" ADD CONSTRAINT "questionnaire_assessments_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_assessments" ADD CONSTRAINT "questionnaire_assessments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_assessments" ADD CONSTRAINT "questionnaire_assessments_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "questionnaire_access_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_access_tokens" ADD CONSTRAINT "questionnaire_access_tokens_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_access_tokens" ADD CONSTRAINT "questionnaire_access_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_questionnaires" ADD CONSTRAINT "course_questionnaires_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_questionnaires" ADD CONSTRAINT "course_questionnaires_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_form_items" ADD CONSTRAINT "questionnaire_form_items_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_form_answers" ADD CONSTRAINT "questionnaire_form_answers_questionnaire_assessment_id_fkey" FOREIGN KEY ("questionnaire_assessment_id") REFERENCES "questionnaire_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_form_answers" ADD CONSTRAINT "questionnaire_form_answers_form_item_id_fkey" FOREIGN KEY ("form_item_id") REFERENCES "questionnaire_form_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_sessions" ADD CONSTRAINT "classroom_sessions_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_questions" ADD CONSTRAINT "classroom_questions_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_answers" ADD CONSTRAINT "classroom_answers_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_answers" ADD CONSTRAINT "classroom_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "classroom_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_answers" ADD CONSTRAINT "classroom_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "classroom_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_access_tokens" ADD CONSTRAINT "checkin_access_tokens_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "checkins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_access_tokens" ADD CONSTRAINT "checkin_access_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
