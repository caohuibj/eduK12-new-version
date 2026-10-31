import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {afterAll,describe,expect,it,vi} from 'vitest'
const registry=vi.hoisted(()=>({entry:vi.fn()}))
// This fixture exercises actual cohort/member SQL; its synthetic leaf has an
// explicit approved aggregate contract rather than relying on a missing entry.
vi.mock('../../modules/assessment-run/registeredResources',()=>({resolveHistoricalRelationalEntry:registry.entry}))
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {buildReportingFixture} from './reporting-fixture'
import {freezeRunTrackCohort,readReportingCohort} from '../../modules/reporting/cohort'
import {listAuthoritativeRunLeafSources,resolveAuthoritativeRunResults} from '../../modules/reporting/resultSource'
import {educationGroupSelector,listEducationGroupSelections} from '../../modules/reporting/education-group-selection'
import {assertCampusLeafGroupDifferencing} from '../../modules/campus/group-reports'
import {validateResultDisclosureContract} from '../../modules/assessment-policy/result-disclosure'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
if(!url)throw Error('explicit isolated PostgreSQL required')
requireIsolatedReleaseDatabase(url)
afterAll(()=>prisma.$disconnect())
describe('School leaf source and historical subgroup in PostgreSQL',()=>{
 it.skipIf(!!process.env.GROUP_SCHOOL_RETAINED_FIXTURE)('uses actual historical class/tag members, deduplicates staff assignments, and keeps a frozen cohort after tag changes',async()=>{
  const f=await buildReportingFixture(prisma,20)
  const grade=randomUUID(),classA=randomUUID(),classB=randomUUID(),dimension=randomUUID(),label=randomUUID()
  await prisma.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name) VALUES(${grade},${f.organizationId},'GRADE','Synthetic grade')`
  for(const id of [classA,classB])await prisma.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name,parent_unit_id) VALUES(${id},${f.organizationId},'CLASS',${id},${grade})`
  await prisma.$executeRaw`INSERT INTO organization_classification_dimensions(id,organization_id,key,name,cardinality) VALUES(${dimension},${f.organizationId},'group','人员组','MULTI')`
  await prisma.$executeRaw`INSERT INTO organization_labels(id,organization_id,dimension_id,name) VALUES(${label},${f.organizationId},${dimension},'历史甲组')`
  for(const member of f.members.slice(0,10)){
   await prisma.$executeRaw`INSERT INTO organization_persona_grants(id,organization_id,membership_id,persona,granted_by_user_id) VALUES(${randomUUID()},${f.organizationId},${member.membershipId},'STUDENT',${f.ownerId})`
   await prisma.$executeRaw`INSERT INTO organization_student_class_assignments(id,organization_id,membership_id,class_unit_id,valid_from) VALUES(${randomUUID()},${f.organizationId},${member.membershipId},${classA},'2026-09-01'::timestamptz)`
   await prisma.$executeRaw`INSERT INTO organization_label_assignments(id,organization_id,membership_id,dimension_id,dimension_cardinality,label_id,valid_from) VALUES(${randomUUID()},${f.organizationId},${member.membershipId},${dimension},'MULTI',${label},'2026-09-01'::timestamptz)`
  }
  const selector=await educationGroupSelector(f.organizationId,'SCHOOL',{kind:'CLASSES',ids:[classA]})
  const cohort=await freezeRunTrackCohort({...f,generatedByUserId:f.ownerId,cohortSelector:selector})
  expect(cohort.eligibleN).toBe(10)
  const catalog=await listEducationGroupSelections({...f,product:'SCHOOL'})
  expect(catalog.options.map(row=>row.id).sort()).toEqual([classA,label].sort())
  const tools=await listAuthoritativeRunLeafSources(f)
  expect(tools).toHaveLength(1)
  const contract=validateResultDisclosureContract({schemaVersion:1,policyKey:'synthetic-school-leaf',minimumRespondents:10,
    audiences:Object.fromEntries(['RESPONDENT','SUBJECT','TEACHER','PARENT','PROFESSIONAL','ORGANIZATION','RESEARCH'].map(audience=>[
      audience,{mode:audience==='ORGANIZATION'?'AGGREGATE_ONLY':'NONE',metricKeys:audience==='ORGANIZATION'?['score']:[],longitudinalMetricKeys:[]},
    ]))})
  registry.entry.mockImplementation(async ref=>ref.resourceKind===tools[0].leaf.unitType
    &&ref.resourceKey===tools[0].leaf.instrumentKey&&ref.resourceVersion===tools[0].leaf.instrumentVersion
    ?{releaseStatus:'PUBLISHED',resultDisclosure:contract}:null)
  const result=await resolveAuthoritativeRunResults(cohort,tools[0].leaf)
  expect(result.resolved).toHaveLength(10);expect(result.resolved.every(row=>row.metrics[0].value===1)).toBe(true)
  expect(result.resourceKey).toBe(tools[0].leaf.instrumentKey)
  await expect(assertCampusLeafGroupDifferencing({organizationId:f.organizationId,cohort,leaf:tools[0].leaf})).resolves.toBeUndefined()
  await prisma.$executeRaw`UPDATE organization_label_assignments SET valid_until=statement_timestamp() WHERE organization_id=${f.organizationId} AND label_id=${label}`
  const reread=await readReportingCohort(cohort.id)
  expect(reread.snapshotHash).toBe(cohort.snapshotHash);expect(reread.members).toEqual(cohort.members)
  const staff=f.members[10]
  await prisma.$executeRaw`INSERT INTO organization_persona_grants(id,organization_id,membership_id,persona,granted_by_user_id) VALUES(${randomUUID()},${f.organizationId},${staff.membershipId},'TEACHER',${f.ownerId})`
  for(const id of [classA,classB])await prisma.$executeRaw`INSERT INTO organization_staff_class_assignments(id,organization_id,membership_id,class_unit_id,staff_role,valid_from) VALUES(${randomUUID()},${f.organizationId},${staff.membershipId},${id},'TEACHING','2026-09-01'::timestamptz)`
  const teacher=await freezeRunTrackCohort({...f,generatedByUserId:f.ownerId,cohortSelector:await educationGroupSelector(f.organizationId,'TEACHER',{kind:'CLASSES',ids:[classA,classB]})})
  expect(teacher.members.map(row=>row.membershipId)).toEqual([staff.membershipId])
 },30_000)
 it.runIf(!!process.env.GROUP_SCHOOL_RETAINED_FIXTURE)('continues only the retained staff-class deduplication step after the fixture enum repair',async()=>{
  const f=JSON.parse(readFileSync(process.env.GROUP_SCHOOL_RETAINED_FIXTURE!,'utf8'))
  for(const id of f.classIds)await prisma.$executeRaw`INSERT INTO organization_staff_class_assignments(id,organization_id,membership_id,class_unit_id,staff_role,valid_from) VALUES(${randomUUID()},${f.organizationId},${f.staffMembershipId},${id},'TEACHING','2026-09-01'::timestamptz)`
  const teacher=await freezeRunTrackCohort({...f,generatedByUserId:f.ownerId,cohortSelector:await educationGroupSelector(f.organizationId,'TEACHER',{kind:'CLASSES',ids:f.classIds})})
  expect(teacher.members.map(row=>row.membershipId)).toEqual([f.staffMembershipId])
 })

})
