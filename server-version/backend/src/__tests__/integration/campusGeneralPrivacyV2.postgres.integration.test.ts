import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {buildReportingFixture} from './reporting-fixture'
import {grantSyntheticHuischoolProduct} from './educationProductFixture'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {policyFingerprint} from '../../modules/report-privacy/schema'
import {STANDARD} from '../../modules/report-privacy/registry'
import type {AuthenticatedPrincipal} from '../../types'

const science=vi.hoisted(()=>({
  generate:vi.fn(),read:vi.fn(),spec:vi.fn(),artifact:vi.fn(),
}))
// Real PostgreSQL source admission/authorization/immutable release/read.
// Stub only the separately reviewed scientific engine/artifact producer:
// its detailed canonical-result and scientific validation have their own tests.
vi.mock('../../modules/reporting/service',()=>({
  generateOrganizationGroupAnalysis:science.generate,
}))
vi.mock('../../modules/reporting/pr4Service',()=>({
  readOrganizationReportingArtifact:science.read,
}))
vi.mock('../../modules/reporting/spec',()=>({
  getPublishedReportingSpec:science.spec,
}))
vi.mock('../../modules/reporting/artifact',()=>({
  readReportingArtifactRecord:science.artifact,
}))
import {publishCampusGeneralGroupV2,readCampusGeneralGroupV2}
  from '../../modules/campus/generalGroupV2.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=url&&process.env.DATABASE_URL===url?describe:describe.skip
let db:PrismaClient
const old={preferences:process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED,
  school:process.env.REPORT_PRIVACY_SCHOOL_V2_ENABLED,
  manifest:process.env.CAMPUS_GENERAL_REPORT_APPROVED_RESOURCES,
  encryption:process.env.DATA_ENCRYPTION_KEY}
