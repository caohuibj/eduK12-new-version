-- Immutable internally sourced candidate evidence; application services still
-- require current capability and sample scope in the same transaction.
CREATE TABLE measurement_reference_candidates (
  id TEXT PRIMARY KEY,
  candidate_hash TEXT NOT NULL UNIQUE CHECK (candidate_hash ~ '^[a-f0-9]{64}$'),
  measurement_release_id TEXT NOT NULL REFERENCES measurement_content_releases(id) ON DELETE RESTRICT,
  analyzer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CHECK ((payload->>'candidateHash' = candidate_hash) IS TRUE),
  CHECK ((payload->>'analyzerId' = analyzer_id) IS TRUE),
  CHECK ((payload->'measurement'->>'releaseId' = measurement_release_id) IS TRUE),
  CHECK ((payload->'scope'->>'kind' IN ('PRIVATE','SHARED','PLATFORM')) IS TRUE),
  CHECK ((jsonb_typeof(payload->'definition'->'entries') = 'array') IS TRUE)
);
CREATE TABLE measurement_reference_reviews (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES measurement_reference_candidates(id) ON DELETE RESTRICT,
  candidate_hash TEXT NOT NULL,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  statement TEXT NOT NULL CHECK (length(trim(statement)) > 0),
  reviewed_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX measurement_reference_review_candidate_idx ON measurement_reference_reviews(candidate_id,reviewed_at);
CREATE FUNCTION validate_measurement_reference_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE candidate measurement_reference_candidates%ROWTYPE;
BEGIN
  SELECT * INTO STRICT candidate FROM measurement_reference_candidates WHERE id=NEW.candidate_id FOR SHARE;
  IF NEW.candidate_hash <> candidate.candidate_hash THEN RAISE EXCEPTION 'REFERENCE_REVIEW_STALE'; END IF;
  -- Derive formal use from immutable candidate data, never a reviewer-provided flag.
  IF candidate.payload->'scope'->>'kind' = 'PLATFORM'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(candidate.payload->'definition'->'entries') e WHERE e->>'referenceKind'='normative_distribution')
    AND NEW.reviewer_id=candidate.analyzer_id
  THEN RAISE EXCEPTION 'REFERENCE_INDEPENDENT_REVIEW_REQUIRED'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_reference_review_valid BEFORE INSERT ON measurement_reference_reviews
FOR EACH ROW EXECUTE FUNCTION validate_measurement_reference_review();
CREATE TRIGGER measurement_reference_candidate_immutable BEFORE UPDATE OR DELETE ON measurement_reference_candidates
FOR EACH ROW EXECUTE FUNCTION protect_measurement_content_event();
CREATE TRIGGER measurement_reference_review_immutable BEFORE UPDATE OR DELETE ON measurement_reference_reviews
FOR EACH ROW EXECUTE FUNCTION protect_measurement_content_event();
