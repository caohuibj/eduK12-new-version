-- Narrow author-private drafts and technical snapshots. No old data is rewritten.
CREATE TABLE education_private_tools (
 id text PRIMARY KEY,entry text NOT NULL CHECK(entry IN ('SCHOOL','TEACHER')),
 organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 owner_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('SCALE','FORM')),title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 definition jsonb NOT NULL,content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT education_private_tools_scope_key UNIQUE(id,entry,organization_id,owner_user_id,kind)
);
CREATE INDEX education_private_tools_owner_idx ON education_private_tools(entry,organization_id,owner_user_id,id);
CREATE TABLE education_private_tool_versions (
 id text PRIMARY KEY,tool_id text NOT NULL,entry text NOT NULL,organization_id text NOT NULL,owner_user_id text NOT NULL,kind text NOT NULL,
 source_revision integer NOT NULL CHECK(source_revision>0),title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 definition jsonb NOT NULL,content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT education_private_tool_versions_tool_fkey FOREIGN KEY(tool_id,entry,organization_id,owner_user_id,kind)
  REFERENCES education_private_tools(id,entry,organization_id,owner_user_id,kind) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT education_private_tool_versions_revision_key UNIQUE(tool_id,source_revision)
);
CREATE FUNCTION protect_education_private_tool() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Private tool history is retained'; END IF;
 IF TG_TABLE_NAME='education_private_tool_versions' THEN RAISE EXCEPTION 'Private tool version is immutable'; END IF;
 IF (NEW.id,NEW.entry,NEW.organization_id,NEW.owner_user_id,NEW.kind,NEW.created_at)
  IS DISTINCT FROM (OLD.id,OLD.entry,OLD.organization_id,OLD.owner_user_id,OLD.kind,OLD.created_at)
 THEN RAISE EXCEPTION 'Private tool ownership is immutable'; END IF;
 IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Private tool revision must advance once'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER education_private_tools_guard BEFORE UPDATE OR DELETE ON education_private_tools FOR EACH ROW EXECUTE FUNCTION protect_education_private_tool();
CREATE TRIGGER education_private_tool_versions_guard BEFORE UPDATE OR DELETE ON education_private_tool_versions FOR EACH ROW EXECUTE FUNCTION protect_education_private_tool();

CREATE FUNCTION check_education_private_tool_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE draft education_private_tools%ROWTYPE;
BEGIN
 SELECT * INTO draft FROM education_private_tools WHERE id=NEW.tool_id FOR SHARE;
 IF NOT FOUND OR (NEW.entry,NEW.organization_id,NEW.owner_user_id,NEW.kind,NEW.source_revision,NEW.title,NEW.definition,NEW.content_hash)
   IS DISTINCT FROM (draft.entry,draft.organization_id,draft.owner_user_id,draft.kind,draft.revision,draft.title,draft.definition,draft.content_hash)
 THEN RAISE EXCEPTION 'Private snapshot must match current exact draft revision'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER education_private_tool_versions_source BEFORE INSERT ON education_private_tool_versions FOR EACH ROW EXECUTE FUNCTION check_education_private_tool_snapshot();
