-- CreateEnum
CREATE TYPE "CognitiveConfigStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "CognitiveAssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CognitiveSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'INVALID');

-- CreateTable
CREATE TABLE "cognitive_test_configs" (
    "id" TEXT NOT NULL,
    "test_type" TEXT NOT NULL,
    "config_version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instruction" TEXT,
    "config" JSONB,
    "status" "CognitiveConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "engine_version" TEXT NOT NULL,
    "scoring_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "cognitive_test_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cognitive_assignments" (
    "id" TEXT NOT NULL,
    "course_id" TEXT,
    "course_snapshot" JSONB,
    "config_id" TEXT NOT NULL,
    "created_by" TEXT,
    "title" TEXT NOT NULL,
    "instruction" TEXT,
    "status" "CognitiveAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "opens_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "cognitive_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cognitive_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "participant_key" TEXT NOT NULL,
    "participant_snapshot" JSONB,
    "assignment_id" TEXT,
    "config_id" TEXT NOT NULL,
    "test_type" TEXT NOT NULL,
    "attempt_no" INTEGER NOT NULL DEFAULT 1,
    "status" "CognitiveSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "score_encrypted" TEXT,
    "metrics_encrypted" TEXT,
    "quality_flags_encrypted" TEXT,
    "config_version" TEXT NOT NULL,
    "config_snapshot_encrypted" TEXT,
    "engine_version" TEXT NOT NULL,
    "scoring_version" TEXT NOT NULL,
    "random_seed" TEXT,
    "completion_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cognitive_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cognitive_trials" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "trial_index" INTEGER NOT NULL,
    "payload_encrypted" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cognitive_trials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cognitive_test_configs_test_type_status_idx" ON "cognitive_test_configs"("test_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cognitive_test_configs_test_type_config_version_key" ON "cognitive_test_configs"("test_type", "config_version");

-- CreateIndex
CREATE INDEX "cognitive_assignments_course_id_idx" ON "cognitive_assignments"("course_id");

-- CreateIndex
CREATE INDEX "cognitive_sessions_user_id_status_idx" ON "cognitive_sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "cognitive_sessions_assignment_id_idx" ON "cognitive_sessions"("assignment_id");

-- CreateIndex
CREATE INDEX "cognitive_sessions_config_id_idx" ON "cognitive_sessions"("config_id");

-- CreateIndex
CREATE INDEX "cognitive_sessions_participant_key_idx" ON "cognitive_sessions"("participant_key");

-- CreateIndex
CREATE UNIQUE INDEX "cognitive_sessions_assignment_id_participant_key_attempt_no_key" ON "cognitive_sessions"("assignment_id", "participant_key", "attempt_no");

-- CreateIndex
CREATE INDEX "cognitive_trials_session_id_idx" ON "cognitive_trials"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "cognitive_trials_session_id_trial_index_key" ON "cognitive_trials"("session_id", "trial_index");

-- AddForeignKey
ALTER TABLE "cognitive_assignments" ADD CONSTRAINT "cognitive_assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cognitive_assignments" ADD CONSTRAINT "cognitive_assignments_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "cognitive_test_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cognitive_assignments" ADD CONSTRAINT "cognitive_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cognitive_sessions" ADD CONSTRAINT "cognitive_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cognitive_sessions" ADD CONSTRAINT "cognitive_sessions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "cognitive_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cognitive_sessions" ADD CONSTRAINT "cognitive_sessions_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "cognitive_test_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cognitive_trials" ADD CONSTRAINT "cognitive_trials_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cognitive_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

