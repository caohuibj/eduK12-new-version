-- Empty arrays identify legacy whole-run reservations.
ALTER TABLE tool_license_charges ADD COLUMN track_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
