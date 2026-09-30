import { randomUUID } from 'node:crypto'
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest'
import { PrismaClient,UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership,createOrganization,grantPersona } from '../../modules/organization/service'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { assignStaffToClass,assignStudentToClass } from '../../modules/organization/classRelationships'
import { createCounselorClientRelationship } from '../../modules/organization/classificationRelations'
import { addAssessmentRunTrackDraft,createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { previewAssessmentRun,publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry,type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { readRespondentRunSummary } from '../../modules/reporting/respondentSummary'
import { relationalProductRegistry } from '../../modules/assessment-relational/product-registry'
import { testDisclosure } from '../assessment-policy/result-disclosure.fixture'
const source=vi.hoisted(()=>({resolve:vi.fn()}))
vi.mock('../../modules/reporting/resultSource',()=>({resolveAuthoritativeTrackObservations:source.resolve}))
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let db:PrismaClient
suite('source initiation mode and scoped Parent SELF PostgreSQL',()=>{
 beforeAll(async()=>{db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(()=>db.$disconnect())
 it('checks current respondent authority and binds each persona scope to its source initiation mode and targets only class parents',async()=>{
  const owner=await db.user.create({data:{username:randomUUID(),passwordHash:'test',role:UserRole.TEACHER}})
  const publisher=await db.user.create({data:{username:randomUUID(),passwordHash:'test',role:UserRole.TEACHER}})
  const organizationId=(await createOrganization({name:'mode scopes',meta:{actorUserId:owner.id,commandKey:randomUUID()}})).organization.id
  const meta=()=>({actorUserId:owner.id,commandKey:randomUUID()})
  const staff=await createMembership({organizationId,userId:publisher.id,meta:meta()})
  await grantPersona({organizationId,membershipId:staff.id,persona:'TEACHER',meta:meta()})
  await grantPersona({organizationId,membershipId:staff.id,persona:'COUNSELOR',meta:meta()})
  const grade=await createOrganizationUnit({organizationId,unitKind:'GRADE',name:'grade'})
  const cls=await createOrganizationUnit({organizationId,unitKind:'CLASS',name:'own class',parentUnitId:grade.id})
  const other=await createOrganizationUnit({organizationId,unitKind:'CLASS',name:'other class',parentUnitId:grade.id})
  await assignStaffToClass({organizationId,membershipId:staff.id,classUnitId:cls.id,staffRole:'HOMEROOM'})
  const members=[]
  for(const [persona,classUnitId] of [['STUDENT',cls.id],['CLIENT',null],['STUDENT',other.id]] as const){
   const u=await db.user.create({data:{username:randomUUID(),passwordHash:'test',role:UserRole.STUDENT}})
   const m=await createMembership({organizationId,userId:u.id,meta:meta()});members.push({u,m})
   await grantPersona({organizationId,membershipId:m.id,persona,meta:meta()})
   if(classUnitId)await assignStudentToClass({organizationId,membershipId:m.id,classUnitId})
  }
  await createCounselorClientRelationship({organizationId,counselorMembershipId:staff.id,clientMembershipId:members[1].m.id})
  const disclosure=testDisclosure();disclosure.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['score'],longitudinalMetricKeys:[]}
  vi.spyOn(relationalProductRegistry,'findExact').mockReturnValue({releaseStatus:'PUBLISHED',resultDisclosure:disclosure} as any)
  const base={resultDisclosure:disclosure,subjectRoles:['STUDENT','CLIENT','PARENT'],respondentRoles:['STUDENT','CLIENT','PARENT'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'ORG_SELF_V1',minimumRespondents:null}
  const makeRegistry=(mode:'CLASS_ASSIGN'|'PROFESSIONAL_ASSIGN')=>new RunResourceAuthorityRegistry([{
   family:'BUNDLE',capabilities:{transactionMode:'TRANSACTIONAL_DB',startMode:'TRANSACTIONAL',supportsLookupByOperationKey:false,supportsSafeCancel:true,finalAuthority:'CANONICAL_RUNTIME',runtimeBindingKind:'COMPOSITE',runV1Enabled:true},
   async resolveExact(ref){return {...ref,...base,initiationModes:[mode],scientificMaturity:'PILOT',applicabilityHash:canonicalHash({base,mode}),runtimeLaunchTarget:{kind:'COMPOSITE',ref:'test'}}},
  } as RunResourceAuthorityAdapter])
  for(const [mode,role,index,ok] of [['CLASS_ASSIGN','STUDENT',0,true],['PROFESSIONAL_ASSIGN','STUDENT',0,false],['PROFESSIONAL_ASSIGN','CLIENT',1,true],['CLASS_ASSIGN','CLIENT',1,false]] as const){
   const run=await createAssessmentRunDraft({organizationId,name:mode+role,createdByUserId:publisher.id})
   await addAssessmentRunTrackDraft({organizationId,runId:run.id,resource:{family:'BUNDLE',key:'mode-test',version:'1'},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[members[index].m.id]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[members[index].m.id]},requestedPolicy:{...base,subjectRoles:[role],respondentRoles:[role]}})
   const input={organizationId,runId:run.id,actorUserId:publisher.id,expectedVersion:2,resourceRegistry:makeRegistry(mode)}
   if(ok){expect((await previewAssessmentRun(input)).tracks[0].executionCount).toBe(1);expect((await publishAssessmentRun(input)).executionCount).toBe(1)
    const [e]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_run_executions WHERE run_id=${run.id}`
    await db.$executeRaw`UPDATE relational_assessment_assignments SET status='COMPLETED' WHERE id IN (SELECT relational_assignment_id FROM assessment_run_executions WHERE id=${e.id})`
    source.resolve.mockResolvedValue({resolved:[{executionId:e.id,respondent:{userId:members[index].u.id},metrics:[{key:'score',value:4,resultQuality:'interpretable'}]}]})
    expect((await readRespondentRunSummary(members[index].u.id,e.id)).state).toBe('READY')
    await db.$executeRaw`UPDATE organization_persona_grants SET revoked_at=now() WHERE membership_id=${members[index].m.id}`
    await expect(readRespondentRunSummary(members[index].u.id,e.id)).rejects.toMatchObject({statusCode:404})
    await db.$executeRaw`UPDATE organization_persona_grants SET revoked_at=NULL WHERE membership_id=${members[index].m.id}`
    source.resolve.mockImplementationOnce(async()=>{await db.$executeRaw`UPDATE organization_memberships SET valid_until=now() WHERE id=${members[index].m.id}`;return {resolved:[{executionId:e.id,respondent:{userId:members[index].u.id},metrics:[{key:'score',value:4,resultQuality:'interpretable'}]}]}})
    await expect(readRespondentRunSummary(members[index].u.id,e.id)).rejects.toMatchObject({statusCode:404})
    await db.$executeRaw`UPDATE organization_memberships SET valid_until=NULL WHERE id=${members[index].m.id}`
   }
   else{await expect(previewAssessmentRun(input)).rejects.toMatchObject({code:'RUN_PUBLISH_SCOPE'});await expect(publishAssessmentRun(input)).rejects.toMatchObject({code:'RUN_PUBLISH_SCOPE'})}
  }
  const parents=[]
  for(const child of [members[0],members[2]]){
   const parent=await db.user.create({data:{username:randomUUID(),passwordHash:'test',role:UserRole.PARENT}});parents.push(parent)
   await db.parentStudentRelationship.create({data:{parentUserId:parent.id,studentUserId:child.u.id,status:'ACTIVE',approvedAt:new Date(),approvedByUserId:owner.id}})
  }
  const run=await createAssessmentRunDraft({organizationId,name:'own class parents',createdByUserId:publisher.id})
  await addAssessmentRunTrackDraft({organizationId,runId:run.id,resource:{family:'BUNDLE',key:'parent-self',version:'1'},subjectSelector:{kind:'CLASS_UNITS',classUnitIds:[cls.id]},respondentSelector:{kind:'CLASS_UNITS',classUnitIds:[cls.id]},requestedPolicy:{...base,subjectRoles:['PARENT'],respondentRoles:['PARENT']}})
  expect((await publishAssessmentRun({organizationId,runId:run.id,actorUserId:publisher.id,expectedVersion:2,resourceRegistry:makeRegistry('CLASS_ASSIGN')})).executionCount).toBe(1)
  const rows=await db.$queryRaw<Array<{userId:string}>>`SELECT r.user_id AS "userId" FROM assessment_run_executions e JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id WHERE e.run_id=${run.id}`
  expect(rows).toEqual([{userId:parents[0].id}])
  const [e]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_run_executions WHERE run_id=${run.id}`
  await db.$executeRaw`UPDATE relational_assessment_assignments SET status='COMPLETED' WHERE id IN (SELECT relational_assignment_id FROM assessment_run_executions WHERE id=${e.id})`
  source.resolve.mockResolvedValue({resolved:[{executionId:e.id,respondent:{userId:parents[0].id},metrics:[{key:'score',value:4,resultQuality:'interpretable'}]}]})
  expect((await readRespondentRunSummary(parents[0].id,e.id)).state).toBe('READY')
  await db.parentStudentRelationship.updateMany({where:{parentUserId:parents[0].id},data:{status:'REVOKED'}})
  await expect(readRespondentRunSummary(parents[0].id,e.id)).rejects.toMatchObject({statusCode:404})
  vi.restoreAllMocks()
 },60000)
})
