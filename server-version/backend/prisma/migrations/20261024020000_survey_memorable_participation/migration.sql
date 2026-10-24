-- Additive: existing projects and participants retain their original link mode.
ALTER TABLE survey_projects
 ADD COLUMN participant_identity_mode TEXT NOT NULL DEFAULT 'PERSONAL_LINK',
 ADD COLUMN participant_code_label TEXT NOT NULL DEFAULT '报名序号',
 ADD COLUMN participant_code_instructions TEXT NOT NULL DEFAULT '请输入研究者分配给你的编号。',
 ADD CONSTRAINT survey_participant_identity_mode_check CHECK (
 participant_identity_mode IN ('PERSONAL_LINK','MEMORABLE_CODE') AND
 (collection_mode='LINKED_WAVES' OR participant_identity_mode='PERSONAL_LINK'));
CREATE TABLE survey_participant_codes (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES survey_projects(id) ON DELETE RESTRICT,
 prefix TEXT NOT NULL CHECK(prefix ~ '^[A-Z0-9一-龥]{1,20}$'),
 participant_id TEXT UNIQUE,
 credential_version INTEGER NOT NULL DEFAULT 0 CHECK(credential_version>=0),
 reset_hash TEXT,
 reset_expires_at TIMESTAMPTZ,
 previous_credential_hash TEXT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT survey_participant_codes_participant_id_project_id_key UNIQUE(participant_id,project_id),
 CONSTRAINT survey_participant_codes_project_id_prefix_key UNIQUE(project_id,prefix),
 CONSTRAINT survey_participant_codes_participant_project_fk FOREIGN KEY(participant_id,project_id)
 REFERENCES survey_participants(id,project_id) ON DELETE RESTRICT,
 CONSTRAINT survey_participant_codes_reset_check CHECK ((reset_hash IS NULL)=(reset_expires_at IS NULL))
);
CREATE FUNCTION survey_guard_identity_mode() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.first_published_at IS NOT NULL AND
 (NEW.participant_identity_mode IS DISTINCT FROM OLD.participant_identity_mode OR
  NEW.participant_code_label IS DISTINCT FROM OLD.participant_code_label OR
  NEW.participant_code_instructions IS DISTINCT FROM OLD.participant_code_instructions) THEN
  RAISE EXCEPTION 'Participant entry mode is fixed after first publication';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER survey_guard_identity_mode BEFORE UPDATE ON survey_projects
 FOR EACH ROW EXECUTE FUNCTION survey_guard_identity_mode();
