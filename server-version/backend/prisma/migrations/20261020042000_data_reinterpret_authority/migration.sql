-- Add a separately granted, exact-FINAL reinterpretation capability on the same
-- bounded User grant chain. No role grants or existing rows are created/updated.
-- The consuming service must intersect current data access and verify that each
-- selected FINAL belongs to scope_id; this CHECK does not grant data access.
ALTER TABLE content_capability_grants
  DROP CONSTRAINT content_capability_grants_resource_kind_check,
  DROP CONSTRAINT content_capability_grants_capabilities_check,
  ADD CONSTRAINT content_capability_grants_resource_kind_check
    CHECK (resource_kind IN ('measurement','reference','report','catalog','material','data')),
  ADD CONSTRAINT content_capability_grants_capabilities_check
    CHECK (cardinality(capabilities) BETWEEN 1 AND 12 AND capabilities <@ ARRAY[
      'measurement.edit','measurement.publish','reference.analyze','reference.review','reference.publish',
      'report.edit','report.publish','catalog.manage','material.use','material.adapt','material.distribute',
      'data.reinterpret']::text[]),
  ADD CONSTRAINT content_capability_grants_data_project_check
    CHECK (resource_kind <> 'data' OR scope_kind = 'PROJECT');
-- The existing trigger still enforces capability/resource prefix, immutable
-- scope, bounded delegation and parent resource/capability/expiry containment.
