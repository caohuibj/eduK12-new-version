-- PR6: one immutable follow-up evaluation link per improvement action.
-- Separate table avoids rewriting the protected, completed action itself.
-- No student-level response or reporting score is copied here.
CREATE TABLE "huiteacher_improvement_reassessments"(
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "action_id" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "reviewed_by_user_id" TEXT NOT NULL,
  "feedback_cipher" TEXT NOT NULL,
  "feedback_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "huiteacher_improvement_reassessments_pkey" PRIMARY KEY("id"),
  CONSTRAINT "huiteacher_improvement_reassessments_action_key"
    UNIQUE("organization_id","action_id"),
  CONSTRAINT "huiteacher_improvement_reassessments_org_id_key"
    UNIQUE("organization_id","id"),
  CONSTRAINT "huiteacher_improvement_reassessments_action_fkey"
    FOREIGN KEY ("organization_id","action_id")
    REFERENCES "huiteacher_improvement_actions"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_improvement_reassessments_target_fkey"
    FOREIGN KEY ("organization_id","target_id")
    REFERENCES "huiteacher_evaluation_targets"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_improvement_reassessments_event_fkey"
    FOREIGN KEY ("organization_id","event_id")
    REFERENCES "huiteacher_evaluation_events"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_improvement_reassessments_reviewer_fkey"
    FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_improvement_reassessments_hash_check"
    CHECK("feedback_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "huiteacher_improvement_reassessments_cipher_check"
    CHECK("feedback_cipher" ~ '^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$')
);
CREATE INDEX "huiteacher_improvement_reassessments_target_idx"
  ON "huiteacher_improvement_reassessments"
  ("organization_id","target_id","created_at" DESC);

-- DB authorization of provenance is independent of API routing.
CREATE OR REPLACE FUNCTION guard_huiteacher_improvement_reassessment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'Improvement reassessment evidence is immutable'
    USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(
  SELECT 1
  FROM "huiteacher_improvement_actions" action
  JOIN "huiteacher_evaluation_events" event
    ON event."organization_id"=action."organization_id"
    AND event."id"=NEW."event_id"
    AND event."target_id"=action."target_id"
    AND event."status"='CLOSED'
    AND event."closed_at">action."completed_at"
  WHERE action."organization_id"=NEW."organization_id"
    AND action."id"=NEW."action_id"
    AND action."target_id"=NEW."target_id"
    AND action."status"='COMPLETED'
    AND action."source_event_id" IS DISTINCT FROM NEW."event_id"
    AND (
      EXISTS(
        SELECT 1 FROM "huiteacher_evaluation_run_links" link
        JOIN "assessment_runs" run
          ON run."organization_id"=link."organization_id"
          AND run."id"=link."run_id" AND run."status"='CLOSED'
        JOIN "assessment_run_executions" execution
          ON execution."organization_id"=run."organization_id"
          AND execution."run_id"=run."id" AND execution."status"='COMPLETED'
        WHERE link."organization_id"=event."organization_id"
          AND link."event_id"=event."id"
      )
      OR EXISTS(
        SELECT 1 FROM "huiteacher_observation_records" record
        WHERE record."organization_id"=event."organization_id"
          AND record."event_id"=event."id"
          AND record."status"='SUBMITTED'
          AND record."kind" IN ('FACT','FORMAL_FEEDBACK')
      )
    )
 ) THEN
  RAISE EXCEPTION 'Follow-up must reference a later closed Teacher evaluation with formally submitted evidence for the same target'
    USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_improvement_reassessment_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "huiteacher_improvement_reassessments"
  FOR EACH ROW EXECUTE FUNCTION guard_huiteacher_improvement_reassessment();
