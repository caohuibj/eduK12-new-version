-- Format 1 is Scale; format 2 is the separately verified Cognitive runtime.
-- No personal facts, permission decisions or results are stored in this table.
ALTER TABLE assessment_runtime_artifacts DROP CONSTRAINT assessment_runtime_artifacts_format_version_check;
ALTER TABLE assessment_runtime_artifacts ADD CONSTRAINT assessment_runtime_artifacts_format_version_check CHECK(format_version IN(1,2));
