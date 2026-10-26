-- TIMESTAMP(3) grant windows store UTC; keep every existing guard unchanged.
CREATE OR REPLACE FUNCTION guard_content_capability_grant() RETURNS trigger LANGUAGE plpgsql AS $$
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
      OR parent.valid_from > (clock_timestamp() AT TIME ZONE 'UTC') OR parent.expires_at <= (clock_timestamp() AT TIME ZONE 'UTC')
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
