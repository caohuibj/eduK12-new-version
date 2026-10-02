-- Immutable PARENT publication alongside the original report. No source edits/backfill/grants.
CREATE TABLE parent_report_publications (
 id text PRIMARY KEY,
 source_artifact_id text NOT NULL,
 organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 subject_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
 template_key text NOT NULL,
 template_version text NOT NULL,
 template_hash text NOT NULL CHECK (template_hash ~ '^[0-9a-f]{64}$'),
 projection_payload jsonb NOT NULL,
 projection_hash text NOT NULL CHECK (projection_hash ~ '^[0-9a-f]{64}$'),
 publication_payload jsonb NOT NULL,
 publication_hash text NOT NULL CHECK (publication_hash ~ '^[0-9a-f]{64}$'),
 published_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 published_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 command_key text NOT NULL,
 request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 UNIQUE(published_by_user_id,command_key),
 UNIQUE(id,source_artifact_id,source_hash,publication_hash),
 UNIQUE(id,source_artifact_id),
 FOREIGN KEY(source_artifact_id,organization_id,source_hash) REFERENCES reporting_analysis_artifacts(id,organization_id,snapshot_hash) ON DELETE RESTRICT
);
CREATE TABLE parent_report_publication_heads (
 source_artifact_id text PRIMARY KEY REFERENCES reporting_analysis_artifacts(id) ON DELETE RESTRICT,
 publication_id text NOT NULL,
 version integer NOT NULL CHECK(version>0),
 revoked_at timestamptz,
 FOREIGN KEY(publication_id,source_artifact_id) REFERENCES parent_report_publications(id,source_artifact_id) ON DELETE RESTRICT
);
ALTER TABLE parent_report_consents ADD COLUMN publication_id text, ADD COLUMN publication_hash text;
ALTER TABLE parent_report_consents ADD CONSTRAINT parent_consent_publication_pair CHECK ((publication_id IS NULL)=(publication_hash IS NULL));
ALTER TABLE parent_report_consents ADD CONSTRAINT parent_consent_publication_binding FOREIGN KEY(publication_id,source_artifact_id,source_hash,publication_hash) REFERENCES parent_report_publications(id,source_artifact_id,source_hash,publication_hash) ON DELETE RESTRICT;
ALTER TABLE parent_report_consents ADD CONSTRAINT parent_consent_publication_tuple UNIQUE(id,publication_id,publication_hash);
ALTER TABLE parent_report_disclosure_grants ADD COLUMN publication_id text, ADD COLUMN publication_hash text;
ALTER TABLE parent_report_disclosure_grants ADD CONSTRAINT parent_grant_publication_pair CHECK ((publication_id IS NULL)=(publication_hash IS NULL));
ALTER TABLE parent_report_disclosure_grants ADD CONSTRAINT parent_grant_publication_binding FOREIGN KEY(publication_id,source_artifact_id,source_hash,publication_hash) REFERENCES parent_report_publications(id,source_artifact_id,source_hash,publication_hash) ON DELETE RESTRICT;
ALTER TABLE parent_report_disclosure_grants ADD CONSTRAINT parent_grant_publication_consent FOREIGN KEY(consent_id,publication_id,publication_hash) REFERENCES parent_report_consents(id,publication_id,publication_hash) ON DELETE RESTRICT;
CREATE FUNCTION parent_publication_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'parent publication evidence is immutable'; END $$;
CREATE TRIGGER parent_publication_immutable BEFORE UPDATE OR DELETE ON parent_report_publications FOR EACH ROW EXECUTE FUNCTION parent_publication_immutable();
CREATE TRIGGER parent_publication_head_no_delete BEFORE DELETE ON parent_report_publication_heads FOR EACH ROW EXECUTE FUNCTION parent_publication_immutable();
