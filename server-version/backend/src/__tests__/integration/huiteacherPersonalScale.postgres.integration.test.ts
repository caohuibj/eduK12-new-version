import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll,afterAll,describe,expect,it } from 'vitest'
import {
  integrationDatabaseUrl,requireIsolatedReleaseDatabase,
} from './integration-env'
import { independentReviewer } from './independent-reviewer'
import {
  createCustomScaleDefinition,hashScaleDefinition,
} from '../../modules/scale/scale-definition'
import {
  registerDescriptiveResource,transitionDescriptiveResource,
  descriptiveResourceEntry,
} from '../../modules/assessment-run/registeredResources'
import {
  changeTeacherScaleLicense,assertTeacherScaleRunUse,
} from '../../modules/huiteacher/scaleLicense.service'
import {
  createHuiteacherTarget,createHuiteacherEvent,
  createHuiteacherEventRunDraft,transitionHuiteacherEvent,
  readHuiteacherEventRun,
} from '../../modules/huiteacher/evaluation.service'
import {
  addTeacherRunTrack,publishTeacherRun,
} from '../../modules/huiteacher/run.service'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { submitScaleAssessmentFinal } from '../../modules/scale/scale-final-submit.service'
import { decryptFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { finalizeCompositeAttemptIfReady } from '../../modules/composite/composite.service'
import { readTeacherPersonalScaleReport } from '../../modules/huiteacher/scalePersonalReport.service'
import { resolveEducationProductMemberScope } from '../../modules/organization/educationProductAccess'

const URL=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=URL?describe:describe.skip
let db:PrismaClient
const previousEncryptionKey=process.env.DATA_ENCRYPTION_KEY
const edu=async()=>{
  const userId=randomUUID()
  return db.user.create({data:{
    id:userId,username:'huiteacher-adult-'+userId.replace(/-/g,''),
    accountDomain:'SCHOOL',passwordHash:'synthetic-test-only',
    role:'TEACHER',teacherApproved:true,
  }})
}
const teacherSchool=async(userId:string)=>{
  const organization=await db.organization.create({data:{
    id:randomUUID(),name:'licensed-teacher-'+randomUUID(),
    createdByUserId:userId,productDomain:'SCHOOL',
  }})
  const membership=await db.organizationMembership.create({data:{
    id:randomUUID(),organizationId:organization.id,userId,
    orgRole:'ORG_ADMIN',
  }})
  await db.organizationPersonaGrant.create({data:{
    id:randomUUID(),organizationId:organization.id,
    membershipId:membership.id,persona:'TEACHER',grantedByUserId:userId,
  }})
  await db.educationProductEntitlement.create({data:{
    organizationId:organization.id,product:'HUITEACHER',status:'ACTIVE',
    grantedByUserId:userId,
  }})
  await db.educationProductRoleGrant.create({data:{
    id:randomUUID(),organizationId:organization.id,
    membershipId:membership.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',
    grantedByUserId:userId,
  }})
  return organization
}

suite('Huiteacher PR3: independently released adult self Scale and respondent-only report',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(URL!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
    db=new PrismaClient({datasources:{db:{url:URL!}}})
    await db.$connect()
  })
  afterAll(async()=>{
    await db?.$disconnect()
    if(previousEncryptionKey===undefined)delete process.env.DATA_ENCRYPTION_KEY
  })

  it('rejects teacher delivery without independent review and exact school license',async()=>{
    const admin=await db.user.create({data:{
      username:'scale-release-'+randomUUID(),passwordHash:'synthetic',
      accountDomain:'TRAINING',role:'ADMIN',platformRole:'SYSTEM_ADMIN',
    }})
    const actor={userId:admin.id,platformRole:'SYSTEM_ADMIN'}
    const definition=createCustomScaleDefinition()
    definition.respondentType='teacher_self_report'
    definition.source.title='原创合成教师工作体验'
    definition.items=['Q1','Q2','Q3'].map((itemCode,sortOrder)=>({
      itemCode,sortOrder,content:'本轮教师工作体验 '+(sortOrder+1),
      type:'single',required:true,responseSetKey:'default',randomizeOptions:false,
    }))
    definition.scoring.itemRules=definition.items.map(item=>({
      itemCode:item.itemCode,transform:{type:'identity' as const},
    }))
    definition.scoring.scores=[{
      key:'support',type:'total',label:'自我支持体验',
      direction:'descriptive',canonical:true,displayPrecision:1,
      source:{type:'items',aggregation:'sum',
        items:definition.items.map(item=>({itemCode:item.itemCode,weight:1}))},
    }]
    definition.report.primaryScoreKeys=['support']
    definition.report.scoreOrder=['support']
    definition.report.interpretations=[{
      scoreKey:'support',headline:'你对支持资源的体验',
      source:{type:'score_only'},
      summary:'这个结果仅反映这三道题的本次回答，可以帮助回顾日常工作体验。',
      bands:[],
      guidance:[{category:'reflection',text:'可以回想最近一次获得实际支持的情境。'}],
    }]
    const definitionHash=hashScaleDefinition(definition)
    const scale=await db.scale.create({data:{
      code:'teacher_self_'+randomUUID().replace(/-/g,''),
      name:'教师工作体验（合成测试）',status:'PUBLISHED',
      creatorId:admin.id,instrumentClass:'CUSTOM_DESCRIPTIVE',
      definition,definitionHash,
    }})
    const resource=await registerDescriptiveResource(
      actor,scale.id,'TEACHER_INDIVIDUAL')
    expect(resource.resource_key).toBe('teacher-scale:'+scale.id+':INDIVIDUAL')
    expect(resource.entry.applicability).toMatchObject({
      subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],
      analysisMode:'INDIVIDUAL_ONLY',relationshipKinds:['SELF'],
    })
    expect(resource.entry.resultDisclosure.audiences.ORGANIZATION.mode).toBe('NONE')
    expect(resource.entry.resultDisclosure.audiences.RESPONDENT.mode).toBe('INDIVIDUAL_SUMMARY')
    await expect(transitionDescriptiveResource(
      actor,resource.id,'review')).rejects.toMatchObject({
      code:'RESOURCE_INDEPENDENT_REVIEW_REQUIRED',
    })
    const reviewer=await independentReviewer(actor)
    await transitionDescriptiveResource(reviewer,resource.id,'review')
    await transitionDescriptiveResource(actor,resource.id,'publish')

    const manager=await edu()
    const other=await edu()
    const school=await teacherSchool(manager.id)
    const member=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:school.id,userId:other.id,
      orgRole:'MEMBER',
    }})
    await db.organizationPersonaGrant.create({data:{
      id:randomUUID(),organizationId:school.id,membershipId:member.id,
      persona:'TEACHER',grantedByUserId:manager.id,
    }})
    const target=await createHuiteacherTarget({
      organizationId:school.id,actorUserId:manager.id,
      kind:'ORGANIZATION',name:'本校教师个人发展',
    })
    const event=await createHuiteacherEvent({
      organizationId:school.id,actorUserId:manager.id,
      targetId:target.id,kind:'ASSESSMENT',title:'教师个人描述性自评',
    })
    const draft=await createHuiteacherEventRunDraft({
      organizationId:school.id,actorUserId:manager.id,
      eventId:event.id,name:'教师自评 Run',
    })
    const scope={organizationId:school.id,actorUserId:manager.id,eventId:event.id}
    const ref={family:'SCALE' as const,
      key:resource.resource_key,version:resource.resource_version}
    await expect(assertTeacherScaleRunUse(db,{
      organizationId:school.id,runId:draft.runId,resource:ref,
    })).rejects.toThrow()
    await expect(addTeacherRunTrack({...scope,resource:ref,
      subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},
      requestedPolicy:{
        subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],
        relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],
        analysisMode:'INDIVIDUAL_ONLY',minimumRespondents:null,
        visibilityPolicyKey:'HUITEACHER_ADULT_SELF_PILOT_V1',
      },
    })).rejects.toThrow()
    const licensed=await changeTeacherScaleLicense({
      organizationId:school.id,resourceId:resource.id,actorUserId:admin.id,
      action:'GRANT',
    })
    expect(licensed.status).toBe('ACTIVE')
    await assertTeacherScaleRunUse(db,{
      organizationId:school.id,runId:draft.runId,resource:ref,
    })
    await addTeacherRunTrack({...scope,resource:ref,
      subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},
      requestedPolicy:{
        subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],
        relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],
        analysisMode:'INDIVIDUAL_ONLY',minimumRespondents:null,
        visibilityPolicyKey:'HUITEACHER_ADULT_SELF_PILOT_V1',
      },
    })
    await transitionHuiteacherEvent({
      ...scope,action:'OPEN',expectedVersion:1,
    })
    const state=await readHuiteacherEventRun(scope)
    const released=await publishTeacherRun({
      ...scope,expectedVersion:state.version,
    })
    expect(released.executionCount).toBe(2)

    const [execution]=await db.$queryRaw<Array<{id:string}>>`
      SELECT execution."id" FROM "assessment_run_executions" execution
      JOIN "assessment_run_actor_snapshots" respondent
        ON respondent."id"=execution."respondent_actor_snapshot_id"
        AND respondent."organization_id"=execution."organization_id"
        AND respondent."run_id"=execution."run_id"
      WHERE execution."organization_id"=${school.id}
        AND execution."run_id"=${draft.runId}
        AND respondent."user_id"=${other.id}
      LIMIT 1
    `
    expect(execution?.id).toBeTruthy()
    const started=await startAssessmentRunExecution({
      executionId:execution.id,actorUserId:other.id,
    })
    expect(started.state).toBe('STARTED')
    if(started.state!=='STARTED')throw new Error('Scale START is not started')
    expect(started.runtimeBindingKind).toBe('COMPOSITE')
    const child=await db.assessment.findFirstOrThrow({
      where:{compositeAttemptId:started.runtimeBindingRef},
    })
    const frozen=decryptFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted!)
    await submitScaleAssessmentFinal({
      assessmentId:child.id,submissionId:randomUUID(),
      attemptEpoch:child.attemptEpoch,definitionHash:frozen.legacyDefinitionHash,
      userId:other.id,compositeAttemptId:started.runtimeBindingRef,
      answers:[1,3,5].map((v,i)=>({
        itemCode:'Q'+(i+1),responseValue:'option_'+v,
      })),
    })
    await finalizeCompositeAttemptIfReady(started.runtimeBindingRef)
    const report=await readTeacherPersonalScaleReport({
      actorUserId:other.id,executionId:execution.id,
    })
    expect(report.state).toBe('READY')
    if(report.state!=='READY')throw new Error('Score source is not ready')
    expect(report.metrics.find(metric=>metric.key==='support')?.value).toBe(9)
    expect(report.metrics.find(metric=>metric.key==='support')?.headline)
      .toBe('你对支持资源的体验')
    expect(JSON.stringify(report)).not.toContain('subjectUserId')
    await expect(readTeacherPersonalScaleReport({
      actorUserId:manager.id,executionId:execution.id,
    })).rejects.toThrow()

    await changeTeacherScaleLicense({
      organizationId:school.id,resourceId:resource.id,
      actorUserId:admin.id,action:'REVOKE',
    })
    await expect(assertTeacherScaleRunUse(db,{
      organizationId:school.id,runId:draft.runId,resource:ref,
    })).rejects.toThrow()
    // Completed owner report remains readable if Teacher product membership
    // remains valid; withdrawing the license must block new delivery.
    const previous=await readTeacherPersonalScaleReport({
      actorUserId:other.id,executionId:execution.id,
    })
    expect(previous.state).toBe('READY')
    await db.educationProductEntitlement.update({
      where:{organizationId_product:{
        organizationId:school.id,product:'HUITEACHER',
      }},data:{status:'SUSPENDED',suspendedAt:new Date()},
    })
    expect(await resolveEducationProductMemberScope({
      actorUserId:other.id,organizationId:school.id,product:'HUITEACHER',
    })).toBeNull()
    await expect(readTeacherPersonalScaleReport({
      actorUserId:other.id,executionId:execution.id,
    })).rejects.toThrow()
  })
})
