import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {Prisma,PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import {educationReportFixture} from '../reporting/education-assessment-report.fixture'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {buildTrainingFlowUnits} from '../../modules/composite/training-flow-definition'
import {draftEducationAssessmentEntry,educationAssessmentResourceKey} from '../../modules/education-tools/assessment-resource.contract'
import {relationalEntryToRunPolicy} from '../../modules/assessment-run/resourceAuthority'
import {educationSchoolAssessmentReportRouter,educationTeacherAssessmentReportRouter} from '../../modules/reporting/education-assessment-report.routes'
import {readEducationRespondentAssessmentReport} from '../../modules/reporting/education-assessment-report.service'
import {generateToken} from '../../utils/jwt'
import {cacheService} from '../../services/cacheService'
import {closeQueues} from '../../config/queue'
import {issueAdminContentRoot,revokeAdminContentGrant} from '../../modules/measurement-content/admin-authority.service'
import {assertEducationAssessmentDistributionCurrent} from '../../modules/education-tools/assessment-resource.distribution'

const url=integrationDatabaseUrl('PR363_FEEDBACK_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,server:Server,base:string
const adminProof=()=>({tokenVersion:0,adminSessionId:'synthetic-report-fixture-only',adminVerifiedAt:Date.now()/1000})
/** Synthetic accepted FINAL facts only. This verifies production source/current
 * report SQL and real account middleware on a fully migrated disposable DB;
 * it does not claim new-tool publication/START/scoring/FINAL qualification. */
async function seed(product:'SCHOOL'|'TEACHER'){
 const actors=await setupEducationLibraryRuntimeFixture({db,product,trackCount:0,publish:false})
 const map=new Map<number,string>([[2,actors.organizationId]])
 const id=(n:number)=>{if(!map.has(n))map.set(n,randomUUID());return map.get(n)!}
 const attemptId=randomUUID(),assignmentId=randomUUID(),executionId=randomUUID(),trackId=randomUUID(),actorId=randomUUID(),relationshipId=randomUUID()
 const f=await educationReportFixture(product,['COGNITIVE'],{id,actorUserId:actors.participantUserId,ownerUserId:actors.libraryAdminUserId,sourceActorId:actors.libraryAdminUserId,attemptId,assignmentId})
 for(const release of f.releases.values()){
  if(release.layer==='REPORT'&&release.scope.kind!=='PLATFORM')release.scope.resourceId=f.origin.runtimeCompositeId
  await db.measurementContentRelease.create({data:{id:release.releaseId,key:release.key+'-'+f.origin.resourceId,version:release.version,layer:release.layer,family:release.family,
   hashScheme:release.hashScheme,contentHash:release.contentHash,content:release.content as Prisma.InputJsonValue,scope:release.scope,provenance:release.provenance as Prisma.InputJsonValue,
   assetRefs:release.assetRefs,sourceReleaseId:null,publishedBy:actors.libraryAdminUserId,status:'PUBLISHED'}})
 }
 await db.cognitiveTestConfig.create({data:{id:id(100),testType:'synthetic-report-'+randomUUID(),configVersion:'1',name:'Synthetic frozen report identity',engineVersion:'1',scoringVersion:'1',config:{},status:'PUBLISHED'}})
 await db.cognitiveAssignment.create({data:{id:id(110),configId:id(100),createdBy:actors.libraryAdminUserId,title:'Synthetic accepted report',status:'PUBLISHED',listedStandalone:false}})
 const snapshot={schemaVersion:1 as const,compositeId:f.origin.runtimeCompositeId,units:f.binding.units}
 await db.compositeAssessment.create({data:{id:f.origin.sourceCompositeId,code:'synthetic-source-'+randomUUID(),name:'Synthetic original source',status:'PUBLISHED',createdBy:actors.libraryAdminUserId}})
 await db.compositeAssessment.create({data:{id:f.origin.runtimeCompositeId,code:'synthetic-runtime-'+randomUUID(),name:'Synthetic education report runtime',status:'PUBLISHED',createdBy:actors.libraryAdminUserId,
  productKind:'ORGANIZATION_RESOURCE',publicEnabled:false,copyable:false,trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot)}})
 await db.compositeAssessmentItem.create({data:{id:id(10),compositeAssessmentId:f.origin.runtimeCompositeId,type:'COGNITIVE',position:0,required:true,cognitiveAssignmentId:id(110)}})
 const runtime=await db.compositeAssessment.findUniqueOrThrow({where:{id:f.origin.runtimeCompositeId},include:{items:true,formSections:true}})
 f.origin.runtimeDefinitionHash=canonicalHash(buildTrainingFlowUnits(runtime))
 const resourceKeys=[f.origin.sourceCompositeId,...f.releases.keys()]
 const distribution=await issueAdminContentRoot(actors.libraryAdminUserId,adminProof(),{requestId:randomUUID(),expectedVersion:0,reason:'Explicit isolated synthetic report history fixture only',
  grant:{subjectId:actors.libraryAdminUserId,scope:{product,scopeKind:'ORGANIZATION',scopeId:actors.organizationId,resourceKind:'material',resourceKeys},capabilities:['material.distribute'],
   delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60_000).toISOString(),expiresAt:new Date(Date.now()+3_600_000).toISOString()}})
 f.origin.distribution={actorId:actors.libraryAdminUserId,grants:resourceKeys.map(resourceId=>({resourceId,grantId:distribution.grantId,version:distribution.version})).sort((a,b)=>a.resourceId.localeCompare(b.resourceId))}
 await db.$transaction(tx=>assertEducationAssessmentDistributionCurrent(tx,f.origin))
 const draft=draftEducationAssessmentEntry({origin:f.origin,title:'Synthetic approved education report',disclosure:f.contract})
 const reviewer=await db.user.create({data:{username:'report-reviewer-'+randomUUID(),passwordHash:'synthetic-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
 const original={kind:'SYSTEM_ADMIN',actorId:actors.libraryAdminUserId},review={kind:'SYSTEM_ADMIN',actorId:reviewer.id}
 await db.$executeRaw`INSERT INTO education_assessment_deliveries(id,product,organization_id,family,source_composite_id,runtime_composite_id,entry,entry_hash,created_by_user_id,created_authority)
  VALUES(${f.origin.resourceId},${product},${actors.organizationId},'COGNITIVE',${f.origin.sourceCompositeId},${f.origin.runtimeCompositeId},${JSON.stringify(draft)}::jsonb,${canonicalHash(draft)},${actors.libraryAdminUserId},${JSON.stringify(original)}::jsonb)`
 await db.$executeRaw`UPDATE education_assessment_deliveries SET status='REVIEWED',reviewed_by_user_id=${reviewer.id},reviewed_at=clock_timestamp(),reviewed_authority=${JSON.stringify(review)}::jsonb WHERE id=${f.origin.resourceId}`
 const entry={...draft,releaseStatus:'PUBLISHED' as const},policy=relationalEntryToRunPolicy(entry),key=educationAssessmentResourceKey(f.origin)
 await db.$executeRaw`UPDATE education_assessment_deliveries SET status='PUBLISHED',entry=${JSON.stringify(entry)}::jsonb,entry_hash=${canonicalHash(entry)},published_by_user_id=${actors.libraryAdminUserId},published_at=clock_timestamp(),published_authority=${JSON.stringify(original)}::jsonb WHERE id=${f.origin.resourceId}`
 await db.$executeRaw`INSERT INTO assessment_run_tracks(id,organization_id,run_id,resource_family,resource_key,resource_version,requested_policy,frozen_resource_policy,resource_policy_hash)
  VALUES(${trackId},${actors.organizationId},${actors.runId},'COGNITIVE',${key},'1.0.0',${JSON.stringify(policy)}::jsonb,${JSON.stringify(policy)}::jsonb,${canonicalHash(policy)})`
 await actors.open()
 await db.$executeRaw`UPDATE assessment_runs SET status='PUBLISHED',published_at=clock_timestamp() WHERE id=${actors.runId}`
 const role=product==='SCHOOL'?'STUDENT':'TEACHER'
 const persona=await db.organizationPersonaGrant.findFirstOrThrow({where:{organizationId:actors.organizationId,membershipId:actors.participantMembershipId!,persona:role,revokedAt:null}})
 const payload={schemaVersion:1,userId:actors.participantUserId,membershipId:actors.participantMembershipId,actorRole:role,personaGrantId:persona.id}
 await db.$executeRaw`INSERT INTO assessment_run_actor_snapshots(id,organization_id,run_id,provenance_kind,user_id,membership_id,actor_role,snapshot_payload,snapshot_hash)
  VALUES(${actorId},${actors.organizationId},${actors.runId},'ORG_MEMBER',${actors.participantUserId},${actors.participantMembershipId},${role},${JSON.stringify(payload)}::jsonb,${canonicalHash(payload)})`
 const relation={schemaVersion:1,relationshipKind:'SELF',subjectActorSnapshotId:actorId,respondentActorSnapshotId:actorId}
 await db.$executeRaw`INSERT INTO assessment_run_relationship_snapshots(id,organization_id,run_id,relationship_kind,subject_actor_snapshot_id,respondent_actor_snapshot_id,snapshot_payload,snapshot_hash)
  VALUES(${relationshipId},${actors.organizationId},${actors.runId},'SELF',${actorId},${actorId},${JSON.stringify(relation)}::jsonb,${canonicalHash(relation)})`
 const episode=await db.assessmentEpisode.create({data:{subjectUserId:actors.participantUserId,initiatedByUserId:actors.managerUserId,initiationMode:'TEACHER_CAMPAIGN'}})
 await db.relationalAssessmentAssignment.create({data:{id:assignmentId,episodeId:episode.id,subjectUserId:actors.participantUserId,subjectRole:role,respondentUserId:actors.participantUserId,respondentRole:role,
  createdByUserId:actors.managerUserId,relationshipKind:'SELF',relationshipSnapshotJson:relation,relationshipSnapshotHash:canonicalHash(relation),perspective:'SELF_REPORT',resourceKind:'COGNITIVE',resourceKey:key,resourceVersion:'1.0.0',visibilityPolicyKey:f.contract.policyKey,status:'COMPLETED'}})
 await db.$executeRaw`UPDATE relational_assessment_assignments SET policy_domain='ORGANIZATION_RUN' WHERE id=${assignmentId}`
 const {compositeAssessment:_composite,...parent}=f.parent
 await db.compositeAssessmentAttempt.create({data:{...parent,status:'COMPLETED',participantKey:'synthetic:'+randomUUID(),runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',completedAt:new Date(),completedItems:1,
  trainingContentBinding:f.binding as Prisma.InputJsonValue}})
 for(const row of f.rows)await db.assessmentUnitSnapshot.create({data:{...row,unitType:'COGNITIVE',terminalState:'COMPLETED',payloadKind:'UNIT_RESULT',completedAt:new Date()}})
 await db.$executeRaw`INSERT INTO assessment_run_executions(id,organization_id,run_id,track_id,subject_actor_snapshot_id,respondent_actor_snapshot_id,relationship_snapshot_id,status,relational_assignment_id,runtime_binding_kind,runtime_binding_ref,started_at,completed_at)
  VALUES(${executionId},${actors.organizationId},${actors.runId},${trackId},${actorId},${actorId},${relationshipId},'COMPLETED',${assignmentId},'COMPOSITE',${attemptId},clock_timestamp(),clock_timestamp())`
 return {...actors,...f,executionId,reviewer,role,entry,key,distribution}
}

suite('education production report composition with real migrated PostgreSQL and real account middleware',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const app=express();app.use('/school',educationSchoolAssessmentReportRouter);app.use('/teacher',educationTeacherAssessmentReportRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR'}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },90_000)
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await db?.$disconnect();await cacheService.close();await closeQueues()})
 it.each(['SCHOOL','TEACHER'] as const)('%s reads exact stored report, survives retirement/issuer loss, and enforces current report/realm revocation',async product=>{
  const f=await seed(product),input={actorUserId:f.participantUserId,executionId:f.executionId,product}
  expect(await readEducationRespondentAssessmentReport(input)).toMatchObject({state:'READY',reports:[{status:'READY',rendered:{blocks:[{type:'TEXT'},{type:'METRIC',value:10}]}}]})
  const user=await db.user.findUniqueOrThrow({where:{id:f.participantUserId}})
  const token=generateToken({userId:user.id,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',...(product==='TEACHER'?{sessionProduct:'HUITEACHER' as const}:{})})
  const endpoint=base+'/'+product.toLowerCase()+'/assessment-reports/executions/'+f.executionId,cookie=(product==='SCHOOL'?'huischool_session':'huiteacher_session')+'='+token
  expect((await fetch(endpoint,{headers:{cookie}})).status).toBe(200)
  expect((await fetch(endpoint,{headers:{cookie:'ptool_session='+token}})).status).toBe(401)
  expect((await fetch(endpoint,{headers:{cookie:(product==='SCHOOL'?'huiteacher_session':'huischool_session')+'='+token}})).status).toBe(401)
  await revokeAdminContentGrant(f.libraryAdminUserId,adminProof(),f.distribution.grantId,{expectedVersion:f.distribution.version,reason:'Stop only new synthetic distribution'})
  await expect(db.$transaction(tx=>assertEducationAssessmentDistributionCurrent(tx,f.origin))).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
  expect((await fetch(endpoint,{headers:{cookie}})).status).toBe(200)
  await db.user.update({where:{id:f.libraryAdminUserId},data:{isFrozen:true}})
  await db.user.update({where:{id:f.reviewer.id},data:{platformRole:'STANDARD'}})
  await db.$executeRaw`UPDATE education_assessment_deliveries SET status='RETIRED',retired_by_user_id=${f.managerUserId},retired_at=clock_timestamp() WHERE id=${f.origin.resourceId}`
  if(product==='SCHOOL')await db.$executeRaw`UPDATE campus_activities SET status='PAUSED' WHERE course_id=${f.workflow.id}`
  else await db.huiteacherEvaluationEvent.update({where:{id:f.workflow.id},data:{status:'CLOSED',closedAt:new Date()}})
  if(product==='TEACHER')await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:f.participantUserId,permission:'RUN_START',reason:'Stop new collection only',deniedByUserId:f.managerUserId}})
  expect(await readEducationRespondentAssessmentReport(input)).toMatchObject({state:'READY'})
  expect((await fetch(endpoint,{headers:{cookie}})).status).toBe(200)
  expect(await readEducationRespondentAssessmentReport({...input,actorUserId:f.managerUserId})).toBeNull()
  const deny=await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:f.participantUserId,permission:'REPORT_READ',reason:'Synthetic real report revocation',deniedByUserId:f.managerUserId}})
  expect((await fetch(endpoint,{headers:{cookie}})).status).toBe(404)
  await db.organizationAccessDeny.update({where:{id:deny.id},data:{liftedAt:new Date()}})
  expect((await fetch(endpoint,{headers:{cookie}})).status).toBe(200)
  const reportId=f.origin.units[0].report!.releaseId
  await db.measurementContentRelease.update({where:{id:reportId},data:{status:'REVOKED'}})
  expect(await readEducationRespondentAssessmentReport(input)).toMatchObject({state:'READY',reports:[{status:'REVOKED',rendered:null}]})
  if(product==='TEACHER'){
   await db.compositeAssessment.update({where:{id:f.origin.runtimeCompositeId},data:{status:'ARCHIVED'}})
   expect((await fetch(endpoint,{headers:{cookie}})).status).toBe(409)
  }
  await db.user.update({where:{id:user.id},data:{isFrozen:true}})
  expect((await fetch(endpoint,{headers:{cookie}})).status).toBe(401)
 },90_000)
})
