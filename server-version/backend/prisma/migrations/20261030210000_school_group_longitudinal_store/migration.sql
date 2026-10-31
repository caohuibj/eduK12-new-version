-- Reuse the encrypted aggregate store; existing School GROUP artifacts remain
-- the authoritative per-wave disclosure/history and are referenced, not copied.
ALTER TABLE reporting_task_artifacts DROP CONSTRAINT reporting_task_artifacts_product_check,
 ADD CONSTRAINT reporting_task_artifacts_product_check
 CHECK (product IN ('SURVEY','TRAINING','SCHOOL'));
