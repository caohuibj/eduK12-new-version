import { prisma } from '../../config/database'

/** Current database grant and MFA enrollment; never trust legacy JWT role. */
export async function isActiveResearcher(userId:string):Promise<boolean> {
  const rows=await prisma.$queryRaw<Array<{usable:boolean}>>`
    SELECT TRUE AS "usable" FROM "users" u
    JOIN "survey_accounts" a ON a."user_id"=u."id"
    JOIN "survey_researcher_grants" g ON g."user_id"=u."id"
    JOIN "survey_mfa_credentials" m ON m."user_id"=u."id"
    WHERE u."id"=${userId} AND u."account_domain"='SURVEY'
      AND u."is_active" AND NOT u."is_frozen"
      AND (u."expires_at" IS NULL OR u."expires_at">statement_timestamp())
      AND g."status"='ACTIVE' AND m."enabled"=TRUE
    LIMIT 1
  `
  return rows.length===1
}
