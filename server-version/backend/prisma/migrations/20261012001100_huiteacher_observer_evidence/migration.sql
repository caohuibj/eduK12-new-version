-- PR4: expert/peer scope is an event grant, NOT school membership or
-- Huischool psychology access. All evidence bodies are encrypted at rest.
CREATE TABLE "huiteacher_observer_grants" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "observer_user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "invited_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "revision" INTEGER NOT NULL DEFAULT 1,
  UNIQUE ("organization_id","event_id","observer_user_id"),
  FOREIGN KEY ("organization_id","event_id") REFERENCES
    "huiteacher_evaluation_events"("organization_id","id") ON DELETE RESTRICT,
  FOREIGN KEY ("observer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CHECK ("role" IN ('EXPERT','PEER')),
  CHECK ("revision">=1),
  CHECK ("expires_at">"created_at"),
  CHECK (
    ("status"='INVITED' AND "accepted_at" IS NULL AND "revoked_at" IS NULL)
    OR ("status"='ACCEPTED' AND "accepted_at" IS NOT NULL AND "revoked_at" IS NULL)
    OR ("status"='REVOKED' AND "revoked_at" IS NOT NULL)
  )
);
CREATE INDEX "huiteacher_observer_grants_user_idx" ON "huiteacher_observer_grants"
  ("observer_user_id","status","expires_at");

CREATE TABLE "huiteacher_observation_records" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "observer_user_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "body_cipher" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "submitted_at" TIMESTAMPTZ(6),
  FOREIGN KEY ("organization_id","event_id") REFERENCES
    "huiteacher_evaluation_events"("organization_id","id") ON DELETE RESTRICT,
  FOREIGN KEY ("observer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CHECK ("kind" IN ('FACT','FORMAL_FEEDBACK','PRIVATE_REFLECTION')),
  CHECK ("revision">=1),
  CHECK (("status"='DRAFT' AND "submitted_at" IS NULL)
    OR ("status"='SUBMITTED' AND "submitted_at" IS NOT NULL)),
  CHECK (length("body_cipher")>20)
);
CREATE INDEX "huiteacher_observation_records_event_idx"
  ON "huiteacher_observation_records"("organization_id","event_id","status","kind");
CREATE INDEX "huiteacher_observation_records_observer_idx"
  ON "huiteacher_observation_records"("observer_user_id","created_at" DESC);

CREATE OR REPLACE FUNCTION guard_huiteacher_observation_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM "huiteacher_evaluation_events" event
  JOIN "education_product_entitlements" entitlement
    ON entitlement."organization_id"=event."organization_id"
    AND entitlement."product"='HUITEACHER' AND entitlement."status"='ACTIVE'
  JOIN "organizations" org ON org."id"=event."organization_id"
    AND org."status"='ACTIVE' AND org."product_domain"='SCHOOL'
  WHERE event."organization_id"=NEW."organization_id"
    AND event."id"=NEW."event_id" AND event."status"='OPEN'
    AND event."kind" IN ('CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT')
 ) THEN
  RAISE EXCEPTION 'Observation records require open Teacher field event'
    USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_observation_records_insert_guard"
 BEFORE INSERT ON "huiteacher_observation_records"
 FOR EACH ROW EXECUTE FUNCTION guard_huiteacher_observation_insert();

-- A submitted observation is an immutable evidentiary record. Its author,
-- event, kind and organization cannot be moved even while it is a draft.
ALTER TABLE "huiteacher_observation_records" ADD CONSTRAINT "huiteacher_cipher_format_check"
  CHECK ("body_cipher" ~ '^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$');
CREATE OR REPLACE FUNCTION protect_huiteacher_observation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Observation records cannot be deleted'
      USING ERRCODE='23514';
  END IF;
  IF OLD."status"='SUBMITTED' THEN
    RAISE EXCEPTION 'Submitted observation records are immutable'
      USING ERRCODE='23514';
  END IF;
  IF NEW."id"<>OLD."id"
     OR NEW."organization_id"<>OLD."organization_id"
     OR NEW."event_id"<>OLD."event_id"
     OR NEW."observer_user_id"<>OLD."observer_user_id"
     OR NEW."kind"<>OLD."kind"
     OR NEW."created_at"<>OLD."created_at" THEN
    RAISE EXCEPTION 'Observation ownership and provenance cannot change'
      USING ERRCODE='23514';
  END IF;
  IF NEW."revision"<>OLD."revision"+1 THEN
    RAISE EXCEPTION 'Observation revision must advance exactly once'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_observation_record_immutable"
  BEFORE UPDATE OR DELETE ON "huiteacher_observation_records"
  FOR EACH ROW EXECUTE FUNCTION protect_huiteacher_observation();
