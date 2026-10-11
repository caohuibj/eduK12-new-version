-- Auditable researcher confirmation of study-local cross-wave linkage disclosure.
-- The default is FALSE; no historical consent may be silently upgraded.
ALTER TABLE "survey_waves"
  ADD COLUMN "linkage_notice_confirmed" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION survey_wave_published_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publication_id" IS NOT NULL AND (
    NEW."publication_id" IS DISTINCT FROM OLD."publication_id" OR
    NEW."consent_text" IS DISTINCT FROM OLD."consent_text" OR
    NEW."consent_version" IS DISTINCT FROM OLD."consent_version" OR
    NEW."instrument_ids" IS DISTINCT FROM OLD."instrument_ids" OR
    NEW."general_text" IS DISTINCT FROM OLD."general_text" OR
    NEW."linkage_notice_confirmed" IS DISTINCT FROM OLD."linkage_notice_confirmed"
  ) THEN
    RAISE EXCEPTION 'Published Survey wave consent and definition are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER survey_wave_published_guard ON "survey_waves";
CREATE TRIGGER survey_wave_published_guard
  BEFORE UPDATE OF "publication_id","consent_text","consent_version",
    "instrument_ids","general_text","linkage_notice_confirmed"
  ON "survey_waves" FOR EACH ROW EXECUTE FUNCTION survey_wave_published_guard();

-- DB direct publication cannot bypass the mode-sensitive disclosure rule.
CREATE OR REPLACE FUNCTION survey_linkage_disclosure_gate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."publication_id" IS NOT NULL
    AND EXISTS (SELECT 1 FROM "survey_projects" WHERE "id"=NEW."project_id" AND "collection_mode"='LINKED_WAVES')
    AND NEW."linkage_notice_confirmed" IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Linked Wave requires explicit linkage disclosure confirmation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER survey_linkage_disclosure_gate
  BEFORE INSERT OR UPDATE OF "publication_id","linkage_notice_confirmed"
  ON "survey_waves" FOR EACH ROW EXECUTE FUNCTION survey_linkage_disclosure_gate();
