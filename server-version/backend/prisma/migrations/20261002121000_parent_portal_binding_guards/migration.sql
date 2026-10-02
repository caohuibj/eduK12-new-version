-- Bind every evidence row to the exact relationship, consenting subject and frozen source.
-- This adds constraints only; it does not grant or backfill any access.
ALTER TABLE parent_student_relationships ADD CONSTRAINT parent_relation_identity_tuple UNIQUE (id,parent_user_id,student_user_id);
ALTER TABLE parent_report_consents ADD CONSTRAINT parent_consent_identity_tuple UNIQUE (id,relationship_id,source_artifact_id,parent_user_id,student_user_id,source_hash,consent_version,consent_hash);
ALTER TABLE reporting_analysis_artifacts ADD CONSTRAINT parent_artifact_source_tuple UNIQUE (id,organization_id,snapshot_hash);
ALTER TABLE parent_report_consents ADD CONSTRAINT parent_consent_relationship_binding FOREIGN KEY (relationship_id,parent_user_id,student_user_id) REFERENCES parent_student_relationships(id,parent_user_id,student_user_id) ON DELETE RESTRICT;
ALTER TABLE parent_report_disclosure_grants ADD CONSTRAINT parent_grant_relationship_binding FOREIGN KEY (relationship_id,parent_user_id,student_user_id) REFERENCES parent_student_relationships(id,parent_user_id,student_user_id) ON DELETE RESTRICT;
ALTER TABLE parent_report_disclosure_grants ADD CONSTRAINT parent_grant_consent_binding FOREIGN KEY (consent_id,relationship_id,source_artifact_id,parent_user_id,student_user_id,source_hash,consent_version,consent_hash) REFERENCES parent_report_consents(id,relationship_id,source_artifact_id,parent_user_id,student_user_id,source_hash,consent_version,consent_hash) ON DELETE RESTRICT;
ALTER TABLE parent_report_disclosure_grants ADD CONSTRAINT parent_grant_source_binding FOREIGN KEY (source_artifact_id,organization_id,source_hash) REFERENCES reporting_analysis_artifacts(id,organization_id,snapshot_hash) ON DELETE RESTRICT;
