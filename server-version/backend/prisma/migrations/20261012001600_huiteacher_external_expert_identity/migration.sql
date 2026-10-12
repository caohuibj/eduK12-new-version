-- PR4: external experts can use the shared education User without
-- becoming a Huischool teacher/member. A one-use code grants only ONE
-- Huiteacher field event and never creates a psychology authorization.
CREATE TABLE "huiteacher_external_expert_invites" (
 "id" TEXT PRIMARY KEY,
 "organization_id" TEXT NOT NULL,
 "event_id" TEXT NOT NULL,
 "token_hash" TEXT NOT NULL UNIQUE,
 "issued_by_user_id" TEXT NOT NULL,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 "expires_at" TIMESTAMPTZ(6) NOT NULL,
 "consumed_at" TIMESTAMPTZ(6),
 "consumed_by_user_id" TEXT,
 "revoked_at" TIMESTAMPTZ(6),
 CONSTRAINT "huiteacher_expert_invite_event_fk"
  FOREIGN KEY ("organization_id","event_id")
    REFERENCES "huiteacher_evaluation_events"("organization_id","id") ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_expert_invite_issuer_fk"
  FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_expert_invite_consumer_fk"
  FOREIGN KEY ("consumed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_expert_invite_expiration"
  CHECK ("expires_at">"created_at"),
 CONSTRAINT "huiteacher_expert_invite_claim_pair"
  CHECK (("consumed_at" IS NULL)=("consumed_by_user_id" IS NULL))
);
CREATE INDEX "huiteacher_external_expert_invites_event"
 ON "huiteacher_external_expert_invites"("organization_id","event_id","expires_at");
CREATE OR REPLACE FUNCTION guard_huiteacher_expert_invite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Expert invitation history cannot be deleted'
     USING ERRCODE='23514';
 END IF;
 IF OLD."consumed_at" IS NOT NULL THEN
   RAISE EXCEPTION 'Consumed expert invitations cannot be modified'
     USING ERRCODE='23514';
 END IF;
 IF NEW."id"<>OLD."id" OR NEW."organization_id"<>OLD."organization_id"
    OR NEW."event_id"<>OLD."event_id" OR NEW."token_hash"<>OLD."token_hash"
    OR NEW."issued_by_user_id"<>OLD."issued_by_user_id"
    OR NEW."created_at"<>OLD."created_at" OR NEW."expires_at"<>OLD."expires_at" THEN
   RAISE EXCEPTION 'Expert invitation provenance is immutable'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_expert_invitation_immutable"
 BEFORE UPDATE OR DELETE ON "huiteacher_external_expert_invites"
 FOR EACH ROW EXECUTE FUNCTION guard_huiteacher_expert_invite();
