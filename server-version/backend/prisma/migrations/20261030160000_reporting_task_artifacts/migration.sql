-- Organization reporting artifacts require a real organization, Run/Track,
-- cohort and published spec. Survey/Training task reports have different real
-- source authorities. Store only aggregate projection + frozen source pointers.
CREATE TABLE reporting_task_artifacts (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL CHECK (product IN ('SURVEY','TRAINING')),
  container_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  generated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payload_cipher TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  generated_at TIMESTAMP(3) NOT NULL
);
CREATE INDEX reporting_task_artifacts_source_idx ON reporting_task_artifacts(product,container_id,task_id,generated_at DESC,id DESC);
CREATE TRIGGER reporting_task_artifacts_immutable BEFORE UPDATE OR DELETE ON reporting_task_artifacts
FOR EACH ROW EXECUTE FUNCTION reject_reporting_snapshot_mutation();
