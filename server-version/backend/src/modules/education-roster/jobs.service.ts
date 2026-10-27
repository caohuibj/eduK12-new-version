import {randomBytes,randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import type {AuthenticatedPrincipal} from '../../types'
import {assertPersonnelGovernor,personnelHash} from '../campus/personnel.binding'
import {CampusAdmissionError} from '../campus/admission.error'
import {checkPersonnelBatch,importPersonnelInTransaction,personnelInput} from '../campus/personnel.service'
import {resolveOrganizationAccessContext} from '../organization/access'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {createOrganizationUnitInTransaction} from '../organization/structure'
import {appendAudit} from '../organization/service'
import {rosterJobInput,validateWholeRoster,rosterParts,RosterJobError,type RosterJobInput,type RosterSource,type RosterEntry,type RosterIssue} from './jobs.schema'
type Tx=Prisma.TransactionClient
type Scope={actor:AuthenticatedPrincipal;organizationId:string;entry:RosterEntry}
type Job={id:string;organizationId:string;actorUserId:string;entry:RosterEntry;kind:RosterJobInput['kind'];inputDigest:string;sourceDigest:string;rowCount:number;partCount:number;status:string;verifiedOffline:boolean;confirmedAt:Date|null;runnerDigest:string|null;runnerExpiresAt:Date|null;createdAt:Date;expiresAt:Date}
type Receipt={batchId:string;added:number;skipped:number}
type Part={index:number;batchId:string;inputDigest:string;rowCount:number;state:string;previewToken:string|null;plannedAdd:number;plannedSkip:number;errorCount:number;needsVerification:boolean;issues:RosterIssue[];receipt:Receipt|null;committedAt:Date|null}
const fail=(code:string,message:string,status=409):never=>{throw new RosterJobError(code,message,status)}
const jobSelect=Prisma.sql`id,organization_id AS "organizationId",actor_user_id AS "actorUserId",entry,kind,input_digest AS "inputDigest",source_digest AS "sourceDigest",row_count AS "rowCount",part_count AS "partCount",status,verified_offline AS "verifiedOffline",confirmed_at AS "confirmedAt",runner_digest AS "runnerDigest",runner_expires_at AS "runnerExpiresAt",created_at AS "createdAt",expires_at AS "expiresAt"`
export async function assertRosterJobAuthority(tx:Tx,s:Scope,kind:RosterJobInput['kind']){
 if(s.actor.accountDomain!=='SCHOOL')fail('ROSTER_AUTHORITY_REQUIRED','教育账号不可用。',403)
 const user=await tx.user.findUnique({where:{id:s.actor.userId},select:{accountDomain:true,isActive:true,isFrozen:true,expiresAt:true}})
 if(!user||user.accountDomain!=='SCHOOL'||!user.isActive||user.isFrozen||(user.expiresAt&&user.expiresAt<=new Date()))fail('ROSTER_AUTHORITY_REQUIRED','当前账号不可用。',403)
 if(s.entry==='TEACHER'){
  const scope=await resolveEducationProductMemberScope({actorUserId:s.actor.userId,organizationId:s.organizationId,product:'HUITEACHER'},tx)
  if(!scope?.productAdmin)fail('ROSTER_AUTHORITY_REQUIRED','需要当前学校的 Teacher 管理授权。',403)
 }
 if(kind==='STUDENT'||kind==='STAFF'||kind==='ASSIGNMENT')await assertPersonnelGovernor(tx,s.actor,s.organizationId)
 else if(s.entry==='SCHOOL'){
  const ctx=await resolveOrganizationAccessContext({principal:s.actor,organizationId:s.organizationId},tx)
  if(!ctx||ctx.productDomain!=='SCHOOL'||ctx.organizationStatus!=='ACTIVE'||!ctx.canGovern)fail('ROSTER_AUTHORITY_REQUIRED','需要当前学校的结构管理授权。',403)
 }
}
async function findJob(tx:Tx,s:Scope,id:string,lock=false,allowExpired=false){
 const rows=await tx.$queryRaw<Job[]>(Prisma.sql`SELECT ${jobSelect} FROM education_roster_import_jobs WHERE id=${id} AND organization_id=${s.organizationId} AND actor_user_id=${s.actor.userId} AND entry=${s.entry} ${lock?Prisma.sql`FOR UPDATE`:Prisma.empty}`)
 const job=rows[0];if(!job)fail('ROSTER_JOB_NOT_FOUND','找不到当前身份的导入任务。',404)
 await assertRosterJobAuthority(tx,s,job.kind)
 if(!allowExpired&&job.expiresAt<=new Date())fail('ROSTER_JOB_EXPIRED','任务已过期，请重新校验名单。',410)
 return job
}
async function partsFor(tx:Tx,id:string){return tx.$queryRaw<Part[]>`SELECT part_index AS index,batch_id AS "batchId",input_digest AS "inputDigest",row_count AS "rowCount",state,preview_token AS "previewToken",planned_add AS "plannedAdd",planned_skip AS "plannedSkip",error_count AS "errorCount",needs_verification AS "needsVerification",issues,receipt,committed_at AS "committedAt" FROM education_roster_import_parts WHERE job_id=${id} ORDER BY part_index`}
const proofFor=(job:Job)=>personnelHash(['roster-proof:v1',job.id,job.organizationId,job.actorUserId,job.entry,job.inputDigest,job.sourceDigest])
const planFor=(job:Job,parts:Part[])=>personnelHash(['roster-plan:v1',job.id,parts.map(p=>[p.index,p.inputDigest,p.previewToken,p.plannedAdd,p.plannedSkip,p.errorCount,p.needsVerification])])
const verifyProof=(job:Job,proof:string)=>{if(proof!==proofFor(job))fail('ROSTER_SOURCE_REQUIRED','请重新选择原文件，核对学校、类型和表头映射。',400)}
const publicJob=(job:Job,parts:Part[])=>({id:job.id,kind:job.kind,status:job.status,rows:job.rowCount,partCount:job.partCount,createdAt:job.createdAt,expiresAt:job.expiresAt,expired:job.expiresAt<=new Date(),confirmed:!!job.confirmedAt,planToken:planFor(job,parts),needsVerification:parts.some(p=>p.state!=='COMMITTED'&&p.needsVerification),added:parts.reduce((n,p)=>n+(p.receipt?.added??0),0),skipped:parts.reduce((n,p)=>n+(p.receipt?.skipped??0),0),savedRows:parts.filter(p=>p.state==='COMMITTED').reduce((n,p)=>n+p.rowCount,0),parts:parts.map(p=>({index:p.index,rows:p.rowCount,state:p.state,add:p.plannedAdd,skip:p.plannedSkip,errors:p.errorCount,issues:p.issues,receipt:p.receipt,committedAt:p.committedAt}))})
const txRead=<T>(fn:(tx:Tx)=>Promise<T>)=>prisma.$transaction(fn,{timeout:20000})
export async function createRosterJob(s:Scope,p:{requestId:string;input:RosterJobInput;source:RosterSource}){
 const input=rosterJobInput.parse(p.input);validateWholeRoster(input)
 const digest=personnelHash(input),sourceDigest=personnelHash(p.source),parts=rosterParts(input)
 return txRead(async tx=>{
  await assertRosterJobAuthority(tx,s,input.kind)
  await validateResolvedClassRoster(tx,s,input)
  await tx.$executeRaw`INSERT INTO education_roster_import_jobs(id,organization_id,actor_user_id,entry,kind,input_digest,source_digest,row_count,part_count) VALUES(${p.requestId},${s.organizationId},${s.actor.userId},${s.entry},${input.kind},${digest},${sourceDigest},${input.rows.length},${parts.length}) ON CONFLICT(id) DO NOTHING`
  const job=await findJob(tx,s,p.requestId,true)
  if(job.inputDigest!==digest||job.sourceDigest!==sourceDigest||job.kind!==input.kind)fail('ROSTER_REQUEST_CONFLICT','此任务编号已用于其他名单，请重新准备。')
  for(let i=0;i<parts.length;i++)await tx.$executeRaw`INSERT INTO education_roster_import_parts(organization_id,job_id,part_index,batch_id,input_digest,row_count) VALUES(${s.organizationId},${job.id},${i},${randomUUID()},${personnelHash(parts[i])},${parts[i].rows.length}) ON CONFLICT(job_id,part_index) DO NOTHING`
  return {...publicJob(job,await partsFor(tx,job.id)),proof:proofFor(job)}
 })
}
export async function readRosterJob(s:Scope,id:string){return txRead(async tx=>{const job=await findJob(tx,s,id,false,true);return publicJob(job,await partsFor(tx,id))})}
export async function listRosterJobs(s:Scope,before?:string){return txRead(async tx=>{
 await assertRosterJobAuthority(tx,s,'GRADE')
 let personnel=true
 try{await assertPersonnelGovernor(tx,s.actor,s.organizationId)}catch(e){if(e instanceof CampusAdmissionError&&e.statusCode===403)personnel=false;else throw e}
 let boundary:Job|undefined
 if(before){const found=await tx.$queryRaw<Job[]>(Prisma.sql`SELECT ${jobSelect} FROM education_roster_import_jobs WHERE id=${before} AND organization_id=${s.organizationId} AND actor_user_id=${s.actor.userId} AND entry=${s.entry}`);boundary=found[0];if(!boundary)fail('ROSTER_CURSOR_INVALID','历史位置已失效，请刷新。',400)}
 const rows=await tx.$queryRaw<Job[]>(Prisma.sql`SELECT ${jobSelect} FROM education_roster_import_jobs WHERE organization_id=${s.organizationId} AND actor_user_id=${s.actor.userId} AND entry=${s.entry} AND (${personnel} OR kind IN ('GRADE','CLASS')) ${boundary?Prisma.sql`AND (created_at,id)<(${boundary.createdAt},${boundary.id})`:Prisma.empty} ORDER BY created_at DESC,id DESC LIMIT 21`)
 // History is a summary projection. Do not load/return up to 20 complete
 // 5000-row error reports just to render a list; details retain their own ACL.
 const page=rows.slice(0,20)
 const totals=page.length?await tx.$queryRaw<Array<{jobId:string;added:number;skipped:number;savedRows:number}>>(Prisma.sql`
  SELECT job_id AS "jobId",COALESCE(SUM((receipt->>'added')::int),0)::int AS added,
   COALESCE(SUM((receipt->>'skipped')::int),0)::int AS skipped,
   COALESCE(SUM(CASE WHEN state='COMMITTED' THEN row_count ELSE 0 END),0)::int AS "savedRows"
  FROM education_roster_import_parts WHERE job_id IN (${Prisma.join(page.map(j=>j.id))}) GROUP BY job_id`):[]
 const byId=new Map(totals.map(t=>[t.jobId,t]))
 const list=page.map(job=>({id:job.id,kind:job.kind,status:job.status,rows:job.rowCount,partCount:job.partCount,
  createdAt:job.createdAt,expiresAt:job.expiresAt,expired:job.expiresAt<=new Date(),
  added:byId.get(job.id)?.added??0,skipped:byId.get(job.id)?.skipped??0,savedRows:byId.get(job.id)?.savedRows??0}))
 return {list,next:rows.length>20?rows[19].id:null}
})}
export async function matchRosterJob(s:Scope,id:string,p:{input:RosterJobInput;source:RosterSource}){return txRead(async tx=>{
 const job=await findJob(tx,s,id),input=rosterJobInput.parse(p.input);validateWholeRoster(input)
 if(personnelHash(input)!==job.inputDigest||personnelHash(p.source)!==job.sourceDigest)fail('ROSTER_SOURCE_MISMATCH','与原任务的文件、类型或映射不一致；已保存记录保持不变。',400)
 await validateResolvedClassRoster(tx,s,input)
 return {...publicJob(job,await partsFor(tx,id)),proof:proofFor(job)}
})}
async function checkedPart(tx:Tx,s:Scope,job:Job,index:number,input:RosterJobInput){
 const parts=await partsFor(tx,job.id),part=parts[index]
 if(!part||part.index!==index||input.kind!==job.kind||input.rows.length>100||personnelHash(input)!==part.inputDigest)fail('ROSTER_PART_MISMATCH','批次内容不符，请核对原文件和映射。',400)
 return {parts,part}
}
async function previewStructure(tx:Tx,s:Scope,input:Extract<RosterJobInput,{kind:'GRADE'|'CLASS'}>){
 const units=await tx.$queryRaw<Array<{id:string;unitKind:string;name:string;parentUnitId:string|null}>>`SELECT id,unit_kind AS "unitKind",name,parent_unit_id AS "parentUnitId" FROM organization_units WHERE organization_id=${s.organizationId}`
 const rows=input.rows.map(row=>{
  let parentId:string|null=null,message='待新增',state='add'
  if(input.kind==='CLASS'){
   const parents=units.filter(u=>u.unitKind==='GRADE'&&(row.grade?u.name===row.grade:u.id===input.defaultGradeId))
   if(parents.length!==1)message='所属年级不存在或名称不唯一，请先核对学校结构。'
   else parentId=parents[0].id
  }else if(row.grade)message='年级名单不能含所属年级。'
  const matches=units.filter(u=>u.unitKind===input.kind&&u.name.trim()===row.name&&(input.kind==='GRADE'||u.parentUnitId===parentId))
  if(matches.length>1)message='已有同名项不唯一，请先核对。'
  if(message!=='待新增')state='error'
  else if(matches.length){state='skip';message='已存在，跳过'}
  return {line:row.line,name:row.name,parentId,state,message}
 })
 return {rows,token:personnelHash([s.organizationId,input,rows]),add:rows.filter(r=>r.state==='add').length,skip:rows.filter(r=>r.state==='skip').length,errors:rows.filter(r=>r.state==='error').length}
}
// Textual grade names and the default grade ID can denote the same parent.
// Resolve against this school's structure before persisting any whole-file plan;
// keep the original input/digest unchanged for resumable source matching.
async function validateResolvedClassRoster(tx:Tx,s:Scope,input:RosterJobInput){
 if(input.kind!=='CLASS')return
 const checked=await previewStructure(tx,s,input),seen=new Map<string,number>(),issues:RosterIssue[]=[]
 for(const row of checked.rows){
  if(!row.parentId)continue // Unresolved parents still fail the ordinary preview.
  const key=JSON.stringify([row.parentId,row.name])
  const previous=seen.get(key)
  if(previous!==undefined)issues.push({line:row.line,message:`与第 ${previous} 行属于同一年级下的同名班级，请先去重。`})
  else seen.set(key,row.line)
 }
 if(issues.length)throw new RosterJobError('ROSTER_WHOLE_FILE_INVALID','整份名单有重复班级，尚未开始导入。',400,issues)
}
export async function previewRosterPart(s:Scope,id:string,index:number,p:{proof:string;input:RosterJobInput}){return txRead(async tx=>{
 const job=await findJob(tx,s,id,true);verifyProof(job,p.proof)
 if(job.confirmedAt)fail('ROSTER_RECHECK_REQUIRED','请先选择重新核对剩余内容。')
 const input=rosterJobInput.parse(p.input),{part}=await checkedPart(tx,s,job,index,input)
 if(part.state==='COMMITTED')return publicJob(job,await partsFor(tx,id))
 const checked=input.kind==='GRADE'||input.kind==='CLASS'?await previewStructure(tx,s,input):await checkPersonnelBatch(tx,{actor:s.actor,organizationId:s.organizationId,input:personnelInput.parse(input)})
 const issues=checked.rows.filter(r=>r.state==='error').map(r=>({line:r.line,message:r.message}))
 const verify='number'in (checked.rows[0]??{})&&checked.rows.some(r=>r.state==='add'&&'expectedUserId'in r&&!!r.expectedUserId)
 await tx.$executeRaw`UPDATE education_roster_import_parts SET state='PREVIEWED',preview_token=${checked.token},planned_add=${checked.add},planned_skip=${checked.skip},error_count=${checked.errors},needs_verification=${verify},issues=${JSON.stringify(issues)}::jsonb WHERE job_id=${id} AND part_index=${index} AND state<>'COMMITTED'`
 const parts=await partsFor(tx,id),ready=parts.every(p=>p.state!=='PLANNED'),errors=parts.some(p=>p.errorCount>0)
 const status=ready?(errors?'PREVIEW_ERROR':'READY'):'PREVIEWING'
 await tx.$executeRaw`UPDATE education_roster_import_jobs SET status=${status},updated_at=statement_timestamp() WHERE id=${id}`;job.status=status
 return publicJob(job,parts)
})}
export async function beginRosterRun(s:Scope,id:string,p:{proof:string;planToken:string;verifiedOffline?:boolean},resume=false){return txRead(async tx=>{
 const job=await findJob(tx,s,id,true);verifyProof(job,p.proof);const parts=await partsFor(tx,id)
 if(job.status==='COMPLETED')return {...publicJob(job,parts),runToken:null}
 if(parts.some(p=>p.state==='PLANNED'||p.errorCount>0)||planFor(job,parts)!==p.planToken)fail('ROSTER_PLAN_CHANGED','预览未完成或已变化，请重新核对。')
 if(resume&&!job.confirmedAt)fail('ROSTER_CONFIRM_REQUIRED','请先核对并确认导入。')
 if(!resume&&parts.some(p=>p.state!=='COMMITTED'&&p.needsVerification)&&!p.verifiedOffline)fail('ROSTER_OFFLINE_REQUIRED','请先核实已有账号属于对应本人。',400)
 const verified=resume?job.verifiedOffline:!!p.verifiedOffline,runToken=randomBytes(24).toString('base64url'),expires=new Date(Date.now()+300000)
 await tx.$executeRaw`UPDATE education_roster_import_jobs SET status='RUNNING',verified_offline=${verified},confirmed_at=COALESCE(confirmed_at,statement_timestamp()),runner_digest=${personnelHash(runToken)},runner_expires_at=${expires},updated_at=statement_timestamp() WHERE id=${id}`
 job.status='RUNNING';job.confirmedAt=job.confirmedAt??new Date();job.verifiedOffline=verified
 return {...publicJob(job,parts),runToken}
})}
export async function pauseRosterJob(s:Scope,id:string,proof:string,recheck=false){return txRead(async tx=>{
 const job=await findJob(tx,s,id,true);verifyProof(job,proof)
 if(job.status==='COMPLETED')return publicJob(job,await partsFor(tx,id))
 if(recheck)await tx.$executeRaw`UPDATE education_roster_import_parts SET state='PLANNED',preview_token=NULL,planned_add=0,planned_skip=0,error_count=0,needs_verification=FALSE,issues='[]'::jsonb WHERE job_id=${id} AND state<>'COMMITTED'`
 const status=recheck?'PREVIEWING':job.confirmedAt?'PAUSED':job.status
 await tx.$executeRaw`UPDATE education_roster_import_jobs SET status=${status},runner_digest=NULL,runner_expires_at=NULL,confirmed_at=CASE WHEN ${recheck} THEN NULL ELSE confirmed_at END,verified_offline=CASE WHEN ${recheck} THEN FALSE ELSE verified_offline END,updated_at=statement_timestamp() WHERE id=${id}`
 job.status=status;if(recheck)job.confirmedAt=null
 return publicJob(job,await partsFor(tx,id))
})}
export async function commitRosterPart(s:Scope,id:string,index:number,p:{proof:string;runToken:string;input:RosterJobInput}){
 const metadata=await readRosterJob(s,id),structure=metadata.kind==='GRADE'||metadata.kind==='CLASS'
 return prisma.$transaction(async tx=>{
  const job=await findJob(tx,s,id,true);verifyProof(job,p.proof)
  const input=rosterJobInput.parse(p.input),{parts,part}=await checkedPart(tx,s,job,index,input)
  if(part.state==='COMMITTED')return publicJob(job,parts)
  if(!job.confirmedAt||!job.runnerDigest||job.runnerDigest!==personnelHash(p.runToken)||!job.runnerExpiresAt||job.runnerExpiresAt<=new Date())fail('ROSTER_RUN_PAUSED','执行已暂停，请核对服务器进度后明确继续。')
  if(parts.find(p=>p.state!=='COMMITTED')?.index!==index||part.state!=='PREVIEWED'||part.errorCount)fail('ROSTER_PART_ORDER','请按顺序校验并保存剩余批次。')
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${s.organizationId},7926))`
  await assertRosterJobAuthority(tx,s,job.kind)
  let receipt:Receipt
  if(input.kind==='GRADE'||input.kind==='CLASS'){
   const current=await previewStructure(tx,s,input)
   if(current.errors||current.token!==part.previewToken)fail('ROSTER_PREVIEW_CHANGED','学校结构已变化，请重新核对剩余内容。')
   for(const row of current.rows)if(row.state==='add')await createOrganizationUnitInTransaction(tx,{organizationId:s.organizationId,unitKind:input.kind,name:row.name,parentUnitId:row.parentId})
   receipt={batchId:part.batchId,added:current.add,skipped:current.skip}
  }else receipt=await importPersonnelInTransaction(tx,{actor:s.actor,organizationId:s.organizationId,input:personnelInput.parse(input),batchId:part.batchId,previewToken:part.previewToken!,verifiedOffline:job.verifiedOffline})
  await tx.$executeRaw`UPDATE education_roster_import_parts SET state='COMMITTED',receipt=${JSON.stringify(receipt)}::jsonb,committed_at=statement_timestamp() WHERE job_id=${id} AND part_index=${index} AND state<>'COMMITTED'`
  const updated=await partsFor(tx,id),done=updated.every(p=>p.state==='COMMITTED'),status=done?'COMPLETED':'RUNNING'
  await tx.$executeRaw`UPDATE education_roster_import_jobs SET status=${status},runner_digest=CASE WHEN ${done} THEN NULL ELSE runner_digest END,runner_expires_at=CASE WHEN ${done} THEN NULL ELSE runner_expires_at END,updated_at=statement_timestamp() WHERE id=${id}`;job.status=status
  await appendAudit(tx,{organizationId:s.organizationId,actorUserId:s.actor.userId,action:'EDUCATION_ROSTER_PART_IMPORTED',targetType:'ROSTER_IMPORT_JOB',targetId:id,domainEventId:randomUUID(),payload:{kind:job.kind,part:index,added:receipt.added,skipped:receipt.skipped,complete:done}})
  return publicJob(job,updated)
 },{timeout:20000,isolationLevel:structure?Prisma.TransactionIsolationLevel.ReadCommitted:Prisma.TransactionIsolationLevel.Serializable})
}
