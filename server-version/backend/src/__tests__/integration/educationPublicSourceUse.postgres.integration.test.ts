import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createDraft,updateDraft} from '../../modules/survey/builder.service'
import {submitOwnedSurveyTool,approveGovernedTool,governedRow,withdrawGovernedTool} from '../../modules/survey/governed-tool.service'
import {sourceParts,composeTriplet,type Axis,type Part} from '../../modules/survey/standard-triplet.model'
import {approveStandardTriplet} from '../../modules/survey/standard-triplet.service'
import {listScaleInstrumentSources} from '../../modules/scale/onboarding/instrument-registry'
import {adminContentRootRequestSchema,issueAdminContentRoot,revokeAdminContentGrant} from '../../modules/measurement-content/admin-authority.service'
import {authorizePrivateTool} from '../../modules/education-tools/private-tool.access'
import {educationPrivateToolRouter} from '../../modules/education-tools/private-tool.routes'
import {educationPublicSourceKey} from '../../modules/education-tools/public-source.identity'
import {listEducationPublicSources,readEducationPublicUse} from '../../modules/education-tools/public-source.catalog'
import {authenticateSchool,authenticateHuiteacher} from '../../middleware/auth'
import {generateToken} from '../../utils/jwt'
import {SCHOOL_AUTH_COOKIE_NAME,HUITEACHER_AUTH_COOKIE_NAME} from '../../utils/authCookies'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('Education public fixed-source use on isolated PostgreSQL',()=>{
 let server:Server,base:string,system:string,target:string,other:string,organizationId:string,formId:string,formHash:string,standardKey:string,formKey:string
 const proof=()=>({tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:'synthetic-strong-session'})
 const context=(entry:'SCHOOL'|'TEACHER'='TEACHER',userId=target):PrivateToolContext=>({entry,organizationId,principal:{userId,accountDomain:'SCHOOL'}})
 const request=(keys=[standardKey,formKey],entry:'SCHOOL'|'TEACHER'='TEACHER',subjectId=target)=>({requestId:randomUUID(),expectedVersion:0,reason:'Synthetic exact public-source use',grant:{subjectId,
  scope:{product:entry,scopeKind:'ORGANIZATION',scopeId:organizationId,resourceKind:'material',resourceKeys:keys},capabilities:['material.use'],delegableCapabilities:[],remainingDelegationDepth:0,
  validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
 async function get(entry:'SCHOOL'|'TEACHER',query='',userId=target){
  const user=await db.user.findUniqueOrThrow({where:{id:userId}}),token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,
   accountDomain:'SCHOOL',mfaVerifiedAt:Math.floor(Date.now()/1000),...(entry==='TEACHER'?{sessionProduct:'HUITEACHER' as const}:{})})
  const response=await fetch(`${base}/${entry.toLowerCase()}/organizations/${organizationId}/private-tools/public-sources${query}`,{headers:{cookie:`${entry==='TEACHER'?HUITEACHER_AUTH_COOKIE_NAME:SCHOOL_AUTH_COOKIE_NAME}=${token}`}})
  return {status:response.status,headers:response.headers,value:await response.json()}
 }
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  vi.stubEnv('SURVEY_WORKSPACE_ENABLED','true');vi.stubEnv('SURVEY_PUBLICATION_ENABLED','true')
  system=(await db.user.create({data:{username:'publicsys-'+randomUUID(),passwordHash:'synthetic',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN'}})).id
  target=(await db.user.create({data:{username:'publicauthor-'+randomUUID(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})).id
  other=(await db.user.create({data:{username:'publicadmin-'+randomUUID(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'ADMIN'}})).id
  organizationId=(await db.organization.create({data:{id:randomUUID(),name:'Synthetic public-source school',productDomain:'SCHOOL',createdByUserId:target}})).id
  const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId,userId:target}})
  await db.organizationMembership.create({data:{id:randomUUID(),organizationId,userId:other,orgRole:'ORG_ADMIN'}})
  await db.educationProductEntitlement.createMany({data:['HUISCHOOL','HUITEACHER'].map(product=>({organizationId,product:product as 'HUISCHOOL'|'HUITEACHER',grantedByUserId:system}))})
  await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:system}})
  await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId,membershipId:member.id,persona:'COUNSELOR',grantedByUserId:system}})
  await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId,membershipId:member.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:system}})
  const owner=(await db.user.create({data:{username:'publicform-'+randomUUID(),passwordHash:'synthetic',accountDomain:'SURVEY'}})).id,login='r'+randomUUID().replaceAll('-','').slice(0,18)
  await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:system}})
  await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic'}})
  const project=await db.surveyProject.create({data:{id:randomUUID(),ownerUserId:owner,title:'Synthetic original Form',collectionMode:'SINGLE_UNLINKED'}})
  const draft=await createDraft(owner,project.id,{requestId:randomUUID(),instrumentKey:'original',kind:'FORM',title:'Fixed public Form'})
  const saved=await updateDraft(owner,project.id,draft.id,{revision:draft.revision,title:draft.title,definition:{schemaVersion:1,pages:[{pageKey:'page',title:'Public page',questions:[{itemKey:'choice',type:'SINGLE',prompt:'PRIVATE_SOURCE_BODY_SENTINEL',required:true,options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],rows:[]}]}]}})
  const submitted=await submitOwnedSurveyTool(owner,project.id,draft.id,{requestId:randomUUID(),revision:saved.revision,version:'public-1',statement:'Original author explicitly shares this fixed Form',reference:{language:'zh-CN'}})
  formId=submitted.id;formHash=submitted.hash
  expect((await approveGovernedTool(system,formId,{expectedVersion:submitted.version,hash:formHash,reason:'Synthetic original source approval',decision:'APPROVE',allowedProducts:['SURVEY']},proof())).state).toBe('ONLINE')
  formKey=educationPublicSourceKey({kind:'FORM',id:formId,hash:formHash})
  const triplet=listScaleInstrumentSources().filter(source=>source.executable).map(source=>{
   const parts=Object.fromEntries(sourceParts(source.identity.instrumentKey,source.identity.instrumentVersion).map(part=>[part.axis,part])) as Record<Axis,Part>
   return composeTriplet(source.identity.instrumentKey,parts)
  }).find(source=>!source.blockers.length)!
  expect(triplet).toBeDefined()
  const fixed=await approveStandardTriplet(system,{requestId:randomUUID(),toolKey:triplet.toolKey,CONTENT:triplet.parts.CONTENT.hash,PARAMETERS:triplet.parts.PARAMETERS.hash,REPORT:triplet.parts.REPORT.hash,
   expectedCombinationHash:triplet.combinationHash,reason:'Synthetic three-axis source approval',allowedProducts:['SURVEY']},proof())
  expect(fixed.state).toBe('ONLINE');standardKey=educationPublicSourceKey({kind:'STANDARD_SCALE',id:fixed.id,hash:triplet.combinationHash})
  const app=express();app.use(express.json())
  app.use('/teacher/organizations/:organizationId/private-tools',authenticateHuiteacher,educationPrivateToolRouter('TEACHER'))
  app.use('/school/organizations/:organizationId/private-tools',authenticateSchool,educationPrivateToolRouter('SCHOOL'))
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}vi.unstubAllEnvs();await db.$disconnect()})

 it('issues exact non-delegable U and exposes bounded source summaries without wrappers, content copies or source rights',async()=>{
  const empty=await get('TEACHER');expect(empty.status,JSON.stringify(empty.value)).toBe(200);expect(empty.value.data.list).toEqual([])
  const body=request(),issued=await issueAdminContentRoot(system,proof(),body)
  expect(issued).toMatchObject({changed:true,version:1});expect(await issueAdminContentRoot(system,proof(),body)).toMatchObject({changed:false})
  await expect(issueAdminContentRoot(system,proof(),{...body,reason:'Changed retry'})).rejects.toMatchObject({statusCode:409})
  const found=await get('TEACHER');expect(found.status).toBe(200);expect(found.headers.get('cache-control')).toBe('no-store')
  const list=found.value.data.list;expect(list).toHaveLength(2)
  expect(list.find((row:any)=>row.kind==='SCALE')).toMatchObject({catalogKey:standardKey,sourceProvider:'STANDARD_SCALE',canEditOriginal:false,canDistribute:false,versions:{content:expect.any(String),parameters:expect.any(String),report:expect.any(String)}})
  expect(list.find((row:any)=>row.kind==='FORM')).toMatchObject({catalogKey:formKey,language:'zh-CN',versions:{parameters:null,report:null}})
  expect(JSON.stringify(found.value)).not.toMatch(/PRIVATE_SOURCE_BODY_SENTINEL|compiledDefinition|grantId|template|metricKey/)
  expect((await get('TEACHER','?kind=FORM&q=public')).value.data.list).toHaveLength(1)
  expect((await get('TEACHER','?q=no-such-source')).value.data.list).toEqual([])
  expect((await get('TEACHER','?cursor='+encodeURIComponent([...list].sort((a:any,b:any)=>a.catalogKey<b.catalogKey?-1:1)[0].catalogKey))).value.data.list).toHaveLength(1)
  // A valid author in another product still has no U there; an ordinary school
  // admin cannot acquire or see the author library through this endpoint.
  expect((await get('SCHOOL')).value.data.list).toEqual([]);expect((await get('SCHOOL','',other)).status).toBe(403)
  expect((await get('TEACHER','',other)).status).toBe(403)
  const school=await issueAdminContentRoot(system,proof(),request([formKey],'SCHOOL'))
  expect((await get('SCHOOL')).value.data.list).toHaveLength(1)
  const batch=await db.$transaction(async tx=>{await authorizePrivateTool(tx,context());const queries:string[]=[]
   const tracked=new Proxy(tx,{get(object,property){if(property==='$queryRaw')return (query:any)=>{queries.push(query.strings.join(' '));return object.$queryRaw(query)};return Reflect.get(object,property)}})
   const allowed=await readEducationPublicUse(tracked,context(),[standardKey,formKey,formKey],true);return {allowed,queries}
  })
  expect(batch.allowed.size).toBe(2);expect(batch.queries).toHaveLength(2);expect(batch.queries[0]).toContain('FOR SHARE OF g')
  expect(await db.compositeAssessment.count()).toBe(0);expect(await db.educationPrivateToolVersion.count()).toBe(0)
  await revokeAdminContentGrant(system,proof(),issued.grantId,{expectedVersion:1,reason:'Synthetic U withdrawal'})
  expect((await get('TEACHER')).value.data.list).toEqual([])
  expect((await db.$transaction(tx=>readEducationPublicUse(tx,context(),[standardKey,formKey],true))).size).toBe(0)
  expect((await get('SCHOOL')).value.data.list).toHaveLength(1)
  await revokeAdminContentGrant(system,proof(),school.grantId,{expectedVersion:1,reason:'Synthetic School U withdrawal'})
 })

 it('keeps current target, exact source/state and existing UUID-root boundaries on issuance',async()=>{
  for(const subjectId of [other,system])await expect(issueAdminContentRoot(system,proof(),request([formKey],'TEACHER',subjectId))).rejects.toMatchObject({statusCode:403})
  await expect(issueAdminContentRoot(system,{tokenVersion:0},request())).rejects.toMatchObject({statusCode:403})
  await expect(issueAdminContentRoot(target,proof(),request())).rejects.toMatchObject({statusCode:403})
  for(const resourceKeys of [[formKey.replace(formHash,'0'.repeat(64))],[educationPublicSourceKey({kind:'FORM',id:randomUUID(),hash:formHash})]])
   await expect(issueAdminContentRoot(system,proof(),request(resourceKeys))).rejects.toMatchObject({statusCode:403})
  const body=request()
  for(const grant of [
   {...body.grant,scope:{...body.grant.scope,resourceKeys:['*']}},
   {...body.grant,scope:{...body.grant.scope,resourceKeys:['education-source:FORM:'+formId+':'+formHash+':extra']}},
   {...body.grant,scope:{...body.grant.scope,resourceKeys:['education-source:COGNITIVE:'+formId+':'+formHash]}},
   {...body.grant,scope:{...body.grant.scope,scopeId:'arbitrary-school'}},
   {...body.grant,remainingDelegationDepth:1},
   {...body.grant,capabilities:['material.adapt']},
   {...body.grant,capabilities:['material.distribute']},
   {...body.grant,scope:{...body.grant.scope,product:'TRAINING',scopeKind:'COURSE'}},
  ])expect(adminContentRootRequestSchema.safeParse({...body,grant}).success).toBe(false)
  const issued=await issueAdminContentRoot(system,proof(),request([formKey]))
  const row=await governedRow(db,formId)
  await withdrawGovernedTool(system,formId,row.version,'Synthetic stop of new uses',proof())
  expect((await get('TEACHER')).value.data.list).toEqual([])
  await expect(issueAdminContentRoot(system,proof(),request([formKey]))).rejects.toMatchObject({statusCode:403})
  // Emergency U withdrawal still works after source stop.
  await revokeAdminContentGrant(system,proof(),issued.grantId,{expectedVersion:1,reason:'Stopped source withdrawal'})
 })
})
