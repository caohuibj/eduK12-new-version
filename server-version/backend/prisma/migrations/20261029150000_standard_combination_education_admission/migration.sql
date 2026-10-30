-- Extend only exact standard-combination entry approval. No use grants are
-- created, inferred, upgraded or withdrawn, and existing two-entry rows remain.
ALTER TABLE survey_tool_policies DROP CONSTRAINT tool_policy_product;
ALTER TABLE survey_tool_policies ADD CONSTRAINT tool_policy_product CHECK (
 product IN ('TRAINING','SURVEY') OR
 product IN ('SCHOOL','TEACHER') AND
 resource_key ~ '^standard-release:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
);
