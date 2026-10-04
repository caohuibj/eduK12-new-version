CREATE TABLE organization_member_invitations (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE, invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  persona TEXT CHECK (persona IN ('TEACHER','STUDENT','COUNSELOR','CLIENT')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CONSUMED','REVOKED')),
  expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  consumed_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  membership_id TEXT, revoked_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,membership_id) REFERENCES organization_memberships(organization_id,id) ON DELETE RESTRICT,
  CHECK (expires_at>created_at),
  CHECK ((status='ACTIVE' AND consumed_by_user_id IS NULL AND membership_id IS NULL AND revoked_by_user_id IS NULL) OR
    (status='CONSUMED' AND consumed_by_user_id IS NOT NULL AND membership_id IS NOT NULL AND revoked_by_user_id IS NULL) OR
    (status='REVOKED' AND consumed_by_user_id IS NULL AND membership_id IS NULL AND revoked_by_user_id IS NOT NULL))
);
CREATE INDEX organization_member_invitations_org_idx ON organization_member_invitations(organization_id,created_at DESC,id);
