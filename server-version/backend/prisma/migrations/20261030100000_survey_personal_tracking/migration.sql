-- Additive, no rewriting of historical publications or FINALs.
ALTER TABLE survey_projects ADD COLUMN longitudinal_plan JSONB;
ALTER TABLE survey_participants ADD COLUMN longitudinal_snapshots JSONB NOT NULL DEFAULT '{}';
ALTER TABLE survey_projects ADD CONSTRAINT survey_personal_plan_object CHECK(longitudinal_plan IS NULL OR jsonb_typeof(longitudinal_plan)='object');
ALTER TABLE survey_participants ADD CONSTRAINT survey_personal_snapshots_object CHECK(jsonb_typeof(longitudinal_snapshots)='object');

ALTER TABLE survey_waves ADD COLUMN longitudinal_source_wave_id TEXT;
