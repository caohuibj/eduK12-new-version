-- Additive format support. Reapplying preserves the same seven-format boundary.
-- No existing ticket, retention policy or access constraint is changed.
ALTER TABLE survey_export_tickets DROP CONSTRAINT IF EXISTS survey_export_tickets_format_check;
ALTER TABLE survey_export_tickets ADD CONSTRAINT survey_export_tickets_format_check
  CHECK (format IN ('RAW_WAVE','RAW_LONG','RAW_WIDE','SCORE_LONG','SCORE_WIDE','COGNITIVE_TRIAL_LONG','INTERPRETATION_LONG'));
