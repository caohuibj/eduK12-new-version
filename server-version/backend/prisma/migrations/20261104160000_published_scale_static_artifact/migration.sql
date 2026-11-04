-- Format 3 is the publish-time static Scale content referenced by an
-- ordinary Training publication snapshot (schemaVersion 2). It carries no
-- reference bindings, deployment policy, participant fact or timestamp.
ALTER TABLE assessment_runtime_artifacts DROP CONSTRAINT assessment_runtime_artifacts_format_version_check;
ALTER TABLE assessment_runtime_artifacts ADD CONSTRAINT assessment_runtime_artifacts_format_version_check CHECK(format_version IN(1,2,3));
