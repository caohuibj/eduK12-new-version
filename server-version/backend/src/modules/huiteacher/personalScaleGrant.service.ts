import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { assertEntryAdmin } from '../admin-permissions/service'
import { releasedTeacherScaleEntry } from './scaleLicense.service'

export class TeacherPersonalGrantError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='TeacherPersonalGrantError'
  }
}
const deny=(code:string,status=409):never=>{throw new TeacherPersonalGrantError(code,status)}

/** Users share the education credential; personal product membership does not
 * require School psychology enrollment, Organization, or a fake school.
 * All grants are platform-controlled and exact released resource versions.
 */
export async function changeTeacherPersonalGrant(input:{
  actorUserId:string;teacherUserId:string;resourceId:string;
  action:'GRANT'|'REVOKE';expectedRevision?:number
}){
  return prisma.$transaction(async tx=>{
    await assertEntryAdmin(tx,input.actorUserId,'HUITEACHER')
    const [user]=await tx.$queryRaw<Array<{id:string}>>`
      SELECT "id" FROM "users" WHERE "id"=${input.teacherUserId}
        AND "account_domain"='SCHOOL' AND "role" IN ('TEACHER','ADMIN')
        AND "teacher_approved"=TRUE AND "is_active"=TRUE
        AND "is_frozen"=FALSE AND "must_change_password"=FALSE
        AND ("expires_at" IS NULL OR "expires_at">statement_timestamp())
      FOR UPDATE
    `
    if(!user)deny('TEACHER_PERSONAL_ACCOUNT_INELIGIBLE',403)
    const resource=await tx.$queryRaw<Array<{key:string;version:string}>>`
      SELECT "resource_key" AS "key","resource_version" AS "version"
      FROM "registered_assessment_resources"
      WHERE "id"=${input.resourceId} FOR SHARE
    `
    if(!resource.length)deny('TEACHER_PERSONAL_RESOURCE_NOT_FOUND',404)
    if(input.action==='GRANT')await releasedTeacherScaleEntry(tx,{
      family:'SCALE',key:resource[0].key,version:resource[0].version,
    })
    const key={userId:input.teacherUserId,resourceId:input.resourceId}
    const prior=await tx.huiteacherPersonalScaleGrant.findUnique({
      where:{userId_resourceId:key},
    })
    if(!prior&&input.action==='REVOKE')deny('TEACHER_PERSONAL_GRANT_NOT_FOUND',404)
    if(input.expectedRevision!==undefined
      &&input.expectedRevision!==(prior?.revision??0))
      deny('TEACHER_PERSONAL_GRANT_CHANGED')
    const target=input.action==='GRANT'?'ACTIVE':'REVOKED'
    if(prior?.status===target){
      return {userId:input.teacherUserId,resourceId:input.resourceId,
        status:target,revision:prior.revision,unchanged:true}
    }
    const changed=prior
      ?await tx.huiteacherPersonalScaleGrant.update({
        where:{userId_resourceId:key},
        data:{status:target,revokedAt:target==='REVOKED'?new Date():null,
          revision:{increment:1},...(target==='ACTIVE'?{grantedByUserId:input.actorUserId}:{})},
      })
      :await tx.huiteacherPersonalScaleGrant.create({data:{
        ...key,status:'ACTIVE',grantedByUserId:input.actorUserId,
      }})
    await tx.$executeRaw`
      INSERT INTO "organization_governance_audits"
        ("id","organization_id","actor_user_id","action","target_type",
         "target_id","domain_event_id","payload")
      VALUES (${randomUUID()},NULL,${input.actorUserId},
        ${'HUITEACHER_PERSONAL_SCALE_'+input.action},'TEACHER_PERSONAL_SCALE_GRANT',
        ${input.teacherUserId},${randomUUID()},
        ${JSON.stringify({resourceId:input.resourceId,
          resourceKey:resource[0].key,revision:changed.revision,status:target})}::jsonb)
    `
    return {userId:input.teacherUserId,resourceId:input.resourceId,
      status:changed.status,revision:changed.revision,unchanged:false}
  })
}
