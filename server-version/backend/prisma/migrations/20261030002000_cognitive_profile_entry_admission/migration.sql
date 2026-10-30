-- Education entry approval is still exact: an immutable standard combination
-- or a named profile of one exact config, with its content fingerprint.
ALTER TABLE survey_tool_policies DROP CONSTRAINT tool_policy_product;
ALTER TABLE survey_tool_policies ADD CONSTRAINT tool_policy_product CHECK (
 product IN ('TRAINING','SURVEY') OR product IN ('SCHOOL','TEACHER') AND (
  resource_key ~ '^standard-release:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  OR resource_key ~ '^cognitive-profile:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}:(experience|standard|research)$'
 )
);
CREATE INDEX cognitive_profile_approval_identity ON assessment_management_events(resource_id,((metadata->>'artifactHash')))
 WHERE action='COGNITIVE_PROFILE_APPROVED';
