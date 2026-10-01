import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Prisma, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { assignStaffToClass, assignStudentToClass } from '../../modules/organization/classRelationships'
import { createCounselorClientRelationship } from '../../modules/organization/classificationRelations'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { acceptRunExecutionConsent } from '../../modules/assessment-run/consent'
import { listAssignedRunTasks } from '../../modules/assessment-run/productRead'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { RunResourceAuthorityRegistry, createRelationalRunResourceAdapter } from '../../modules/assessment-run/resourceAuthority'
import { createRelationalProductRegistry, relationalProductRegistry, type RelationalProductEntryV1 } from '../../modules/assessment-relational/product-registry'
import { validateScaleDefinition, hashScaleDefinition } from '../../modules/scale/scale-definition'
import { getAttemptState } from '../../modules/composite/composite.service'
import { submitCompositeScaleFinal } from '../../modules/scale/scale-final-submit.service'
import { readRespondentRunSummary } from '../../modules/reporting/respondentSummary'
import { resolveAuthoritativeTrackObservations } from '../../modules/reporting/resultSource'
import { testDisclosure } from '../assessment-policy/result-disclosure.fixture'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let db:PrismaClient
suite('single question observer: real publish → consent → START → FINAL → canonical feedback',()=>{
 beforeAll(async()=>{db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{vi.restoreAllMocks();await db.$disconnect()})
 for(const role of ['PARENT','TEACHER','COUNSELOR'] as const)it(`${role} evaluates A using seven frequency options without subject report escalation`,async()=>{
  const makeUser=(role:UserRole,name?:string)=>db.user.create({data:{username:randomUUID(),passwordHash:'test-only',role,...(name?{nickname:name}:{})}})
  const owner=await makeUser(UserRole.TEACHER)
  const respondent=await makeUser(role==='PARENT'?UserRole.PARENT:UserRole.TEACHER)
  const subject=await makeUser(UserRole.STUDENT,'A')
  const org=(await createOrganization({name:'single question observer',meta:{actorUserId:owner.id,commandKey:randomUUID()}})).organization.id
  const meta=()=>({actorUserId:owner.id,commandKey:randomUUID()})
  const sm=await createMembership({organizationId:org,userId:subject.id,meta:meta()})
  const subjectRole=role==='COUNSELOR'?'CLIENT':'STUDENT'
  await grantPersona({organizationId:org,membershipId:sm.id,persona:subjectRole,meta:meta()})
  let rm:string|null=null
  const grade=await createOrganizationUnit({organizationId:org,unitKind:'GRADE',name:'A grade'})
  const cls=await createOrganizationUnit({organizationId:org,unitKind:'CLASS',name:'A class',parentUnitId:grade.id})
  if(role!=='COUNSELOR')await assignStudentToClass({organizationId:org,membershipId:sm.id,classUnitId:cls.id})
  if(role==='PARENT'){
   await db.parentStudentRelationship.create({data:{parentUserId:respondent.id,studentUserId:subject.id,status:'ACTIVE',approvedAt:new Date(),approvedByUserId:owner.id}})
   const [publisher]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM organization_memberships WHERE organization_id=${org} AND user_id=${owner.id} AND valid_until IS NULL`
   await grantPersona({organizationId:org,membershipId:publisher.id,persona:'TEACHER',meta:meta()})
   await assignStaffToClass({organizationId:org,membershipId:publisher.id,classUnitId:cls.id,staffRole:'HOMEROOM'})
  }else{
   const m=await createMembership({organizationId:org,userId:respondent.id,meta:meta()});rm=m.id
   await grantPersona({organizationId:org,membershipId:m.id,persona:role,meta:meta()})
   if(role==='TEACHER')await assignStaffToClass({organizationId:org,membershipId:m.id,classUnitId:cls.id,staffRole:'HOMEROOM'})
   else await createCounselorClientRelationship({organizationId:org,counselorMembershipId:m.id,clientMembershipId:sm.id})
  }
  const raw=JSON.parse(readFileSync(new URL('../../../../docs/fixtures/interaction-frequency-observer.scale.json',import.meta.url),'utf8'))
  const validated=validateScaleDefinition(raw,{instrumentClass:'CUSTOM_DESCRIPTIVE',forPublish:true})
  expect(validated.issues.filter(i=>i.severity==='error')).toEqual([])
  const definition=validated.definition!
  expect(definition.items).toHaveLength(1);expect(definition.responseSets[0].options.map(o=>o.score)).toEqual([1,2,3,4,5,6,7])
  const scale=await db.scale.create({data:{code:'observer-frequency-'+randomUUID(),name:'请你评价 A',creatorId:owner.id,status:'PUBLISHED',visibility:'HIDDEN',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'1.0.0',definition:definition as unknown as Prisma.InputJsonValue,definitionHash:hashScaleDefinition(definition),itemCount:1,dimensionCount:1}})
  const composite=await db.compositeAssessment.create({data:{code:randomUUID(),name:'请你评价 A',status:'PUBLISHED',createdBy:owner.id,items:{create:{type:'SCALE',position:0,required:true,scaleId:scale.id}}},include:{items:true}})
  const relationship=role==='PARENT'?'PARENT_CHILD':role==='TEACHER'?'CLASS_TEACHER_STUDENT':'COUNSELOR_CLIENT'
  const disclosure=testDisclosure();disclosure.policyKey='self-authored:interaction-frequency:v1'
  disclosure.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['interaction_frequency'],longitudinalMetricKeys:[]}
  const entry:RelationalProductEntryV1={title:'请你评价 A',description:'自建单题交互频率，不使用常模或诊断',releaseStatus:'PUBLISHED',scienceMaturity:'PILOT',initiationModes:[role==='PARENT'?'ORG_ASSIGN':role==='COUNSELOR'?'PROFESSIONAL_ASSIGN':'CLASS_ASSIGN'],subjectReportMode:'NONE',resultDisclosure:disclosure,
   applicability:{schemaVersion:1,resourceKind:'BUNDLE',resourceKey:composite.code,resourceVersion:'1.0.0',subjectRoles:[subjectRole],respondentRoles:[role],relationshipKinds:[relationship],perspectives:['OBSERVER_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:role==='COUNSELOR'?'ORG_OBSERVER_V1':'observer_private_respondent_v1',minimumRespondents:null},cohortAnalysisPolicy:null,launchTarget:{runtime:'COMPOSITE',compositeAssessmentId:composite.id}}
  const registry=createRelationalProductRegistry([entry])
  // Inject only authored content, while exercising the normal release/definition/consent/runtime/report gates.
  const original=relationalProductRegistry.findExact.bind(relationalProductRegistry)
  const spy=vi.spyOn(relationalProductRegistry,'findExact').mockImplementation(ref=>registry.findExact(ref)??original(ref))
  try{
   const resourceRegistry=new RunResourceAuthorityRegistry([createRelationalRunResourceAdapter({family:'BUNDLE',registry,capabilities:{startMode:'TRANSACTIONAL',runV1Enabled:true,supportsSafeCancel:true}})])
   const publisher=role==='PARENT'?owner.id:respondent.id
   const run=await createAssessmentRunDraft({organizationId:org,name:'请你评价 A',createdByUserId:publisher})
   const track=await addAssessmentRunTrackDraft({organizationId:org,runId:run.id,resource:{family:'BUNDLE',key:composite.code,version:'1.0.0'},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[sm.id]},respondentSelector:rm?{kind:'MEMBERSHIP_IDS',membershipIds:[rm]}:{kind:'RELATED_PARENT'},requestedPolicy:entry.applicability})
   expect((await publishAssessmentRun({organizationId:org,runId:run.id,actorUserId:publisher,expectedVersion:2,resourceRegistry})).executionCount).toBe(1)
   const task=(await listAssignedRunTasks(respondent.id)).list.find(t=>t.runId===run.id)!
   expect(task.subjectName).toBe(subject.username)
   await expect(startAssessmentRunExecution({executionId:task.executionId,actorUserId:subject.id,resourceRegistry})).rejects.toMatchObject({statusCode:403})
   if(role!=='COUNSELOR'){
    await expect(startAssessmentRunExecution({executionId:task.executionId,actorUserId:respondent.id,resourceRegistry})).rejects.toMatchObject({code:'RUN_CONSENT_REQUIRED'})
    await acceptRunExecutionConsent({executionId:task.executionId,actorUserId:respondent.id})
   }
   const started=await startAssessmentRunExecution({executionId:task.executionId,actorUserId:respondent.id,resourceRegistry})
   expect(started.state).toBe('STARTED');if(started.state!=='STARTED')throw new Error('not started')
   const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:started.runtimeBindingRef}})
   expect(child.subjectUserId).toBe(subject.id);expect(child.respondentUserId).toBe(respondent.id);expect(child.runtimeGeneration).toBe('UNIFIED_V1')
   await getAttemptState(started.runtimeBindingRef,{userId:respondent.id})
   await submitCompositeScaleFinal(started.runtimeBindingRef,composite.items[0].id,{submissionId:randomUUID(),attemptEpoch:child.attemptEpoch,definitionHash:hashScaleDefinition(definition),answers:[{itemCode:'interaction_frequency',responseValue:6}]},{userId:respondent.id})
   expect((await getAttemptState(started.runtimeBindingRef,{userId:respondent.id})).status).toBe('COMPLETED')
   expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:started.runtimeBindingRef}})).status).toBe('COMPLETED')
   const batch=await resolveAuthoritativeTrackObservations({organizationId:org,runId:run.id,trackId:track.id})
   expect(batch.resolved).toHaveLength(1);expect(batch.resolved[0].metrics.find(m=>m.key==='interaction_frequency')?.value).toBe(6)
   expect(await readRespondentRunSummary(respondent.id,task.executionId)).toEqual({schemaVersion:1,mode:'INDIVIDUAL_SUMMARY',state:'READY',metrics:{interaction_frequency:6}})
   await expect(readRespondentRunSummary(subject.id,task.executionId)).rejects.toMatchObject({statusCode:404})
   await expect(readRespondentRunSummary(owner.id,task.executionId)).rejects.toMatchObject({statusCode:404})
   await db.$executeRaw`UPDATE organization_persona_grants SET revoked_at=now() WHERE membership_id=${sm.id}`
   expect((await listAssignedRunTasks(respondent.id)).list.some(t=>t.runId===run.id)).toBe(false)
   await expect(readRespondentRunSummary(respondent.id,task.executionId)).rejects.toMatchObject({statusCode:404})
  }finally{spy.mockRestore()}
 },60000)
})
