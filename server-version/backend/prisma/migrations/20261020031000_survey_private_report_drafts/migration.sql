CREATE TABLE survey_report_drafts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES survey_projects(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  report_key TEXT NOT NULL,
  version TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  payload JSONB NOT NULL,
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','PUBLISHED')),
  published_release_id TEXT REFERENCES measurement_content_releases(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE(project_id,report_key,version),
  CHECK ((state='DRAFT' AND published_release_id IS NULL) OR (state='PUBLISHED' AND published_release_id IS NOT NULL))
);
CREATE FUNCTION protect_published_survey_report_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state='PUBLISHED' THEN RAISE EXCEPTION 'REPORT_PUBLISHED_DRAFT_IMMUTABLE'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.project_id<>OLD.project_id OR NEW.owner_id<>OLD.owner_id OR NEW.report_key<>OLD.report_key OR NEW.version<>OLD.version THEN
    RAISE EXCEPTION 'REPORT_DRAFT_IDENTITY_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER survey_report_draft_immutable BEFORE UPDATE OR DELETE ON survey_report_drafts
FOR EACH ROW EXECUTE FUNCTION protect_published_survey_report_draft();
