import {randomBytes,randomUUID} from 'node:crypto'
import type {Server} from 'node:http'
import express from 'express'
import {Prisma,PrismaClient,type User} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {config} from '../../config'
import {generateToken} from '../../utils/jwt'
import {csrfProtection} from '../../middleware/csrf'
import {errorHandler} from '../../middleware/errorHandler'
import {trainingScaleLibraryGovernanceRouter} from '../../modules/scale-library-governance/routes'
import {publishContentRelease} from '../../modules/measurement-content/repository'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {submit,review} from '../../modules/scale-library-governance/service'
import {readEducationLibraryUse} from '../../modules/scale-library-governance/education-use'
import {readEducationLibraryRegisteredSource} from '../../modules/scale-library-governance/education-runtime-resources'
import type {EducationAdministration} from '../../modules/scale-library-governance/education-applicability'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
const prefix='httpgate'+randomUUID().slice(0,8)
const definition={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'问题',required:true,reverse:false,dimensionKeys:['total']}]}
const metadata={title:'Synthetic HTTP scale',author:'Synthetic author',copyright:'Self authored redistribution explicitly permitted',applicability:'Synthetic only',scoringDescription:'Mean',reportDescription:'Descriptive, no diagnosis'}
const five:EducationAdministration[]=[{population:'STUDENT',responseMode:'SELF'},{population:'STUDENT',responseMode:'PARENT_REPORT'},{population:'STUDENT',responseMode:'TEACHER_REPORT'},{population:'TEACHER',responseMode:'SELF'},{population:'TEACHER',responseMode:'STUDENT_REPORT'}]
type Entry={entryId:string;releaseId:string;contentHash:string;submissionId:string;snapshotHash:string}
let db:PrismaClient,server:Server,base:string,admin:User,delegate:User,ordinary:User,owner:User,member:User,otherMember:User,outsider:User
let organizationId:string,otherOrg:string,projectId:string,approved:Entry,unsupported:Entry,dependency:Entry,delegateGrant:string,originalJwt:string
const creates=(domain:'LEGACY'|'SURVEY'|'SCHOOL',extra:Prisma.UserCreateInput={username:'unused',passwordHash:'synthetic'})=>db.user.create({data:{...extra,username:prefix+randomUUID().slice(0,8),passwordHash:'non-login-synthetic-fixture',accountDomain:domain}})
const exact=(entry=approved)=>({releaseId:entry.releaseId,contentHash:entry.contentHash})
const picker=(product:'SCHOOL'|'TEACHER'='SCHOOL')=>({...exact(),product,scopeKind:'USER',organizationId})
const command=(product:'SCHOOL'|'TEACHER',scopeKind:'USER'|'ORGANIZATION',userId:string|null)=>({...exact(),product,scopeKind,organizationId,userId,requestId:randomUUID()})
const token=(user:User,extra:Record<string,unknown>={})=>{
 const accountDomain=user.accountDomain
 if(accountDomain!=='LEGACY'&&accountDomain!=='SURVEY'&&accountDomain!=='SCHOOL')throw new Error('unexpected synthetic account domain')
 return generateToken({userId:user.id,username:user.username,role:user.role,accountDomain,tokenVersion:user.tokenVersion,
  adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID(),...extra})
}
async function http(method:'GET'|'POST',path:string,actor:User|null,data?:Record<string,unknown>,options:{csrf?:boolean;token?:string;origin?:string}={}){
 const headers:Record<string,string>={'Origin':options.origin??'https://training.eduk12.top'}
 const cookies:string[]=[]
 // The real platform middleware accepts only its session cookie, never Bearer.
 if(actor)cookies.push('ptool_session='+encodeURIComponent(options.token??token(actor)))
 if(method==='POST'){
  headers['Content-Type']='application/json'
  if(options.csrf!==false){cookies.push('ptool_csrf=synthetic-http-csrf');headers['x-csrf-token']='synthetic-http-csrf'}
 }
 if(cookies.length)headers.Cookie=cookies.join('; ')
 const query=method==='GET'&&data?'?'+new URLSearchParams(Object.entries(data).map(([key,value])=>[key,String(value)])):''
 const response=await fetch(base+path+query,{method,headers,...(method==='POST'?{body:JSON.stringify(data??{})}:{})})
 return {status:response.status,body:await response.json() as any}
}
const entryPath=(entry=approved)=>'/entries/'+entry.entryId
async function approvedEntry(administrations:EducationAdministration[],withReport=false):Promise<Entry>{
 const release=await db.$transaction(tx=>publishContentRelease(tx,scaleMeasurementRelease({localId:randomUUID(),version:'v1',instrumentVersion:'1',
  definition:compileResearchScale(metadata.title,definition),instrumentClass:'CUSTOM_DESCRIPTIVE',presentationMode:'ALL_AT_ONCE',
  scope:{kind:'PRIVATE',ownerId:owner.id,product:'SURVEY',resourceId:projectId},provenance:{authoringRelationship:'ORIGINAL',
   authoringSnapshot:{title:metadata.title,definition,instrumentClass:'CUSTOM_DESCRIPTIVE',product:'SURVEY'}}}),owner.id))
 if(release.layer!=='MEASUREMENT'||release.family!=='SCALE')throw new Error('synthetic scale measurement expected')
 const dependencies:string[]=[]
 if(withReport){
  const report=await db.$transaction(tx=>publishContentRelease(tx,{layer:'REPORT',family:'SCALE',key:prefix+randomUUID(),version:'1',
   scope:{kind:'PRIVATE',ownerId:owner.id,product:'SURVEY',resourceId:projectId},assetRefs:[],sourceReleaseId:null,provenance:{fixture:true},
   content:{projectionVersion:1,measurements:[{releaseId:release.releaseId,contentHash:release.contentHash}],metricKeys:release.content.metrics.map(metric=>metric.metricKey),
    audience:'researcher',language:'zh-CN',generatorVersion:'1',template:{title:'Synthetic report',blocks:[{type:'TEXT',text:'Synthetic prose'}]}}},owner.id))
  dependencies.push(report.releaseId)
 }
 const application=await submit(owner.id,'SURVEY',{requestId:randomUUID(),releaseId:release.releaseId,metadata,dependencyReleaseIds:dependencies,
  educationApplicability:{schemaVersion:1,administrations}})
 const result=await review(admin.id,application.id,{expectedVersion:1,decision:'APPROVE',allowedProducts:['TRAINING','SURVEY'],reason:'Isolated synthetic HTTP approval'})
 const [frozen]=await db.$queryRaw<Array<{snapshot_hash:string}>>`SELECT snapshot_hash FROM scale_library_submissions WHERE id=${application.id}`
 return {entryId:result.entryId!,releaseId:release.releaseId,contentHash:release.contentHash,submissionId:application.id,snapshotHash:frozen.snapshot_hash}
}
suite('Education public distribution real HTTP / isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  if(process.env.NODE_ENV!=='test')throw new Error('test process required; no deployed authentication configuration')
  // Ephemeral process-local signing only. No persistent credential or login account setup.
  originalJwt=config.jwtSecret;config.jwtSecret=randomBytes(32).toString('hex')
  process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  admin=await creates('LEGACY',{username:'x',passwordHash:'x',role:'ADMIN',platformRole:'SYSTEM_ADMIN'})
  delegate=await creates('LEGACY',{username:'x',passwordHash:'x',role:'ADMIN'})
  ordinary=await creates('LEGACY',{username:'x',passwordHash:'x',role:'TEACHER',teacherApproved:true})
  owner=await creates('SURVEY');member=await creates('SCHOOL');otherMember=await creates('SCHOOL');outsider=await creates('SCHOOL')
  const login=prefix+'owner'
  await db.surveyAccount.create({data:{userId:owner.id,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:owner.id,status:'ACTIVE',grantedBy:admin.id}})
  await db.surveyMfaCredential.create({data:{userId:owner.id,enabled:true,secretCipher:'synthetic-only'}})
  projectId=randomUUID();await db.surveyProject.create({data:{id:projectId,ownerUserId:owner.id,title:'Synthetic HTTP source',collectionMode:'SINGLE_UNLINKED'}})
  approved=await approvedEntry(five);unsupported=await approvedEntry([{population:'TEACHER',responseMode:'STUDENT_REPORT'}]);dependency=await approvedEntry(five,true)
  organizationId=randomUUID();otherOrg=randomUUID()
  for(const id of [organizationId,otherOrg])await db.organization.create({data:{id,name:prefix+id,productDomain:'SCHOOL',createdByUserId:admin.id}})
  for(const product of ['HUISCHOOL','HUITEACHER'])await db.educationProductEntitlement.create({data:{organizationId,product,grantedByUserId:admin.id}})
  for(const user of [member,otherMember,outsider])await db.organizationMembership.create({data:{id:randomUUID(),organizationId:user===outsider?otherOrg:organizationId,userId:user.id,validFrom:new Date('2020-01-01')}})
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:delegate.id,entry:'HUITEACHER',grantedBy:admin.id}})
  delegateGrant=randomUUID()
  await db.contentCapabilityGrant.create({data:{id:delegateGrant,subjectId:delegate.id,issuerId:admin.id,product:'TEACHER',scopeKind:'PLATFORM',scopeId:'scale-library-governance',resourceKind:'material',resourceKeys:[approved.releaseId],capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000),expiresAt:new Date(Date.now()+3600000),ancestry:[delegateGrant]}})
  const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/training/scale-library-governance',trainingScaleLibraryGovernanceRouter);app.use(errorHandler)
  server=await new Promise<Server>(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening))})
  const address=server.address();if(!address||typeof address==='string')throw new Error('loopback HTTP listener missing')
  base='http://127.0.0.1:'+address.port+'/api/training/scale-library-governance'
 },120000)
 afterAll(async()=>{
  if(server)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
  if(originalJwt!==undefined)config.jwtSecret=originalJwt
  await db?.$disconnect()
 })
 it('requires actual authentication, CSRF, current admin proof and exact delegated material authority',async()=>{
  const path=entryPath()+'/recipients',write=entryPath()+'/grants',body=command('SCHOOL','USER',member.id)
  expect((await http('GET',path,null,picker())).status).toBe(401)
  expect((await http('GET',path,owner,picker())).status).toBe(401)
  expect((await http('GET',path,ordinary,picker())).status).toBe(403)
  expect((await http('GET',path,admin,picker(),{token:token(admin,{tokenVersion:admin.tokenVersion+1})})).status).toBe(401)
  expect((await http('GET',path,admin,picker(),{token:token(admin,{adminVerifiedAt:undefined,adminSessionId:undefined})})).status).toBe(401)
  expect((await http('POST',write,admin,body,{csrf:false})).status).toBe(403)
  expect((await http('POST',write,admin,body,{origin:'https://survey.eduk12.top'})).status).toBe(403)
  expect((await http('POST',write,admin,body,{token:token(admin,{adminVerifiedAt:Math.floor(Date.now()/1000)-600})})).body.code).toBe('ADMIN_KEY_STEP_UP_REQUIRED')
  expect((await http('GET',path,delegate,picker('TEACHER'))).status).toBe(403)
  expect((await http('GET',path,delegate,{...picker('TEACHER'),grantId:delegateGrant})).status).toBe(200)
  expect((await http('GET',path,delegate,{...picker(),grantId:delegateGrant})).status).toBe(403)
  expect(await db.scale.findUnique({where:{libraryEntryId:approved.entryId}})).toBeNull()
 },120000)
 it('uses the public picker and grant transaction for exact USER/ORG scopes, current eligibility, idempotence and only runnable variants',async()=>{
  const path=entryPath(),query=picker()
  const users=await http('GET',path+'/recipients',admin,query)
  expect(users.status).toBe(200);expect(users.body.data).toMatchObject({product:'SCHOOL',scopeKind:'USER',organizationId})
  expect(users.body.data.list.map((row:any)=>row.id).sort()).toEqual([member.id,otherMember.id].sort())
  expect((await http('GET',path+'/recipients',admin,{...query,cursor:outsider.id})).status).toBe(400)
  const orgs=await http('GET',path+'/recipients',admin,{...exact(),product:'TEACHER',scopeKind:'ORGANIZATION',keyword:prefix})
  expect(orgs.status).toBe(200);expect(orgs.body.data.list.map((row:any)=>row.id)).toEqual([organizationId])
  for(const patch of [{releaseId:randomUUID()},{contentHash:'f'.repeat(64)}]){
   expect((await http('GET',path+'/recipients',admin,{...query,...patch})).body.message).toContain('EXACT_VERSION_MISMATCH')
   expect((await http('POST',path+'/grants',admin,{...command('SCHOOL','USER',member.id),...patch})).body.message).toContain('EXACT_VERSION_MISMATCH')
  }
  expect((await http('POST',path+'/grants',admin,{...command('SCHOOL','ORGANIZATION',null),userId:member.id})).status).toBe(400)
  expect((await http('POST',path+'/grants',admin,command('SCHOOL','USER',outsider.id))).status).toBe(403)
  const deny=await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId,userId:otherMember.id,permission:'HUISCHOOL_ACCESS',reason:'Synthetic current deny',deniedByUserId:admin.id}})
  expect((await http('GET',path+'/recipients',admin,query)).body.data.list.map((row:any)=>row.id)).not.toContain(otherMember.id)
  expect((await http('POST',path+'/grants',admin,command('SCHOOL','USER',otherMember.id))).status).toBe(403)
  await db.organizationAccessDeny.update({where:{id:deny.id},data:{liftedAt:new Date(),liftedByUserId:admin.id}})
  await db.educationProductEntitlement.update({where:{organizationId_product:{organizationId,product:'HUISCHOOL'}},data:{status:'SUSPENDED',suspendedAt:new Date()}})
  expect((await http('GET',path+'/recipients',admin,query)).status).toBe(403)
  expect((await http('POST',path+'/grants',admin,command('SCHOOL','ORGANIZATION',null))).status).toBe(403)
  await db.educationProductEntitlement.update({where:{organizationId_product:{organizationId,product:'HUISCHOOL'}},data:{status:'ACTIVE',suspendedAt:null}})
  const request=command('SCHOOL','USER',member.id)
  const first=await http('POST',path+'/grants',admin,request),replay=await http('POST',path+'/grants',admin,request)
  expect(first.status).toBe(200);expect(replay.status).toBe(200);expect(replay.body.data.id).toBe(first.body.data.id)
  const [count]=await db.$queryRaw<Array<{n:number}>>`SELECT count(*)::int AS n FROM scale_library_use_grants WHERE id=${request.requestId}`
  expect(count.n).toBe(1)
  expect((await http('POST',path+'/grants',admin,{...request,userId:otherMember.id})).status).toBe(409)
  expect((await http('POST',path+'/grants',admin,command('SCHOOL','ORGANIZATION',null))).status).toBe(200)
  expect((await http('POST',path+'/grants',admin,command('TEACHER','ORGANIZATION',null))).status).toBe(200)
  const delegated=await http('POST',path+'/grants',delegate,{...command('TEACHER','USER',otherMember.id),grantId:delegateGrant})
  expect(delegated.status).toBe(200);expect(delegated.body.data.issuerId).toBe(delegate.id)
  for(const [product,variants] of [['SCHOOL',['STUDENT:SELF','STUDENT:PARENT_REPORT','STUDENT:TEACHER_REPORT']],['TEACHER',['TEACHER:SELF']]] as const){
   const rows=await db.$queryRaw<Array<{key:string;composite_id:string}>>(Prisma.sql`SELECT r.entry->'libraryOrigin'->>'variantKey' AS key,r.composite_id
    FROM registered_assessment_resources r JOIN composite_assessments c ON c.id=r.composite_id AND c.status='PUBLISHED'
    WHERE r.entry->'libraryOrigin'->>'entryId'=${approved.entryId} AND r.entry->'libraryOrigin'->>'product'=${product}`)
   expect(rows.map(row=>row.key).sort()).toEqual([...variants].sort());expect(new Set(rows.map(row=>row.composite_id)).size).toBe(variants.length)
  }
  expect(await db.scale.count({where:{libraryEntryId:approved.entryId}})).toBe(1)
  const [snapshot]=await db.$queryRaw<Array<{snapshot:any;snapshot_hash:string}>>`SELECT snapshot,snapshot_hash FROM scale_library_submissions WHERE id=${approved.submissionId}`
  expect(snapshot.snapshot.educationApplicability.administrations.map((row:EducationAdministration)=>row.population+':'+row.responseMode).sort()).toEqual(five.map(row=>row.population+':'+row.responseMode).sort())
  expect(snapshot.snapshot_hash).toBe(approved.snapshotHash)
 },120000)
 it('rejects unsupported declarations/dependencies and revoked new use while retaining exact historical resource identity',async()=>{
  for(const [entry,reason] of [[unsupported,'PRODUCT_VARIANT_ADAPTER_NOT_READY'],[dependency,'DEPENDENCY_ADAPTER_NOT_READY']] as const){
   for(const product of ['SCHOOL','TEACHER'] as const){
    const query={...exact(entry),product,scopeKind:'USER',organizationId}
    const pickerResult=await http('GET',entryPath(entry)+'/recipients',admin,query)
    const grantResult=await http('POST',entryPath(entry)+'/grants',admin,{...query,requestId:randomUUID(),userId:member.id})
    expect(pickerResult.status).toBe(409);expect(pickerResult.body.message).toContain(reason)
    expect(grantResult.status).toBe(409);expect(grantResult.body.message).toContain(reason)
   }
   expect(await db.scale.findUnique({where:{libraryEntryId:entry.entryId}})).toBeNull()
  }
  // Unsupported course-teacher interpretation cannot be smuggled as an extra grant field.
  expect((await http('POST',entryPath()+'/grants',admin,{...command('SCHOOL','USER',otherMember.id),targetMode:'COURSE_TEACHER'})).status).toBe(400)
  const [resource]=await db.$queryRaw<Array<{resource_key:string;resource_version:string;entry_hash:string;definition_hash:string}>>(Prisma.sql`SELECT resource_key,resource_version,entry_hash,definition_hash FROM registered_assessment_resources WHERE entry->'libraryOrigin'->>'entryId'=${approved.entryId} AND entry->'libraryOrigin'->>'product'='SCHOOL' ORDER BY resource_key LIMIT 1`)
  const source=()=>db.$transaction(tx=>readEducationLibraryRegisteredSource(tx,{product:'SCHOOL',resourceKey:resource.resource_key,resourceVersion:resource.resource_version,purpose:'HISTORY'}))
  await expect(source()).resolves.toBeTruthy()
  const granted=await http('GET',entryPath()+'/grants',admin)
  expect(granted.status).toBe(200)
  for(const grant of granted.body.data.list.filter((row:any)=>row.product==='SCHOOL')){
   expect((await http('POST','/grants/'+grant.id+'/revoke',admin,{expectedVersion:grant.version,reason:'Synthetic future-use withdrawal'})).status).toBe(200)
  }
  await expect(db.$transaction(tx=>readEducationLibraryUse(tx,{...exact(),entryId:approved.entryId,product:'SCHOOL',organizationId,actorId:member.id}))).rejects.toThrow()
  await expect(source()).resolves.toBeTruthy()
  const [after]=await db.$queryRaw<Array<{entry_hash:string;definition_hash:string}>>`SELECT entry_hash,definition_hash FROM registered_assessment_resources WHERE resource_key=${resource.resource_key} AND resource_version=${resource.resource_version}`
  expect(after).toEqual({entry_hash:resource.entry_hash,definition_hash:resource.definition_hash})
  await db.contentCapabilityGrant.update({where:{id:delegateGrant},data:{revokedAt:new Date(),revokedBy:admin.id,revokeReason:'Synthetic authority withdrawal',version:{increment:1}}})
  expect((await http('GET',entryPath()+'/recipients',delegate,{...picker('TEACHER'),grantId:delegateGrant})).status).toBe(403)
  expect((await http('POST',entryPath()+'/grants',delegate,{...command('TEACHER','USER',member.id),grantId:delegateGrant})).status).toBe(403)
 },120000)
})
