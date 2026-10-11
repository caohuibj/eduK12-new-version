-- Non-destructive Survey sample analysis policy, separate from immutable FINAL.
-- The completion status and final ciphertext are never rewritten by review.
CREATE TABLE "survey_sample_reviews" (
  "attempt_id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "wave_id" TEXT NOT NULL,
  "verdict" TEXT NOT NULL CHECK ("verdict" IN ('INCLUDED','EXCLUDED')),
  "reason" TEXT NOT NULL CHECK (length("reason") BETWEEN 2 AND 1000),
  "reviewed_by" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" >= 1),
  "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_sample_review_attempt_project_wave_fk"
    FOREIGN KEY ("attempt_id","project_id","wave_id")
    REFERENCES "survey_wave_attempts"("id","project_id","wave_id") ON DELETE RESTRICT
);
-- Required for Prisma's compound one-to-one relation, matching the scoped FK.
CREATE UNIQUE INDEX "survey_sample_reviews_attempt_scope_unique"
  ON "survey_sample_reviews"("attempt_id","project_id","wave_id");
CREATE INDEX "survey_sample_reviews_scope_idx"
  ON "survey_sample_reviews"("project_id","wave_id","verdict");
-- Survey Events continue to preserve old and new verdicts and the exact reason.
