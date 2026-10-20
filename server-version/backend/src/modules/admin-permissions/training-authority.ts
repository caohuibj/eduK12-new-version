import {Prisma} from '@prisma/client'

/** Internal course/creator joins use aliases c and u. Grant writes serialize
 * with these readers through the shared user lock in the enclosing query. */
export const trainingCreatorAuthoritySql = Prisma.sql`
  u.account_domain IN ('LEGACY','TRAINING') AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
  AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
  AND (EXISTS(SELECT 1 FROM admin_entry_grants g WHERE g.user_id=u.id AND g.entry='TRAINING' AND g.revoked_at IS NULL)
    OR (u.role::text='TEACHER' AND u.teacher_approved AND c.creator_id=u.id))`
