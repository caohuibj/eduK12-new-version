-- Bounded exact T1 audit lookup for the existing MaterialGrant revision. No
-- current/latest inference and no migration/backfill of old authorizations.
CREATE INDEX assessment_management_standard_use_revision_idx ON assessment_management_events
 (resource_id,(metadata->>'grantId'),(metadata->>'useVersion'))
 WHERE action='STANDARD_COMBINATION_USE_GRANTED';
