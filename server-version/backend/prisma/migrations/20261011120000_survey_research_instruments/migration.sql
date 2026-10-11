-- PR2 Survey research-only authoring drafts. Existing product catalogs are untouched.
CREATE TABLE "survey_instrument_drafts" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL REFERENCES "survey_projects"("id") ON DELETE RESTRICT,
  "instrument_key" TEXT NOT NULL CHECK ("instrument_key" ~ '^[a-z][a-z0-9_-]{0,79}$'),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('FORM','SCALE','SJT')),
  "title" TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 200),
  "definition" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','ARCHIVED')),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_instruments_definition_object_check"
    CHECK (jsonb_typeof("definition") = 'object' AND octet_length("definition"::text) <= 524288),
  CONSTRAINT "survey_instruments_project_key_uniq" UNIQUE ("project_id","instrument_key")
);
CREATE INDEX "survey_instruments_project_status_idx"
  ON "survey_instrument_drafts"("project_id","status","updated_at","id");
