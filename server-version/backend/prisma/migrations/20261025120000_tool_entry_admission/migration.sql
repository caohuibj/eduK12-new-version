-- An entry is part of an exact admission identity, not a new version store.
-- Existing explicit Survey decisions keep their scope. Never infer Training
-- admission from ONLINE, publication, or a global administrator role.
ALTER TABLE survey_tool_policies ADD COLUMN product text NOT NULL DEFAULT 'SURVEY';
ALTER TABLE survey_tool_policies ADD CONSTRAINT tool_policy_product CHECK(product IN ('TRAINING','SURVEY'));
ALTER TABLE survey_tool_policies DROP CONSTRAINT survey_tool_policies_pkey;
ALTER TABLE survey_tool_policies ADD PRIMARY KEY(product,resource_key,fingerprint);
