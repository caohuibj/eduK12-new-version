-- Permanent, bounded content rights on existing identities. No account/entry grants.
-- Root issuance has deliberately no HTTP/service entry point pending admin integration.
CREATE TABLE content_capability_grants (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  issuer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parent_grant_id TEXT REFERENCES content_capability_grants(id) ON DELETE RESTRICT,
  product TEXT NOT NULL CHECK (product IN ('TRAINING','SURVEY','SCHOOL','TEACHER')),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('PLATFORM','ORGANIZATION','PROJECT','COURSE')),
  scope_id TEXT NOT NULL CHECK (length(btrim(scope_id)) BETWEEN 1 AND 240),
  resource_kind TEXT NOT NULL CHECK (resource_kind IN ('measurement','reference','report','catalog','material')),
  resource_keys TEXT[] NOT NULL CHECK (cardinality(resource_keys) BETWEEN 1 AND 128),
  capabilities TEXT[] NOT NULL CHECK (cardinality(capabilities) BETWEEN 1 AND 11 AND capabilities <@ ARRAY[
    'measurement.edit','measurement.publish','reference.analyze','reference.review','reference.publish',
    'report.edit','report.publish','catalog.manage','material.use','material.adapt','material.distribute']::text[]),
  delegable_capabilities TEXT[] NOT NULL CHECK (delegable_capabilities <@ capabilities),
  remaining_delegation_depth INTEGER NOT NULL CHECK (remaining_delegation_depth BETWEEN 0 AND 1),
  valid_from TIMESTAMP(3) NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL CHECK (expires_at > valid_from),
  ancestry TEXT[] NOT NULL CHECK (cardinality(ancestry) BETWEEN 1 AND 2),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP(3),
  revoked_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  revoke_reason TEXT,
  CHECK (remaining_delegation_depth > 0 OR cardinality(delegable_capabilities) = 0),
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL) OR
    (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_reason IS NOT NULL AND length(btrim(revoke_reason)) BETWEEN 1 AND 1000))
);
CREATE INDEX content_capability_grants_subject_scope_idx ON content_capability_grants
  (subject_id, product, scope_kind, scope_id, resource_kind);
CREATE INDEX content_capability_grants_parent_idx ON content_capability_grants(parent_grant_id);

CREATE FUNCTION guard_content_capability_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent content_capability_grants%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'content grants are retained; revoke instead';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['revoked_at','revoked_by','revoke_reason','version']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['revoked_at','revoked_by','revoke_reason','version']) OR
       OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'content grant is immutable except one versioned revocation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.version <> 1 OR NEW.revoked_at IS NOT NULL OR NEW.revoked_by IS NOT NULL OR NEW.revoke_reason IS NOT NULL
    OR (cardinality(NEW.delegable_capabilities) > 0 AND array_ndims(NEW.delegable_capabilities) <> 1)
    OR array_ndims(NEW.resource_keys) <> 1 OR array_ndims(NEW.capabilities) <> 1 OR array_ndims(NEW.ancestry) <> 1
    OR array_position(NEW.resource_keys,NULL) IS NOT NULL OR array_position(NEW.capabilities,NULL) IS NOT NULL
    OR array_position(NEW.delegable_capabilities,NULL) IS NOT NULL OR array_position(NEW.ancestry,NULL) IS NOT NULL
    OR cardinality(NEW.resource_keys) <> (SELECT count(DISTINCT v) FROM unnest(NEW.resource_keys) v)
    OR cardinality(NEW.capabilities) <> (SELECT count(DISTINCT v) FROM unnest(NEW.capabilities) v)
    OR cardinality(NEW.delegable_capabilities) <> (SELECT count(DISTINCT v) FROM unnest(NEW.delegable_capabilities) v)
    OR EXISTS (SELECT 1 FROM unnest(NEW.resource_keys) v WHERE v <> btrim(v) OR length(v) NOT BETWEEN 1 AND 240)
    OR EXISTS (SELECT 1 FROM unnest(NEW.capabilities) v WHERE split_part(v,'.',1) <> NEW.resource_kind) THEN
    RAISE EXCEPTION 'invalid content grant contract';
  END IF;
  IF NEW.parent_grant_id IS NULL THEN
    IF NEW.ancestry <> ARRAY[NEW.id] THEN RAISE EXCEPTION 'invalid root grant path'; END IF;
  ELSE
    SELECT * INTO parent FROM content_capability_grants WHERE id=NEW.parent_grant_id FOR SHARE;
    IF NOT FOUND OR parent.subject_id <> NEW.issuer_id OR parent.revoked_at IS NOT NULL
      OR parent.valid_from > clock_timestamp() OR parent.expires_at <= clock_timestamp()
      OR parent.remaining_delegation_depth < 1 OR NEW.remaining_delegation_depth >= parent.remaining_delegation_depth
      OR NOT (NEW.capabilities <@ parent.delegable_capabilities)
      OR NOT (NEW.delegable_capabilities <@ parent.delegable_capabilities)
      OR NEW.product <> parent.product OR NEW.scope_kind <> parent.scope_kind OR NEW.scope_id <> parent.scope_id
      OR NEW.resource_kind <> parent.resource_kind OR NOT (NEW.resource_keys <@ parent.resource_keys)
      OR NEW.valid_from < parent.valid_from OR NEW.expires_at > parent.expires_at
      OR NEW.ancestry <> parent.ancestry || NEW.id THEN
      RAISE EXCEPTION 'content delegation exceeds parent grant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER content_capability_grants_guard BEFORE INSERT OR UPDATE OR DELETE ON content_capability_grants
  FOR EACH ROW EXECUTE FUNCTION guard_content_capability_grant();
