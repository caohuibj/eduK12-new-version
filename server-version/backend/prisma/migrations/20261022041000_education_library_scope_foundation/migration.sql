-- Additive scope foundation only. No historical grants are widened or deleted.
ALTER TABLE scale_library_use_grants
  ADD COLUMN scope_kind text NOT NULL DEFAULT 'USER',
  ADD COLUMN organization_id text REFERENCES organizations(id) ON DELETE RESTRICT,
  ALTER COLUMN user_id DROP NOT NULL,
  DROP CONSTRAINT scale_library_use_grants_product_check;
ALTER TABLE scale_library_use_grants
  ADD CONSTRAINT scale_library_use_grants_product_check CHECK (product IN ('TRAINING','SURVEY','SCHOOL','TEACHER')),
  ADD CONSTRAINT scale_library_use_grants_scope_check CHECK (
    (product IN ('TRAINING','SURVEY') AND scope_kind='USER' AND user_id IS NOT NULL AND organization_id IS NULL)
    OR (product IN ('SCHOOL','TEACHER') AND organization_id IS NOT NULL
      AND material_grant_id IS NULL AND survey_tool_grant_id IS NULL
      AND ((scope_kind='USER' AND user_id IS NOT NULL) OR (scope_kind='ORGANIZATION' AND user_id IS NULL)))
  );
DROP INDEX scale_library_use_grant_active;
CREATE UNIQUE INDEX scale_library_use_grant_active ON scale_library_use_grants(entry_id,user_id,product)
  WHERE status='ACTIVE' AND product IN ('TRAINING','SURVEY');
CREATE UNIQUE INDEX scale_library_education_user_grant_active ON scale_library_use_grants(entry_id,product,organization_id,user_id)
  WHERE status='ACTIVE' AND product IN ('SCHOOL','TEACHER') AND scope_kind='USER';
CREATE UNIQUE INDEX scale_library_education_org_grant_active ON scale_library_use_grants(entry_id,product,organization_id)
  WHERE status='ACTIVE' AND product IN ('SCHOOL','TEACHER') AND scope_kind='ORGANIZATION';
-- USER and ORGANIZATION grants may coexist; revoking one does not revoke the other.
CREATE OR REPLACE FUNCTION protect_scale_library_facts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Scale library history is retained'; END IF;
 IF TG_TABLE_NAME IN ('scale_library_events','scale_library_emergency_stops','scale_library_media') THEN RAISE EXCEPTION 'Scale library events are append only'; END IF;
 -- Dispatch before referencing table-specific record fields. SQL AND does not
 -- protect heterogeneous NEW/OLD records from field resolution in PostgreSQL.
 IF TG_TABLE_NAME='scale_library_submissions' THEN
  IF (NEW.id,NEW.release_id,NEW.product,NEW.source_id,NEW.author_id,NEW.metadata,NEW.dependency_release_ids,NEW.snapshot,NEW.snapshot_hash,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.release_id,OLD.product,OLD.source_id,OLD.author_id,OLD.metadata,OLD.dependency_release_ids,OLD.snapshot,OLD.snapshot_hash,OLD.created_at)
  THEN RAISE EXCEPTION 'Submitted release and metadata are immutable'; END IF;
 ELSIF TG_TABLE_NAME='scale_library_entries' THEN
  IF (NEW.id,NEW.submission_id,NEW.release_id,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.submission_id,OLD.release_id,OLD.created_at)
  THEN RAISE EXCEPTION 'Approved entry identity is immutable'; END IF;
 ELSIF TG_TABLE_NAME='scale_library_use_grants' THEN
  IF (NEW.id,NEW.entry_id,NEW.user_id,NEW.scope_kind,NEW.organization_id,NEW.product,NEW.issuer_id,NEW.authority_grant_id,NEW.material_grant_id,NEW.survey_tool_grant_id,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.entry_id,OLD.user_id,OLD.scope_kind,OLD.organization_id,OLD.product,OLD.issuer_id,OLD.authority_grant_id,OLD.material_grant_id,OLD.survey_tool_grant_id,OLD.created_at)
  THEN RAISE EXCEPTION 'Use grant scope is immutable'; END IF;
 ELSE
  RAISE EXCEPTION 'Unsupported scale library history table';
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Scale library transition version must advance once'; END IF;
  IF TG_TABLE_NAME='scale_library_submissions' AND NOT (OLD.status='SUBMITTED' AND NEW.status IN ('WITHDRAWN','RETURNED','APPROVED')) THEN RAISE EXCEPTION 'Invalid application transition'; END IF;
  IF TG_TABLE_NAME='scale_library_entries' AND NOT (OLD.status='ACTIVE' AND NEW.status IN ('WITHDRAWN','EMERGENCY_DISABLED') OR OLD.status='WITHDRAWN' AND NEW.status='EMERGENCY_DISABLED') THEN RAISE EXCEPTION 'Invalid entry transition'; END IF;
  IF TG_TABLE_NAME='scale_library_use_grants' AND NOT (OLD.status='ACTIVE' AND NEW.status='REVOKED') THEN RAISE EXCEPTION 'Invalid use transition'; END IF;
 END IF;
 RETURN NEW;
END $$;
