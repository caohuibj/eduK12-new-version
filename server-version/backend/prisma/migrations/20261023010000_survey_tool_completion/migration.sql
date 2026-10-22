-- Completion belongs to an exact authoring revision. Existing drafts remain unfinished.
ALTER TABLE survey_tool_templates ADD COLUMN completed_revision INTEGER;
ALTER TABLE survey_tool_templates ADD CONSTRAINT survey_tool_templates_completed_revision_check
 CHECK (completed_revision IS NULL OR (status='DRAFT' AND completed_revision=revision));
