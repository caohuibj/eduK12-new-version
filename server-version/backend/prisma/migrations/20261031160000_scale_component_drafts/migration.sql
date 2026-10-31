CREATE TABLE scale_component_drafts (
 id text PRIMARY KEY,
 tool_key text NOT NULL,
 configuration_name text NOT NULL,
 base_combination_id text REFERENCES survey_standard_releases(id) ON DELETE RESTRICT,
 base_combination_hash text,
 changed_parts jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 request_id text NOT NULL,
 request_index integer NOT NULL CHECK(request_index>=0),
 request_digest text NOT NULL,
 published_release_id text REFERENCES survey_standard_releases(id) ON DELETE RESTRICT,
 created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 updated_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(request_id,request_index),
 CHECK((base_combination_id IS NULL)=(base_combination_hash IS NULL)),
 CHECK(request_digest ~ '^[0-9a-f]{64}$'),
 CHECK(jsonb_typeof(changed_parts)='object' AND changed_parts<>'{}'::jsonb)
);
CREATE INDEX scale_component_drafts_page ON scale_component_drafts(created_at DESC,id DESC);
CREATE FUNCTION scale_component_draft_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Scale component draft history is retained'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 OR NEW.published_release_id IS NOT NULL THEN RAISE EXCEPTION 'New component draft required'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.published_release_id IS NOT NULL THEN RAISE EXCEPTION 'Approved component draft is frozen'; END IF;
 IF ROW(NEW.id,NEW.tool_key,NEW.created_by,NEW.created_at,NEW.request_id,NEW.request_index,NEW.request_digest)
 IS DISTINCT FROM ROW(OLD.id,OLD.tool_key,OLD.created_by,OLD.created_at,OLD.request_id,OLD.request_index,OLD.request_digest)
 THEN RAISE EXCEPTION 'Component import identity is immutable'; END IF;
 IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Component revision conflict'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scale_component_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON scale_component_drafts
 FOR EACH ROW EXECUTE FUNCTION scale_component_draft_guard();
