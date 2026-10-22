-- Independent reusable form definitions are always private, non-deliverable drafts.
-- Existing branches are preserved exactly; no business data is rewritten.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE composite_assessments DROP CONSTRAINT questionnaire_collection_only;
ALTER TABLE composite_assessments ADD CONSTRAINT questionnaire_collection_only CHECK (
 (product_kind = 'LEGACY_COMPOSITE' AND questionnaire_type IS NULL)
 OR (product_kind IN ('QUESTIONNAIRE','ASSESSMENT_BUNDLE')
 AND ((product_kind = 'QUESTIONNAIRE' AND questionnaire_type IS NOT NULL)
   OR (product_kind = 'ASSESSMENT_BUNDLE' AND questionnaire_type IS NULL))
 AND report_package_profile IS NULL AND report_package_key IS NULL AND report_package_version IS NULL AND report_package_snapshot_encrypted IS NULL
 AND analysis_protocol_key IS NULL AND analysis_protocol_version IS NULL AND analysis_protocol_snapshot_encrypted IS NULL)
 OR (product_kind = 'ORGANIZATION_RESOURCE' AND questionnaire_type IS NULL AND course_id IS NULL AND public_enabled = FALSE AND copyable = FALSE
 AND report_package_profile IS NULL AND report_package_key IS NULL AND report_package_version IS NULL AND report_package_snapshot_encrypted IS NULL
 AND analysis_protocol_key IS NULL AND analysis_protocol_version IS NULL AND analysis_protocol_snapshot_encrypted IS NULL)
 OR (product_kind = 'FORM_TEMPLATE' AND questionnaire_type = 'GENERAL'
 AND status = 'DRAFT' AND course_id IS NULL AND public_enabled = FALSE AND copyable = FALSE
 AND opens_at IS NULL AND expires_at IS NULL AND published_at IS NULL
 AND report_package_profile IS NULL AND report_package_key IS NULL AND report_package_version IS NULL AND report_package_snapshot_encrypted IS NULL
 AND analysis_protocol_key IS NULL AND analysis_protocol_version IS NULL AND analysis_protocol_snapshot_encrypted IS NULL
 AND training_feedback_policy IS NULL AND training_persistence_policy IS NULL AND training_timing_policy IS NULL
 AND training_variant_draft IS NULL AND training_variant_frozen IS NULL
 AND training_flow_draft IS NULL AND training_flow_frozen IS NULL)
);
COMMIT;
