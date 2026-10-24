-- Third entry mode: self-assigned secret is never revealed to the researcher.
ALTER TABLE survey_projects DROP CONSTRAINT survey_participant_identity_mode_check;
ALTER TABLE survey_projects ADD CONSTRAINT survey_participant_identity_mode_check CHECK (
 participant_identity_mode IN ('PERSONAL_LINK','MEMORABLE_CODE','SELF_CODE') AND
 (collection_mode='LINKED_WAVES' OR participant_identity_mode='PERSONAL_LINK'));
