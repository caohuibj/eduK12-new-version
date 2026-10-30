-- Scientific configuration definitions only. No user grant, result or seed.
ALTER TABLE assessment_public_templates DROP CONSTRAINT assessment_public_templates_template_kind_check;
ALTER TABLE assessment_public_templates ADD CONSTRAINT assessment_public_templates_template_kind_check CHECK (template_kind IN
 ('SCALE_RESULT_BASE','SCALE_REFERENCE','SCALE_INTERPRETATION','SCALE_CAVEATS','SCALE_CANONICAL_LAYOUT','COMPOSITE_REPORT_LAYOUT','UNIT_ADMISSION_PLAN','FROZEN_SLOT_PLAN','WHOLE_VALIDATION_PLAN','COGNITIVE_PROFILE_CONFIGURATION'));
