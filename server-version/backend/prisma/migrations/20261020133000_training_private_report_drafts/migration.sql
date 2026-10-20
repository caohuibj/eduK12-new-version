CREATE TABLE training_report_drafts (
 id TEXT PRIMARY KEY,
 course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
 composite_id TEXT NOT NULL REFERENCES composite_assessments(id) ON DELETE RESTRICT,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 report_key TEXT NOT NULL, version TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0), payload JSONB NOT NULL,
 create_input_hash TEXT NOT NULL CHECK(create_input_hash ~ '^[a-f0-9]{64}$'),
 state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','PUBLISHED')),
 published_release_id TEXT REFERENCES measurement_content_releases(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 UNIQUE(composite_id,report_key,version),
 CHECK ((state='DRAFT' AND published_release_id IS NULL) OR (state='PUBLISHED' AND published_release_id IS NOT NULL))
);
CREATE FUNCTION protect_training_report_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN
  IF OLD.state='PUBLISHED' THEN RAISE EXCEPTION 'REPORT_PUBLISHED_DRAFT_IMMUTABLE'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF (NEW.id,NEW.course_id,NEW.composite_id,NEW.owner_id,NEW.report_key,NEW.version,NEW.create_input_hash)
    IS DISTINCT FROM (OLD.id,OLD.course_id,OLD.composite_id,OLD.owner_id,OLD.report_key,OLD.version,OLD.create_input_hash) THEN
    RAISE EXCEPTION 'REPORT_DRAFT_IDENTITY_IMMUTABLE';
  END IF;
 END IF;
 IF NEW.state='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM measurement_content_releases r
   WHERE r.id=NEW.published_release_id AND r.layer='REPORT'
    AND r.scope->>'kind'='PRIVATE' AND r.scope->>'product'='TRAINING'
    AND r.scope->>'ownerId'=NEW.owner_id AND r.scope->>'resourceId'=NEW.composite_id) THEN
   RAISE EXCEPTION 'REPORT_DRAFT_RELEASE_SCOPE_MISMATCH';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_report_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON training_report_drafts
 FOR EACH ROW EXECUTE FUNCTION protect_training_report_draft();
