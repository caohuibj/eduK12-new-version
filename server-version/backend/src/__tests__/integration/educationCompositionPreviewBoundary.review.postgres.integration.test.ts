import {randomUUID} from 'node:crypto'
import type {Server} from 'node:http'
import express from 'express'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {authenticateSchool} from '../../middleware/auth'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {CSRF_HEADER_NAME,SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME} from '../../utils/authCookies'
import {educationPrivateToolRouter} from '../../modules/education-tools/private-tool.routes'
import * as tools from '../../modules/education-tools/private-tool.service'
import {educationPublicSourceKey} from '../../modules/education-tools/public-source.identity'
import {issueAdminContentRoot} from '../../modules/measurement-content/admin-authority.service'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {compileResearchScale} from '../../modules/survey/builder.compiler'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip

// A serializer boundary regression, not another START/FINAL qualification.
// The Standard is installed and approved through the original publication API;
// no ONLINE row, registry override, source snapshot or runtime is fabricated.
suite('Review: public Standard content at the whole-composition preview boundary',()=>{
 let server:Server|undefined,base:string,sourceId:string,sourceHash:string,systemId:string
 const key='domain_fixed_mindset_mathematics_zh_cn',version='1.0.0'
 const proof=()=>({tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:'synthetic-review-standard-session'})

 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  systemId=(await db.user.create({data:{username:'review-standard-'+randomUUID(),passwordHash:'synthetic-only',platformRole:'SYSTEM_ADMIN',accountDomain:'TRAINING'}})).id
  const registry=await import('../../modules/scale/onboarding/instrument-registry')
  const install=await import('../../modules/scale/onboarding/install')
  const publish=await import('../../modules/scale/onboarding/publish')
  const source=registry.getScaleInstrumentSource(key,version)!,policy=registry.getScaleInstrumentRuntimePolicy(key,version)!
  const input={instrumentKey:key,instrumentVersion:version,actorUserId:systemId,deploymentPolicy:{schemaVersion:2 as const,revision:1,
   locale:'zh-CN',territory:source.scientificReview?.territory??'ZZ',deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE'] as Array<'STANDALONE'|'COMPOSITE'|'QUESTIONNAIRE'>,
   runtimePolicyHash:policy.runtimePolicyHash,localizationVersion:version,inFlightCompletion:'FROZEN_DEADLINE' as const}}
  const planned=await install.planScaleInstrumentInstall(db,input)
  expect(planned.blockers).toEqual([])
  await install.installScaleInstrument(db,input)
  const publication={instrumentKey:key,instrumentVersion:version,actorUserId:systemId,visibility:'HIDDEN' as const,allowedProducts:['SURVEY' as const]}
  const ready=await publish.planStandardScalePublication(db,publication)
  expect(ready.blockers).toEqual([])
  await publish.publishStandardScale(db,{...publication,expectedProofHash:ready.proofHash})
  const {sourceParts}=await import('../../modules/survey/standard-triplet.model')
  const {previewStandardTriplet,approveStandardTriplet}=await import('../../modules/survey/standard-triplet.service')
  const parts=sourceParts(key,version),selection={toolKey:key,CONTENT:parts.find(p=>p.axis==='CONTENT')!.hash,
   PARAMETERS:parts.find(p=>p.axis==='PARAMETERS')!.hash,REPORT:parts.find(p=>p.axis==='REPORT')!.hash}
  const triplet=await previewStandardTriplet(db,systemId,selection)
  expect(triplet.blockers).toEqual([])
  const approved=await approveStandardTriplet(systemId,{...selection,requestId:randomUUID(),expectedCombinationHash:triplet.combinationHash,
   reason:'Isolated serializer regression fixture',allowedProducts:['SURVEY']},proof())
  sourceId=approved.id;sourceHash=triplet.combinationHash
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/campus/organizations/:organizationId/private-tools',authenticateSchool,educationPrivateToolRouter('SCHOOL'))
  app.use((error:{statusCode?:number;code?:string},_req:express.Request,res:express.Response,_next:express.NextFunction)=>
   res.status(error.statusCode??500).json({code:error.code??'ERROR'}))
  server=app.listen(0,'127.0.0.1')
  await new Promise<void>(resolve=>server!.once('listening',resolve))
  base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)

 afterAll(async()=>{
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  await db.$disconnect()
 })

 it('does not serialize scorer, reference policy or report internals through the alternate whole-preview endpoint',async()=>{
  const author=await db.user.create({data:{username:'review-author-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
  const org=await db.organization.create({data:{id:randomUUID(),name:'Synthetic preview boundary',productDomain:'SCHOOL',createdByUserId:author.id}})
  const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:author.id}})
  await db.educationProductEntitlement.create({data:{organizationId:org.id,product:'HUISCHOOL',grantedByUserId:author.id}})
  await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,persona:'COUNSELOR',grantedByUserId:author.id}})
  await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:author.id}})
  await issueAdminContentRoot(systemId,proof(),{requestId:randomUUID(),expectedVersion:0,reason:'Synthetic exact-use fixture',grant:{subjectId:author.id,
   scope:{product:'SCHOOL',scopeKind:'ORGANIZATION',scopeId:org.id,resourceKind:'material',resourceKeys:[educationPublicSourceKey({kind:'STANDARD_SCALE',id:sourceId,hash:sourceHash})]},
   capabilities:['material.use'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  const context={entry:'SCHOOL' as const,organizationId:org.id,principal:{userId:author.id,accountDomain:'SCHOOL' as const}}
  const privateDefinition=compileResearchScale('Owned preview',{schemaVersion:1,respondentType:'student_self_report',aggregation:'sum',
   responseOptions:[{optionKey:'yes',label:'Yes',score:1},{optionKey:'no',label:'No',score:0}],dimensions:[{dimensionKey:'owned',label:'Owned',direction:'descriptive'}],
   items:[{itemKey:'own',prompt:'Owned question',required:true,reverse:false,dimensionKeys:['owned']}]})
  const ownDraft=await tools.createPrivateTool(context,{kind:'SCALE',title:'Owned preview'}),ownSaved=await tools.updatePrivateTool(context,ownDraft.id,{expectedRevision:1,title:ownDraft.title,definition:privateDefinition})
  const own=await tools.freezePrivateTool(context,ownDraft.id,{expectedRevision:ownSaved.revision,expectedContentHash:ownSaved.contentHash})
  const draft=await tools.createPrivateTool(context,{kind:'COMPOSITION',title:'Preview disclosure boundary'})
  await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title:draft.title,definition:{schemaVersion:1,adapterVersion:'1.0.0',
   administration:{population:'STUDENT',responseMode:'SELF'},instruction:'',contextFields:[{contextKey:'gradeLevel',formType:'single_choice',formLabel:'年级',formOptions:[{value:'7',label:'七年级'}]}],
   blocks:[{blockId:randomUUID(),instruction:'',source:{provider:'STANDARD_SCALE',kind:'SCALE',versionId:sourceId,contentHash:sourceHash}},
    {blockId:randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:'SCALE',versionId:own.id,contentHash:own.contentHash}}]}})
  const token=generateToken({userId:author.id,username:author.username,role:author.role,tokenVersion:author.tokenVersion,accountDomain:'SCHOOL',mfaVerifiedAt:Math.floor(Date.now()/1000)})
  const csrf='synthetic-review-csrf'
  const response=await fetch(`${base}/api/campus/organizations/${org.id}/private-tools/${draft.id}/preview`,{method:'POST',headers:{
   'content-type':'application/json',cookie:`${SCHOOL_AUTH_COOKIE_NAME}=${token}; ${SCHOOL_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf},body:'{}'})
  const body=await response.json()
  expect(response.status,JSON.stringify(body.code)).toBe(200)
  const block=body.data.result.blocks[0]
  expect(body.data).toMatchObject({previewOnly:true,persistedAnswers:false})
  expect(block).toMatchObject({kind:'SCALE',definition:{items:expect.any(Array),responseSets:expect.any(Array)}})
  const internals=['scoring','referencePolicy','report'].filter(field=>field in block.definition)
  expect(internals,'The alternate preview must preserve the public Standard display-only boundary').toEqual([])
  expect(block.definition.responseSets.flatMap((set:{options:unknown[]})=>set.options).every((option:object)=>!('score'in option))).toBe(true)
  expect(body.data.result.blocks[1].definition).toMatchObject({scoring:privateDefinition.scoring,referencePolicy:privateDefinition.referencePolicy,report:privateDefinition.report})
 })
})
