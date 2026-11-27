import {Prisma} from '@prisma/client'
import type {AdminEntry} from './service'

/** Pinned entry evidence for an exact use issued by another account. Callers
 * taking row locks check issuer expiry with their own post-lock timestamp. */
export function currentEntryEvidenceJoin(input:{
  issuerId:Prisma.Sql;entryId:Prisma.Sql;entryRevision:Prisma.Sql;entry:AdminEntry
}){
  return Prisma.sql`
    JOIN users u ON u.id=${input.issuerId} AND u.account_domain IN ('TRAINING','LEGACY') AND u.platform_role='STANDARD'
      AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
    JOIN admin_entry_grants e ON e.id=${input.entryId} AND e.user_id=u.id AND e.version::text=${input.entryRevision}::text
      AND e.entry=${input.entry} AND e.revoked_at IS NULL`
}
