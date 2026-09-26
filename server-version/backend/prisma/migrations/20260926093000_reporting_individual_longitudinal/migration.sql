-- Add a distinct personal-report policy; never rewrite historical payloads or hashes.
ALTER TABLE reporting_analysis_artifacts ADD COLUMN subject_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE reporting_analysis_artifacts
 DROP CONSTRAINT reporting_analysis_artifacts_kind_check,
 DROP CONSTRAINT reporting_analysis_artifacts_policy_check,
 DROP CONSTRAINT reporting_analysis_artifacts_source_shape_check;
ALTER TABLE reporting_analysis_artifacts
 ADD CONSTRAINT reporting_analysis_artifacts_kind_check CHECK (analysis_kind IN ('GROUP','REPEATED_COHORT','MATCHED_LONGITUDINAL','PROTECTED_FEEDBACK','INDIVIDUAL_LONGITUDINAL')),
 ADD CONSTRAINT reporting_analysis_artifacts_policy_check CHECK (policy_domain IN ('ORG_GROUP_REPORT_V1','ORG_PROTECTED_FEEDBACK_V1','ORG_INDIVIDUAL_REPORT_V1')),
 ADD CONSTRAINT reporting_analysis_artifacts_source_shape_check CHECK (
    (
      "subject_user_id" IS NULL AND "analysis_kind"='GROUP'
      AND "policy_domain"='ORG_GROUP_REPORT_V1'
      AND "cohort_snapshot_id" IS NOT NULL
      AND "series_id" IS NULL
      AND "source_run_id" IS NULL AND "source_track_id" IS NULL
      AND "subject_actor_snapshot_id" IS NULL AND "relationship_kind" IS NULL AND "perspective" IS NULL
    )
    OR (
      "subject_user_id" IS NULL AND "analysis_kind" IN ('REPEATED_COHORT','MATCHED_LONGITUDINAL')
      AND "policy_domain"='ORG_GROUP_REPORT_V1'
      AND "cohort_snapshot_id" IS NULL
      AND "series_id" IS NOT NULL
      AND "source_run_id" IS NULL AND "source_track_id" IS NULL
      AND "subject_actor_snapshot_id" IS NULL AND "relationship_kind" IS NULL AND "perspective" IS NULL
    )
    OR (
      "subject_user_id" IS NULL AND "analysis_kind"='PROTECTED_FEEDBACK'
      AND "policy_domain"='ORG_PROTECTED_FEEDBACK_V1'
      AND "cohort_snapshot_id" IS NULL
      AND "series_id" IS NULL
      AND "source_run_id" IS NOT NULL AND "source_track_id" IS NOT NULL
      AND "subject_actor_snapshot_id" IS NOT NULL
      AND length(btrim("relationship_kind")) > 0
      AND "perspective" IS NOT NULL
    )

 OR (analysis_kind='INDIVIDUAL_LONGITUDINAL' AND policy_domain='ORG_INDIVIDUAL_REPORT_V1'
   AND subject_user_id IS NOT NULL AND series_id IS NOT NULL AND cohort_snapshot_id IS NULL
   AND source_run_id IS NULL AND source_track_id IS NULL AND subject_actor_snapshot_id IS NULL
   AND relationship_kind IS NULL AND perspective IS NULL));
CREATE INDEX reporting_individual_subject_idx ON reporting_analysis_artifacts(organization_id,subject_user_id,generated_at DESC) WHERE subject_user_id IS NOT NULL;
CREATE INDEX reporting_subject_source_idx ON assessment_run_actor_snapshots(organization_id,user_id,run_id,id);
