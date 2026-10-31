ALTER TABLE reporting_task_artifacts
 ADD COLUMN report_kind text NOT NULL DEFAULT 'GROUP',
 ADD COLUMN plan_id text,
 ADD CONSTRAINT reporting_task_artifact_kind CHECK (
  (report_kind='GROUP' AND plan_id IS NULL) OR
  (report_kind='GROUP_LONGITUDINAL' AND plan_id IS NOT NULL));
CREATE INDEX reporting_task_artifacts_plan_idx
 ON reporting_task_artifacts(product,container_id,report_kind,plan_id,generated_at DESC,id DESC);
