-- The binding is written once at attempt creation; hot progress/finalize
-- UPDATEs never touch it. Fire the unchanged guard only when the binding or
-- the attempt identity it is anchored to is written. PostgreSQL fires an
-- UPDATE OF trigger whenever a listed column is in the SET list, so every
-- change to these columns is still checked; INSERT is always checked.
DROP TRIGGER training_content_attempt_guard ON composite_assessment_attempts;
CREATE TRIGGER training_content_attempt_guard BEFORE INSERT OR UPDATE OF
 training_content_binding, training_content_binding_hash, id, composite_assessment_id, attempt_epoch
 ON composite_assessment_attempts FOR EACH ROW EXECUTE FUNCTION guard_training_content_attempt();
