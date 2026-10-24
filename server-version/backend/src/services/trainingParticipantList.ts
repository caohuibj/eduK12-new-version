import {Prisma} from '@prisma/client'
import {prisma} from '../config/database'

/** The base STUDENT role also backs management-only accounts. This read-only
 * roster excludes current management identities before counting or pagination. */
export async function listTrainingParticipants(role:'STUDENT'|'TEACHER',keyword:string,page:number,pageSize:number){
 const where=Prisma.sql`u."account_domain" IN ('LEGACY','TRAINING')
  AND u."role" = ${role}::"UserRole" AND u."platform_role" = 'STANDARD'
  AND NOT EXISTS (SELECT 1 FROM "admin_entry_grants" g WHERE g."user_id"=u."id" AND g."revoked_at" IS NULL)
  ${keyword?Prisma.sql`AND (POSITION(${keyword} IN u."username")>0 OR POSITION(${keyword} IN COALESCE(u."nickname",''))>0)`:Prisma.empty}`
 const [list,counts]=await Promise.all([
  prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`SELECT u."id",u."username",u."role",u."nickname",u."avatar_url" AS "avatarUrl",u."phone",
   u."is_active" AS "isActive",u."is_frozen" AS "isFrozen",u."teacher_approved" AS "teacherApproved",u."expires_at" AS "expiresAt",
   u."created_at" AS "createdAt",u."updated_at" AS "updatedAt",u."must_change_password" AS "mustChangePassword"
   FROM "users" u WHERE ${where} ORDER BY u."created_at" DESC,u."id" DESC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`),
  prisma.$queryRaw<Array<{total:bigint}>>(Prisma.sql`SELECT COUNT(*) AS "total" FROM "users" u WHERE ${where}`),
 ])
 return {list,total:Number(counts[0]?.total??0),page,pageSize}
}
