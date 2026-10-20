-- Existing private reviews remain readable. Formal reviews bind the exact
-- current scientific grant, independently of management or business roles.
ALTER TABLE measurement_reference_reviews
  ADD COLUMN reviewer_grant_id TEXT,
  ADD COLUMN reviewer_grant_version INTEGER,
  ADD CONSTRAINT measurement_reference_review_grant_pair CHECK (
    (reviewer_grant_id IS NULL AND reviewer_grant_version IS NULL)
    OR (reviewer_grant_id IS NOT NULL AND reviewer_grant_version IS NOT NULL AND reviewer_grant_version > 0)
  );
