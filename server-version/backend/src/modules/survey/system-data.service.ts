import {readGovernedPackageReports} from './governed-package.reports'
import {randomBytes,randomUUID} from 'node:crypto'
import {prisma} from '../../config/database'
import {AdminPermissionError} from '../admin-permissions/service'
import type {AdminSessionProof} from '../admin-permissions/proof'
import {assertCurrentSystemSurveyAdmin,assertSystemSurveyDataAudit,sessionFingerprint} from './system-data-authority'
import {loadSurveySource} from './analytics.source'
import {readSurveyStoredReport} from './report-results.service'
import {projectDeidentifiedSurveyPage} from './deidentified-export'
const fail=(s:number,m:string):never=>{throw new AdminPermissionError(s,m)}
async function audit(actorId:string,proof:AdminSessionProof,projectId:string|null,action:string,reason:string,metadata:Record<string,unknown>={}){
 const id=randomUUID()
 await prisma.$transaction(async tx=>{
  await assertCurrentSystemSurveyAdmin(tx,actorId,proof)
  if(projectId&&!await tx.surveyProject.findUnique({where:{id:projectId},select:{id:true}}))fail(404,'Survey 项目不存在')
  await tx.$executeRaw`INSERT INTO survey_admin_data_audits(id,actor_id,project_id,action,reason,metadata)
   VALUES(${id},${actorId},${projectId},${action},${reason},${JSON.stringify({...metadata,sessionFingerprint:sessionFingerprint(proof)})}::jsonb)`
 })
 return {auditId:id,proof}
}
export async function listSystemSurveyProjects(actorId:string,proof:AdminSessionProof,reason:string,page:number){
 await audit(actorId,proof,null,'LIST_PROJECTS',reason,{page})
 const list=await prisma.surveyProject.findMany({select:{id:true,title:true,status:true},orderBy:{id:'asc'},take:26,skip:(page-1)*25})
 return {list:list.slice(0,25),hasMore:list.length>25,page}
}
export async function viewSystemSurveyAnswers(actorId:string,proof:AdminSessionProof,input:{projectId:string;reason:string;afterId?:string}){
 const systemAccess=await audit(actorId,proof,input.projectId,'VIEW_ANSWERS',input.reason,{afterId:input.afterId??null})
 const source=await loadSurveySource({actorUserId:actorId,projectId:input.projectId,systemAccess,maxFinals:25,pageMode:true,
  stableIdCursor:true,includeInterpretation:true,includeAttendance:false,...(input.afterId?{afterFinal:{id:input.afterId,completedAt:new Date(0)}}:{})})
 return {raw:source.raw,codebook:source.codebook,scores:source.scores,reports:source.interpretations?.map(row=>({finalId:row.finalId,waveId:row.waveId,
  units:row.binding?.units.map(unit=>({instrumentKey:unit.instrumentKey,status:row.interpretation?.units.find(i=>i.instrumentKey===unit.instrumentKey)?.report.status??'NOT_RECORDED'}))??[]})),
  nextAfterId:source.nextFinalCursor?.id??null,auditId:systemAccess.auditId,downloadAuthorized:false}
}
export async function viewSystemSurveyReport(actorId:string,proof:AdminSessionProof,input:{projectId:string;waveId:string;finalId:string;instrumentKey:string;reason:string}){
 const systemAccess=await audit(actorId,proof,input.projectId,'VIEW_REPORT',input.reason,{waveId:input.waveId,finalId:input.finalId,instrumentKey:input.instrumentKey})
 return {report:await readSurveyStoredReport(actorId,{...input,systemAccess}),auditId:systemAccess.auditId,downloadAuthorized:false}
}
export async function issueSurveyExportGrant(actorId:string,proof:AdminSessionProof,input:{projectId:string;userId:string;reason:string;hours:number}){
 await audit(actorId,proof,input.projectId,'ISSUE_DEIDENTIFIED_EXPORT_GRANT',input.reason,{subjectId:input.userId,hours:input.hours})
 return prisma.$transaction(async tx=>{
  await assertCurrentSystemSurveyAdmin(tx,actorId,proof)
  const [target]=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM users WHERE id=${input.userId} AND platform_role='SYSTEM_ADMIN'
   AND account_domain IN ('LEGACY','TRAINING') AND is_active AND NOT is_frozen FOR SHARE`
  if(!target)fail(403,'去隐私导出授权只能签发给独立系统管理员')
  const id=randomUUID(),expiresAt=new Date(Date.now()+input.hours*3600000)
  await tx.$executeRaw`INSERT INTO survey_system_export_grants(id,user_id,project_id,pseudonym_salt,capability,issued_by,reason,expires_at)
   VALUES(${id},${input.userId},${input.projectId},${randomBytes(32).toString('hex')},'DEIDENTIFIED_EXPORT',${actorId},${input.reason},${expiresAt})`
  return {id,expiresAt,capability:'DEIDENTIFIED_EXPORT'}
 })
}
export async function listSurveyExportGrants(actorId:string,proof:AdminSessionProof,projectId:string){
 return prisma.$transaction(async tx=>{
  await assertCurrentSystemSurveyAdmin(tx,actorId,proof)
  return {list:await tx.$queryRaw<Array<{id:string;userId:string;expiresAt:Date}>>`SELECT id,user_id AS "userId",expires_at AS "expiresAt" FROM survey_system_export_grants
   WHERE project_id=${projectId} AND revoked_at IS NULL AND expires_at>clock_timestamp() ORDER BY created_at DESC LIMIT 100`}
 })
}
export async function revokeSurveyExportGrant(actorId:string,proof:AdminSessionProof,input:{grantId:string;reason:string}){
 await audit(actorId,proof,null,'REVOKE_DEIDENTIFIED_EXPORT_GRANT',input.reason,{grantId:input.grantId})
 return prisma.$transaction(async tx=>{
  await assertCurrentSystemSurveyAdmin(tx,actorId,proof)
  const changed=await tx.$executeRaw`UPDATE survey_system_export_grants SET revoked_at=clock_timestamp() WHERE id=${input.grantId} AND revoked_at IS NULL`
  if(!changed)fail(409,'授权不存在或已撤销');return {revoked:true}
 })
}
export async function exportDeidentifiedSurvey(actorId:string,proof:AdminSessionProof,input:{projectId:string;grantId:string;reason:string;afterId?:string}){
 const systemAccess=await audit(actorId,proof,input.projectId,'EXPORT_DEIDENTIFIED',input.reason,{grantId:input.grantId,afterId:input.afterId??null})
 const grant=async()=>prisma.$transaction(async tx=>{
  await assertSystemSurveyDataAudit(tx,actorId,input.projectId,systemAccess)
  const [row]=await tx.$queryRaw<Array<{salt:string}>>`SELECT pseudonym_salt AS salt FROM survey_system_export_grants
   WHERE id=${input.grantId} AND user_id=${actorId} AND project_id=${input.projectId} AND capability='DEIDENTIFIED_EXPORT'
   AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE`
  if(!row)fail(403,'下载与导出需要单独且有效的项目去隐私授权');return row
 })
 const permission=await grant()
 const source=await loadSurveySource({actorUserId:actorId,projectId:input.projectId,systemAccess,maxFinals:25,pageMode:true,
  stableIdCursor:true,includeInterpretation:false,includeAttendance:false,...(input.afterId?{afterFinal:{id:input.afterId,completedAt:new Date(0)}}:{})})
 const result=projectDeidentifiedSurveyPage(source,permission.salt)
 await grant()
 return {...result,nextAfterId:source.nextFinalCursor?.id??null}
}

export async function viewSystemPackageReports(actorId:string,proof:AdminSessionProof,input:{projectId:string;waveId:string;finalId:string;reason:string}){const systemAccess=await audit(actorId,proof,input.projectId,'VIEW_REPORT',input.reason,{waveId:input.waveId,finalId:input.finalId,reportKind:'PACKAGE'});return {reports:await readGovernedPackageReports(actorId,{...input,systemAccess}),auditId:systemAccess.auditId,downloadAuthorized:false}}
