-- PR4: human-reviewed, separately authored consensus of independent
-- immutable field records. This is NOT MULTI_INFORMANT_SYNTHESIS or an
-- arithmetic average of survey/Scale results.
ALTER TABLE "huiteacher_observation_records"
  ADD CONSTRAINT "huiteacher_observation_record_scope_key"
  UNIQUE("organization_id","event_id","id");

CREATE TABLE "huiteacher_field_consensuses" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body_cipher" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "submitted_at" TIMESTAMPTZ(6),
  CONSTRAINT "huiteacher_field_consensuses_scope_key" UNIQUE ("organization_id","event_id","id"),
  CONSTRAINT "huiteacher_field_consensuses_event_fkey" FOREIGN KEY ("organization_id","event_id")
    REFERENCES "huiteacher_evaluation_events"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_field_consensuses_author_fkey" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_field_consensuses_title_check"
    CHECK (char_length(btrim("title")) BETWEEN 2 AND 200),
  CONSTRAINT "huiteacher_field_consensuses_status_check"
    CHECK (("status"='DRAFT' AND "submitted_at" IS NULL)
      OR ("status"='SUBMITTED' AND "submitted_at" IS NOT NULL)),
  CONSTRAINT "huiteacher_field_consensuses_rev_check" CHECK ("revision">=1),
  CONSTRAINT "huiteacher_field_consensuses_cipher_check"
    CHECK ("body_cipher" ~ '^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$')
);
CREATE INDEX "huiteacher_field_consensuses_event_idx"
  ON "huiteacher_field_consensuses"("organization_id","event_id","status","created_at" DESC);

CREATE TABLE "huiteacher_field_consensus_sources" (
  "organization_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "consensus_id" TEXT NOT NULL,
  "record_id" TEXT NOT NULL,
  "source_cipher_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY("consensus_id","record_id"),
  CONSTRAINT "huiteacher_field_consensus_sources_parent_fkey"
    FOREIGN KEY("organization_id","event_id","consensus_id")
    REFERENCES "huiteacher_field_consensuses"("organization_id","event_id","id")
    ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_field_consensus_sources_record_fkey"
    FOREIGN KEY("organization_id","event_id","record_id")
    REFERENCES "huiteacher_observation_records"("organization_id","event_id","id")
    ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_field_consensus_sources_hash_check"
    CHECK ("source_cipher_hash" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "huiteacher_field_consensus_sources_scope_idx"
  ON "huiteacher_field_consensus_sources"("organization_id","event_id","consensus_id");

CREATE OR REPLACE FUNCTION protect_huiteacher_field_consensus() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Huiteacher consensus cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF OLD."status"='SUBMITTED' THEN
    RAISE EXCEPTION 'Finalized Huiteacher consensus is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW."id"<>OLD."id" OR NEW."organization_id"<>OLD."organization_id"
    OR NEW."event_id"<>OLD."event_id"
    OR NEW."created_by_user_id"<>OLD."created_by_user_id"
    OR NEW."created_at"<>OLD."created_at"
    OR NEW."revision"<>OLD."revision"+1 THEN
    RAISE EXCEPTION 'Consensus provenance/revision cannot change' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_field_consensus_immutable"
  BEFORE UPDATE OR DELETE ON "huiteacher_field_consensuses"
  FOR EACH ROW EXECUTE FUNCTION protect_huiteacher_field_consensus();

CREATE OR REPLACE FUNCTION protect_huiteacher_consensus_sources() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION 'Consensus evidence citations are immutable' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM "huiteacher_field_consensuses" parent
    WHERE parent."id"=NEW."consensus_id" AND parent."organization_id"=NEW."organization_id"
      AND parent."event_id"=NEW."event_id" AND parent."status"='DRAFT'
  ) THEN
    RAISE EXCEPTION 'Consensus citations require an open draft' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_field_consensus_source_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "huiteacher_field_consensus_sources"
  FOR EACH ROW EXECUTE FUNCTION protect_huiteacher_consensus_sources();
