-- Researcher-owned authoring, independent from any study. Existing study rows are unchanged.
CREATE TABLE survey_tool_templates (
 id TEXT PRIMARY KEY,
 owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK (kind IN ('FORM','SCALE','COMPOSITION')),
 title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
 definition JSONB NOT NULL CHECK (octet_length(definition::text) <= 1048576),
 revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ARCHIVED')),
 creation_digest TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX survey_tool_templates_owner_idx ON survey_tool_templates(owner_user_id,status,updated_at DESC,id);
CREATE TABLE survey_tool_selections (
 id TEXT PRIMARY KEY,
 owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 project_id TEXT NOT NULL REFERENCES survey_projects(id) ON DELETE RESTRICT,
 request_digest TEXT NOT NULL,
 instrument_ids JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
