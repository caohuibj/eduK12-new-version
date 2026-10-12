-- PR4 independent evaluators must explicitly approve the SAME exact
-- human-authored consensus revision. A manager cannot impersonate signers.
CREATE TABLE "huiteacher_field_consensus_approvals" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "consensus_id" TEXT NOT NULL,
  "observer_user_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "content_hash" TEXT NOT NULL,
  "approved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "huiteacher_field_consensus_approvals_scope"
    FOREIGN KEY ("organization_id","event_id","consensus_id")
    REFERENCES "huiteacher_field_consensuses"("organization_id","event_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_field_consensus_approvals_user"
    FOREIGN KEY ("observer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_field_consensus_approvals_once_revision"
    UNIQUE ("consensus_id","observer_user_id","revision"),
  CONSTRAINT "huiteacher_field_consensus_approvals_digest"
    CHECK ("content_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "huiteacher_field_consensus_approvals_revision"
    CHECK ("revision">=1)
);
CREATE INDEX "huiteacher_field_consensus_approvals_revision_idx"
  ON "huiteacher_field_consensus_approvals"("organization_id","event_id","consensus_id","revision");

CREATE OR REPLACE FUNCTION protect_huiteacher_consensus_approval() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION 'Independent consensus approvals are immutable'
      USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "huiteacher_field_consensuses" consensus
    WHERE consensus."id"=NEW."consensus_id"
      AND consensus."organization_id"=NEW."organization_id"
      AND consensus."event_id"=NEW."event_id"
      AND consensus."revision"=NEW."revision" AND consensus."status"='DRAFT'
  ) THEN
    RAISE EXCEPTION 'Consensus approval requires matching live draft revision'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_consensus_approval_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "huiteacher_field_consensus_approvals"
  FOR EACH ROW EXECUTE FUNCTION protect_huiteacher_consensus_approval();
