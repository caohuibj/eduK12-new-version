-- Reuse the existing immutable aggregate store and its plan/snapshot references.
ALTER TABLE reporting_task_artifacts DROP CONSTRAINT reporting_task_artifacts_product_check,
 ADD CONSTRAINT reporting_task_artifacts_product_check
 CHECK (product IN ('SURVEY','TRAINING','SCHOOL','TEACHER'));
