-- PR4 observational Form evidence: not a second Assessment Run/FINAL
-- engine. This binds a released unscored Form V2 to one field event and
-- freezes the validated expert response with an immutable formal field note.
CREATE TABLE "huiteacher_field_event_forms" (
 "organization_id" TEXT NOT NULL,
 "event_id" TEXT NOT NULL,
 "form_id" TEXT NOT NULL,
 "definition_digest" TEXT NOT NULL,
 "assigned_by_user_id" TEXT NOT NULL,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 PRIMARY KEY ("organization_id","event_id"),
 CONSTRAINT "huiteacher_field_event_forms_exact_key"
   UNIQUE("organization_id","event_id","form_id"),
 CONSTRAINT "huiteacher_field_event_forms_event_fkey"
   FOREIGN KEY("organization_id","event_id")
     REFERENCES "huiteacher_evaluation_events"("organization_id","id") ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_field_event_forms_form_fkey"
   FOREIGN KEY("organization_id","form_id")
     REFERENCES "huiteacher_form_instruments"("organization_id","id") ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_field_event_forms_actor_fkey"
   FOREIGN KEY("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_field_event_forms_digest"
   CHECK ("definition_digest" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "huiteacher_field_form_evidence" (
 "id" TEXT PRIMARY KEY,
 "organization_id" TEXT NOT NULL,
 "event_id" TEXT NOT NULL,
 "record_id" TEXT NOT NULL UNIQUE,
 "form_id" TEXT NOT NULL,
 "definition_digest" TEXT NOT NULL,
 "answers_cipher" TEXT NOT NULL,
 "answers_hash" TEXT NOT NULL,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 CONSTRAINT "huiteacher_field_form_evidence_note"
   FOREIGN KEY("organization_id","event_id","record_id")
     REFERENCES "huiteacher_observation_records"("organization_id","event_id","id")
     ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_field_form_evidence_bound_form"
   FOREIGN KEY("organization_id","event_id","form_id")
     REFERENCES "huiteacher_field_event_forms"("organization_id","event_id","form_id")
     ON DELETE RESTRICT,
 CONSTRAINT "huiteacher_field_form_evidence_digest"
   CHECK ("definition_digest" ~ '^[a-f0-9]{64}$'
     AND "answers_hash" ~ '^[a-f0-9]{64}$'),
 CONSTRAINT "huiteacher_field_form_evidence_cipher"
   CHECK ("answers_cipher" ~ '^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$')
);
CREATE INDEX "huiteacher_field_form_evidence_scope"
 ON "huiteacher_field_form_evidence"("organization_id","event_id","form_id");
CREATE OR REPLACE FUNCTION protect_huiteacher_field_form_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
   RAISE EXCEPTION 'Field Form evidence cannot be changed'
     USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(
   SELECT 1 FROM "huiteacher_observation_records" note
   JOIN "huiteacher_field_event_forms" binding
     ON binding."organization_id"=note."organization_id"
     AND binding."event_id"=note."event_id"
     AND binding."form_id"=NEW."form_id"
     AND binding."definition_digest"=NEW."definition_digest"
   WHERE note."id"=NEW."record_id"
     AND note."organization_id"=NEW."organization_id"
     AND note."event_id"=NEW."event_id"
     AND note."kind"='FORMAL_FEEDBACK' AND note."status"='DRAFT'
 ) THEN
   RAISE EXCEPTION 'Only a draft formal note can receive exact Form evidence'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_field_form_evidence_guard"
 BEFORE INSERT OR UPDATE OR DELETE ON "huiteacher_field_form_evidence"
 FOR EACH ROW EXECUTE FUNCTION protect_huiteacher_field_form_evidence();
