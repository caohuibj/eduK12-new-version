-- Administrative ceiling per exact released measurement-tool version.
CREATE TABLE parent_tool_disclosure_policies (
  resource_family text NOT NULL CHECK (resource_family IN ('SCALE','FORM','BUNDLE','COGNITIVE','SITUATIONAL')),
  resource_key text NOT NULL,
  resource_version text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  policy jsonb NOT NULL,
  policy_hash text NOT NULL CHECK (policy_hash ~ '^[0-9a-f]{64}$'),
  configured_by_user_id text NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY(resource_family,resource_key,resource_version),
  CHECK (policy->>'mode' IN ('NONE','COMPLETION_ONLY','INDIVIDUAL_SUMMARY')),
  CHECK (jsonb_typeof(policy->'metricKeys')='array'),
  CHECK (jsonb_typeof(policy->'longitudinalMetricKeys')='array')
);
CREATE TABLE parent_tool_disclosure_policy_events (
  id text PRIMARY KEY,
  resource_family text NOT NULL,
  resource_key text NOT NULL,
  resource_version text NOT NULL,
  actor_user_id text NOT NULL REFERENCES users(id),
  command_key text NOT NULL,
  request_hash text NOT NULL,
  previous_version integer NOT NULL,
  version integer NOT NULL,
  previous_policy jsonb,
  policy jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE(actor_user_id,command_key)
);
CREATE FUNCTION reject_parent_tool_policy_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'parent tool policy events are append-only'; END;
$$;
CREATE TRIGGER immutable_parent_tool_policy_events BEFORE UPDATE OR DELETE ON parent_tool_disclosure_policy_events FOR EACH ROW EXECUTE FUNCTION reject_parent_tool_policy_event_mutation();
