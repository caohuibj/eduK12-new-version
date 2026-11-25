-- Historical used_count is retained. New unlimited claims spread over 64 rows;
-- finite claims serialize only their final quota check and include shard totals.
CREATE TABLE composite_access_token_usage_shards (
 token_id TEXT NOT NULL REFERENCES composite_assessment_access_tokens(id) ON DELETE CASCADE,
 shard SMALLINT NOT NULL CHECK(shard>=0 AND shard<64),
 used_count BIGINT NOT NULL CHECK(used_count>0),
 PRIMARY KEY(token_id,shard)
);
CREATE FUNCTION guard_composite_token_usage_shard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE live composite_assessment_access_tokens;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM composite_assessment_access_tokens WHERE id=OLD.token_id) THEN
   RAISE EXCEPTION 'Public usage cannot be removed from a live token';
  END IF;
  RETURN OLD;
 END IF;
 SELECT * INTO live FROM composite_assessment_access_tokens WHERE id=NEW.token_id FOR SHARE;
 IF NOT FOUND OR NOT live.is_active OR live.max_uses<>0 OR live.expires_at<=(clock_timestamp() AT TIME ZONE 'UTC') THEN
  RAISE EXCEPTION 'Public token is no longer eligible for an unlimited claim' USING ERRCODE='23514';
 END IF;
 IF (TG_OP='INSERT' AND NEW.used_count<>1) OR (TG_OP='UPDATE' AND (
  NEW.token_id IS DISTINCT FROM OLD.token_id OR NEW.shard IS DISTINCT FROM OLD.shard OR NEW.used_count<>OLD.used_count+1)) THEN
  RAISE EXCEPTION 'Public token usage must advance exactly once';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_composite_token_usage_shard BEFORE INSERT OR UPDATE OR DELETE ON composite_access_token_usage_shards
 FOR EACH ROW EXECUTE FUNCTION guard_composite_token_usage_shard();
-- Keep older binaries fail-closed if a formerly unlimited token becomes finite.
CREATE FUNCTION guard_composite_token_total_quota() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.used_count>OLD.used_count AND NEW.max_uses>0 AND NEW.used_count+COALESCE(
  (SELECT SUM(used_count) FROM composite_access_token_usage_shards WHERE token_id=NEW.id),0)>NEW.max_uses THEN
  RAISE EXCEPTION 'Public token quota exhausted' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_composite_token_total_quota BEFORE UPDATE OF used_count ON composite_assessment_access_tokens
 FOR EACH ROW EXECUTE FUNCTION guard_composite_token_total_quota();