const set=(name:string,value:string|undefined)=>{
  if(value===undefined)delete process.env[name]
  else process.env[name]=value
}
suite('School general V2: exact resource + immutable release/read in isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!)
    process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED='true'
    process.env.REPORT_PRIVACY_SCHOOL_V2_ENABLED='true'
    process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32)
    db=new PrismaClient({datasources:{db:{url:url!}}})
    await db.$connect()
  })
  afterAll(async()=>{
    await db?.$disconnect()
    set('REPORT_PRIVACY_PREFERENCES_V1_ENABLED',old.preferences)
    set('REPORT_PRIVACY_SCHOOL_V2_ENABLED',old.school)
    set('CAMPUS_GENERAL_REPORT_APPROVED_RESOURCES',old.manifest)
    set('DATA_ENCRYPTION_KEY',old.encryption)
  })
  it('publishes only a reviewed complete SELF/STUDENT source, then GET reads identical projection',async()=>{
    const ownerId=randomUUID(),organizationId=randomUUID()
    const admin=await db.user.create({data:{
      id:ownerId,username:'v2admin_'+ownerId.replace(/-/g,'').slice(0,23),
      passwordHash:'synthetic',accountDomain:'SCHOOL',
      role:'ADMIN',teacherApproved:true,
    }})
    await db.organization.create({data:{
      id:organizationId,name:'School general privacy '+randomUUID(),
      productDomain:'SCHOOL',createdByUserId:admin.id,
    }})
    const ownerMember=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId,userId:admin.id,orgRole:'ORG_ADMIN',
    }})
    await grantSyntheticHuischoolProduct(db,{
      organizationId,adminUserId:admin.id,adminMembershipId:ownerMember.id,
    })
    const members:Array<{userId:string;membershipId:string}>=[]
    for(let i=0;i<5;i++){
      const personId=randomUUID()
      await db.user.create({data:{
        id:personId,username:'v2student_'+personId.replace(/-/g,'').slice(0,21),
        passwordHash:'synthetic',accountDomain:'SCHOOL',role:'STUDENT',
      }})
      const member=await db.organizationMembership.create({data:{
        id:randomUUID(),organizationId,userId:personId,orgRole:'MEMBER',
      }})
      members.push({userId:personId,membershipId:member.id})
    }
    const f=await buildReportingFixture(db,5,false,{
      ownerId:admin.id,organizationId,members,
      resourceKey:'school-general-review-'+randomUUID(),
      resourceVersion:'1.0.0',at:new Date('2026-10-08T00:00:00Z'),
    })
    const actor:AuthenticatedPrincipal={
      userId:admin.id,username:admin.username,role:'ADMIN',
      accountDomain:'SCHOOL',platformRole:'STANDARD',
      tokenVersion:0,mustChangePassword:false,
    }
    const ref=await db.$queryRaw<Array<{key:string;version:string}>>`
      SELECT resource_key AS key,resource_version AS version
      FROM assessment_run_tracks WHERE id=${f.trackId}
    `
    expect(ref).toHaveLength(1)
    process.env.CAMPUS_GENERAL_REPORT_APPROVED_RESOURCES=JSON.stringify([{
      family:'BUNDLE',key:ref[0].key,version:ref[0].version,
    }])
    const requested={
      subjectRoles:['STUDENT'],respondentRoles:['STUDENT'],
      relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],
      analysisMode:'COHORT_AGGREGATE',minimumRespondents:5,
    }
    const resource={minimumRespondents:5}
    await db.$executeRaw`
      UPDATE assessment_run_tracks SET requested_policy=${JSON.stringify(requested)}::jsonb,
        frozen_resource_policy=${JSON.stringify(resource)}::jsonb,
        resource_policy_hash=${canonicalHash(resource)}
      WHERE id=${f.trackId}
    `
    const closedAt=new Date(Date.now()-86_400_000*2)
    await db.$executeRaw`
      UPDATE assessment_runs SET status='CLOSED',closed_at=${closedAt}
      WHERE id=${f.runId}
    `
    const course=await db.course.create({data:{
      title:'School V2 controlled general education group',
      courseCode:'schoolv2-'+randomUUID(),creatorId:f.ownerId,
      courseType:'CAMPUS_ACTIVITY',organizationId:f.organizationId,
      isRecruiting:false,
    }})
    await db.$executeRaw`
      INSERT INTO campus_activities
        (course_id,organization_id,owner_membership_id,purpose,status,closed_at)
      VALUES (${course.id},${f.organizationId},${ownerMember.id},
        'SCHOOL_CLIMATE','CLOSED',${closedAt})
    `
    await db.$executeRaw`
      INSERT INTO campus_activity_runs
        (course_id,organization_id,run_id,bound_by_user_id)
      VALUES (${course.id},${f.organizationId},${f.runId},${f.ownerId})
    `
    for(const member of f.members){
      const episode=await db.assessmentEpisode.create({data:{
        id:randomUUID(),subjectUserId:member.userId,
        initiatedByUserId:f.ownerId,initiationMode:'STUDENT_SELF',
      }})
      const relation={schemaVersion:1,relationshipKind:'SELF',
        subjectUserId:member.userId,respondentUserId:member.userId}
      const assignment=await db.relationalAssessmentAssignment.create({data:{
        id:randomUUID(),episodeId:episode.id,subjectUserId:member.userId,
        subjectRole:'STUDENT',respondentUserId:member.userId,
        respondentRole:'STUDENT',createdByUserId:f.ownerId,
        relationshipKind:'SELF',relationshipSnapshotJson:relation,
        relationshipSnapshotHash:canonicalHash(relation),
        perspective:'SELF_REPORT',resourceKind:'BUNDLE',
        resourceKey:ref[0].key,resourceVersion:ref[0].version,
        analysisMode:'COHORT_AGGREGATE',minimumRespondents:5,
        visibilityPolicyKey:'CAMPUS_GENERAL_TEST',
      }})
      await db.$executeRaw`
        UPDATE assessment_run_executions SET relational_assignment_id=${assignment.id}
        WHERE id=${member.executionId}
      `
    }
    const proof={schemaVersion:1,product:'HUISCHOOL',
      scenario:'SCHOOL_GENERAL_EDUCATION_GROUP',
      options:{...STANDARD,crossReleaseOverlapGuard:true},
      source:'APPROVED_REPORT_PREFERENCE_V1'}
    const snapshot=await db.educationReportPolicySnapshot.create({data:{
      id:randomUUID(),organizationId:f.organizationId,runId:f.runId,
      product:'HUISCHOOL',scenario:'SCHOOL_GENERAL_EDUCATION_GROUP',
      effective:proof,effectiveHash:policyFingerprint(proof),
      fingerprint:policyFingerprint({proof,runId:f.runId}),
      policyVersion:1,origin:'MY',schoolDefaultRevision:0,
      schoolMinimumRevision:0,publisherRevision:1,
      publishedByUserId:f.ownerId,publishedAt:closedAt,
    }})
    const specId=randomUUID(),artifactId=randomUUID()
    const projection={kind:'GROUP',state:'present',eligibleN:5,
      resultContributorN:5,metrics:{
        score:{state:'present',validN:5,missingN:0,
          aggregations:{mean:2.4,median:2.5}},
      }}
    science.spec.mockResolvedValue({definition:{
      analysisKind:'GROUP',minimumCohortN:5,minimumContributorN:5,
      metricRules:[{metricId:'score',minimumMetricN:5}],
    }})
    science.generate.mockResolvedValue({artifactId})
    science.read.mockResolvedValue({artifactId,projection})
    science.artifact.mockResolvedValue({
      analysisKind:'GROUP',organizationId:f.organizationId,specId,
      artifactPayload:{source:{runId:f.runId,trackId:f.trackId},
        inputManifest:f.members.map(m=>({subjectUserId:m.userId}))},
    })
    const input={actor,organizationId:f.organizationId,
      runId:f.runId,trackId:f.trackId,specId}
    await expect(readCampusGeneralGroupV2(input))
      .rejects.toMatchObject({code:'CAMPUS_GENERAL_REPORT_NOT_PUBLISHED'})
    const released=await publishCampusGeneralGroupV2(input)
    expect(released).toMatchObject({state:'READY',participantN:5,completedN:5,
      metrics:{score:{mean:2.4}}})
    expect(await readCampusGeneralGroupV2(input)).toEqual(released)
    expect(await publishCampusGeneralGroupV2(input)).toEqual(released)
    const ledger=await db.educationReportReleaseRecord.findFirstOrThrow({
      where:{organizationId:f.organizationId,policySnapshotId:snapshot.id,
        reportKind:'SCHOOL_GENERAL_EDUCATION_GROUP'},
    })
    expect(ledger.effectivePopulationDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(ledger.reportProjection)).not.toContain(f.members[0].userId)
    expect(await db.educationReportReleaseRecord.count({where:{
      organizationId:f.organizationId,reportKind:'SCHOOL_GENERAL_EDUCATION_GROUP',
    }})).toBe(1)
    await expect(db.educationReportReleaseRecord.delete({where:{id:ledger.id}}))
      .rejects.toThrow()
    const student:AuthenticatedPrincipal={...actor,
      userId:f.members[0].userId,role:'STUDENT'}
    await expect(readCampusGeneralGroupV2({...input,actor:student})).rejects.toThrow()
    process.env.REPORT_PRIVACY_SCHOOL_V2_ENABLED='false'
    await expect(readCampusGeneralGroupV2(input)).rejects
      .toMatchObject({code:'CAMPUS_GENERAL_REPORT_DISABLED'})
  })
})
