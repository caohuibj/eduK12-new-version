import { testDisclosure } from '../assessment-policy/result-disclosure.fixture'
import { relationalProductRegistry } from '../../modules/assessment-relational/product-registry'
import { readParticipantLongitudinal, listParticipantLongitudinal } from '../../modules/reporting/participantService'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { assignStudentToClass, assignStaffToClass, endStaffClassAssignment } from '../../modules/organization/classRelationships'
import { createCounselorClientRelationship, endCounselorClientRelationship } from '../../modules/organization/classificationRelations'
import { assertIndividualLongitudinalAccess } from '../../modules/reporting/individualAuthorization'
import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { buildReportingFixture } from './reporting-fixture'
import { createMembership, endMembership, grantCapability, grantPersona, denyOrganizationAccess } from '../../modules/organization/service'
import { createPlatformReportingSpec, reviewPlatformReportingSpec, publishPlatformReportingSpec, validateReportingSpecDefinition } from '../../modules/reporting/spec'
import { generateIndividualLongitudinal, listIndividualSources, listIndividualSubjects, listCohortMembers } from '../../modules/reporting/individualService'
import { readOrganizationReportingArtifact } from '../../modules/reporting/pr4Service'
import { readReportingArtifactRecord } from '../../modules/reporting/artifact'
import { createReportingExport, downloadReportingExport } from '../../modules/reporting/export'
import { buildIndividualLongitudinalProjection } from '../../modules/reporting/individual'
import { listOrganizationReportingSeries, listOrganizationReportingSources, listReportingCohortOptions } from '../../modules/reporting/discovery'
import { createReportingSeries, readReportingSeriesWave } from '../../modules/reporting/series'
import type { ReportingIndividualLongitudinalSpecV1 } from '../../modules/reporting/types'
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
if (!url) throw new Error('Individual longitudinal requires an isolated PostgreSQL database')
let db: PrismaClient
beforeAll(() => { process.env.DATABASE_URL=url; db=new PrismaClient({datasources:{db:{url}}}) })
afterAll(async()=>{await db.$disconnect()})
describe('individual longitudinal PostgreSQL',()=>{
  it('isolates one stable user, preserves evidence, reuses artifacts and revokes reads/exports',async()=>{
    const contract = testDisclosure(); contract.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['score'],longitudinalMetricKeys:['score']}; contract.audiences.PROFESSIONAL={...contract.audiences.RESPONDENT}
    const first=await buildReportingFixture(db,3,false,undefined,contract)
    const manager=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:first.organizationId,userId:first.ownerId,orgRole:'ORG_ADMIN'}})
    const principal={userId:first.ownerId,platformRole:'STANDARD' as const}
    const scope={principal,organizationId:first.organizationId}
    const subject=first.members[0]
    const meta=()=>({actorUserId:first.ownerId,commandKey:randomUUID()})
    await expect(assertIndividualLongitudinalAccess({...scope,subjectUserId:subject.userId})).rejects.toMatchObject({statusCode:404})
    await grantCapability({organizationId:first.organizationId,membershipId:manager.id,capability:'PSYCHOLOGY_STAFF',meta:meta()})
    await endMembership({organizationId:first.organizationId,membershipId:subject.membershipId,meta:meta()})
    const episode=await createMembership({organizationId:first.organizationId,userId:subject.userId,meta:meta()})
    const resource=(await db.$queryRaw<Array<{key:string}>>`SELECT resource_key AS key FROM assessment_run_tracks WHERE id=${first.trackId}`)[0].key
    const second=await buildReportingFixture(db,3,false,{ownerId:first.ownerId,organizationId:first.organizationId,
      members:first.members.map((m,i)=>({userId:m.userId,membershipId:i===0?episode.id:m.membershipId})),resourceKey:resource,at:new Date('2026-10-01')},contract)
    const actor={userId:first.ownerId,platformRole:'SYSTEM_ADMIN' as const}
    const definition:ReportingIndividualLongitudinalSpecV1={schemaVersion:1,analysisKind:'INDIVIDUAL_LONGITUDINAL',engineKey:'ORG_INDIVIDUAL_LONGITUDINAL_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT',reportEvidenceCeiling:'PILOT',
      metricRules:[{metricId:'score',sourceMetricKey:'score',sourceFamily:'BUNDLE',sourceResourceKey:resource,valueType:'NUMBER',longitudinalMetricKey:'score',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',missingnessRule:'EXCLUDE',observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}],
      comparabilityRules:[{schemaVersion:1,metricId:'score',resourceFamily:'BUNDLE',resourceKey:resource,fromVersion:'1.0.0',toVersion:'1.0.0',level:'EXACT',evidenceRef:'test:same-protocol',evidenceHash:'e'.repeat(64)}]}
    expect(()=>validateReportingSpecDefinition({...definition,minimumCohortN:1})).toThrow()
    const spec=await createPlatformReportingSpec({actor,specKey:randomUUID(),version:1,definition})
    await reviewPlatformReportingSpec({actor,specId:spec.id});await publishPlatformReportingSpec({actor,specId:spec.id})
    const discovery=await listIndividualSubjects({...scope,page:1,pageSize:2})
    expect(discovery.list).toHaveLength(2);expect(discovery.nextPage).toBe(2)
    expect((await listIndividualSources({...scope,subjectUserId:subject.userId,page:1,pageSize:1})).nextPage).toBe(2)
    const named=await listCohortMembers({...scope,page:1,pageSize:100})
    expect(named.list.find(m=>m.userId===subject.userId)?.membershipIds.sort()).toEqual([subject.membershipId,episode.id].sort())
    expect((await listCohortMembers({...scope,search:'no-such-member',page:1,pageSize:1})).list).toEqual([])
    const input={...scope,subjectUserId:subject.userId,specId:spec.id,sources:[second,first].map(({runId,trackId})=>({runId,trackId}))}
    const released = vi.spyOn(relationalProductRegistry, 'findExact').mockReturnValue({releaseStatus:'PUBLISHED',resultDisclosure:contract} as any)
    const result=await generateIndividualLongitudinal(input)
    expect(result.projection.waves.map(w=>w.metrics.score)).toEqual([{state:'present',value:1},{state:'present',value:1}])
    expect(result.projection.comparisons[0].metrics.score.delta).toBe(0)
    expect((await Promise.all([generateIndividualLongitudinal(input),generateIndividualLongitudinal({...input,sources:[...input.sources].reverse()})])).map(a=>a.artifactId)).toEqual([result.artifactId,result.artifactId])

    try {
      const participant = await readParticipantLongitudinal(subject.userId, result.artifactId)
      expect(participant.waves.map(w=>w.metrics.score)).toEqual([{state:'present',value:1},{state:'present',value:1}])
      expect(participant.comparisons[0].metrics.score.delta).toBe(0)
      expect(JSON.stringify(participant)).not.toMatch(/canonicalResultHash|snapshotHash|generatedByUserId|subjectUserId|waveId|evidenceHash|evidenceRef/)
      expect((await listParticipantLongitudinal(subject.userId)).list.map(r=>r.id)).toContain(result.artifactId)
      await expect(readParticipantLongitudinal(first.members[1].userId,result.artifactId)).rejects.toMatchObject({statusCode:404})
      await expect(readParticipantLongitudinal(first.ownerId,result.artifactId)).rejects.toMatchObject({statusCode:404})
      released.mockReturnValue(null)
      await expect(readParticipantLongitudinal(subject.userId,result.artifactId)).rejects.toMatchObject({statusCode:404})
      released.mockReturnValue({releaseStatus:'PUBLISHED',resultDisclosure:contract} as any)
    } finally { /* keep release available for subsequent staff reads/exports */ }
    const stored=await readReportingArtifactRecord(result.artifactId)
    if(stored.analysisKind!=='INDIVIDUAL_LONGITUDINAL') throw new Error('wrong artifact')
    const waves=await Promise.all(stored.artifactPayload.waveBindings.map(w=>readReportingSeriesWave({organizationId:first.organizationId,seriesId:stored.seriesId,waveKey:w.waveKey})))
    expect(waves.map(w=>w.inputManifest.resolved.map(r=>r.subjectUserId))).toEqual([[subject.userId],[subject.userId]])
    expect(waves.map(w=>w.inputManifest.resolved[0].membershipId)).toEqual([subject.membershipId,episode.id])
    const sideBySide=buildIndividualLongitudinalProjection({subjectUserId:subject.userId,waves,spec:{...definition,comparabilityRules:[]}})
    expect(sideBySide.comparisons[0].metrics.score.comparability.level).toBe('NOT_COMPARABLE')
    expect(sideBySide.comparisons[0].metrics.score).not.toHaveProperty('delta')
    const missing=structuredClone(waves); const row=missing[1].inputManifest.resolved[0]
    missing[1].inputManifest.resolved=[];missing[1].inputManifest.unresolved=[{executionId:row.executionId,subjectUserId:row.subjectUserId,membershipId:row.membershipId,reason:'NOT_COMPLETED'}]
    expect(buildIndividualLongitudinalProjection({subjectUserId:subject.userId,waves:missing,spec:definition}).waves[1].metrics.score).toEqual({state:'missing',reason:'NOT_COMPLETED'})
    expect(()=>buildIndividualLongitudinalProjection({subjectUserId:first.members[1].userId,waves,spec:definition})).toThrow()
    await expect(generateIndividualLongitudinal({...input,subjectUserId:randomUUID()})).rejects.toMatchObject({statusCode:404})
    await expect(generateIndividualLongitudinal({...input,sources:[input.sources[0],input.sources[0]]})).rejects.toMatchObject({statusCode:400})
    const unrelated={...scope,principal:{userId:first.members[1].userId,platformRole:'STANDARD' as const},artifactId:result.artifactId}
    await expect(readOrganizationReportingArtifact(unrelated)).rejects.toMatchObject({statusCode:404})
    await expect(readOrganizationReportingArtifact({...unrelated,principal:{userId:subject.userId,platformRole:'STANDARD'}})).rejects.toMatchObject({statusCode:404})
    await expect(db.$executeRaw`UPDATE reporting_analysis_artifacts SET subject_user_id=${first.members[1].userId} WHERE id=${result.artifactId}`).rejects.toThrow()
    await expect(db.$executeRaw`DELETE FROM reporting_analysis_artifacts WHERE id=${result.artifactId}`).rejects.toThrow()
    await grantCapability({organizationId:first.organizationId,membershipId:manager.id,capability:'REPORT_MEMBER_EXPORT',meta:meta()})
    await expect(createReportingExport({...scope,target:{kind:'AGGREGATE',artifactId:result.artifactId}})).rejects.toMatchObject({code:'EXPORT_NOT_ALLOWED'})
    const ticket=await createReportingExport({...scope,target:{kind:'MEMBER',artifactId:result.artifactId}})
    expect((await downloadReportingExport({...scope,exportId:ticket.exportId})).csv).toContain('INDIVIDUAL_LONGITUDINAL')
    await db.organizationMembership.update({where:{id:first.members[2].membershipId},data:{orgRole:'ORG_ADMIN'}})
    await endMembership({organizationId:first.organizationId,membershipId:manager.id,meta:meta()})
    await expect(readOrganizationReportingArtifact({...scope,artifactId:result.artifactId})).rejects.toMatchObject({statusCode:404})
    await expect(downloadReportingExport({...scope,exportId:ticket.exportId})).rejects.toMatchObject({statusCode:404})
    released.mockRestore()
  },60000)
  it('requires current teacher/class or counselor/client scope and honors individual-policy denies', async()=>{
    const f=await buildReportingFixture(db,3)
    const organizationId=f.organizationId
    const manager=await createMembership({organizationId,userId:f.ownerId,meta:{actorUserId:f.ownerId,commandKey:randomUUID()}})
    const meta=()=>({actorUserId:f.ownerId,commandKey:randomUUID()})
    await grantPersona({organizationId,membershipId:manager.id,persona:'TEACHER',meta:meta()})
    const principal={userId:f.ownerId,platformRole:'STANDARD' as const}
    const input={principal,organizationId,subjectUserId:f.members[0].userId}
    await expect(assertIndividualLongitudinalAccess(input)).rejects.toMatchObject({statusCode:404})
    await grantPersona({organizationId,membershipId:f.members[0].membershipId,persona:'STUDENT',meta:meta()})
    await grantPersona({organizationId,membershipId:f.members[1].membershipId,persona:'STUDENT',meta:meta()})
    const grade=await createOrganizationUnit({organizationId,unitKind:'GRADE',name:'grade'})
    const cls=await createOrganizationUnit({organizationId,unitKind:'CLASS',name:'class',parentUnitId:grade.id})
    const otherCls=await createOrganizationUnit({organizationId,unitKind:'CLASS',name:'other-class',parentUnitId:grade.id})
    await assignStudentToClass({organizationId,membershipId:f.members[0].membershipId,classUnitId:cls.id})
    await assignStudentToClass({organizationId,membershipId:f.members[1].membershipId,classUnitId:otherCls.id})
    const staff=await assignStaffToClass({organizationId,membershipId:manager.id,classUnitId:cls.id,staffRole:'TEACHING'})

    const dimension=randomUUID(), inScopeLabel=randomUUID(), outOfScopeLabel=randomUUID()
    await db.$executeRaw`INSERT INTO organization_classification_dimensions
      (id,organization_id,key,name,cardinality)
      VALUES (${dimension},${organizationId},${'scope-'+randomUUID()},'Scope labels','SINGLE')`
    await db.$executeRaw`INSERT INTO organization_labels (id,organization_id,dimension_id,name)
      VALUES (${inScopeLabel},${organizationId},${dimension},'Visible label'),
             (${outOfScopeLabel},${organizationId},${dimension},'Hidden label')`
    await db.$executeRaw`INSERT INTO organization_label_assignments
      (id,organization_id,membership_id,dimension_id,dimension_cardinality,label_id,valid_from)
      VALUES
        (${randomUUID()},${organizationId},${f.members[0].membershipId},${dimension},'SINGLE',${inScopeLabel},'2026-09-01'::timestamptz),
        (${randomUUID()},${organizationId},${f.members[1].membershipId},${dimension},'SINGLE',${outOfScopeLabel},'2026-09-01'::timestamptz)`

    await expect(assertIndividualLongitudinalAccess(input)).resolves.toBeUndefined()
    const options=await listReportingCohortOptions({principal,organizationId})
    expect(options.classes.map(row=>row.id)).toEqual([cls.id])
    expect(options.labels.map(row=>row.id)).toEqual([inScopeLabel])
    expect(options.dimensions.map(row=>row.id)).toEqual([dimension])

    const resource=(await db.$queryRaw<Array<{family:string;key:string}>>`
      SELECT resource_family AS family, resource_key AS key FROM assessment_run_tracks WHERE id=${f.trackId}`)[0]
    const ownSeries=await createReportingSeries({organizationId,seriesKey:`teacher-${randomUUID()}`,
      scope:{schemaVersion:1,resourceFamily:resource.family as any,resourceKey:resource.key},createdByUserId:f.ownerId})
    const otherSeries=await createReportingSeries({organizationId,seriesKey:`other-${randomUUID()}`,
      scope:{schemaVersion:1,resourceFamily:resource.family as any,resourceKey:resource.key},createdByUserId:f.members[1].userId})
    const visibleSeries=await listOrganizationReportingSeries({principal,organizationId,page:1,pageSize:50})
    expect(visibleSeries.list.map(row=>row.seriesId)).toContain(ownSeries.id)
    expect(visibleSeries.list.map(row=>row.seriesId)).not.toContain(otherSeries.id)

    const otherRun=await buildReportingFixture(db,3,false,{organizationId,ownerId:f.members[1].userId,members:f.members,
      resourceKey:resource.key,at:new Date('2026-10-02T00:00:00Z')})
    const visibleSources=await listOrganizationReportingSources({principal,organizationId,page:1,pageSize:100})
    expect(visibleSources.list.map(row=>row.runId)).toContain(f.runId)
    expect(visibleSources.list.map(row=>row.runId)).not.toContain(otherRun.runId)
    expect((await listIndividualSubjects({...input,page:1,pageSize:50})).list.map(s=>s.userId)).toEqual([f.members[0].userId])
    await expect(assertIndividualLongitudinalAccess({...input,subjectUserId:f.members[1].userId})).rejects.toMatchObject({statusCode:404})
    expect((await listCohortMembers({...input,page:1,pageSize:50})).list.map(s=>s.userId)).toEqual([f.members[0].userId])
    await endStaffClassAssignment({organizationId,assignmentId:staff.id})
    expect((await listCohortMembers({...input,page:1,pageSize:50})).list).toEqual([])
    await expect(assertIndividualLongitudinalAccess(input)).rejects.toMatchObject({statusCode:404})
    await grantPersona({organizationId,membershipId:manager.id,persona:'COUNSELOR',meta:meta()})
    await grantPersona({organizationId,membershipId:f.members[0].membershipId,persona:'CLIENT',meta:meta()})
    const relationship=await createCounselorClientRelationship({organizationId,counselorMembershipId:manager.id,clientMembershipId:f.members[0].membershipId})
    await expect(assertIndividualLongitudinalAccess(input)).resolves.toBeUndefined()
    await endCounselorClientRelationship({organizationId,relationshipId:relationship.id})
    await expect(assertIndividualLongitudinalAccess(input)).rejects.toMatchObject({statusCode:404})
    await grantCapability({organizationId,membershipId:manager.id,capability:'PSYCHOLOGY_STAFF',meta:meta()})
    await expect(assertIndividualLongitudinalAccess(input)).resolves.toBeUndefined()
    await denyOrganizationAccess({organizationId,userId:f.ownerId,permission:'ORG_INDIVIDUAL_REPORT_V1',reason:'test',meta:meta()})
    await expect(assertIndividualLongitudinalAccess(input)).rejects.toMatchObject({statusCode:404})
  },60000)

})
