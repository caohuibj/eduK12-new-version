-- PR6 C5: only a formal, closed Teacher event can be cited as an
-- improvement source. A student feedback event is never a substitute path
-- around its threshold/cross-wave ledger and remains ineligible for PR6
-- narrative reassessment until a separately reviewed policy is implemented.
CREATE OR REPLACE FUNCTION protect_huiteacher_improvement_sources()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."source_event_id" IS NOT NULL THEN
  IF NOT EXISTS(
    SELECT 1 FROM "huiteacher_evaluation_events" e
    WHERE e."organization_id"=NEW."organization_id"
      AND e."id"=NEW."source_event_id"
      AND e."target_id"=NEW."target_id" AND e."status"='CLOSED'
      AND NOT EXISTS(
        SELECT 1 FROM "huiteacher_student_eval_configs" student
        WHERE student."organization_id"=e."organization_id"
          AND student."event_id"=e."id"
      )
      AND (
        EXISTS(
          SELECT 1 FROM "huiteacher_evaluation_run_links" link
          JOIN "assessment_runs" run
            ON run."organization_id"=link."organization_id"
            AND run."id"=link."run_id" AND run."status"='CLOSED'
          JOIN "assessment_run_executions" execution
            ON execution."organization_id"=run."organization_id"
            AND execution."run_id"=run."id"
            AND execution."status"='COMPLETED'
          WHERE link."organization_id"=e."organization_id"
            AND link."event_id"=e."id"
        )
        OR EXISTS(
          SELECT 1 FROM "huiteacher_observation_records" note
          WHERE note."organization_id"=e."organization_id"
            AND note."event_id"=e."id"
            AND note."status"='SUBMITTED'
            AND note."kind" IN ('FACT','FORMAL_FEEDBACK')
        )
      )
  ) THEN
   RAISE EXCEPTION 'PR6 improvement source requires closed, formal, non-student Teacher evidence'
     USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_improvement_source_evidence_guard"
  BEFORE INSERT ON "huiteacher_improvement_actions"
  FOR EACH ROW EXECUTE FUNCTION protect_huiteacher_improvement_sources();

CREATE OR REPLACE FUNCTION protect_huiteacher_reassessment_source()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(
    SELECT 1 FROM "huiteacher_student_eval_configs" student
    WHERE student."organization_id"=NEW."organization_id"
      AND student."event_id"=NEW."event_id"
 ) THEN
   RAISE EXCEPTION 'PR6 reassessment cannot release student feedback'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_reassessment_no_student_source"
  BEFORE INSERT ON "huiteacher_improvement_reassessments"
  FOR EACH ROW EXECUTE FUNCTION protect_huiteacher_reassessment_source();
