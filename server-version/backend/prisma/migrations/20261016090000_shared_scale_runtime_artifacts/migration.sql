-- Additive; retain this table and compatible reader when reverting new writes.
CREATE TABLE "assessment_runtime_artifacts" (
  "artifact_hash" TEXT PRIMARY KEY CHECK ("artifact_hash" ~ '^[0-9a-f]{64}$'),
  "format_version" INTEGER NOT NULL CHECK ("format_version" = 1),
  "plaintext_bytes" INTEGER NOT NULL CHECK ("plaintext_bytes" BETWEEN 1 AND 2097152),
  "payload_encrypted" TEXT NOT NULL CHECK (octet_length("payload_encrypted") BETWEEN 1 AND 4194304),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION "reject_assessment_runtime_artifact_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assessment_runtime_artifacts are immutable; append a new content hash' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "assessment_runtime_artifacts_immutable"
  BEFORE UPDATE OR DELETE ON "assessment_runtime_artifacts"
  FOR EACH ROW EXECUTE FUNCTION "reject_assessment_runtime_artifact_mutation"();
