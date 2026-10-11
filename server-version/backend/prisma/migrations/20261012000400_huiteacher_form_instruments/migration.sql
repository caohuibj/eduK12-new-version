-- Huiteacher PR2-C3: author Teacher-only unscored Form content using the
-- existing Survey V2 definition contract, not a new scoring engine.
-- Publishing freezes one exact definition; later changes require a new Form ID.
CREATE TABLE "huiteacher_form_instruments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "definition" JSONB NOT NULL,
  "definition_digest" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "huiteacher_form_instruments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "huiteacher_form_instruments_org_id_key" UNIQUE ("organization_id","id"),
  CONSTRAINT "huiteacher_form_instruments_org_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_form_instruments_author_fkey" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_form_instruments_status_check"
    CHECK ("status" IN ('DRAFT','PUBLISHED')),
  CONSTRAINT "huiteacher_form_instruments_revision_check" CHECK ("revision">=1),
  CONSTRAINT "huiteacher_form_instruments_title_check"
    CHECK(length(btrim("title")) BETWEEN 1 AND 200),
  CONSTRAINT "huiteacher_form_instruments_publication_check"
    CHECK (("status"='DRAFT' AND "published_at" IS NULL)
       OR ("status"='PUBLISHED' AND "published_at" IS NOT NULL)),
  CONSTRAINT "huiteacher_form_instruments_digest_check"
    CHECK ("definition_digest" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "huiteacher_forms_org_status_idx"
  ON "huiteacher_form_instruments"("organization_id","status","created_at" DESC);
CREATE OR REPLACE FUNCTION protect_teacher_form_definition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD."status"='PUBLISHED' THEN
    RAISE EXCEPTION 'Published Teacher Form is immutable'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "huiteacher_form_immutable"
 BEFORE UPDATE OR DELETE ON "huiteacher_form_instruments"
 FOR EACH ROW EXECUTE FUNCTION protect_teacher_form_definition();
CREATE TRIGGER "huiteacher_form_school_guard"
 BEFORE INSERT ON "huiteacher_form_instruments"
 FOR EACH ROW EXECUTE FUNCTION teacher_evaluation_school_admission();
