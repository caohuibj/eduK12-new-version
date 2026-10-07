import { independentReviewer } from './independent-reviewer'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { createCustomScaleDefinition, hashScaleDefinition } from '../../modules/scale/scale-definition'
import { registerDescriptiveResource, transitionDescriptiveResource, listReleasedRegisteredResources, assertRegisteredResourceUse } from '../../modules/assessment-run/registeredResources'
import { createOrganization, createMembership, grantPersona, grantCapability } from '../../modules/organization/service'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { productionRunResourceAuthorityRegistry, RunResourceAuthorityRegistry } from '../../modules/assessment-run/resourceAuthority'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { submitScaleAssessmentFinal } from '../../modules/scale/scale-final-submit.service'
import { generateAutomaticLongitudinal } from '../../modules/reporting/longitudinal-planner'
import { finalizeCompositeAttemptIfReady, updateComposite } from '../../modules/composite/composite.service'
import { decryptFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { readRespondentRunSummary } from '../../modules/reporting/respondentSummary'
import { createPlatformReportingSpec, reviewPlatformReportingSpec, publishPlatformReportingSpec } from '../../modules/reporting/spec'
import { descriptiveReportingDefinition } from '../../modules/reporting/content.controller'
import { generateIndividualLongitudinal } from '../../modules/reporting/individualService'
import { readOrganizationReportingArtifact } from '../../modules/reporting/pr4Service'
import { createReportingExport, downloadReportingExport } from '../../modules/reporting/export'
import { readParticipantLongitudinal } from '../../modules/reporting/participantService'

vi.mock('../../config/queue', () => ({ exportQueue: {}, videoQueue: {}, imageQueue: {} }))
const url = integrationDatabaseUrl('INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL', 'PR38_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient
const suffix = randomUUID()
const meta = (actorUserId: string) => ({ actorUserId, commandKey: randomUUID() })

suite('registered descriptive content → real two-wave canonical reports', () => {
  beforeAll(async () => { requireIsolatedReleaseDatabase(url!); db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect() })
  afterAll(async () => { await db?.$disconnect() })
  it('registers/reviews/publishes through production services, preserves grants and exports two actual FINAL submissions', async () => {
    const admin = await db.user.create({ data: { username:'r3-resource-admin-' + suffix, passwordHash:'synthetic-only', role:'ADMIN', platformRole:'SYSTEM_ADMIN' } })
    const teacher = await db.user.create({ data: { username:'r3-resource-teacher-' + suffix, passwordHash:'synthetic-only', role:'TEACHER' } })
    const student = await db.user.create({ data: { username:'r3-resource-student-' + suffix, passwordHash:'synthetic-only', role:'STUDENT' } })
    const actor = { userId: admin.id, platformRole:'SYSTEM_ADMIN' }, teacherActor = {userId:teacher.id,platformRole:'STANDARD'}
    const definition = createCustomScaleDefinition()
    definition.source = {title:'原创合成偏好素材'}
    definition.items = ['Q1','Q2','Q3'].map((itemCode, sortOrder) => ({ itemCode,sortOrder,content:itemCode,type:'single',required:true,responseSetKey:'default',randomizeOptions:false }))
    definition.scoring.itemRules = definition.items.map(item => ({itemCode:item.itemCode,transform:{type:'identity'}}))
    definition.scoring.scores = [{key:'total',type:'total',label:'总分',direction:'descriptive',canonical:true,displayPrecision:1,source:{type:'items',aggregation:'sum',items:definition.items.map(item => ({itemCode:item.itemCode,weight:1}))}}]
    definition.report.primaryScoreKeys=['total']; definition.report.scoreOrder=['total']
    definition.report.interpretations=[{scoreKey:'total',headline:'偏好描述',source:{type:'score_only'},summary:'三题回答合计。',bands:[],guidance:[]}]
    const definitionHash = hashScaleDefinition(definition)
    const scale = await db.scale.create({data:{code:'r3resource_' + suffix.replaceAll('-',''),name:'原创偏好',status:'PUBLISHED',creatorId:admin.id,instrumentClass:'CUSTOM_DESCRIPTIVE',definition,definitionHash}})
    let resource = await registerDescriptiveResource(actor,scale.id)
    expect((await registerDescriptiveResource(actor,scale.id)).id).toBe(resource.id)
    await expect(updateComposite(admin.id, UserRole.ADMIN, resource.composite_id, {name:'replace'})).rejects.toMatchObject({statusCode:403})
    await expect(transitionDescriptiveResource(actor,resource.id,'publish')).rejects.toMatchObject({code:'RESOURCE_STATE_CONFLICT'})
    await expect(transitionDescriptiveResource(actor,resource.id,'review')).rejects.toMatchObject({code:'RESOURCE_INDEPENDENT_REVIEW_REQUIRED',statusCode:403})
    expect((await db.$queryRaw<Array<{status:string}>>`SELECT status FROM registered_assessment_resources WHERE id=${resource.id}`)[0].status).toBe('DRAFT')
    // Construct an existing pre-policy self-review, then use only production
    // registration/review/publish to repair it as a new version.
    await db.$executeRaw`UPDATE registered_assessment_resources SET status='REVIEWED',reviewed_by_user_id=${admin.id},reviewed_at=CURRENT_TIMESTAMP WHERE id=${resource.id}`
    await expect(transitionDescriptiveResource(actor,resource.id,'publish')).rejects.toMatchObject({code:'RESOURCE_INDEPENDENT_REVIEW_REQUIRED',statusCode:409})
    const oldId = resource.id
    resource = await registerDescriptiveResource(actor,scale.id)
    expect(resource.id).not.toBe(oldId); expect(resource.status).toBe('DRAFT'); expect(resource.resource_version).toBe('1.0.2')
    expect((await registerDescriptiveResource(actor,scale.id)).id).toBe(resource.id)
    expect((await db.$queryRaw<Array<{status:string;reviewed_by_user_id:string}>>`SELECT status,reviewed_by_user_id FROM registered_assessment_resources WHERE id=${oldId}`)[0]).toEqual({status:'REVIEWED',reviewed_by_user_id:admin.id})
    await transitionDescriptiveResource(await independentReviewer(actor),resource.id,'review')
    await transitionDescriptiveResource(actor,resource.id,'publish')
    expect(await listReleasedRegisteredResources(teacher.id, UserRole.TEACHER)).toEqual([])
    const ref = {family:'SCALE' as const,key:resource.resource_key,version:resource.resource_version}
    await expect(assertRegisteredResourceUse(ref, teacher.id)).rejects.toMatchObject({code:'RESOURCE_USE_FORBIDDEN'})
    await db.materialGrant.create({data:{teacherId:teacher.id,resourceType:'SCALE',resourceId:scale.id,grantedBy:admin.id}})
    expect((await listReleasedRegisteredResources(teacher.id,UserRole.TEACHER)).map(e=>e.applicability.resourceKey)).toContain(ref.key)
    const org = await createOrganization({name:'r3-longitudinal-' + suffix,meta:meta(admin.id)})
    const organizationId = org.organization.id
    const studentMembership = await createMembership({organizationId,userId:student.id,meta:meta(admin.id)})
    await grantPersona({organizationId,membershipId:studentMembership.id,persona:'STUDENT',meta:meta(admin.id)})
    const teacherMembership = await createMembership({organizationId,userId:teacher.id,meta:meta(admin.id)})
    await grantPersona({organizationId,membershipId:teacherMembership.id,persona:'TEACHER',meta:meta(admin.id)})
    // Professional capability is explicit synthetic setup, never a publication side effect.
    await grantCapability({organizationId,membershipId:teacherMembership.id,capability:'PSYCHOLOGY_STAFF',meta:meta(admin.id)})
    const sources: Array<{runId:string;trackId:string}> = []
    for (const [wave, values] of [[1,[1,3,5]],[2,[2,4,5]]] as const) {
      const run = await createAssessmentRunDraft({organizationId,name:`实际第${wave}次测量`,createdByUserId:admin.id})
      await addAssessmentRunTrackDraft({organizationId,runId:run.id,resource:ref,
        subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[studentMembership.id]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[studentMembership.id]},
        requestedPolicy:{...resource.entry.applicability}})
      await publishAssessmentRun({organizationId,runId:run.id,actorUserId:admin.id,expectedVersion:2})
      const [execution] = await db.$queryRaw<Array<{id:string;track_id:string}>>`SELECT id,track_id FROM assessment_run_executions WHERE run_id=${run.id}`
      const started = await startAssessmentRunExecution({executionId:execution.id,actorUserId:student.id})
      expect(started.state).toBe('STARTED')
      if (started.state !== 'STARTED') throw new Error('runtime did not start')
      const attemptId = started.runtimeBindingRef
      const child = await db.assessment.findFirstOrThrow({where:{compositeAttemptId:attemptId}})
      const frozen = decryptFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted!)
      await submitScaleAssessmentFinal({assessmentId:child.id,submissionId:randomUUID(),attemptEpoch:child.attemptEpoch,
        definitionHash:frozen.legacyDefinitionHash,userId:student.id,compositeAttemptId:attemptId,
        answers:values.map((value,index)=>({itemCode:'Q'+(index+1),responseValue:'option_'+value}))})
      await finalizeCompositeAttemptIfReady(attemptId)
      expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('COMPLETED')
      const summary = await readRespondentRunSummary(student.id,execution.id)
      expect(summary).toMatchObject({state:'READY',metrics:{total:wave===1?9:11}})
      sources.push({runId:run.id,trackId:execution.track_id})
    }
    const spec = await createPlatformReportingSpec({actor,specKey:'r3-individual-' + suffix,version:1,
      definition:descriptiveReportingDefinition({...resource.entry,definitionHash},'INDIVIDUAL_LONGITUDINAL',3)})
    await reviewPlatformReportingSpec({actor: await independentReviewer(actor),specId:spec.id});await publishPlatformReportingSpec({actor,specId:spec.id})
    const input={organizationId,subjectUserId:student.id,sources,specId:spec.id}
    // Platform admin and org admin alone must not disclose an individual's report.
    await expect(generateIndividualLongitudinal({...input,principal:actor})).rejects.toMatchObject({statusCode:404})
    const report = await generateIndividualLongitudinal({...input,principal:teacherActor})
    expect(report.projection.waves.map(w=>w.metrics.total)).toEqual([{state:'present',value:9},{state:'present',value:11}])
    expect(report.projection.comparisons[0].metrics.total.delta).toBe(2)
    expect((await readParticipantLongitudinal(student.id,report.artifactId)).waves).toHaveLength(2)
    expect((await readOrganizationReportingArtifact({organizationId,artifactId:report.artifactId,principal:teacherActor})).artifactId).toBe(report.artifactId)
    await expect(createReportingExport({organizationId,principal:teacherActor,target:{kind:'MEMBER',artifactId:report.artifactId}})).rejects.toMatchObject({code:'EXPORT_NOT_ALLOWED',statusCode:403})
    await grantCapability({organizationId,membershipId:teacherMembership.id,capability:'REPORT_MEMBER_EXPORT',meta:meta(admin.id)})
    const ticket=await createReportingExport({organizationId,principal:teacherActor,target:{kind:'MEMBER',artifactId:report.artifactId}})
    const download=await downloadReportingExport({organizationId,principal:teacherActor,exportId:ticket.exportId})
    expect(download.csv).toContain('9');expect(download.csv).toContain('11')
    const [adminMembership]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM organization_memberships WHERE organization_id=${organizationId} AND user_id=${admin.id}`
    await grantCapability({organizationId,membershipId:adminMembership.id,capability:'PSYCHOLOGY_STAFF',meta:meta(admin.id)})
    const adminReport=await readOrganizationReportingArtifact({organizationId,artifactId:report.artifactId,principal:actor})
    expect(adminReport.projection).toEqual(report.projection)
    await grantCapability({organizationId,membershipId:adminMembership.id,capability:'REPORT_MEMBER_EXPORT',meta:meta(admin.id)})
    const adminTicket=await createReportingExport({organizationId,principal:actor,target:{kind:'MEMBER',artifactId:report.artifactId}})
    const adminDownload=await downloadReportingExport({organizationId,principal:actor,exportId:adminTicket.exportId})
    expect(adminDownload.csv).toBe(download.csv)
    const groupResource=await registerDescriptiveResource(actor,scale.id,'GROUP')
    await transitionDescriptiveResource(await independentReviewer(actor),groupResource.id,'review');await transitionDescriptiveResource(actor,groupResource.id,'publish')
    const groupMembers=[{userId:student.id,membershipId:studentMembership.id}]
    for (let i=0;i<2;i++) {
      const user=await db.user.create({data:{username:`r3-group-${i}-${suffix}`,passwordHash:'synthetic-only',role:'STUDENT'}})
      const member=await createMembership({organizationId,userId:user.id,meta:meta(admin.id)})
      await grantPersona({organizationId,membershipId:member.id,persona:'STUDENT',meta:meta(admin.id)})
      groupMembers.push({userId:user.id,membershipId:member.id})
    }
    const groupSources: Array<{runId:string;trackId:string}>=[]
    for (const [wave,values] of [[1,[1,3,5]],[2,[2,4,5]]] as const) {
      const run=await createAssessmentRunDraft({organizationId,name:`实际群体第${wave}次`,createdByUserId:admin.id})
      await addAssessmentRunTrackDraft({organizationId,runId:run.id,resource:{family:'SCALE',key:groupResource.resource_key,version:groupResource.resource_version},
        subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:groupMembers.map(m=>m.membershipId)},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:groupMembers.map(m=>m.membershipId)},requestedPolicy:{...groupResource.entry.applicability}})
      await publishAssessmentRun({organizationId,runId:run.id,actorUserId:admin.id,expectedVersion:2})
      const executions=await db.$queryRaw<Array<{id:string;track_id:string;user_id:string}>>`SELECT e.id,e.track_id,a.user_id FROM assessment_run_executions e JOIN assessment_run_actor_snapshots a ON a.id=e.respondent_actor_snapshot_id WHERE e.run_id=${run.id}`
      for (const execution of executions) {
        const started=await startAssessmentRunExecution({executionId:execution.id,actorUserId:execution.user_id})
        if(started.state!=='STARTED') throw new Error('group runtime did not start')
        const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:started.runtimeBindingRef}})
        const frozen=decryptFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted!)
        await submitScaleAssessmentFinal({assessmentId:child.id,submissionId:randomUUID(),attemptEpoch:child.attemptEpoch,definitionHash:frozen.legacyDefinitionHash,userId:execution.user_id,compositeAttemptId:started.runtimeBindingRef,
          answers:values.map((value,index)=>({itemCode:'Q'+(index+1),responseValue:'option_'+value}))})
        await finalizeCompositeAttemptIfReady(started.runtimeBindingRef)
        await expect(readRespondentRunSummary(execution.user_id,execution.id)).rejects.toMatchObject({statusCode:404})
      }
      groupSources.push({runId:run.id,trackId:executions[0].track_id})
    }
    const groupSpec=await createPlatformReportingSpec({actor,specKey:'r3-group-spec-'+suffix,version:1,definition:descriptiveReportingDefinition({...groupResource.entry,definitionHash},'MATCHED_LONGITUDINAL',3)})
    await reviewPlatformReportingSpec({actor: await independentReviewer(actor),specId:groupSpec.id});await publishPlatformReportingSpec({actor,specId:groupSpec.id})
    const groupInput={organizationId,principal:actor,sources:groupSources,specId:groupSpec.id,analysisKind:'MATCHED_LONGITUDINAL' as const,mode:'FULL_CASE' as const,cohortStrategy:'WAVE_SPECIFIC' as const}
    const groupReport=await generateAutomaticLongitudinal(groupInput)
    expect(groupReport.projection).toMatchObject({kind:'MATCHED_LONGITUDINAL',state:'present',matchedEligibleN:3,metrics:{total:{state:'present',validCaseN:3}}})
    if(groupReport.projection.kind!=='MATCHED_LONGITUDINAL') throw new Error('wrong group report')
    expect(groupReport.projection.metrics?.total.waveMeans?.map(w=>w.mean)).toEqual([9,11])
    expect(groupReport.projection.metrics?.total.comparisons?.[0].delta).toBe(2)
    await grantCapability({organizationId,membershipId:adminMembership.id,capability:'REPORT_EXPORT',meta:meta(admin.id)})
    const groupTicket=await createReportingExport({organizationId,principal:actor,target:{kind:'AGGREGATE',artifactId:groupReport.artifactId}})
    const groupCsv=await downloadReportingExport({organizationId,principal:actor,exportId:groupTicket.exportId})
    expect(groupCsv.csv).toContain('9');expect(groupCsv.csv).toContain('11');expect(groupCsv.csv).not.toContain(student.id)
    const suppressed=await generateAutomaticLongitudinal({...groupInput,cohortSelector:{schemaVersion:2,combine:'ALL',clauses:[{kind:'MEMBERSHIP_IDS',membershipIds:[studentMembership.id]}]}})
    expect(suppressed.projection.state).toBe('suppressed');expect(suppressed.projection).not.toHaveProperty('metrics');expect(suppressed.projection).not.toHaveProperty('matchedEligibleN')
    await db.materialGrant.deleteMany({where:{teacherId:teacher.id,resourceId:scale.id}})
    await expect(assertRegisteredResourceUse(ref,teacher.id)).rejects.toMatchObject({code:'RESOURCE_USE_FORBIDDEN'})
    const raceRun = await createAssessmentRunDraft({ organizationId, name: '注册资源停用竞态', createdByUserId: admin.id })
    await addAssessmentRunTrackDraft({ organizationId, runId: raceRun.id, resource: ref, subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [studentMembership.id] }, respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [studentMembership.id] }, requestedPolicy: { ...resource.entry.applicability } })
    const originalAdapter = productionRunResourceAuthorityRegistry.adapterFor('SCALE')
    const racingRegistry = new RunResourceAuthorityRegistry([{ ...originalAdapter, async resolveExact(selected) {
      const policy = await originalAdapter.resolveExact(selected)
      await transitionDescriptiveResource(actor, resource.id, 'retire')
      return policy
    } }])
    await expect(publishAssessmentRun({ organizationId, runId: raceRun.id, actorUserId: admin.id, expectedVersion: 2, resourceRegistry: racingRegistry })).rejects.toMatchObject({ code: 'RESOURCE_USE_FORBIDDEN' })
    expect((await db.$queryRaw<Array<{status:string}>>`SELECT status FROM assessment_runs WHERE id=${raceRun.id}`)[0].status).toBe('DRAFT')
    expect((await db.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int AS n FROM assessment_run_executions WHERE run_id=${raceRun.id}`)[0].n).toBe(0)
    await expect(assertRegisteredResourceUse(ref,admin.id)).rejects.toMatchObject({code:'RESOURCE_USE_FORBIDDEN'})
    expect((await readParticipantLongitudinal(student.id,report.artifactId)).waves).toHaveLength(2)
    expect((await readOrganizationReportingArtifact({organizationId,artifactId:report.artifactId,principal:actor})).projection).toEqual(report.projection)
    expect((await db.assessment.count({where:{scaleId:scale.id,status:'COMPLETED'}}))).toBe(8)
  }, 60000)
})
