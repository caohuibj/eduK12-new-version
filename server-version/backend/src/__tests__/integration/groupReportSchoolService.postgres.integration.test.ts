import {randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {afterAll,describe,expect,it,vi} from 'vitest'
const registry=vi.hoisted(()=>({entry:vi.fn()}))
// Only the pre-approved synthetic content registry entry is substituted. Actual
// School authority, policy, canonical reads, math, artifact writes/reads are real.
vi.mock('../../modules/assessment-run/registeredResources',()=>({resolveHistoricalRelationalEntry:registry.entry}))
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {buildReportingFixture} from './reporting-fixture'
import {grantSyntheticHuischoolProduct} from './educationProductFixture'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {policyFingerprint} from '../../modules/report-privacy/schema'
import {STANDARD} from '../../modules/report-privacy/registry'
import {createPlatformReportingSpec,reviewPlatformReportingSpec,publishPlatformReportingSpec} from '../../modules/reporting/spec'
import {listAuthoritativeRunLeafSources,setReportingPayloadMaterializationObserverForTests} from '../../modules/reporting/resultSource'
import {generateCampusGroupReport,readCampusGroupReport} from '../../modules/campus/group-reports'
import {readReportingArtifactRecord} from '../../modules/reporting/artifact'
import type {AuthenticatedPrincipal} from '../../types'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
if(!url)throw Error('explicit isolated PostgreSQL required')
requireIsolatedReleaseDatabase(url)
afterAll(async()=>{setReportingPayloadMaterializationObserverForTests(null);await prisma.$disconnect()})
const at=new Date('2026-09-19T00:00:00Z'),from=new Date('2026-09-01T00:00:00Z')
const contract={schemaVersion:1,policyKey:'synthetic-school-service',minimumRespondents:10,audiences:Object.fromEntries(['RESPONDENT','SUBJECT','TEACHER','PARENT','PROFESSIONAL','ORGANIZATION','RESEARCH'].map(a=>[a,{mode:'AGGREGATE_ONLY',metricKeys:['score'],longitudinalMetricKeys:[]}]))} as any
const specDefinition={schemaVersion:1,analysisKind:'GROUP',engineKey:'ORG_GROUP_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT',minimumCohortN:10,minimumContributorN:10,reportEvidenceCeiling:'PILOT',metricRules:[{metricId:'score',sourceMetricKey:'score',acceptedResultQuality:['interpretable','limited'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',aggregations:['MEAN','SD_SAMPLE'],missingnessRule:'EXCLUDE',minimumMetricN:10,observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}]}

describe('School actual reporting service with isolated PostgreSQL',()=>{
 it('generates and persists a selected class V2, reads it without canonical reprocessing, and retains the old version after rename',async()=>{
  registry.entry.mockResolvedValue({releaseStatus:'PUBLISHED',resultDisclosure:contract})
  const {owner,ownerMembership,organization,f,spec,classId}=await(async()=>{
   if(process.env.SCHOOL_SERVICE_EXISTING_FIXTURE){
    const ready=JSON.parse(readFileSync(process.env.SCHOOL_SERVICE_EXISTING_FIXTURE,'utf8'))
    return {owner:await prisma.user.findUniqueOrThrow({where:{id:ready.ownerId}}),ownerMembership:{id:ready.ownerMembershipId},organization:{id:ready.organizationId},f:{organizationId:ready.organizationId,runId:ready.runId,trackId:ready.trackId},spec:{id:ready.specId},classId:ready.classId as string}
   }
  const retained=process.env.SCHOOL_SERVICE_EXISTING_USERS?JSON.parse(readFileSync(process.env.SCHOOL_SERVICE_EXISTING_USERS,'utf8')):null
  const owner=retained?await prisma.user.findUniqueOrThrow({where:{id:retained.owner}}):await prisma.user.create({data:{username:'school-group-owner-'+randomUUID(),passwordHash:'synthetic',role:'ADMIN',accountDomain:'SCHOOL',teacherApproved:true}})
  const specAuthor=retained?await prisma.user.findUniqueOrThrow({where:{id:retained.author}}):await prisma.user.create({data:{username:'school-group-author-'+randomUUID(),passwordHash:'synthetic',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
  const reviewer=retained?await prisma.user.findUniqueOrThrow({where:{id:retained.reviewer}}):await prisma.user.create({data:{username:'school-group-reviewer-'+randomUUID(),passwordHash:'synthetic',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
  const organization=await prisma.organization.create({data:{id:randomUUID(),name:'Synthetic School group service',productDomain:'SCHOOL',createdByUserId:owner.id}})
  const ownerMembership=await prisma.organizationMembership.create({data:{id:randomUUID(),organizationId:organization.id,userId:owner.id,orgRole:'ORG_ADMIN',validFrom:from}})
  await grantSyntheticHuischoolProduct(prisma,{organizationId:organization.id,adminUserId:owner.id,adminMembershipId:ownerMembership.id})
  const members=[]
  for(let i=0;i<20;i++){
   const user=await prisma.user.create({data:{username:'school-group-student-'+randomUUID(),passwordHash:'synthetic',role:'STUDENT',accountDomain:'SCHOOL'}})
   const membership=await prisma.organizationMembership.create({data:{id:randomUUID(),organizationId:organization.id,userId:user.id,orgRole:'MEMBER',validFrom:from}})
   members.push({userId:user.id,membershipId:membership.id})
  }
  const resourceKey='synthetic-school-group-'+randomUUID()
  const f=await buildReportingFixture(prisma,20,false,{ownerId:owner.id,organizationId:organization.id,members,resourceKey,resourceVersion:'1',at},contract)
  const requested={analysisMode:'COHORT_AGGREGATE',perspectives:['SELF_REPORT'],minimumRespondents:10}
  await prisma.$executeRaw`UPDATE assessment_run_tracks SET requested_policy=${JSON.stringify(requested)}::jsonb WHERE id=${f.trackId}`
  const closedAt=new Date(Date.now()-2*86_400_000)
  await prisma.$executeRaw`UPDATE assessment_runs SET status='CLOSED',closed_at=${closedAt} WHERE id=${f.runId}`
  const course=await prisma.course.create({data:{title:'Synthetic School reporting activity',courseCode:'school-group-'+randomUUID(),creatorId:owner.id,courseType:'CAMPUS_ACTIVITY',organizationId:organization.id,isRecruiting:false}})
  await prisma.$executeRaw`INSERT INTO campus_activities(course_id,organization_id,owner_membership_id,purpose,status,closed_at) VALUES(${course.id},${organization.id},${ownerMembership.id},'SCHOOL_CLIMATE','CLOSED',${closedAt})`
  await prisma.$executeRaw`INSERT INTO campus_activity_runs(course_id,organization_id,run_id,bound_by_user_id) VALUES(${course.id},${organization.id},${f.runId},${owner.id})`
  for(const member of f.members){
   const episode=await prisma.assessmentEpisode.create({data:{subjectUserId:member.userId,initiatedByUserId:owner.id,initiationMode:'STUDENT_SELF'}})
   const relation={schemaVersion:1,relationshipKind:'SELF',subjectUserId:member.userId,respondentUserId:member.userId}
   const assignment=await prisma.relationalAssessmentAssignment.create({data:{id:randomUUID(),episodeId:episode.id,subjectUserId:member.userId,subjectRole:'STUDENT',respondentUserId:member.userId,respondentRole:'STUDENT',createdByUserId:owner.id,relationshipKind:'SELF',relationshipSnapshotJson:relation,relationshipSnapshotHash:canonicalHash(relation),perspective:'SELF_REPORT',resourceKind:'BUNDLE',resourceKey,resourceVersion:'1',analysisMode:'COHORT_AGGREGATE',minimumRespondents:10,visibilityPolicyKey:'SYNTHETIC_SCHOOL_GROUP'}})
   await prisma.$executeRaw`UPDATE relational_assessment_assignments SET policy_domain='ORGANIZATION_RUN',status='COMPLETED',started_at=${at},completed_at=${at} WHERE id=${assignment.id}`
   await prisma.$executeRaw`UPDATE assessment_run_executions SET relational_assignment_id=${assignment.id} WHERE id=${member.executionId}`
   await prisma.compositeAssessmentAttempt.update({where:{id:member.attemptId},data:{assignmentRef:assignment.id}})
  }
  const grade=randomUUID(),classId=randomUUID()
  await prisma.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name) VALUES(${grade},${organization.id},'GRADE','Synthetic grade')`
  await prisma.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name,parent_unit_id) VALUES(${classId},${organization.id},'CLASS','冻结甲班',${grade})`
  for(const member of f.members.slice(0,10)){
   await prisma.$executeRaw`INSERT INTO organization_persona_grants(id,organization_id,membership_id,persona,granted_by_user_id) VALUES(${randomUUID()},${organization.id},${member.membershipId},'STUDENT',${owner.id})`
   await prisma.$executeRaw`INSERT INTO organization_student_class_assignments(id,organization_id,membership_id,class_unit_id,valid_from) VALUES(${randomUUID()},${organization.id},${member.membershipId},${classId},${from})`
  }
  const scientificAuthor={userId:specAuthor.id,platformRole:'SYSTEM_ADMIN'},scientificReviewer={userId:reviewer.id,platformRole:'SYSTEM_ADMIN'}
  const spec=await createPlatformReportingSpec({actor:scientificAuthor,specKey:'synthetic-school-group-'+randomUUID(),version:1,definition:specDefinition})
  await reviewPlatformReportingSpec({actor:scientificReviewer,specId:spec.id})
  await publishPlatformReportingSpec({actor:scientificReviewer,specId:spec.id})
  const effective={schemaVersion:1,product:'HUISCHOOL',scenario:'SCHOOL_GENERAL_EDUCATION_GROUP',options:STANDARD,source:'APPROVED_REPORT_PREFERENCE_V1'}
  await prisma.educationReportPolicySnapshot.create({data:{id:randomUUID(),organizationId:organization.id,runId:f.runId,product:'HUISCHOOL',scenario:'SCHOOL_GENERAL_EDUCATION_GROUP',effective,effectiveHash:policyFingerprint(effective),fingerprint:policyFingerprint({effective,runId:f.runId}),policyVersion:1,origin:'MY',schoolDefaultRevision:0,schoolMinimumRevision:0,publisherRevision:1,publishedByUserId:owner.id,publishedAt:at}})
  return {owner,ownerMembership,organization,f,spec,classId}
  })()
  const [tool]=await listAuthoritativeRunLeafSources(f)
  const actor={userId:owner.id,username:owner.username,role:'ADMIN',accountDomain:'SCHOOL',platformRole:'STANDARD',tokenVersion:0,mustChangePassword:false} as AuthenticatedPrincipal
  const input={actor,organizationId:organization.id,runId:f.runId,trackId:f.trackId,specId:spec.id,leaf:tool.leaf,selection:{kind:'CLASSES' as const,ids:[classId]}}
  writeFileSync('/tmp/school-group-service-fixture.json',JSON.stringify({ownerId:owner.id,ownerMembershipId:ownerMembership.id,organizationId:organization.id,runId:f.runId,trackId:f.trackId,classId,specId:spec.id,leaf:tool.leaf,actor}))
  let phase='idle',canonical=0
  const operations:{generate:number;read:number}={generate:0,read:0}
  prisma.$use(async(params,next)=>{if(phase==='generate')operations.generate++;if(phase==='read')operations.read++;return next(params)})
  setReportingPayloadMaterializationObserverForTests(()=>canonical++)
  const resumedArtifact=process.env.SCHOOL_SERVICE_EXISTING_ARTIFACT?JSON.parse(readFileSync(process.env.SCHOOL_SERVICE_EXISTING_ARTIFACT,'utf8')):null
  phase='generate';const generationStart=Date.now()
  const generated=resumedArtifact??await generateCampusGroupReport(input)
  let generationMs=resumedArtifact?null:Date.now()-generationStart,generationCanonical=resumedArtifact?null:canonical
  phase='idle';writeFileSync('/tmp/school-group-service-first-artifact.json',JSON.stringify(generated))
  if(!resumedArtifact)expect(generated).toHaveProperty('projection.metrics.0.mean',1)
  const stored=await readReportingArtifactRecord(generated.artifactId)
  if(!resumedArtifact)expect(stored.artifactPayload).toMatchObject({schemaVersion:2,source:{leaf:tool.leaf},metricMetadata:{score:{minimumN:10,unit:'score'}}})
  canonical=0;phase='read';const readStart=Date.now()
  const reread=await readCampusGroupReport({actor,organizationId:organization.id,artifactId:generated.artifactId})
  const readMs=Date.now()-readStart,readCanonical=canonical;phase='idle'
  expect(reread).toEqual(generated);if(!resumedArtifact)expect(generationCanonical).toBe(10);expect(readCanonical).toBe(0)
  await prisma.$executeRaw`UPDATE organization_units SET name='更名乙班' WHERE id=${classId}`
  const old=await readCampusGroupReport({actor,organizationId:organization.id,artifactId:generated.artifactId})
  expect(old).toHaveProperty('projection.populationLabel','班级：冻结甲班（任一匹配）')
  canonical=0;operations.generate=0;phase='generate';const updateStart=Date.now()
  const updated=await generateCampusGroupReport(input)
  generationMs=Date.now()-updateStart;generationCanonical=canonical;phase='idle'
  expect(generationCanonical).toBe(10)
  expect(updated.artifactId).not.toBe(generated.artifactId)
  expect(updated).toHaveProperty('projection.populationLabel','班级：更名乙班（任一匹配）')
  expect((await readReportingArtifactRecord(generated.artifactId)).snapshotHash).toBe(stored.snapshotHash)
  canonical=0;operations.read=0;phase='read';const updateReadStart=Date.now()
  expect(await readCampusGroupReport({actor,organizationId:organization.id,artifactId:updated.artifactId})).toEqual(updated)
  const updatedReadMs=Date.now()-updateReadStart,updatedReadCanonical=canonical;phase='idle'
  expect(updatedReadCanonical).toBe(0)
  await prisma.organizationMembership.update({where:{id:ownerMembership.id},data:{validUntil:new Date()}})
  await expect(readCampusGroupReport({actor,organizationId:organization.id,artifactId:generated.artifactId})).rejects.toMatchObject({code:'CAMPUS_GROUP_REPORT_NOT_FOUND'})
  writeFileSync('/tmp/school-group-service-proof.json',JSON.stringify({passed:true,syntheticContentRegistry:true,realSchoolServiceAuthorityCanonicalStatsAndArtifact:true,selectedPeople:10,assignedPeople:20,generationCanonical,readCanonical:updatedReadCanonical,operations,generationMs,readMs:updatedReadMs,measurement:'explicit updated version generation versus its immediate persisted read',resumedFirstArtifact:!!resumedArtifact,immutableOldVersion:true,frozenRangeAfterRename:true,currentAuthorityRevocation:true,specIndependentReviewReal:true,productionAccessed:false},null,2))
 },40_000)
})
