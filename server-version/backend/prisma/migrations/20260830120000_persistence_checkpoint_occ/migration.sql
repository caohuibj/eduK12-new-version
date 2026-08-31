-- Per-assessment revision remains a cheap row-level write guard while each
-- encrypted scale answer carries its own revision for cross-device merging.
ALTER TABLE "assessments"
  ADD COLUMN "answers_revision" INTEGER NOT NULL DEFAULT 0;

-- Each form item is independently versioned so answers for different items can
-- merge while a stale write to the same item is rejected.
ALTER TABLE "questionnaire_form_answers"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
