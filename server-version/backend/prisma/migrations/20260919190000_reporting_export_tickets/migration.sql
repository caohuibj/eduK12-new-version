CREATE TABLE reporting_export_tickets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  viewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  artifact_id TEXT REFERENCES reporting_analysis_artifacts(id) ON DELETE RESTRICT,
  safety_case_id TEXT REFERENCES safety_cases(id) ON DELETE RESTRICT,
  export_kind TEXT NOT NULL CHECK (export_kind IN ('AGGREGATE','MEMBER','SAFETY')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > issued_at),
  CHECK ((export_kind IN ('AGGREGATE','MEMBER') AND artifact_id IS NOT NULL AND safety_case_id IS NULL)
      OR (export_kind='SAFETY' AND artifact_id IS NULL AND safety_case_id IS NOT NULL))
);
CREATE INDEX reporting_export_tickets_viewer_idx ON reporting_export_tickets(organization_id, viewer_user_id, expires_at);
CREATE FUNCTION reporting_export_ticket_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'reporting export tickets are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER reporting_export_ticket_immutable_trigger BEFORE UPDATE ON reporting_export_tickets
FOR EACH ROW EXECUTE FUNCTION reporting_export_ticket_immutable();
