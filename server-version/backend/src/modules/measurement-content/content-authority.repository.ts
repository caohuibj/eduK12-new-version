import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import {
  assertContentDelegation, assertContentGrantChain, contentGrantInputSchema,
  contentAuthorityScopeSchema, contentScopeContains, ContentAuthorityError,
  type ContentAuthorityScope, type ContentCapability, type ContentGrant, type ContentGrantInput,
} from './content-authority'

/* Internal business authorization primitives. Root issuance is restricted by
 * admin-authority.service and the unified strong-auth management route.
 * The caller must use an authenticated User, current entry eligibility,
 * object/data access and source-license checks in the same business transaction.
 * Content capabilities grant none of those rights. Never accept actorId from a body.
 * Use READ COMMITTED transactions; locks are held through the protected write.
 */
type GrantRow = {
  id: string; subject_id: string; issuer_id: string; parent_grant_id: string | null;
  product: ContentAuthorityScope['product']; scope_kind: ContentAuthorityScope['scopeKind']; scope_id: string;
  resource_kind: ContentAuthorityScope['resourceKind']; resource_keys: string[];
  capabilities: ContentCapability[]; delegable_capabilities: ContentCapability[];
  remaining_delegation_depth: number; valid_from: Date; expires_at: Date;
  ancestry: string[]; version: number; revoked_at: Date | null;
  subject_active: boolean; subject_frozen: boolean; subject_expires_at: Date | null;
}
async function currentGrant(db: Prisma.TransactionClient, grantId: string): Promise<ContentGrant> {
  // One bounded ancestry query. Missing ancestors fail closed. Shared locks serialize
  // an in-flight protected write against revoke, without touching descendants.
  const rows = await db.$queryRaw<GrantRow[]>(Prisma.sql`
    SELECT a.*, u.is_active AS subject_active, u.is_frozen AS subject_frozen, u.expires_at AS subject_expires_at
    FROM content_capability_grants leaf
    JOIN content_capability_grants a ON a.id = ANY(leaf.ancestry)
    JOIN users u ON u.id = a.subject_id
    WHERE leaf.id = ${grantId} AND cardinality(leaf.ancestry) BETWEEN 1 AND 2
    ORDER BY a.id FOR SHARE OF a, u`)
  // Read the clock AFTER locks: a revoke/other transaction may have held us
  // beyond expiry. Query projection timestamps may be evaluated before lock wait.
  const [clock] = await db.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  if (!clock || !rows.length || rows.some(r => !r.subject_active || r.subject_frozen || (r.subject_expires_at && r.subject_expires_at <= clock.now)))
    throw new ContentAuthorityError('CONTENT_AUTHORITY_DENIED')
  const grants = rows.map((r): ContentGrant => ({
    id: r.id, subjectId: r.subject_id, issuerId: r.issuer_id, parentGrantId: r.parent_grant_id,
    scope: { product: r.product, scopeKind: r.scope_kind, scopeId: r.scope_id,
      resourceKind: r.resource_kind, resourceKeys: r.resource_keys },
    capabilities: r.capabilities, delegableCapabilities: r.delegable_capabilities,
    remainingDelegationDepth: r.remaining_delegation_depth, validFrom: r.valid_from,
    expiresAt: r.expires_at, ancestry: r.ancestry, version: r.version, revokedAt: r.revoked_at,
  }))
  return assertContentGrantChain(grants, grantId, clock.now)
}
export async function assertContentAuthority(db: Prisma.TransactionClient, input: {
  actorId: string; grantId: string; capability: ContentCapability; scope: ContentAuthorityScope;
}): Promise<{ grantId: string; version: number }> {
  const scope = contentAuthorityScopeSchema.parse(input.scope)
  const grant = await currentGrant(db, input.grantId)
  if (grant.subjectId !== input.actorId || !grant.capabilities.includes(input.capability)
    || !contentScopeContains(grant.scope, scope)) throw new ContentAuthorityError('CONTENT_AUTHORITY_DENIED')
  return { grantId: grant.id, version: grant.version }
}
export async function delegateContentAuthority(db: Prisma.TransactionClient, input: {
  actorId: string; parentGrantId: string; expectedParentVersion: number; grant: ContentGrantInput;
}): Promise<string> {
  const grant = contentGrantInputSchema.parse(input.grant)
  const parent = await currentGrant(db, input.parentGrantId)
  if (parent.version !== input.expectedParentVersion) throw new ContentAuthorityError('CONTENT_AUTHORITY_STALE')
  assertContentDelegation(parent, grant, input.actorId)
  const id = randomUUID(), scope = grant.scope
  // Same UTC TIMESTAMP(3) contract as administrator root issuance.
  await db.$executeRaw(Prisma.sql`INSERT INTO content_capability_grants
    (id,subject_id,issuer_id,parent_grant_id,product,scope_kind,scope_id,resource_kind,resource_keys,
     capabilities,delegable_capabilities,remaining_delegation_depth,valid_from,expires_at,ancestry)
    VALUES (${id},${grant.subjectId},${input.actorId},${parent.id},${scope.product},${scope.scopeKind},
      ${scope.scopeId},${scope.resourceKind},${scope.resourceKeys}::text[],${grant.capabilities}::text[],
      ${grant.delegableCapabilities}::text[],${grant.remainingDelegationDepth},(${grant.validFrom}::timestamptz AT TIME ZONE 'UTC'),
      (${grant.expiresAt}::timestamptz AT TIME ZONE 'UTC'),${[...parent.ancestry, id]}::text[])`)
  return id
}
/** An issuer or recipient may withdraw their own grant, even after it expires.
 * Admin emergency revocation is intentionally left to the final strong-auth service. */
export async function revokeContentAuthority(db: Prisma.TransactionClient, input: {
  actorId: string; grantId: string; expectedVersion: number; reason: string;
}): Promise<void> {
  const reason = input.reason.trim()
  if (!reason || reason.length > 1000) throw new ContentAuthorityError('CONTENT_AUTHORITY_REASON_REQUIRED')
  const changed = await db.$executeRaw(Prisma.sql`UPDATE content_capability_grants
    SET revoked_at=(clock_timestamp() AT TIME ZONE 'UTC'), revoked_by=${input.actorId}, revoke_reason=${reason}, version=version+1
    WHERE id=${input.grantId} AND version=${input.expectedVersion} AND revoked_at IS NULL
      AND (issuer_id=${input.actorId} OR subject_id=${input.actorId})`)
  if (changed !== 1) throw new ContentAuthorityError('CONTENT_AUTHORITY_STALE_OR_DENIED')
}
