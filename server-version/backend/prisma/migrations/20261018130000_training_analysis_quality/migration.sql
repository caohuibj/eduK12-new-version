-- Additive analysis policy only. No writes/backfill to any accepted source.
CREATE TABLE training_analysis_quality (
 id TEXT PRIMARY KEY,
 course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
 attempt_id TEXT NOT NULL REFERENCES composite_assessment_attempts(id) ON DELETE RESTRICT,
 attempt_epoch INTEGER NOT NULL CHECK(attempt_epoch >= 1),
 source_hash TEXT NOT NULL CHECK(source_hash ~ '^[0-9a-f]{64}$'),
 verdict TEXT NOT NULL CHECK(verdict IN ('INCLUDE','EXCLUDE')),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 2 AND 1000),
 reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
 reviewed_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX training_analysis_quality_scope_key ON training_analysis_quality(course_id,attempt_id,attempt_epoch,source_hash);
CREATE INDEX training_analysis_quality_course_id_attempt_id_idx ON training_analysis_quality(course_id,attempt_id);
CREATE TABLE training_analysis_quality_audit (
 id TEXT PRIMARY KEY,
 review_id TEXT NOT NULL REFERENCES training_analysis_quality(id) ON DELETE RESTRICT,
 course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
 attempt_id TEXT NOT NULL REFERENCES composite_assessment_attempts(id) ON DELETE RESTRICT,
 attempt_epoch INTEGER NOT NULL CHECK(attempt_epoch >= 1),
 source_hash TEXT NOT NULL CHECK(source_hash ~ '^[0-9a-f]{64}$'),
 verdict TEXT NOT NULL CHECK(verdict IN ('INCLUDE','EXCLUDE')),
 previous_verdict TEXT NOT NULL CHECK(previous_verdict IN ('INCLUDE','EXCLUDE')),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 2 AND 1000),
 reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(revision >= 1),
 reviewed_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX training_analysis_quality_audit_review_id_revision_key ON training_analysis_quality_audit(review_id,revision);
CREATE INDEX training_analysis_quality_audit_course_id_attempt_id_idx ON training_analysis_quality_audit(course_id,attempt_id);
CREATE FUNCTION training_analysis_quality_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Analysis review history is retained'; END IF;
 IF OLD.id IS DISTINCT FROM NEW.id OR OLD.course_id IS DISTINCT FROM NEW.course_id
 OR OLD.attempt_id IS DISTINCT FROM NEW.attempt_id OR OLD.attempt_epoch IS DISTINCT FROM NEW.attempt_epoch
 OR OLD.source_hash IS DISTINCT FROM NEW.source_hash OR NEW.revision != OLD.revision+1 THEN
   RAISE EXCEPTION 'Analysis review scope is immutable and revision must advance once';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_analysis_quality_guard BEFORE UPDATE OR DELETE ON training_analysis_quality
 FOR EACH ROW EXECUTE FUNCTION training_analysis_quality_guard();
CREATE FUNCTION training_analysis_quality_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Analysis quality audit is append-only'; END $$;
CREATE TRIGGER training_analysis_quality_audit_immutable BEFORE UPDATE OR DELETE ON training_analysis_quality_audit
 FOR EACH ROW EXECUTE FUNCTION training_analysis_quality_audit_immutable();
-- A review revision and its audit event are one atomic decision, including
-- direct SQL under the restricted runtime role. There is no unaudited path.
CREATE FUNCTION training_analysis_quality_audit_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous TEXT;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM training_analysis_quality q WHERE q.id=NEW.review_id
   AND q.course_id=NEW.course_id AND q.attempt_id=NEW.attempt_id AND q.attempt_epoch=NEW.attempt_epoch
   AND q.source_hash=NEW.source_hash AND q.revision=NEW.revision AND q.verdict=NEW.verdict
   AND q.reason=NEW.reason AND q.reviewer_id=NEW.reviewer_id AND q.reviewed_at=NEW.reviewed_at) THEN
   RAISE EXCEPTION 'Analysis audit must bind the exact current review decision';
 END IF;
 IF NEW.revision=1 THEN previous:='INCLUDE';
 ELSE SELECT verdict INTO previous FROM training_analysis_quality_audit WHERE review_id=NEW.review_id AND revision=NEW.revision-1;
 END IF;
 IF previous IS NULL OR previous IS DISTINCT FROM NEW.previous_verdict THEN
   RAISE EXCEPTION 'Analysis audit must extend the prior immutable decision';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_analysis_quality_audit_binding BEFORE INSERT ON training_analysis_quality_audit
 FOR EACH ROW EXECUTE FUNCTION training_analysis_quality_audit_binding();
CREATE FUNCTION training_analysis_quality_requires_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM training_analysis_quality_audit a WHERE a.review_id=NEW.id
   AND a.revision=NEW.revision AND a.course_id=NEW.course_id AND a.attempt_id=NEW.attempt_id
   AND a.attempt_epoch=NEW.attempt_epoch AND a.source_hash=NEW.source_hash
   AND a.verdict=NEW.verdict AND a.reason=NEW.reason AND a.reviewer_id=NEW.reviewer_id) THEN
   RAISE EXCEPTION 'Analysis review requires an immutable audit in the same transaction';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER training_analysis_quality_requires_audit AFTER INSERT OR UPDATE ON training_analysis_quality
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION training_analysis_quality_requires_audit();
