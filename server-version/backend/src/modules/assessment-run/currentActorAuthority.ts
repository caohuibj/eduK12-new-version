import { Prisma } from '@prisma/client'

/** SQL expressions are constructed by callers, never accepted from requests. */
export const currentWindowSql = (row: Prisma.Sql) => Prisma.sql`
  ${row}.valid_from <= statement_timestamp()
  AND (${row}.valid_until IS NULL OR ${row}.valid_until > statement_timestamp())
`
export const usableRunAccountSql = (row: Prisma.Sql) => Prisma.sql`
  ${row}.is_active AND NOT ${row}.is_frozen AND NOT ${row}.must_change_password
  AND (${row}.role <> 'TEACHER' OR ${row}.teacher_approved)
  AND (${row}.expires_at IS NULL OR ${row}.expires_at > statement_timestamp())
`
export const currentRunActorAuthoritySql = (actor: {
  userId: Prisma.Sql; organizationId: Prisma.Sql; provenance: Prisma.Sql;
  membershipId: Prisma.Sql; personaGrantId: Prisma.Sql; role: Prisma.Sql;
}) => Prisma.sql`EXISTS (
  SELECT 1 FROM users current_account WHERE current_account.id=${actor.userId}
    AND ${usableRunAccountSql(Prisma.sql`current_account`)}
    AND NOT EXISTS (SELECT 1 FROM organization_access_denies deny
      WHERE deny.organization_id=${actor.organizationId} AND deny.user_id=${actor.userId}
        AND deny.lifted_at IS NULL AND deny.permission IN ('*','RUN_START'))
    AND (
      (${actor.provenance}='ORG_MEMBER' AND EXISTS (
        SELECT 1 FROM organization_memberships member JOIN organization_persona_grants persona
          ON persona.organization_id=member.organization_id AND persona.membership_id=member.id
        WHERE member.id=${actor.membershipId} AND member.user_id=${actor.userId} AND member.organization_id=${actor.organizationId}
          AND ${currentWindowSql(Prisma.sql`member`)} AND persona.id=${actor.personaGrantId}
          AND persona.persona=${actor.role} AND persona.granted_at<=statement_timestamp() AND persona.revoked_at IS NULL
      )) OR (${actor.provenance}='EXTERNAL_PARENT' AND ${actor.role}='PARENT' AND EXISTS (
        SELECT 1 FROM parent_student_relationships parent_link
          JOIN organization_memberships child ON child.user_id=parent_link.student_user_id AND child.organization_id=${actor.organizationId}
          JOIN users child_account ON child_account.id=child.user_id
          JOIN organization_persona_grants child_persona ON child_persona.organization_id=child.organization_id AND child_persona.membership_id=child.id
        WHERE parent_link.parent_user_id=${actor.userId} AND parent_link.status='ACTIVE' AND parent_link.approved_at IS NOT NULL
          AND ${currentWindowSql(Prisma.sql`child`)} AND ${usableRunAccountSql(Prisma.sql`child_account`)}
          AND child_persona.persona='STUDENT' AND child_persona.granted_at<=statement_timestamp() AND child_persona.revoked_at IS NULL
      ))
    )
)`
