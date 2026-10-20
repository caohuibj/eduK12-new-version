-- Result pointers only: the immutable candidates/reviews retain their payloads.
CREATE TABLE survey_reference_requests (
  request_id UUID PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES survey_projects(id) ON DELETE RESTRICT,
  wave_id TEXT NOT NULL REFERENCES survey_waves(id) ON DELETE RESTRICT,
  operation TEXT NOT NULL CHECK (operation IN ('CREATE','REVIEW')),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  candidate_id TEXT NOT NULL REFERENCES measurement_reference_candidates(id) ON DELETE RESTRICT,
  review_id TEXT REFERENCES measurement_reference_reviews(id) ON DELETE RESTRICT,
  exclusion_counts JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
  CHECK ((operation='CREATE' AND review_id IS NULL AND exclusion_counts IS NOT NULL AND jsonb_typeof(exclusion_counts)='object')
      OR (operation='REVIEW' AND review_id IS NOT NULL AND exclusion_counts IS NULL))
);
CREATE FUNCTION guard_survey_reference_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'survey reference request mappings are immutable';
END $$;
CREATE TRIGGER survey_reference_requests_guard BEFORE UPDATE OR DELETE ON survey_reference_requests
FOR EACH ROW EXECUTE FUNCTION guard_survey_reference_request();
