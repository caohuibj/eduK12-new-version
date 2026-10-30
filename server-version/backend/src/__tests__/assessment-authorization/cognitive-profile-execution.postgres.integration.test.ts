import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_COGNITIVE_PROFILE_EXECUTION==='1'?describe:describe.skip
suite('Explicit profile execution closure with retained v1 history',()=>{
 let db:any,system:any,config:any,oldRows:any,oldPolicies:any,oldUsers:any,oldGrants:any,oldTasks:any,oldAttempts:any,artifacts:any[]=[],ready=false
 const observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_COGNITIVE_PROFILE_DATABASE_URL;if(!url)throw Error('Explicit retained profile fixture required');requireIsolatedReleaseDatabase(url)
  const parsed=new URL(url)
  if(process.env.NODE_ENV!=='test'||parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_cognitive_profile_artifact_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Exact retained runtime fixture required')
  db=(await import('../../config/database')).prisma
  if(await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_PROFILE_APPROVED'}})!==3)throw Error('Read retained outcome before retry; no source republication')
  oldRows=await db.$queryRaw`SELECT * FROM assessment_public_templates ORDER BY template_hash`
  expect(oldRows.filter((r:any)=>r.template_kind==='COGNITIVE_PROFILE_CONFIGURATION')).toHaveLength(2)
  oldPolicies=await db.$queryRaw`SELECT * FROM survey_tool_policies ORDER BY product,resource_key,fingerprint`
  oldUsers=await db.user.findMany({orderBy:{id:'asc'}});oldGrants=await db.materialGrant.findMany({orderBy:{id:'asc'}})
  oldTasks=await db.compositeAssessment.findMany({orderBy:{id:'asc'}});oldAttempts=await db.compositeAssessmentAttempt.findMany({orderBy:{id:'asc'}})
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  config=await db.cognitiveTestConfig.findFirstOrThrow({where:{testType:'reaction',configVersion:'1.1.0',status:'PUBLISHED'}})
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_COGNITIVE_EXECUTION_EVIDENCE??'/tmp/cognitive-profile-execution.json',JSON.stringify({productionAccessed:false,
   scope:'Same registered main profile definitions; explicit v2 execution freeze and system approval only. No source install, new use grant, assignment or START.',
   observations,artifacts:artifacts.map(row=>({artifactHash:row.artifactHash,identity:row.artifact.identity,formatVersion:row.artifact.schemaVersion,
    compiledRuntimeHash:row.artifact.execution?.compiledRuntime.compiledRuntimeHash}))},null,2)+'\n')
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('reads the original v1 artifacts without hydrating current execution and explicitly approves new immutable v2 records',async()=>{
  const {Prisma}=await import('@prisma/client'),{createPublicTemplateStore}=await import('../../modules/assessment-runtime/public-templates')
  const store=createPublicTemplateStore({read:async hashes=>db.$queryRaw`SELECT template_hash AS "templateHash",template_kind AS "templateKind",plaintext_bytes AS "plaintextBytes",payload_encrypted AS "payloadEncrypted"
   FROM assessment_public_templates WHERE template_hash IN (${Prisma.join(hashes)})`,append:async()=>{throw Error('Historical read cannot append')}})
  const api=await import('../../modules/assessment-authorization/cognitive-profile-artifact'),source=await import('../../modules/assessment-authorization/cognitive-profile-source')
  const rows=oldRows.filter((row:any)=>row.template_kind==='COGNITIVE_PROFILE_CONFIGURATION')
  for(const row of rows){
   const [raw]=await store.loadMany([{hash:row.template_hash,kind:'COGNITIVE_PROFILE_CONFIGURATION'}])
   const saved=api.readCognitiveProfileArtifact(raw);expect(saved.schemaVersion).toBe(1);expect(saved.execution).toBeUndefined()
   await expect(db.$transaction((tx:any)=>source.assertPublishedCognitiveArtifactSource(tx,saved))).rejects.toMatchObject({statusCode:409})
  }
  const approval=await import('../../modules/assessment-authorization/cognitive-profile-approval')
  const first=await db.assessmentManagementEvent.findFirstOrThrow({where:{action:'COGNITIVE_PROFILE_APPROVED'},orderBy:{createdAt:'asc'}})
  const receipt=approval.cognitiveProfileApprovalReceipt.parse(first.metadata),oldConfig=receipt.configuration
  const proof={tokenVersion:system.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
  expect(await approval.approveCognitiveProfile(system.id,config.id,oldConfig.profile,{requestId:first.id,expectedArtifactHash:receipt.artifactHash,
   allowedProducts:receipt.allowedProducts,reason:receipt.reason},proof)).toMatchObject({artifactHash:receipt.artifactHash,replayed:true,changed:false})
  for(const profile of ['experience','research'] as const){
   const prepared=await db.$transaction((tx:any)=>source.preparePublishedCognitiveProfile(tx,config.id,profile))
   expect(prepared.artifact.schemaVersion).toBe(2);expect(prepared.artifact.execution.compiledRuntime.instrumentType).toBe('COGNITIVE')
   expect(rows.map((r:any)=>r.template_hash)).not.toContain(prepared.artifactHash)
   await approval.approveCognitiveProfile(system.id,config.id,profile,{requestId:randomUUID(),expectedArtifactHash:prepared.artifactHash,
    allowedProducts:['TRAINING','SURVEY','SCHOOL','TEACHER'],reason:'Synthetic explicit static execution closure approval'},proof)
   const saved=await api.loadCognitiveProfileArtifact(prepared.artifactHash,prepared.artifact.identity)
   await db.$transaction((tx:any)=>source.assertPublishedCognitiveArtifactSource(tx,saved))
   artifacts.push(prepared)
  }
  ready=true;observations.push({originalV1Reads:2,noAutomaticExecutionHydration:true,oldV1NewUseDenied:true,oldRequestStillReturnsOriginalHash:true,
   newV2ExplicitlyApproved:2,configSourceNotRepublished:true})
 },30000)
 it('keeps earlier definitions/policies and all existing users/tasks/attempts intact after versioned content additions',async()=>{
  if(!ready)throw Error('Execution preparation incomplete; dependent reads forbidden')
  const all=await db.$queryRaw`SELECT * FROM assessment_public_templates ORDER BY template_hash`
  expect(all.filter((r:any)=>!artifacts.some(a=>a.artifactHash===r.template_hash))).toEqual(oldRows)
  const policies=await db.$queryRaw`SELECT * FROM survey_tool_policies ORDER BY product,resource_key,fingerprint`
  expect(policies.filter((p:any)=>!artifacts.some(a=>a.artifactHash===p.fingerprint))).toEqual(oldPolicies)
  expect(await db.user.findMany({orderBy:{id:'asc'}})).toEqual(oldUsers);expect(await db.materialGrant.findMany({orderBy:{id:'asc'}})).toEqual(oldGrants)
  expect(await db.compositeAssessment.findMany({orderBy:{id:'asc'}})).toEqual(oldTasks)
  expect(await db.compositeAssessmentAttempt.findMany({orderBy:{id:'asc'}})).toEqual(oldAttempts)
  expect(await db.cognitiveTestConfig.count()).toBe(1)
  expect(await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_PROFILE_APPROVED'}})).toBe(5)
  observations.push({oldPublicContentAndPolicyRowsUnchanged:true,sameOneNativeConfig:true,noUserGrantTaskOrAttemptChanges:true,
   newArtifactBodies:2,newExplicitPolicyRows:8,newApprovalAudits:2})
 },20000)
})
