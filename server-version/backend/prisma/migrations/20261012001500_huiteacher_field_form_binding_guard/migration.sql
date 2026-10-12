-- Additional DB-level integrity for PR4 Form attachment.
-- A field evaluation must freeze an already released Huiteacher Form while
-- the target event is still a draft. No SQL caller may rebind the version.
CREATE OR REPLACE FUNCTION guard_teacher_field_form_binding()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('DELETE','UPDATE') THEN
  RAISE EXCEPTION 'Field Form binding is immutable' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(
  SELECT 1
  FROM "huiteacher_evaluation_events" event
  JOIN "huiteacher_form_instruments" form
    ON form."organization_id"=event."organization_id"
    AND form."id"=NEW."form_id"
    AND form."status"='PUBLISHED'
    AND form."definition_digest"=NEW."definition_digest"
  JOIN "education_product_entitlements" e
    ON e."organization_id"=event."organization_id"
    AND e."product"='HUITEACHER' AND e."status"='ACTIVE'
  JOIN "organizations" org
    ON org."id"=event."organization_id"
    AND org."product_domain"='SCHOOL' AND org."status"='ACTIVE'
  WHERE event."organization_id"=NEW."organization_id"
    AND event."id"=NEW."event_id" AND event."status"='DRAFT'
    AND event."kind" IN ('CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT')
 ) THEN
  RAISE EXCEPTION 'Field Form requires released same-school form and draft field event'
    USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_field_form_binding_guard"
 BEFORE INSERT OR UPDATE OR DELETE ON "huiteacher_field_event_forms"
 FOR EACH ROW EXECUTE FUNCTION guard_teacher_field_form_binding();
