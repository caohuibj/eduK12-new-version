-- Huiteacher PR6: optional lightweight improvement cycle on a stable
-- Teacher target, never a new questionnaire or School psychology data store.
-- Private growth notes are encrypted and excluded from organization reads.
CREATE TABLE "huiteacher_improvement_actions"(
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "source_event_id" TEXT,
  "owner_user_id" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "goal_cipher" TEXT NOT NULL,
  "goal_hash" TEXT NOT NULL,
  "plan_cipher" TEXT NOT NULL,
  "plan_hash" TEXT NOT NULL,
  "evidence_cipher" TEXT,
  "evidence_hash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "due_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "huiteacher_improvement_actions_pkey" PRIMARY KEY("id"),
  CONSTRAINT "huiteacher_improvement_actions_org_id_key" UNIQUE ("organization_id","id"),
  CONSTRAINT "huiteacher_improvement_actions_target_fkey"
    FOREIGN KEY ("organization_id","target_id")
    REFERENCES "huiteacher_evaluation_targets"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_improvement_actions_source_fkey"
    FOREIGN KEY ("organization_id","source_event_id")
    REFERENCES "huiteacher_evaluation_events"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_improvement_actions_owner_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_improvement_actions_audience_check"
    CHECK("audience" IN ('PRIVATE_PERSONAL','SCHOOL_SHARED')),
  CONSTRAINT "huiteacher_improvement_actions_status_check"
    CHECK("status" IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  CONSTRAINT "huiteacher_improvement_actions_version_check" CHECK("version">=1),
  CONSTRAINT "huiteacher_improvement_actions_completion_check"
    CHECK(("status"='COMPLETED')=("completed_at" IS NOT NULL)),
  CONSTRAINT "huiteacher_improvement_actions_cipher_check"
    CHECK(length("goal_cipher") BETWEEN 30 AND 30000
      AND length("plan_cipher") BETWEEN 30 AND 100000),
  CONSTRAINT "huiteacher_improvement_actions_evidence_check"
    CHECK(("evidence_cipher" IS NULL)=("evidence_hash" IS NULL)),
  CONSTRAINT "huiteacher_improvement_actions_hash_check"
    CHECK("goal_hash" ~ '^[a-f0-9]{64}$'
      AND "plan_hash" ~ '^[a-f0-9]{64}$'
      AND ("evidence_hash" IS NULL OR "evidence_hash" ~ '^[a-f0-9]{64}$'))
);
CREATE INDEX "huiteacher_improvement_actions_target_idx"
  ON "huiteacher_improvement_actions"
  ("organization_id","target_id","audience","created_at" DESC,"id" DESC);
CREATE INDEX "huiteacher_improvement_actions_owner_idx"
  ON "huiteacher_improvement_actions"("owner_user_id","audience","created_at" DESC);
CREATE OR REPLACE FUNCTION guard_huiteacher_improvement_action()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Improvement action history cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW."organization_id"<>OLD."organization_id"
    OR NEW."target_id"<>OLD."target_id"
    OR NEW."source_event_id" IS DISTINCT FROM OLD."source_event_id"
    OR NEW."owner_user_id"<>OLD."owner_user_id"
    OR NEW."audience"<>OLD."audience"
    OR NEW."goal_cipher"<>OLD."goal_cipher" OR NEW."goal_hash"<>OLD."goal_hash"
    OR NEW."plan_cipher"<>OLD."plan_cipher" OR NEW."plan_hash"<>OLD."plan_hash"
    OR NEW."created_at"<>OLD."created_at"
    OR NEW."version"<>OLD."version"+1 THEN
   RAISE EXCEPTION 'Improvement action identity/goal is immutable'
     USING ERRCODE='23514';
  END IF;
  IF OLD."status" IN ('COMPLETED','CANCELLED')
    OR (OLD."status"='PLANNED' AND NEW."status" NOT IN ('IN_PROGRESS','CANCELLED'))
    OR (OLD."status"='IN_PROGRESS' AND NEW."status" NOT IN ('COMPLETED','CANCELLED')) THEN
   RAISE EXCEPTION 'Invalid improvement action state change' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW."source_event_id" IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "huiteacher_evaluation_events" event
   WHERE event."id"=NEW."source_event_id"
     AND event."organization_id"=NEW."organization_id"
     AND event."target_id"=NEW."target_id" AND event."status"='CLOSED'
 ) THEN
   RAISE EXCEPTION 'Improvement action source must be a closed matching Teacher event'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_improvement_action_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "huiteacher_improvement_actions"
  FOR EACH ROW EXECUTE FUNCTION guard_huiteacher_improvement_action();
