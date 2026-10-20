// Read-only, aggregate-only. No usernames, credentials, keys or raw DB exports.
import { prisma } from '../config/database'

void (async () => {
  const counts = await prisma.$queryRaw`
    SELECT u."account_domain" AS "accountDomain", u."role"::text AS role,
      u."platform_role"::text AS "platformRole", u."is_active" AS active,
      COALESCE((SELECT string_agg(g."entry", ',' ORDER BY g."entry")
        FROM "admin_entry_grants" g WHERE g."user_id"=u."id" AND g."revoked_at" IS NULL), '') AS entries,
      count(*)::int AS accounts
    FROM "users" u GROUP BY u."account_domain",u."role",u."platform_role",u."is_active",entries
    ORDER BY 1,2,3,4,5
  `
  console.log(JSON.stringify({ source: 'current-database-aggregate', counts }))
})().finally(() => prisma.$disconnect())
