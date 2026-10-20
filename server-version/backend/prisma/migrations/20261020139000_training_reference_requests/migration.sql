-- Immutable operation receipts, never a second sample or release payload.
CREATE TABLE training_reference_requests (
 request_id UUID PRIMARY KEY,
 actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
 composite_id TEXT NOT NULL REFERENCES composite_assessments(id) ON DELETE RESTRICT,
 operation TEXT NOT NULL CHECK (operation IN ('CREATE','REVIEW','PUBLISH')),
 input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
 candidate_id TEXT NOT NULL REFERENCES measurement_reference_candidates(id) ON DELETE RESTRICT,
 review_id TEXT REFERENCES measurement_reference_reviews(id) ON DELETE RESTRICT,
 release_id TEXT REFERENCES measurement_content_releases(id) ON DELETE RESTRICT,
 exclusion_counts JSONB,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
 CHECK ((operation='CREATE' AND review_id IS NULL AND release_id IS NULL AND exclusion_counts IS NOT NULL AND jsonb_typeof(exclusion_counts)='object')
  OR (operation='REVIEW' AND review_id IS NOT NULL AND release_id IS NULL AND exclusion_counts IS NULL)
  OR (operation='PUBLISH' AND review_id IS NOT NULL AND release_id IS NOT NULL AND exclusion_counts IS NULL))
);
CREATE TRIGGER training_reference_requests_guard BEFORE UPDATE OR DELETE ON training_reference_requests
 FOR EACH ROW EXECUTE FUNCTION protect_measurement_content_event();
