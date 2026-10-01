import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import bcrypt from '../backend/node_modules/bcryptjs'
import { PrismaClient } from '../backend/node_modules/@prisma/client'
import { buildReportingFixture } from '../backend/src/__tests__/integration/reporting-fixture'
import { grantCapability } from '../backend/src/modules/organization/service'
import { assertIndividualLongitudinalAccess } from '../backend/src/modules/reporting/individualAuthorization'
import { createPlatformReportingSpec, reviewPlatformReportingSpec, publishPlatformReportingSpec } from '../backend/src/modules/reporting/spec'
async function main(){
 if(process.env.NODE_ENV!=='test'||process.env.REPORTING_BROWSER_ISOLATED_DB!=='1'||!process.env.REPORTING_BROWSER_TEST_DATABASE_URL||process.env.REPORTING_BROWSER_TEST_DATABASE_URL!==process.env.DATABASE_URL)throw new Error('Isolated test database required')
 const db=new PrismaClient()
 const first=await buildReportingFixture(db,6)
 const password='ReportingBrowserSynthetic2026'
 await db.user.update({where:{id:first.ownerId},data:{passwordHash:await bcrypt.hash(password,10),teacherApproved:true,mustChangePassword:false}})
 const manager=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:first.organizationId,userId:first.ownerId,orgRole:'ORG_ADMIN'}})
 const individualAccess={principal:{userId:first.ownerId,platformRole:'STANDARD' as const},organizationId:first.organizationId,subjectUserId:first.members[0].userId}
 // Governance alone cannot read individuals; the positive scenario uses an explicit audited capability.
 await assert.rejects(assertIndividualLongitudinalAccess(individualAccess),{statusCode:404})
 await grantCapability({organizationId:first.organizationId,membershipId:manager.id,capability:'PSYCHOLOGY_STAFF',meta:{actorUserId:first.ownerId,commandKey:randomUUID()}})
 await assertIndividualLongitudinalAccess(individualAccess)
 const resource=(await db.$queryRaw<Array<{key:string}>>`SELECT resource_key AS key FROM assessment_run_tracks WHERE id=${first.trackId}`)[0].key
 for(const at of [new Date('2026-09-20'),new Date('2026-09-21')])await buildReportingFixture(db,6,false,{ownerId:first.ownerId,organizationId:first.organizationId,members:first.members,resourceKey:resource,at,resourceVersion:'1.1.0'})
 const dimension=randomUUID(),label=randomUUID(),grade=randomUUID(),cls=randomUUID(),nextClass=randomUUID()
 await db.$executeRaw`INSERT INTO organization_classification_dimensions (id,organization_id,key,name,cardinality) VALUES (${dimension},${first.organizationId},'gender','性别','SINGLE')`
 await db.$executeRaw`INSERT INTO organization_labels (id,organization_id,dimension_id,name) VALUES (${label},${first.organizationId},${dimension},'女生')`
 await db.$executeRaw`INSERT INTO organization_units (id,organization_id,unit_kind,name) VALUES (${grade},${first.organizationId},'GRADE','初二')`
 for(const [id,name]of [[cls,'三班'],[nextClass,'四班']])await db.$executeRaw`INSERT INTO organization_units (id,organization_id,unit_kind,name,parent_unit_id) VALUES (${id},${first.organizationId},'CLASS',${name},${grade})`
 for(const member of first.members.slice(0,4)){
  await db.$executeRaw`INSERT INTO organization_label_assignments (id,organization_id,membership_id,dimension_id,dimension_cardinality,label_id,valid_from) VALUES (${randomUUID()},${first.organizationId},${member.membershipId},${dimension},'SINGLE',${label},'2026-09-01'::timestamptz)`
  await db.$executeRaw`INSERT INTO organization_persona_grants (id,organization_id,membership_id,persona,granted_by_user_id) VALUES (${randomUUID()},${first.organizationId},${member.membershipId},'STUDENT',${first.ownerId})`
  await db.$executeRaw`INSERT INTO organization_student_class_assignments (id,organization_id,membership_id,class_unit_id,valid_from,valid_until) VALUES (${randomUUID()},${first.organizationId},${member.membershipId},${cls},'2026-09-01'::timestamptz,'2026-09-20'::timestamptz)`
  await db.$executeRaw`INSERT INTO organization_student_class_assignments (id,organization_id,membership_id,class_unit_id,valid_from) VALUES (${randomUUID()},${first.organizationId},${member.membershipId},${nextClass},'2026-09-20'::timestamptz)`
 }
 const actor={userId:first.ownerId,platformRole:'SYSTEM_ADMIN' as const}, specs:Record<string,string>={}
 for(const kind of ['GROUP','REPEATED_COHORT','MATCHED_LONGITUDINAL','INDIVIDUAL_LONGITUDINAL']){
  const individual=kind==='INDIVIDUAL_LONGITUDINAL',group=kind==='GROUP'
  const definition={schemaVersion:1,analysisKind:kind,engineKey:group?'ORG_GROUP_V1':`ORG_${kind}_V1`,engineVersion:'1.0.0',privacyUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT',reportEvidenceCeiling:'PILOT',...(!individual?{minimumCohortN:3,minimumContributorN:3}:{}),
   metricRules:[{metricId:'score',sourceMetricKey:'score',...(!group?{sourceFamily:'BUNDLE',sourceResourceKey:resource,valueType:'NUMBER',longitudinalMetricKey:'score'}:{}),acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',...(!individual?{aggregations:['MEAN'],minimumMetricN:3}:{}),missingnessRule:'EXCLUDE',observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}],...(!group?{comparabilityRules:[]}:{})}
  const spec=await createPlatformReportingSpec({actor,specKey:`!browser-${kind}-${randomUUID()}`,version:1,definition})
  await reviewPlatformReportingSpec({actor,specId:spec.id});await publishPlatformReportingSpec({actor,specId:spec.id});specs[kind]=spec.id
 }
 const owner=await db.user.findUniqueOrThrow({where:{id:first.ownerId}})
 await writeFile(process.env.REPORTING_BROWSER_FIXTURE||'/tmp/reporting-v22-fixture.json',JSON.stringify({organizationId:first.organizationId,username:owner.username,password,resource:'BUNDLE/'+resource,first:{runId:first.runId,trackId:first.trackId},subject:first.members[0].userId,specs}),{mode:0o600})
 await db.$disconnect()
}
main().catch(e=>{console.error(e);process.exitCode=1})
