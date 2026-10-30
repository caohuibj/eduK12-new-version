import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {Prisma} from '@prisma/client'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {assertExactStandardCombinationFacts,type ExactStandardCombination} from '../../modules/measurement-content/standard-combination-source'
import {getContentReleaseBatch} from '../../modules/measurement-content/repository'
import {trainingStandardUseFromEvidence,standardConfigurationIdentity} from '../../modules/assessment-authorization/standard-configuration-binding'
import {readSurveyStandardUse} from '../../modules/assessment-authorization/survey-standard-use'
import {readEducationStandardUseBinding,EDUCATION_STANDARD_USE_ACTION} from '../../modules/assessment-authorization/education-standard-use'
// PostgreSQL timestamp objects are normalized only for this before/after DB
// state digest; original configuration identity hashes remain unchanged.
const stateHash=(value:unknown)=>canonicalHash(JSON.parse(JSON.stringify(value)))
const suite=process.env.PRECISE_READONLY_INVENTORY==='1'?describe:describe.skip
const allowed=['precise_general_test_20261029','precise_training_named_configuration_test_20261029','precise_education_lifecycle_test_20261029','precise_education_replacement_test_20261029','precise_survey_standard_use_test_20261029']
suite('read-only legacy exact grant evidence inventory without backfill',()=>{
 let db:any,database='';const result:any={schemaVersion:1,productionAccessed:false,writeOrBackfill:false,currentAuthorityEvaluated:false,
  scope:'Existing immutable scale grant evidence and source hashes only. No eligibility conversion, task/snapshot migration, permission resurrection or current/latest default.'}
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL??process.env.PRECISE_GENERAL_TEST_DATABASE_URL
  if(!url)throw Error('Explicit retained synthetic database required');requireIsolatedReleaseDatabase(url)
  database=new URL(url).pathname.slice(1)
  if(process.env.NODE_ENV!=='test'||!allowed.includes(database)||new URL(url).port!=='55439'||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('Only named local retained fixtures allowed')
  db=(await import('../../config/database')).prisma
 })
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_READONLY_INVENTORY_EVIDENCE??'/tmp/precise-readonly-inventory.json',JSON.stringify({...result,database},null,2)+'\n')
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('classifies exact original T1/source evidence in a database-enforced read-only snapshot and proposes no writes',async()=>{
  await db.$transaction(async(tx:Prisma.TransactionClient)=>{
   await tx.$executeRaw`SET TRANSACTION READ ONLY`
   const mode=await tx.$queryRaw<Array<{transaction_read_only:string}>>`SHOW transaction_read_only`;expect(mode[0].transaction_read_only).toBe('on')
   const sources=await tx.$queryRaw<ExactStandardCombination[]>`SELECT * FROM survey_standard_releases ORDER BY id LIMIT 129`
   if(sources.length>128)throw Error('Read-only fixture source bound exceeded, no partial classification')
   const measurements=await getContentReleaseBatch(tx,sources.flatMap(r=>r.measurement_release?[r.measurement_release.releaseId]:[]))
   const sourceIdentity=new Map<string,ReturnType<typeof standardConfigurationIdentity>>(),sourceErrors=new Map<string,string>()
   for(const source of sources){try{
    const measurement=source.measurement_release?measurements.get(source.measurement_release.releaseId):null
    assertExactStandardCombinationFacts(source,measurement,'HISTORY')
    if(!measurement||measurement.layer!=='MEASUREMENT')throw Error('Historical exact measurement missing')
    sourceIdentity.set(source.id,standardConfigurationIdentity({row:source,measurement}))
   }catch(error){sourceErrors.set(source.id,error instanceof Error?error.message:'Invalid historical source')}}
   const training=await tx.materialGrant.findMany({where:{resourceType:'STANDARD_COMBINATION'},orderBy:{id:'asc'},take:129})
   const survey=await tx.$queryRaw<Array<{id:string;userId:string;createdBy:string;status:string;snapshot:any}>>`SELECT id,user_id AS "userId",created_by AS "createdBy",status,snapshot FROM survey_tool_grants ORDER BY id LIMIT 129`
   const education=await tx.contentCapabilityGrant.findMany({where:{product:{in:['SCHOOL','TEACHER']},capabilities:{equals:['material.use']}},orderBy:{id:'asc'},take:129})
   if([training,survey,education].some(rows=>rows.length>128))throw Error('Read-only fixture grant bound exceeded, no partial classification')
   const audits=await tx.assessmentManagementEvent.findMany({where:{action:{in:['STANDARD_COMBINATION_USE_GRANTED',EDUCATION_STANDARD_USE_ACTION]}},orderBy:{id:'asc'},take:513})
   if(audits.length>512)throw Error('Read-only fixture audit bound exceeded, no partial classification')
   const fingerprint=()=>stateHash({sources,measurements:[...measurements],training,survey,education,audits})
   const before=fingerprint(),rows:any[]=[]
   const exact=(sealed:any)=>{
    if(!sealed||sealed.binding.configuration.kind!=='STANDARD_COMBINATION')throw Error('Expected an original exact scale identity')
    const c=sealed.binding.configuration,original=sourceIdentity.get(c.combinationId)
    if(!original||canonicalHash(original)!==canonicalHash(c))throw Error(sourceErrors.get(c.combinationId)??'No matching immutable original source')
    return {configurationHash:sealed.binding.configurationHash,bindingHash:sealed.bindingHash,authorizationRevision:sealed.binding.authorization.revision}
   }
   function collect(entry:string,id:string,revoked:boolean,typed:boolean,read:()=>any){
    if(!typed){rows.push({entry,id,revoked,state:'LEGACY_NO_PRECISE_EVIDENCE',action:'KEEP_LEGACY_NO_BACKFILL'});return}
    try{rows.push({entry,id,revoked,state:'EXISTING_PRECISE_SOURCE_VERIFIED',action:'PRESERVE_EXISTING_BINDING',...exact(read())})}
    catch(error){rows.push({entry,id,revoked,state:'EVIDENCE_REQUIRES_REVIEW',action:'NO_AUTOMATIC_MIGRATION',reason:error instanceof Error?error.message:'Invalid evidence'})}
   }
   for(const grant of training){
    const revision=grant.version-(grant.revokedAt?1:0),own=audits.filter(e=>e.resourceId===grant.resourceId&&e.action==='STANDARD_COMBINATION_USE_GRANTED'
     &&(e.metadata as any)?.grantId===grant.id&&(e.metadata as any)?.useVersion===revision&&Object.prototype.hasOwnProperty.call(e.metadata??{},'selectedBinding'))
    const unique=[...new Map(own.map(e=>{const m=e.metadata as any,v={actor_id:e.actorId,selected:m.selectedBinding,configurationName:m.configurationName??null};return [canonicalHash(v),v]})).values()]
    collect('TRAINING',grant.id,grant.revokedAt!==null,own.length>0,()=>{
     const source=sources.find(r=>r.id===grant.resourceId)
     if(!source?.measurement_release||source.combination_hash!==grant.standardCombinationHash)throw Error('Original material grant source differs')
     const authority=grant.authorityGrantId?{authorityGrantId:grant.authorityGrantId}:grant.authorityEntryGrantId&&grant.authorityEntryGrantVersion?
      {authorityEntryGrantId:grant.authorityEntryGrantId,authorityEntryGrantVersion:grant.authorityEntryGrantVersion}:null
     if(!authority)throw Error('Original issuer basis missing')
     return trainingStandardUseFromEvidence({row:source,measurement:source.measurement_release},grant.teacherId,
      {useGrantId:grant.id,useGrantVersion:revision,issuerId:grant.grantedBy,...authority},unique)?.selectedBinding
    })
   }
   for(const grant of survey){
    const snapshot=grant.snapshot as any
    if(snapshot?.ref?.kind!=='SCALE'||typeof snapshot.ref.sourceId!=='string'||!snapshot.ref.sourceId.startsWith('survey-standard:'))continue
    collect('SURVEY',grant.id,grant.status!=='ACTIVE',Object.prototype.hasOwnProperty.call(snapshot.provenance??{},'selectedBinding'),()=>readSurveyStandardUse({id:grant.id,userId:grant.userId,createdBy:grant.createdBy,snapshot}))
   }
   for(const grant of education){
    if(grant.resourceKeys.length!==1||!grant.resourceKeys[0].startsWith('education-source:STANDARD_SCALE:'))continue
    const audit=audits.find(e=>e.id===grant.id&&e.action===EDUCATION_STANDARD_USE_ACTION)
    collect(grant.product,grant.id,grant.revokedAt!==null,Boolean(audit),()=>{
     if(!audit||audit.actorId!==grant.issuerId||grant.scopeKind!=='ORGANIZATION'||grant.resourceKind!=='material'||!grant.subjectId||grant.parentGrantId!==null||grant.remainingDelegationDepth!==0||grant.delegableCapabilities.length!==0||canonicalHash(grant.ancestry)!==canonicalHash([grant.id]))throw Error('Original education use scope differs')
     const metadata=audit.metadata as any
     const sealed=readEducationStandardUseBinding(metadata,{id:grant.id,issuerId:grant.issuerId,recipientId:grant.subjectId,
      scope:{product:grant.product as 'SCHOOL'|'TEACHER',organizationId:grant.scopeId},resourceKey:grant.resourceKeys[0]})
     if(sealed.binding.configuration.kind!=='STANDARD_COMBINATION'||sealed.binding.configuration.combinationId!==audit.resourceId)throw Error('Original education audit source differs')
     return sealed
    })
   }
   // Re-read the exact original tables under the same read-only snapshot. This
   // proves the inventory itself did not modify grant/audit/source rows.
   const after=stateHash({sources:await tx.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id LIMIT 129`,measurements:[...await getContentReleaseBatch(tx,sources.flatMap(r=>r.measurement_release?[r.measurement_release.releaseId]:[]))],
    training:await tx.materialGrant.findMany({where:{resourceType:'STANDARD_COMBINATION'},orderBy:{id:'asc'},take:129}),survey:await tx.$queryRaw<Array<{id:string;userId:string;createdBy:string;status:string;snapshot:any}>>`SELECT id,user_id AS "userId",created_by AS "createdBy",status,snapshot FROM survey_tool_grants ORDER BY id LIMIT 129`,
    education:await tx.contentCapabilityGrant.findMany({where:{product:{in:['SCHOOL','TEACHER']},capabilities:{equals:['material.use']}},orderBy:{id:'asc'},take:129}),
    audits:await tx.assessmentManagementEvent.findMany({where:{action:{in:['STANDARD_COMBINATION_USE_GRANTED',EDUCATION_STANDARD_USE_ACTION]}},orderBy:{id:'asc'},take:513})})
   expect(after).toBe(before)
   Object.assign(result,{databaseReadOnly:true,inputStateHash:before,outputStateHash:after,sourceCount:sources.length,sourceIssues:[...sourceErrors].map(([id,reason])=>({id,reason})),rows,
    counts:Object.fromEntries(['TRAINING','SURVEY','SCHOOL','TEACHER'].map(entry=>[entry,Object.fromEntries(['EXISTING_PRECISE_SOURCE_VERIFIED','LEGACY_NO_PRECISE_EVIDENCE','EVIDENCE_REQUIRES_REVIEW'].map(state=>[state,rows.filter(row=>row.entry===entry&&row.state===state).length]))]))})
   expect(rows.length).toBeGreaterThan(0)
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:5000,timeout:20000})
 })
})
