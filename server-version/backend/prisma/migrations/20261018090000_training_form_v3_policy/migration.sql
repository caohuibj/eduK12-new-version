-- Additive only: historical definitions, accepted facts and scores stay untouched.
ALTER TABLE "composite_assessment_items" ADD COLUMN "form_policy" JSONB;
ALTER TABLE "composite_assessment_attempts" ADD COLUMN "task_satisfaction" TEXT;
ALTER TABLE "composite_form_section_attempts" ADD COLUMN "task_satisfaction" TEXT;
ALTER TABLE "composite_assessment_attempts" ADD CONSTRAINT "composite_task_satisfaction_valid" CHECK ("task_satisfaction" IS NULL OR "task_satisfaction" IN ('SATISFIED','NOT_SATISFIED'));
ALTER TABLE "composite_form_section_attempts" ADD CONSTRAINT "form_section_task_satisfaction_valid" CHECK ("task_satisfaction" IS NULL OR "task_satisfaction" IN ('SATISFIED','NOT_SATISFIED'));
