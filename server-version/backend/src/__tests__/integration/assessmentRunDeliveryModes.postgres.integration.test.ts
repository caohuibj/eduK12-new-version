import { randomUUID } from 'node:crypto'
import { afterAll,beforeAll,describe,expect,it } from 'vitest'
import { PrismaClient,UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership,createOrganization,grantPersona } from '../../modules/organization/service'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { assignStaffToClass,assignStudentToClass } from '../../modules/organization/classRelationships'
import { createCounselorClientRelationship } from '../../modules/organization/classificationRelations'
import { addAssessmentRunTrackDraft,createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { previewAssessmentRun,publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry,type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { listAssignedRunTasks } from '../../modules/assessment-run/productRead'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let db:PrismaClient
suite('source initiation mode and scoped Parent SELF PostgreSQL',()=>{
 beforeAll(async()=>{db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(()=>db.$disconnect())
 it('binds each persona scope to its source initiation mode and targets only class parents',async()=>{
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
  const base={subjectRoles:['STUDENT','CLIENT','PARENT'],respondentRoles:['STUDENT','CLIENT','PARENT'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'ORG_SELF_V1',minimumRespondents:null}
  const makeRegistry=(mode:'CLASS_ASSIGN'|'PROFESSIONAL_ASSIGN',policy=base)=>new RunResourceAuthorityRegistry([{
   family:'BUNDLE',capabilities:{transactionMode:'TRANSACTIONAL_DB',startMode:'TRANSACTIONAL',supportsLookupByOperationKey:false,supportsSafeCancel:true,finalAuthority:'CANONICAL_RUNTIME',runtimeBindingKind:'COMPOSITE',runV1Enabled:true},
   async resolveExact(ref){return {...ref,...policy,initiationModes:[mode],scientificMaturity:'PILOT',applicabilityHash:canonicalHash({base,mode}),runtimeLaunchTarget:{kind:'COMPOSITE',ref:'test'}}},
  } as RunResourceAuthorityAdapter])
  for(const [mode,role,index,ok] of [['CLASS_ASSIGN','STUDENT',0,true],['PROFESSIONAL_ASSIGN','STUDENT',0,false],['PROFESSIONAL_ASSIGN','CLIENT',1,true],['CLASS_ASSIGN','CLIENT',1,false]] as const){
   const run=await createAssessmentRunDraft({organizationId,name:mode+role,createdByUserId:publisher.id})
   await addAssessmentRunTrackDraft({organizationId,runId:run.id,resource:{family:'BUNDLE',key:'mode-test',version:'1'},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[members[index].m.id]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[members[index].m.id]},requestedPolicy:{...base,subjectRoles:[role],respondentRoles:[role]}})
   const input={organizationId,runId:run.id,actorUserId:publisher.id,expectedVersion:2,resourceRegistry:makeRegistry(mode)}
   if(ok){expect((await previewAssessmentRun(input)).tracks[0].executionCount).toBe(1);expect((await publishAssessmentRun(input)).executionCount).toBe(1)}
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
  expect((await listAssignedRunTasks(parents[0].id)).list).toHaveLength(1)
  await db.parentStudentRelationship.updateMany({where:{parentUserId:parents[0].id},data:{status:'REVOKED'}})
  expect((await listAssignedRunTasks(parents[0].id)).list).toEqual([])
  await db.parentStudentRelationship.updateMany({where:{parentUserId:parents[0].id},data:{status:'ACTIVE'}})
  await db.$executeRaw`UPDATE organization_persona_grants SET revoked_at=now() WHERE membership_id=${members[0].m.id}`
  expect((await listAssignedRunTasks(parents[0].id)).list).toEqual([])
  expect((await listAssignedRunTasks(members[0].u.id)).list).toEqual([])
  await db.$executeRaw`UPDATE organization_persona_grants SET revoked_at=NULL WHERE membership_id=${members[0].m.id}`
  for(const [kind,subjectRole,respondentRole,index,respondentId,mode] of [
   ['PARENT_CHILD','STUDENT','PARENT',0,parents[0].id,'CLASS_ASSIGN'],
   ['CLASS_TEACHER_STUDENT','STUDENT','TEACHER',0,publisher.id,'CLASS_ASSIGN'],
   ['COUNSELOR_CLIENT','CLIENT','COUNSELOR',1,publisher.id,'PROFESSIONAL_ASSIGN'],
  ] as const){
   const policy={...base,subjectRoles:[subjectRole],respondentRoles:[respondentRole],relationshipKinds:[kind],perspectives:['OBSERVER_REPORT'],visibilityPolicyKey:respondentRole==='COUNSELOR'?'ORG_OBSERVER_V1':'observer_private_respondent_v1'}
   const observer=await createAssessmentRunDraft({organizationId,name:kind,createdByUserId:publisher.id})
   await addAssessmentRunTrackDraft({organizationId,runId:observer.id,resource:{family:'BUNDLE',key:'observer-'+kind,version:'1'},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[members[index].m.id]},respondentSelector:{kind:respondentRole==='PARENT'?'RELATED_PARENT':'ALL_CURRENT'},requestedPolicy:policy})
   await publishAssessmentRun({organizationId,runId:observer.id,actorUserId:publisher.id,expectedVersion:2,resourceRegistry:makeRegistry(mode,policy)})
   expect((await listAssignedRunTasks(respondentId)).list.some(t=>t.runId===observer.id)).toBe(true)
   if(kind==='PARENT_CHILD')await db.parentStudentRelationship.updateMany({where:{parentUserId:parents[0].id},data:{status:'REVOKED'}})
   if(kind==='CLASS_TEACHER_STUDENT')await db.$executeRaw`UPDATE organization_staff_class_assignments SET valid_until=now() WHERE membership_id=${staff.id}`
   if(kind==='COUNSELOR_CLIENT')await db.$executeRaw`UPDATE organization_counselor_client_relationships SET valid_until=now() WHERE counselor_membership_id=${staff.id}`
   const after=await listAssignedRunTasks(respondentId)
   expect(after.list.some(t=>t.runId===observer.id)).toBe(false)
   expect(JSON.stringify(after)).not.toContain('observer-'+kind)
   if(kind==='PARENT_CHILD')await db.parentStudentRelationship.updateMany({where:{parentUserId:parents[0].id},data:{status:'ACTIVE'}})
   if(kind==='CLASS_TEACHER_STUDENT')await db.$executeRaw`UPDATE organization_staff_class_assignments SET valid_until=NULL WHERE membership_id=${staff.id}`
   if(kind==='COUNSELOR_CLIENT')await db.$executeRaw`UPDATE organization_counselor_client_relationships SET valid_until=NULL WHERE counselor_membership_id=${staff.id}`
  }
 },60000)
})
