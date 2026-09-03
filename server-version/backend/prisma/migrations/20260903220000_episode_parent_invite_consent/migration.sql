-- Commit 11: episode / PARENT / invite / consent (additive; historical rows stay null)

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PARENT';

-- CreateEnum
CREATE TYPE "ParentRelationshipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');
CREATE TYPE "AssessmentEpisodeInitiationMode" AS ENUM ('TEACHER_CAMPAIGN', 'PARENT_SELF_SERVE', 'STUDENT_SELF', 'ANONYMOUS_SELF');
CREATE TYPE "ParentInviteCodeStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "parent_invite_codes" (
    "id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "student_user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "status" "ParentInviteCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "consumed_by_parent_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "parent_invite_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "parent_student_relationships" (
    "id" TEXT NOT NULL,
    "parent_user_id" TEXT NOT NULL,
    "student_user_id" TEXT NOT NULL,
    "status" "ParentRelationshipStatus" NOT NULL DEFAULT 'PENDING',
    "invite_code_id" TEXT,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "revoked_by_user_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,
    "consent_version" TEXT,
    "consent_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "parent_student_relationships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_episodes" (
    "id" TEXT NOT NULL,
    "subject_user_id" TEXT,
    "initiated_by_user_id" TEXT,
    "initiation_mode" "AssessmentEpisodeInitiationMode" NOT NULL,
    "course_id" TEXT,
    "campaign_key" TEXT,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assessment_episodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_attempt_consents" (
    "id" TEXT NOT NULL,
    "subject_user_id" TEXT,
    "respondent_user_id" TEXT,
    "respondent_type" TEXT NOT NULL,
    "consent_version" TEXT NOT NULL,
    "consent_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "visibility_scope" TEXT NOT NULL,
    "share_targets_json" JSONB,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assessment_attempt_consents_pkey" PRIMARY KEY ("id")
);

-- AlterTable Assessment (nullable additive)
ALTER TABLE "assessments"
  ADD COLUMN "subject_user_id" TEXT,
  ADD COLUMN "respondent_user_id" TEXT,
  ADD COLUMN "respondent_type" TEXT,
  ADD COLUMN "episode_id" TEXT,
  ADD COLUMN "assignment_ref" TEXT,
  ADD COLUMN "consent_id" TEXT,
  ADD COLUMN "context_snapshot_ref" TEXT;

ALTER TABLE "composite_assessment_attempts"
  ADD COLUMN "subject_user_id" TEXT,
  ADD COLUMN "respondent_user_id" TEXT,
  ADD COLUMN "respondent_type" TEXT,
  ADD COLUMN "episode_id" TEXT,
  ADD COLUMN "assignment_ref" TEXT,
  ADD COLUMN "consent_id" TEXT,
  ADD COLUMN "context_snapshot_ref" TEXT;

-- Indexes
CREATE UNIQUE INDEX "parent_invite_codes_code_hash_key" ON "parent_invite_codes"("code_hash");
CREATE INDEX "parent_invite_codes_student_user_id_status_idx" ON "parent_invite_codes"("student_user_id", "status");
CREATE INDEX "parent_invite_codes_course_id_status_idx" ON "parent_invite_codes"("course_id", "status");
CREATE INDEX "parent_invite_codes_expires_at_idx" ON "parent_invite_codes"("expires_at");

CREATE UNIQUE INDEX "parent_student_relationships_parent_user_id_student_user_id_key"
  ON "parent_student_relationships"("parent_user_id", "student_user_id");
CREATE INDEX "parent_student_relationships_student_user_id_status_idx"
  ON "parent_student_relationships"("student_user_id", "status");
CREATE INDEX "parent_student_relationships_parent_user_id_status_idx"
  ON "parent_student_relationships"("parent_user_id", "status");

CREATE INDEX "assessment_episodes_subject_user_id_created_at_idx" ON "assessment_episodes"("subject_user_id", "created_at");
CREATE INDEX "assessment_episodes_course_id_campaign_key_idx" ON "assessment_episodes"("course_id", "campaign_key");

CREATE INDEX "assessment_attempt_consents_subject_user_id_accepted_at_idx"
  ON "assessment_attempt_consents"("subject_user_id", "accepted_at");
CREATE INDEX "assessment_attempt_consents_respondent_user_id_accepted_at_idx"
  ON "assessment_attempt_consents"("respondent_user_id", "accepted_at");

CREATE INDEX "assessments_subject_user_id_status_idx" ON "assessments"("subject_user_id", "status");
CREATE INDEX "assessments_respondent_user_id_status_idx" ON "assessments"("respondent_user_id", "status");
CREATE INDEX "assessments_episode_id_idx" ON "assessments"("episode_id");

CREATE INDEX "composite_assessment_attempts_subject_user_id_status_idx"
  ON "composite_assessment_attempts"("subject_user_id", "status");
CREATE INDEX "composite_assessment_attempts_respondent_user_id_status_idx"
  ON "composite_assessment_attempts"("respondent_user_id", "status");
CREATE INDEX "composite_assessment_attempts_episode_id_idx"
  ON "composite_assessment_attempts"("episode_id");

-- FKs (RESTRICT — no physical cascade deletes of identity history)
ALTER TABLE "parent_invite_codes"
  ADD CONSTRAINT "parent_invite_codes_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parent_student_relationships"
  ADD CONSTRAINT "parent_student_relationships_parent_user_id_fkey"
  FOREIGN KEY ("parent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parent_student_relationships"
  ADD CONSTRAINT "parent_student_relationships_student_user_id_fkey"
  FOREIGN KEY ("student_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parent_student_relationships"
  ADD CONSTRAINT "parent_student_relationships_invite_code_id_fkey"
  FOREIGN KEY ("invite_code_id") REFERENCES "parent_invite_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessment_episodes"
  ADD CONSTRAINT "assessment_episodes_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_episodes"
  ADD CONSTRAINT "assessment_episodes_initiated_by_user_id_fkey"
  FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessment_attempt_consents"
  ADD CONSTRAINT "assessment_attempt_consents_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_attempt_consents"
  ADD CONSTRAINT "assessment_attempt_consents_respondent_user_id_fkey"
  FOREIGN KEY ("respondent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_episode_id_fkey"
  FOREIGN KEY ("episode_id") REFERENCES "assessment_episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_consent_id_fkey"
  FOREIGN KEY ("consent_id") REFERENCES "assessment_attempt_consents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "composite_assessment_attempts"
  ADD CONSTRAINT "composite_assessment_attempts_episode_id_fkey"
  FOREIGN KEY ("episode_id") REFERENCES "assessment_episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "composite_assessment_attempts"
  ADD CONSTRAINT "composite_assessment_attempts_consent_id_fkey"
  FOREIGN KEY ("consent_id") REFERENCES "assessment_attempt_consents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
