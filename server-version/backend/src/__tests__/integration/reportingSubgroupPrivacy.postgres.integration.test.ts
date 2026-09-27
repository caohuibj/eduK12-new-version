import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { buildReportingFixture } from './reporting-fixture'
import { createMembership, grantPersona } from '../../modules/organization/service'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { assignStaffToClass, assignStudentToClass, endStaffClassAssignment } from '../../modules/organization/classRelationships'
import { createPlatformReportingSpec, publishPlatformReportingSpec, reviewPlatformReportingSpec } from '../../modules/reporting/spec'
import { generateOrganizationGroupAnalysis } from '../../modules/reporting/service'
import { readOrganizationReportingArtifact } from '../../modules/reporting/pr4Service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
if(!url) throw new Error('Reporting subgroup privacy requires an isolated PostgreSQL database')
afterAll(()=>prisma.$disconnect())
const meta=(userId:string)=>({actorUserId:userId,commandKey:randomUUID()})

describe('new subgroup generation privacy',()=>{
  it('keeps full historical Run access but requires current subject scope and blocks close member differencing',async()=>{
    const f=await buildReportingFixture(prisma,7)
    const organizationId=f.organizationId
    const manager=await createMembership({organizationId,userId:f.ownerId,meta:meta(f.ownerId)})
    await grantPersona({organizationId,membershipId:manager.id,persona:'TEACHER',meta:meta(f.ownerId)})
    for(const member of f.members) await grantPersona({
      organizationId,membershipId:member.membershipId,persona:'STUDENT',meta:meta(f.ownerId),
    })
    const grade=await createOrganizationUnit({organizationId,unitKind:'GRADE',name:'Privacy grade'})
    const cls=await createOrganizationUnit({organizationId,unitKind:'CLASS',name:'Privacy class',parentUnitId:grade.id})
    for(const member of f.members) await assignStudentToClass({organizationId,membershipId:member.membershipId,classUnitId:cls.id})
    const staff=await assignStaffToClass({organizationId,membershipId:manager.id,classUnitId:cls.id,staffRole:'TEACHING'})

    const admin=await prisma.user.create({data:{
      username:`privacy-admin-${randomUUID()}`,passwordHash:'test-only',role:UserRole.ADMIN,platformRole:'SYSTEM_ADMIN',
    }})
    const actor={userId:admin.id,platformRole:'SYSTEM_ADMIN' as const}
    const spec=await createPlatformReportingSpec({actor,specKey:`privacy-${randomUUID()}`,version:1,definition:{
      schemaVersion:1,analysisKind:'GROUP',engineKey:'ORG_GROUP_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',
      selectionPolicy:'UNIQUE_OR_REJECT',minimumCohortN:3,minimumContributorN:3,reportEvidenceCeiling:'PILOT',
      metricRules:[{metricId:'score',sourceMetricKey:'score',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',
        aggregations:['MEAN'],missingnessRule:'EXCLUDE',minimumMetricN:3,observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}],
    }})
    await reviewPlatformReportingSpec({actor,specId:spec.id});await publishPlatformReportingSpec({actor,specId:spec.id})

    const principal={userId:f.ownerId,platformRole:'STANDARD' as const}
    const base={principal,organizationId,runId:f.runId,trackId:f.trackId,specId:spec.id}
    const full=await generateOrganizationGroupAnalysis(base)
    expect(full.projection.state).toBe('present')

    const selector=(indexes:number[])=>({
      schemaVersion:2 as const,combine:'ALL' as const,
      clauses:[{kind:'MEMBERSHIP_IDS' as const,membershipIds:indexes.map(i=>f.members[i].membershipId)}],
    })
    const first=await generateOrganizationGroupAnalysis({...base,cohortSelector:selector([0,1,2])})
    expect(first.projection.state).toBe('present')

    await expect(generateOrganizationGroupAnalysis({...base,cohortSelector:selector([0,1,3])}))
      .rejects.toMatchObject({code:'REPORT_PRIVACY_GUARD'})

    await endStaffClassAssignment({organizationId,assignmentId:staff.id})
    await expect(generateOrganizationGroupAnalysis({...base,cohortSelector:selector([0,1,2])}))
      .rejects.toMatchObject({statusCode:404})

    // Existing immutable artifacts and the complete own Run keep their previous policy.
    expect((await readOrganizationReportingArtifact({...base,artifactId:first.artifactId})).artifactId).toBe(first.artifactId)
    expect((await generateOrganizationGroupAnalysis(base)).artifactId).toBe(full.artifactId)
  },90000)

  it('blocks the A/B/C compositional disclosure counterexample before a single subject can be reconstructed',async()=>{
    const f=await buildReportingFixture(prisma,10)
    const organizationId=f.organizationId
    const manager=await createMembership({organizationId,userId:f.ownerId,meta:meta(f.ownerId)})
    await grantPersona({organizationId,membershipId:manager.id,persona:'TEACHER',meta:meta(f.ownerId)})
    for(const member of f.members) await grantPersona({organizationId,membershipId:member.membershipId,persona:'STUDENT',meta:meta(f.ownerId)})
    const grade=await createOrganizationUnit({organizationId,unitKind:'GRADE',name:'Composition grade'})
    const cls=await createOrganizationUnit({organizationId,unitKind:'CLASS',name:'Composition class',parentUnitId:grade.id})
    for(const member of f.members) await assignStudentToClass({organizationId,membershipId:member.membershipId,classUnitId:cls.id})
    await assignStaffToClass({organizationId,membershipId:manager.id,classUnitId:cls.id,staffRole:'TEACHING'})

    const admin=await prisma.user.create({data:{
      username:`privacy-composition-admin-${randomUUID()}`,passwordHash:'test-only',role:UserRole.ADMIN,platformRole:'SYSTEM_ADMIN',
    }})
    const actor={userId:admin.id,platformRole:'SYSTEM_ADMIN' as const}
    const spec=await createPlatformReportingSpec({actor,specKey:`privacy-composition-${randomUUID()}`,version:1,definition:{
      schemaVersion:1,analysisKind:'GROUP',engineKey:'ORG_GROUP_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',
      selectionPolicy:'UNIQUE_OR_REJECT',minimumCohortN:3,minimumContributorN:3,reportEvidenceCeiling:'PILOT',
      metricRules:[{metricId:'score',sourceMetricKey:'score',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',
        aggregations:['MEAN'],missingnessRule:'EXCLUDE',minimumMetricN:3,observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}],
    }})
    await reviewPlatformReportingSpec({actor,specId:spec.id});await publishPlatformReportingSpec({actor,specId:spec.id})
    const principal={userId:f.ownerId,platformRole:'STANDARD' as const}
    const base={principal,organizationId,runId:f.runId,trackId:f.trackId,specId:spec.id}
    const selector=(indexes:number[])=>({
      schemaVersion:2 as const,combine:'ALL' as const,
      clauses:[{kind:'MEMBERSHIP_IDS' as const,membershipIds:indexes.map(i=>f.members[i].membershipId)}],
    })

    // X=0,1,2; Y=3,4,5; Z=6; Other=7,8,9.
    // A=X+Z and B=Y+Z are individually legal (N=4, complement N=6).
    // The old pairwise-difference rule allowed A/B/C and C=X+Y+Z (N=7,
    // complement N=3), from which Z could be reconstructed algebraically.
    const first=await generateOrganizationGroupAnalysis({...base,cohortSelector:selector([0,1,2,6])})
    expect(first.projection.state).toBe('present')
    await expect(generateOrganizationGroupAnalysis({...base,cohortSelector:selector([3,4,5,6])}))
      .rejects.toMatchObject({code:'REPORT_PRIVACY_GUARD'})
    await expect(generateOrganizationGroupAnalysis({...base,cohortSelector:selector([0,1,2,3,4,5,6])}))
      .rejects.toMatchObject({code:'REPORT_PRIVACY_GUARD'})
  },90000)

  it('makes subgroup privacy check and publication atomic under concurrent requests',async()=>{
    const f=await buildReportingFixture(prisma,10)
    const organizationId=f.organizationId
    const manager=await createMembership({organizationId,userId:f.ownerId,meta:meta(f.ownerId)})
    await grantPersona({organizationId,membershipId:manager.id,persona:'TEACHER',meta:meta(f.ownerId)})
    for(const member of f.members) await grantPersona({organizationId,membershipId:member.membershipId,persona:'STUDENT',meta:meta(f.ownerId)})
    const grade=await createOrganizationUnit({organizationId,unitKind:'GRADE',name:'Atomic privacy grade'})
    const cls=await createOrganizationUnit({organizationId,unitKind:'CLASS',name:'Atomic privacy class',parentUnitId:grade.id})
    for(const member of f.members) await assignStudentToClass({organizationId,membershipId:member.membershipId,classUnitId:cls.id})
    await assignStaffToClass({organizationId,membershipId:manager.id,classUnitId:cls.id,staffRole:'TEACHING'})

    const admin=await prisma.user.create({data:{
      username:`privacy-atomic-admin-${randomUUID()}`,passwordHash:'test-only',role:UserRole.ADMIN,platformRole:'SYSTEM_ADMIN',
    }})
    const actor={userId:admin.id,platformRole:'SYSTEM_ADMIN' as const}
    const spec=await createPlatformReportingSpec({actor,specKey:`privacy-atomic-${randomUUID()}`,version:1,definition:{
      schemaVersion:1,analysisKind:'GROUP',engineKey:'ORG_GROUP_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',
      selectionPolicy:'UNIQUE_OR_REJECT',minimumCohortN:3,minimumContributorN:3,reportEvidenceCeiling:'PILOT',
      metricRules:[{metricId:'score',sourceMetricKey:'score',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',
        aggregations:['MEAN'],missingnessRule:'EXCLUDE',minimumMetricN:3,observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}],
    }})
    await reviewPlatformReportingSpec({actor,specId:spec.id});await publishPlatformReportingSpec({actor,specId:spec.id})
    const principal={userId:f.ownerId,platformRole:'STANDARD' as const}
    const base={principal,organizationId,runId:f.runId,trackId:f.trackId,specId:spec.id}
    const selector=(indexes:number[])=>({
      schemaVersion:2 as const,combine:'ALL' as const,
      clauses:[{kind:'MEMBERSHIP_IDS' as const,membershipIds:indexes.map(i=>f.members[i].membershipId)}],
    })
    const results=await Promise.allSettled([
      generateOrganizationGroupAnalysis({...base,cohortSelector:selector([0,1,2])}),
      generateOrganizationGroupAnalysis({...base,cohortSelector:selector([3,4,5])}),
    ])
    expect(results.filter((result)=>result.status==='fulfilled')).toHaveLength(1)
    const rejected=results.find((result)=>result.status==='rejected')
    expect(rejected?.status).toBe('rejected')
    if(rejected?.status==='rejected') expect(rejected.reason).toMatchObject({code:'REPORT_PRIVACY_GUARD'})
  },90000)

})
