import {createHash} from 'node:crypto'
import type {Prisma} from '@prisma/client'
import {AdminPermissionError} from '../admin-permissions/service'
import {validAdminProof,ADMIN_STEP_UP_SECONDS,type AdminSessionProof} from '../admin-permissions/proof'
export type SystemDataAccess={auditId:string;proof:AdminSessionProof}
export const sessionFingerprint=(proof:AdminSessionProof)=>createHash('sha256').update(proof.adminSessionId??'').digest('hex')
export async function assertCurrentSystemSurveyAdmin(tx:Prisma.TransactionClient,actorId:string,proof:AdminSessionProof){
 if(!validAdminProof(proof,ADMIN_STEP_UP_SECONDS))throw new AdminPermissionError(403,'系统数据访问需要最近五分钟内的管理员双因素验证')
 const [row]=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM users WHERE id=${actorId}
  AND platform_role='SYSTEM_ADMIN' AND account_domain IN ('LEGACY','TRAINING')
  AND is_active AND NOT is_frozen AND NOT must_change_password AND token_version=${proof.tokenVersion}
  AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`
 if(!row)throw new AdminPermissionError(403,'系统管理员权限或会话已失效')
}
/** An audit receipt is scoped to the signed session, project and short MFA window.
 * It is internal only; no owner endpoint accepts this object from a request. */
export async function assertSystemSurveyDataAudit(tx:Prisma.TransactionClient,actorId:string,projectId:string,access:SystemDataAccess){
 await assertCurrentSystemSurveyAdmin(tx,actorId,access.proof)
 const [receipt]=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM survey_admin_data_audits
  WHERE id=${access.auditId} AND actor_id=${actorId} AND project_id=${projectId}
  AND action IN ('VIEW_ANSWERS','VIEW_REPORT','EXPORT_DEIDENTIFIED')
  AND metadata->>'sessionFingerprint'=${sessionFingerprint(access.proof)}
  AND created_at>clock_timestamp()-interval '5 minutes'`
 if(!receipt)throw new AdminPermissionError(403,'缺少本次项目查阅的审计记录')
 const [project]=await tx.$queryRaw<Array<{ownerId:string}>>`SELECT owner_user_id AS "ownerId" FROM survey_projects WHERE id=${projectId} FOR SHARE`
 if(!project)throw new AdminPermissionError(404,'Survey 项目不存在')
 return project.ownerId
}
