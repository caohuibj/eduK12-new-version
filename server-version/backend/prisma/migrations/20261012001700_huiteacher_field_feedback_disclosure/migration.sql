-- PR4 explicit release to evaluated TEACHER only; no implicit access from
-- shared School membership, School psychology roles, or a view of all notes.
CREATE TABLE "huiteacher_field_feedback_releases" (
 "id" TEXT PRIMARY KEY,
 "organization_id" TEXT NOT NULL,
 "event_id" TEXT NOT NULL,
 "recipient_user_id" TEXT NOT NULL,
 "note_id" TEXT,
 "consensus_id" TEXT,
 "released_by_user_id" TEXT NOT NULL,
 "released_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 CONSTRAINT "huiteacher_feedback_release_event_fk"
   FOREIGN KEY("organization_id","event_id")
   REFERENCES "huiteacher_evaluation_events"("organization_id","id") ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_feedback_release_note_fk"
   FOREIGN KEY("organization_id","event_id","note_id")
   REFERENCES "huiteacher_observation_records"("organization_id","event_id","id") ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_feedback_release_consensus_fk"
   FOREIGN KEY("organization_id","event_id","consensus_id")
   REFERENCES "huiteacher_field_consensuses"("organization_id","event_id","id") ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_feedback_release_recipient_fk"
   FOREIGN KEY("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_feedback_release_manager_fk"
   FOREIGN KEY("released_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_feedback_release_exclusive"
   CHECK ((("note_id" IS NOT NULL)::int + ("consensus_id" IS NOT NULL)::int)=1)
);
CREATE UNIQUE INDEX "huiteacher_field_feedback_release_once_note"
 ON "huiteacher_field_feedback_releases"("note_id","recipient_user_id")
 WHERE "note_id" IS NOT NULL;
CREATE UNIQUE INDEX "huiteacher_field_feedback_release_once_consensus"
 ON "huiteacher_field_feedback_releases"("consensus_id","recipient_user_id")
 WHERE "consensus_id" IS NOT NULL;
CREATE INDEX "huiteacher_feedback_release_person_idx"
 ON "huiteacher_field_feedback_releases"("recipient_user_id","released_at" DESC);

CREATE OR REPLACE FUNCTION protect_huiteacher_feedback_release() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
   RAISE EXCEPTION 'Teacher feedback release is immutable'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_feedback_release_immutable"
 BEFORE UPDATE OR DELETE ON "huiteacher_field_feedback_releases"
 FOR EACH ROW EXECUTE FUNCTION protect_huiteacher_feedback_release();
