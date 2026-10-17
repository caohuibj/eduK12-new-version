-- Opt-in per-wave shared-IP exception. Existing waves remain ordinary (NULL).
ALTER TABLE "survey_waves"
  ADD COLUMN "group_ip_policy" JSONB,
  ADD COLUMN "group_ip_activated_at" TIMESTAMPTZ(6);

-- Drafts contain only the schema and IANA zone. Publication adds the server day.
-- COALESCE is intentional: SQL NULL must not let missing JSON properties pass.
ALTER TABLE "survey_waves" ADD CONSTRAINT "survey_waves_group_ip_policy_check" CHECK (
  "group_ip_policy" IS NULL OR COALESCE((
    jsonb_typeof("group_ip_policy")='object'
    AND "group_ip_policy"->'schemaVersion'='1'::jsonb
    AND jsonb_typeof("group_ip_policy"->'timeZone')='string'
    AND length("group_ip_policy"->>'timeZone') BETWEEN 1 AND 100
    AND (
      ("publication_id" IS NULL AND NOT ("group_ip_policy" ? 'activationDate')
        AND "group_ip_policy" - ARRAY['schemaVersion','timeZone'] = '{}'::jsonb)
      OR ("publication_id" IS NOT NULL
        AND jsonb_typeof("group_ip_policy"->'activationDate')='string'
        AND "group_ip_policy"->>'activationDate' ~ '^\d{4}-\d{2}-\d{2}$'
        AND "group_ip_policy" - ARRAY['schemaVersion','timeZone','activationDate'] = '{}'::jsonb)
    )
  ),FALSE)
);
ALTER TABLE "survey_waves" ADD CONSTRAINT "survey_waves_group_ip_window_check" CHECK (
  ("group_ip_policy" IS NULL AND "group_ip_activated_at" IS NULL)
  OR ("group_ip_policy" IS NOT NULL AND (
    ("group_ip_activated_at" IS NULL AND "status"='DRAFT')
    OR ("group_ip_activated_at" IS NOT NULL AND "publication_id" IS NOT NULL
      AND "opens_at" IS NOT NULL AND "closes_at" IS NOT NULL AND "finish_until" IS NOT NULL
      AND "opens_at"="group_ip_activated_at"
      AND "closes_at">"group_ip_activated_at"
      AND "closes_at"<="group_ip_activated_at"+INTERVAL '48 hours'
      AND "finish_until"<="closes_at"
      AND "finish_until"<="group_ip_activated_at"+INTERVAL '48 hours')
  ))
);

CREATE FUNCTION survey_group_ip_policy_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE frozen_policy JSONB;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD."publication_id" IS NOT NULL AND NEW."group_ip_policy" IS DISTINCT FROM OLD."group_ip_policy" THEN
      RAISE EXCEPTION 'Published Survey group IP policy is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD."group_ip_activated_at" IS NOT NULL AND (
      NEW."group_ip_activated_at" IS DISTINCT FROM OLD."group_ip_activated_at"
      OR NEW."opens_at" IS DISTINCT FROM OLD."opens_at"
      OR NEW."closes_at">OLD."closes_at"
      OR NEW."finish_until">OLD."finish_until"
    ) THEN
      RAISE EXCEPTION 'Activated Survey group IP window cannot be restarted or extended' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW."publication_id" IS NOT NULL AND NEW."group_ip_policy" IS NOT NULL THEN
    SELECT "compiled_snapshot"->'groupIpPolicy' INTO frozen_policy FROM "survey_publications"
      WHERE "id"=NEW."publication_id" AND "project_id"=NEW."project_id"
        AND "purpose"='RESEARCH_ONLY'
        AND "compiled_snapshot"->'schemaVersion'='1'::jsonb
        AND "compiled_snapshot"->>'purpose'='RESEARCH_ONLY'
        AND "compiled_snapshot"->>'runtimeStatus'='SURVEY_FINAL_V1'
        AND "compiled_snapshot"->>'projectId'=NEW."project_id"
        AND "compiled_snapshot"->>'waveId'=NEW."id";
    IF frozen_policy IS DISTINCT FROM NEW."group_ip_policy" THEN
      RAISE EXCEPTION 'Survey group IP policy must match the immutable publication' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW."group_ip_activated_at" IS NOT NULL THEN
    -- AT TIME ZONE also rejects invalid database-direct zone names.
    IF to_char(NEW."group_ip_activated_at" AT TIME ZONE (NEW."group_ip_policy"->>'timeZone'),'YYYY-MM-DD')
        IS DISTINCT FROM NEW."group_ip_policy"->>'activationDate' THEN
      RAISE EXCEPTION 'Survey group IP activation must be on its frozen local publication day' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER survey_group_ip_policy_guard
  BEFORE INSERT OR UPDATE OF "publication_id","group_ip_policy","group_ip_activated_at","opens_at","closes_at","finish_until"
  ON "survey_waves" FOR EACH ROW EXECUTE FUNCTION survey_group_ip_policy_guard();
