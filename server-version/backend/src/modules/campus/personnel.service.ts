import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import type {AuthenticatedPrincipal} from '../../types'
import {appendAudit} from '../organization/service'
import {digestCampusStudentNumber} from './admission.service'
import {assertPersonnelGovernor,personnelFail,personnelHash,encryptPersonnel,decryptPersonnel,personnelById,applyPersonnelAssignments,type PersonnelRow} from './personnel.binding'

export const personnelInput=z.object({kind:z.enum(['STUDENT','STAFF','ASSIGNMENT']),rows:z.array(z.object({
 line:z.number().int().min(1).max(10000),number:z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_-]+$/),
 name:z.string().trim().max(100).default(''),grade:z.string().trim().max(200).default(''),className:z.string().trim().max(200).default(''),
 persona:z.enum(['TEACHER','COUNSELOR']).default('TEACHER'),username:z.string().trim().max(32).default(''),
 staffRole:z.enum(['HOMEROOM','TEACHING']).default('TEACHING'),
}).strict()).min(1).max(100)}).strict()
export type PersonnelInput=z.infer<typeof personnelInput>
type Tx=Prisma.TransactionClient
type Input={actor:AuthenticatedPrincipal;organizationId:string;input:PersonnelInput}
type Unit={id:string;unitKind:string;name:string;parentUnitId:string|null}
type Admission={status:string;rosterVersion:number;claimed:number}
type Checked={line:number;number:string;name:string;state:'add'|'skip'|'error';message:string;classUnitId?:string;person?:PersonnelRow;expectedUserId?:string;eligibilityId?:string;numberDigest:string;persona:string;username:string;staffRole:string}
export async function checkPersonnelBatch(tx:Tx,params:Input){
 await assertPersonnelGovernor(tx,params.actor,params.organizationId)
 const {input,organizationId:org}=params
 const units=await tx.$queryRaw<Unit[]>`SELECT id,unit_kind AS "unitKind",name,parent_unit_id AS "parentUnitId" FROM organization_units WHERE organization_id=${org}`
 const rows:Checked[]=[],seen=new Set<string>()
 for(const source of input.rows){
  const row:Checked={line:source.line,number:source.number.toUpperCase(),name:source.name,state:'add',message:'待新增',numberDigest:'',persona:input.kind==='STUDENT'?'STUDENT':source.persona,username:source.username.toLowerCase(),staffRole:source.staffRole}
  row.numberDigest=input.kind==='STUDENT'?digestCampusStudentNumber(org,row.number):personnelHash(['staff-number',org,row.number])
  const duplicate=input.kind==='ASSIGNMENT'?JSON.stringify([row.number,source.grade,source.className,source.staffRole]):row.number
  const error=(message:string)=>{row.state='error';row.message=message}
  if(seen.has(duplicate))error('文件中编号或任教关系重复，请删除重复行。')
  seen.add(duplicate)
  if([...source.name, ...source.grade, ...source.className].some(ch=>ch.charCodeAt(0)<32||ch==='\uFFFD'))error('姓名、年级或班级含有无效字符。')
  if((input.kind==='STAFF'&&(source.grade||source.className||source.staffRole!=='TEACHING'))||(input.kind==='STUDENT'&&(source.persona!=='TEACHER'||source.staffRole!=='TEACHING'))||(input.kind==='ASSIGNMENT'&&(source.name||source.username||source.persona!=='TEACHER')))error('包含不属于当前导入类型的字段，请使用对应模板。')
  if(input.kind==='STAFF'&&!source.name)error('教师姓名必填。')
  if(row.username&&!/^[a-z0-9_.-]{4,32}$/.test(row.username))error('已有校园用户名格式不正确。')
  if(input.kind!=='STAFF'){
   const grades=units.filter(x=>x.unitKind==='GRADE'&&x.name===source.grade)
   const classes=units.filter(x=>x.unitKind==='CLASS'&&x.name===source.className&&x.parentUnitId===grades[0]?.id)
   if(grades.length!==1||classes.length!==1)error('年级／班级不存在或名称不唯一，请先核对学校结构。')
   else row.classUnitId=classes[0].id
  }
  const persons=await tx.$queryRaw<PersonnelRow[]>`
   SELECT id,organization_id AS "organizationId",kind,persona,class_unit_id AS "classUnitId",eligibility_id AS "eligibilityId",expected_user_id AS "expectedUserId",claimed_user_id AS "claimedUserId",profile_cipher AS "profileCipher",number_digest AS "numberDigest"
   FROM campus_personnel WHERE organization_id=${org} AND kind=${input.kind==='STUDENT'?'STUDENT':'STAFF'} AND number_digest=${row.numberDigest}
  `
  row.person=persons[0]
  if(input.kind==='ASSIGNMENT'){
   if(!row.person||row.person.persona!=='TEACHER')error('请先导入具有普通教师身份的人员，再导入任教关系。')
   else if(row.classUnitId){
    const existing=await tx.$queryRaw<Array<{id:string}>>`SELECT person_id AS id FROM campus_personnel_assignments WHERE person_id=${row.person.id} AND class_unit_id=${row.classUnitId} AND staff_role=${row.staffRole}`
    if(existing.length&&row.state!=='error'){row.state='skip';row.message='已有关系，跳过'}
   }
  }else if(row.person){
   const profile=decryptPersonnel(org,row.person.id,row.person.profileCipher)
   if(row.person.persona!==row.persona||row.person.classUnitId!==(row.classUnitId??null)||(source.name&&profile.name!==source.name)||(row.username&&profile.username!==row.username))error('已有人员信息不同，请人工核实；本次不会覆盖。')
   else if(row.state!=='error'){row.state='skip';row.message='人员已存在，跳过'}
  }else{
   if(row.username){
    const account=await tx.campusAccount.findUnique({where:{normalizedLogin:row.username},include:{user:true}})
    if(!account||account.user.accountDomain!=='SCHOOL'||!(input.kind==='STUDENT'?account.user.role==='STUDENT':['TEACHER','ADMIN'].includes(account.user.role))||!account.user.isActive||account.user.isFrozen||account.user.mustChangePassword||(account.user.expiresAt&&account.user.expiresAt<=new Date()))error('已有校园账号不存在或身份不匹配，请人工核实。')
    else{
     row.expectedUserId=account.userId
     const bound=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM campus_personnel WHERE organization_id=${org} AND (expected_user_id=${account.userId} OR claimed_user_id=${account.userId})`
     if(bound.length)error('该账号已经绑定另一人员编号，请人工核实。')
     if(input.kind==='STAFF'){
      const member=await tx.organizationMembership.findFirst({where:{organizationId:org,userId:account.userId,validFrom:{lte:new Date()},OR:[{validUntil:null},{validUntil:{gt:new Date()}}]},select:{id:true}})
      if(member){const persona=await tx.organizationPersonaGrant.findFirst({where:{organizationId:org,membershipId:member.id,persona:row.persona,revokedAt:null},select:{id:true}});if(!persona)error('已有成员身份不同，不会通过导入变更其权限。')}
     }
    }
   }
   if(input.kind==='STUDENT'&&row.classUnitId){
    const teacherOwners=await tx.educationTeacherStudentInvitation.findMany({where:{organizationId:org,studentNoDigest:row.numberDigest,consumedByUserId:{not:null}},select:{consumedByUserId:true}})
    if(teacherOwners.some(x=>x.consumedByUserId!==row.expectedUserId))error('该学号已有 Teacher 教育账号，请填入对应已有校园用户名并人工核实，不得重复建号。')
    const admissions=await tx.$queryRaw<Admission[]>`
     SELECT a.status,a.roster_version AS "rosterVersion",(SELECT COUNT(*)::int FROM campus_student_eligibilities e WHERE e.organization_id=a.organization_id AND e.class_unit_id=a.class_unit_id AND e.status='VALID' AND e.claimed_user_id IS NOT NULL) AS claimed
     FROM campus_class_admissions a WHERE a.organization_id=${org} AND a.class_unit_id=${row.classUnitId}
    `
    if(admissions[0]&&(['OPEN','APPROVED'].includes(admissions[0].status)||admissions[0].claimed>0))error('班级名册已锁定：已开放注册、已有注册或已审批，暂不支持补录。')
    const eligible=await tx.$queryRaw<Array<{id:string;classUnitId:string;claimedUserId:string|null;status:string}>>`SELECT id,class_unit_id AS "classUnitId",claimed_user_id AS "claimedUserId",status FROM campus_student_eligibilities WHERE organization_id=${org} AND student_no_digest=${row.numberDigest}`
    if(eligible.some(x=>x.status!=='VALID'||x.classUnitId!==row.classUnitId||x.claimedUserId))error('学号已有其他班级、注册或隔离记录，请人工核实。')
    else row.eligibilityId=eligible[0]?.id
    if(row.expectedUserId){
     const enrolled=await tx.campusStudentEnrollment.findUnique({where:{userId:row.expectedUserId},select:{userId:true}})
     if(enrolled)error('该账号已有 School 注册记录，请使用现有账号，不能重复关联。')
     const mismatches=await tx.$queryRaw<Array<{id:string}>>`SELECT a.id FROM organization_student_class_assignments a JOIN organization_memberships m ON m.id=a.membership_id AND m.organization_id=a.organization_id WHERE m.user_id=${row.expectedUserId} AND m.organization_id=${org} AND a.is_primary=TRUE AND a.valid_until IS NULL AND a.class_unit_id<>${row.classUnitId}`
     if(mismatches.length)error('已有账号属于其他主班级，本次不会转班。')
    }
   }
  }
  rows.push(row)
 }
 // Pin all normalized inputs plus resolved IDs/outcomes. Mutations re-check this
 // under class locks; client-side parsing is never authorization.
 const token=personnelHash([org,input,rows.map(r=>[r.state,r.classUnitId,r.person?.id,r.person?.claimedUserId,r.expectedUserId,r.eligibilityId,r.message])])
 return {rows,token,add:rows.filter(r=>r.state==='add').length,skip:rows.filter(r=>r.state==='skip').length,errors:rows.filter(r=>r.state==='error').length}
}
function publicPreview(checked:Awaited<ReturnType<typeof checkPersonnelBatch>>){return {...checked,rows:checked.rows.map(({line,number,name,state,message})=>({line,number,name,state,message}))}}
export async function previewPersonnel(input:Input){return publicPreview(await prisma.$transaction(tx=>checkPersonnelBatch(tx,input),{timeout:15000}))}
export async function importPersonnelInTransaction(tx:Tx,params:Input&{batchId:string;previewToken:string;verifiedOffline:boolean}){
 const hash=personnelHash([params.input,params.verifiedOffline])
  await assertPersonnelGovernor(tx,params.actor,params.organizationId)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${params.organizationId},7926))`
  const prior=await tx.$queryRaw<Array<{hash:string;receipt:any;org:string}>>`SELECT request_hash AS hash,receipt,organization_id AS org FROM campus_personnel_import_batches WHERE id=${params.batchId}`
  if(prior.length){if(prior[0].hash!==hash||prior[0].org!==params.organizationId)personnelFail('PERSONNEL_BATCH_CONFLICT');return prior[0].receipt}
  // Share class admission locks with existing roster/window/registration paths.
  const pre=await checkPersonnelBatch(tx,params)
  const classes=[...new Set(pre.rows.filter(r=>r.state==='add'&&params.input.kind==='STUDENT').map(r=>r.classUnitId).filter((x):x is string=>!!x))].sort()
  for(const classId of classes){
   await tx.$executeRaw`INSERT INTO campus_class_admissions(class_unit_id,organization_id) VALUES(${classId},${params.organizationId}) ON CONFLICT(class_unit_id) DO NOTHING`
   await tx.$queryRaw`SELECT class_unit_id FROM campus_class_admissions WHERE class_unit_id=${classId} AND organization_id=${params.organizationId} FOR UPDATE`
  }
  const checked=await checkPersonnelBatch(tx,params)
  if(checked.errors||checked.token!==params.previewToken)personnelFail('PERSONNEL_PREVIEW_CHANGED')
  if(checked.rows.some(x=>x.state==='add'&&x.expectedUserId)&&!params.verifiedOffline)personnelFail('PERSONNEL_OFFLINE_VERIFICATION_REQUIRED',400)
  const receipt={batchId:params.batchId,added:checked.add,skipped:checked.skip}
  await tx.$executeRaw`INSERT INTO campus_personnel_import_batches(id,organization_id,actor_user_id,request_hash,receipt) VALUES(${params.batchId},${params.organizationId},${params.actor.userId},${hash},${JSON.stringify(receipt)}::jsonb)`
  for(const row of checked.rows){
   if(row.state!=='add')continue
   if(params.input.kind==='ASSIGNMENT'){
    await tx.$executeRaw`INSERT INTO campus_personnel_assignments(organization_id,person_id,class_unit_id,staff_role) VALUES(${params.organizationId},${row.person!.id},${row.classUnitId!},${row.staffRole})`
    if(row.person!.claimedUserId)await applyPersonnelAssignments(tx,row.person!,row.person!.claimedUserId)
   }else{
    const id=randomUUID(),eligibilityId=params.input.kind==='STUDENT'?(row.eligibilityId??randomUUID()):null
    if(eligibilityId&&!row.eligibilityId)await tx.$executeRaw`
     INSERT INTO campus_student_eligibilities(id,organization_id,class_unit_id,student_no_digest,roster_version)
     SELECT ${eligibilityId},${params.organizationId},${row.classUnitId!},${row.numberDigest},roster_version FROM campus_class_admissions WHERE class_unit_id=${row.classUnitId!} AND organization_id=${params.organizationId}
    `
    const cipher=encryptPersonnel(params.organizationId,id,{number:row.number,name:row.name,username:row.username})
    await tx.$executeRaw`INSERT INTO campus_personnel(id,organization_id,kind,number_digest,profile_cipher,persona,class_unit_id,eligibility_id,expected_user_id,batch_id) VALUES(${id},${params.organizationId},${params.input.kind},${row.numberDigest},${cipher},${row.persona},${row.classUnitId??null},${eligibilityId},${row.expectedUserId??null},${params.batchId})`
   }
  }
  // A changed pre-registration roster gets a new revision, retaining every
  // prior unclaimed entry. Old, unused class credentials cannot follow it.
  for(const classId of classes){
   await tx.$executeRaw`UPDATE campus_class_admissions SET roster_version=roster_version+1,roster_expected_count=(SELECT COUNT(*) FROM campus_student_eligibilities WHERE class_unit_id=${classId} AND status='VALID'),updated_at=statement_timestamp() WHERE class_unit_id=${classId}`
   await tx.$executeRaw`UPDATE campus_student_eligibilities SET roster_version=(SELECT roster_version FROM campus_class_admissions WHERE class_unit_id=${classId}) WHERE class_unit_id=${classId} AND status='VALID' AND claimed_user_id IS NULL`
   await tx.$executeRaw`UPDATE campus_activation_codes SET revoked_at=statement_timestamp() WHERE class_unit_id=${classId} AND consumed_at IS NULL AND revoked_at IS NULL`
  }
  await appendAudit(tx,{organizationId:params.organizationId,actorUserId:params.actor.userId,action:'CAMPUS_PERSONNEL_IMPORTED',targetType:'PERSONNEL_BATCH',targetId:params.batchId,domainEventId:randomUUID(),payload:{kind:params.input.kind,added:checked.add,skipped:checked.skip}})
  return receipt

}
export async function importPersonnel(params:Input&{batchId:string;previewToken:string;verifiedOffline:boolean}){
 return prisma.$transaction(tx=>importPersonnelInTransaction(tx,params),{timeout:20000,isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
}
export async function listPersonnel(params:{actor:AuthenticatedPrincipal;organizationId:string;after?:string}){
 return prisma.$transaction(async tx=>{
  await assertPersonnelGovernor(tx,params.actor,params.organizationId)
  const rows=await tx.$queryRaw<Array<{id:string;kind:string;persona:string;profileCipher:string;claimedUserId:string|null;expectedUserId:string|null;className:string|null;grade:string|null}>>`
   SELECT p.id,p.kind,p.persona,p.profile_cipher AS "profileCipher",p.claimed_user_id AS "claimedUserId",p.expected_user_id AS "expectedUserId",u.name AS "className",g.name AS grade
   FROM campus_personnel p LEFT JOIN organization_units u ON u.id=p.class_unit_id AND u.organization_id=p.organization_id LEFT JOIN organization_units g ON g.id=u.parent_unit_id AND g.organization_id=u.organization_id
   WHERE p.organization_id=${params.organizationId} AND (${params.after??null}::text IS NULL OR p.id>${params.after??null}) ORDER BY p.id LIMIT 101
  `
  return {list:rows.slice(0,100).map(r=>({id:r.id,kind:r.kind,persona:r.persona,...decryptPersonnel(params.organizationId,r.id,r.profileCipher),className:r.className,grade:r.grade,activated:!!r.claimedUserId,existingAccount:!!r.expectedUserId})),next:rows.length>100?rows[99].id:null}
 })
}
export async function issuePersonnelCredential(params:{actor:AuthenticatedPrincipal;organizationId:string;personId:string}){
 return prisma.$transaction(async tx=>{
  await assertPersonnelGovernor(tx,params.actor,params.organizationId)
  // Same lock order as registration: class -> credential/person.
  const targets=await tx.$queryRaw<Array<{classId:string|null}>>`SELECT class_unit_id AS "classId" FROM campus_personnel WHERE organization_id=${params.organizationId} AND id=${params.personId}`
  if(targets[0]?.classId)await tx.$queryRaw`SELECT class_unit_id FROM campus_class_admissions WHERE class_unit_id=${targets[0].classId} FOR UPDATE`
  const person=await personnelById(tx,params.organizationId,params.personId)
  if(person.claimedUserId)personnelFail('PERSONNEL_ALREADY_ACTIVATED')
  await tx.$executeRaw`UPDATE campus_personnel_credentials SET revoked_at=statement_timestamp() WHERE person_id=${person.id} AND revoked_at IS NULL`
  const code=randomBytes(24).toString('base64url'),id=randomUUID(),expiresAt=new Date(Date.now()+86400000)
  if(person.kind==='STUDENT'){
   const admissions=await tx.$queryRaw<Array<{rosterVersion:number}>>`
    SELECT a.roster_version AS "rosterVersion" FROM campus_class_admissions a JOIN campus_student_eligibilities e ON e.id=${person.eligibilityId} AND e.class_unit_id=a.class_unit_id AND e.organization_id=a.organization_id AND e.status='VALID' AND e.claimed_user_id IS NULL AND e.roster_version=a.roster_version
    WHERE a.organization_id=${params.organizationId} AND a.class_unit_id=${person.classUnitId} AND a.status IN ('DRAFT','OPEN')
   `
   if(!admissions.length)personnelFail('CODE_WINDOW_CLOSED')
   await tx.campusActivationCode.create({data:{id,organizationId:params.organizationId,classUnitId:person.classUnitId!,rosterVersion:admissions[0].rosterVersion,codeDigest:createHash('sha256').update(code).digest('hex'),expiresAt}})
  }else await tx.campusStaffInvitation.create({data:{id,organizationId:params.organizationId,persona:person.persona,adminRole:false,psychologyStaff:false,tokenHash:createHash('sha256').update('school-staff-invite:v1:'+code).digest('hex'),invitedByUserId:params.actor.userId,expiresAt}})
  await tx.$executeRaw`INSERT INTO campus_personnel_credentials(id,organization_id,person_id,student_code_id,staff_invitation_id,issued_by_user_id) VALUES(${randomUUID()},${params.organizationId},${person.id},${person.kind==='STUDENT'?id:null},${person.kind==='STAFF'?id:null},${params.actor.userId})`
  await appendAudit(tx,{organizationId:params.organizationId,actorUserId:params.actor.userId,action:'CAMPUS_PERSONNEL_CREDENTIAL_ISSUED',targetType:'PERSONNEL',targetId:person.id,domainEventId:randomUUID(),payload:{kind:person.kind,expiresAt:expiresAt.toISOString()}})
  return {code,expiresAt:expiresAt.toISOString(),kind:person.kind,existingAccount:!!person.expectedUserId}
 })
}

/** Explicit one-time binding after offline verification. It cannot replace an
 * existing binding, alter a password, grant a role, or claim on behalf of owner. */
export async function bindExistingPersonnel(params:{actor:AuthenticatedPrincipal;organizationId:string;personId:string;username:string;verifiedOffline:true}){
 return prisma.$transaction(async tx=>{
  await assertPersonnelGovernor(tx,params.actor,params.organizationId)
  const before=await tx.$queryRaw<Array<{kind:string;digest:string}>>`SELECT kind,number_digest AS digest FROM campus_personnel WHERE organization_id=${params.organizationId} AND id=${params.personId}`
  if(before[0]?.kind==='STUDENT')await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'education-student:'+params.organizationId+':'+before[0].digest},7927))`
  const person=await personnelById(tx,params.organizationId,params.personId)
  if(person.claimedUserId||person.expectedUserId)personnelFail('PERSONNEL_ALREADY_BOUND')
  const login=params.username.trim().toLowerCase()
  if(!/^[a-z0-9_.-]{4,32}$/.test(login)||!params.verifiedOffline)personnelFail('PERSONNEL_OFFLINE_VERIFICATION_REQUIRED',400)
  const account=await tx.campusAccount.findUnique({where:{normalizedLogin:login},include:{user:true}})
  if(!account||account.user.accountDomain!=='SCHOOL'||!(person.kind==='STUDENT'?account.user.role==='STUDENT':['TEACHER','ADMIN'].includes(account.user.role))||!account.user.isActive||account.user.isFrozen||account.user.mustChangePassword||(account.user.expiresAt&&account.user.expiresAt<=new Date()))personnelFail('PERSONNEL_ACCOUNT_MISMATCH')
  const bound=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM campus_personnel WHERE organization_id=${params.organizationId} AND (expected_user_id=${account!.userId} OR claimed_user_id=${account!.userId})`
  if(bound.length)personnelFail('PERSONNEL_ALREADY_BOUND')
  if(person.kind==='STUDENT'){
   const enrolled=await tx.campusStudentEnrollment.findUnique({where:{userId:account!.userId},select:{userId:true}})
   const owners=await tx.educationTeacherStudentInvitation.findMany({where:{organizationId:params.organizationId,studentNoDigest:person.numberDigest,consumedByUserId:{not:null}},select:{consumedByUserId:true}})
   const mismatch=await tx.$queryRaw<Array<{id:string}>>`SELECT a.id FROM organization_student_class_assignments a JOIN organization_memberships m ON m.organization_id=a.organization_id AND m.id=a.membership_id WHERE m.user_id=${account!.userId} AND m.organization_id=${params.organizationId} AND a.is_primary=TRUE AND a.valid_until IS NULL AND a.class_unit_id<>${person.classUnitId}`
   if(enrolled||mismatch.length||owners.some(x=>x.consumedByUserId!==account!.userId))personnelFail('PERSONNEL_ACCOUNT_MISMATCH')
  }
  const profile=decryptPersonnel(params.organizationId,person.id,person.profileCipher)
  await tx.$executeRaw`UPDATE campus_personnel SET expected_user_id=${account!.userId},profile_cipher=${encryptPersonnel(params.organizationId,person.id,{...profile,username:login})} WHERE id=${person.id}`
  await tx.$executeRaw`UPDATE campus_personnel_credentials SET revoked_at=statement_timestamp() WHERE person_id=${person.id} AND revoked_at IS NULL`
  await appendAudit(tx,{organizationId:params.organizationId,actorUserId:params.actor.userId,action:'CAMPUS_PERSONNEL_EXISTING_ACCOUNT_VERIFIED',targetType:'PERSONNEL',targetId:person.id,domainEventId:randomUUID(),payload:{offlineVerification:true}})
  return {status:'PENDING_OWNER_CONFIRMATION' as const}
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
}
