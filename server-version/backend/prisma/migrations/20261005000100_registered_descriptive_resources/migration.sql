-- Explicit content publication; no existing answers, memberships or grants are changed.
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
);
CREATE TABLE registered_assessment_resources (
  id TEXT PRIMARY KEY,
  resource_key TEXT NOT NULL,
  resource_version TEXT NOT NULL,
  scale_id TEXT NOT NULL REFERENCES scales(id) ON DELETE RESTRICT,
  definition_hash TEXT NOT NULL,
  composite_id TEXT NOT NULL UNIQUE REFERENCES composite_assessments(id) ON DELETE RESTRICT,
  entry JSONB NOT NULL,
  entry_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEWED','PUBLISHED','RETIRED')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  published_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ,
  retired_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  retired_at TIMESTAMPTZ,
  UNIQUE(resource_key,resource_version)
);
CREATE INDEX registered_assessment_resources_status_idx ON registered_assessment_resources(status);
