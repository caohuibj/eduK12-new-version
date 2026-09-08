-- PR-B standalone Situational runtime.
-- The pilot is an independent UNIT and therefore does not reuse the Scale
-- table or create a synthetic questionnaire/composite parent.
CREATE TABLE "situational_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "participant_key" TEXT NOT NULL,
    "instrument_key" TEXT NOT NULL,
    "instrument_version" TEXT NOT NULL,
    "attempt_no" INTEGER NOT NULL DEFAULT 1,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "delivery_mode" "InstrumentDeliveryMode" NOT NULL DEFAULT 'FINAL_ONLY',
    "runtime_generation" "RuntimeGeneration" NOT NULL DEFAULT 'UNIFIED_V1',
    "attempt_epoch" INTEGER NOT NULL DEFAULT 1,
    "definition_hash" TEXT NOT NULL,
    "compiled_runtime_hash" TEXT NOT NULL,
    "scorer_key" TEXT NOT NULL,
    "scoring_version" TEXT NOT NULL,
    "frozen_at" TIMESTAMP(3) NOT NULL,
    "runtime_snapshot_encrypted" TEXT NOT NULL,
    "submission_id" TEXT,
    "submission_payload_hash" TEXT,
    "submitted_at" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "total_time" INTEGER,
    "result_encrypted" TEXT,
    "canonical_result_encrypted" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "situational_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "situational_raw_submissions" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "attempt_epoch" INTEGER NOT NULL,
    "response_count" INTEGER NOT NULL,
    "payload_encrypted" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "payload_schema_version" INTEGER NOT NULL,
    "encoding_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "situational_raw_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "situational_attempts_submission_id_key"
    ON "situational_attempts"("submission_id");
CREATE UNIQUE INDEX "situational_attempts_identity_key"
    ON "situational_attempts"("instrument_key", "instrument_version", "participant_key", "attempt_no");
CREATE UNIQUE INDEX "situational_attempts_active_participant_key"
    ON "situational_attempts"("instrument_key", "instrument_version", "participant_key")
    WHERE "status" = 'IN_PROGRESS';
CREATE INDEX "situational_attempts_user_id_status_idx"
    ON "situational_attempts"("user_id", "status");
CREATE INDEX "situational_attempts_participant_key_status_idx"
    ON "situational_attempts"("participant_key", "status");
CREATE INDEX "situational_attempts_instrument_key_instrument_version_status_idx"
    ON "situational_attempts"("instrument_key", "instrument_version", "status");

CREATE UNIQUE INDEX "situational_raw_submissions_attempt_id_key"
    ON "situational_raw_submissions"("attempt_id");

ALTER TABLE "situational_attempts"
    ADD CONSTRAINT "situational_attempts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "situational_raw_submissions"
    ADD CONSTRAINT "situational_raw_submissions_attempt_id_fkey"
    FOREIGN KEY ("attempt_id") REFERENCES "situational_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
