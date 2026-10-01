CREATE TABLE scale_axis_snapshots (
  scale_id TEXT NOT NULL REFERENCES scales(id) ON DELETE RESTRICT,
  axis_hash TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  axes JSONB NOT NULL,
  source_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scale_id, axis_hash)
);
CREATE FUNCTION forbid_scale_axis_snapshot_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'SCALE_AXIS_SNAPSHOT_IMMUTABLE'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER scale_axis_snapshot_immutable BEFORE UPDATE OR DELETE ON scale_axis_snapshots FOR EACH ROW EXECUTE FUNCTION forbid_scale_axis_snapshot_mutation();
