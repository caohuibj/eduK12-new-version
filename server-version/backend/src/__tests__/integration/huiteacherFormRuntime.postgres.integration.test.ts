import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll,afterAll,describe,it,expect } from 'vitest'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from './integration-env'
import { createHuiteacherForm,updateHuiteacherForm,publishHuiteacherForm } from '../../modules/huiteacher/forms.service'
import { createHuiteacherTarget,createHuiteacherEvent,
  createHuiteacherEventRunDraft,transitionHuiteacherEvent,readHuiteacherEventRun,
} from '../../modules/huiteacher/evaluation.service'
import { addTeacherRunTrack,previewTeacherRun,publishTeacherRun } from '../../modules/huiteacher/run.service'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { readOwnHuiteacherFormTask,submitOwnHuiteacherFormFinal } from '../../modules/huiteacher/formFinal.service'
import { productionRunResourceAuthorityRegistry } from '../../modules/assessment-run/resourceAuthority'
import { teacherFormResourceRef } from '../../modules/huiteacher/formRunResource'

const URL=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=URL?describe:describe.skip
let db:PrismaClient
const identity=async()=>{
  const id=randomUUID()
  return db.user.create({data:{
    id,username:'teacher_form_'+id.replace(/-/g,''),
    accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true,
    passwordHash:'synthetic-test-only',
  }})
}
suite('Teacher-only Survey Form V2 released resource → Run START → encrypted FINAL',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(URL!)
    db=new PrismaClient({datasources:{db:{url:URL!}}})
    await db.$connect()
    process.env.CAMPUS_MFA_ENCRYPTION_KEY='49'.repeat(32)
  })
  afterAll(async()=>{await db?.$disconnect()})
  it('shares one canonical task identity and cannot overwrite FINAL',async()=>{
    const admin=await identity()
    const organization=await db.organization.create({data:{
      id:randomUUID(),name:'huiteacher-form-test-'+randomUUID(),
      productDomain:'SCHOOL',createdByUserId:admin.id,
    }})
    const membership=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:organization.id,userId:admin.id,orgRole:'ORG_ADMIN',
    }})
    await db.organizationPersonaGrant.create({data:{
      id:randomUUID(),organizationId:organization.id,membershipId:membership.id,
      persona:'TEACHER',grantedByUserId:admin.id,
    }})
    await db.educationProductEntitlement.create({data:{
      organizationId:organization.id,product:'HUITEACHER',
      status:'ACTIVE',grantedByUserId:admin.id,
    }})
    await db.educationProductRoleGrant.create({data:{
      id:randomUUID(),organizationId:organization.id,membershipId:membership.id,
      product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:admin.id,
    }})
    const participants=await Promise.all(Array.from({length:9},()=>identity()))
    for(const person of participants){
      const member=await db.organizationMembership.create({data:{
        id:randomUUID(),organizationId:organization.id,userId:person.id,orgRole:'MEMBER',
      }})
      await db.organizationPersonaGrant.create({data:{
        id:randomUUID(),organizationId:organization.id,membershipId:member.id,
        persona:'TEACHER',grantedByUserId:admin.id,
      }})
    }
    const target=await createHuiteacherTarget({
      organizationId:organization.id,actorUserId:admin.id,
      kind:'ORGANIZATION',name:'Teacher Organization Survey',
    })
    const event=await createHuiteacherEvent({
      organizationId:organization.id,actorUserId:admin.id,
      targetId:target.id,kind:'ASSESSMENT',title:'Teacher group wellbeing Form',
    })
    const draft=await createHuiteacherForm({
      organizationId:organization.id,actorUserId:admin.id,title:'Teacher Form V2',
    })
    await updateHuiteacherForm({
      organizationId:organization.id,actorUserId:admin.id,
      formId:draft.id,expectedRevision:draft.revision,title:'Teacher Form V2',
      definition:{schemaVersion:2,pages:[{pageKey:'p1',title:'教师体验',
        questions:[{itemKey:'q1',type:'LIKERT',prompt:'工作中的支持',
          required:true,options:[{optionKey:'a',label:'不足'},{optionKey:'b',label:'充分'}],rows:[]},
          {itemKey:'q2',type:'SHORT_TEXT',prompt:'补充建议',
            required:false,options:[],rows:[],maxLength:200}],
      }]},
    })
    const form=await db.huiteacherFormInstrument.findUniqueOrThrow({where:{id:draft.id}})
    await publishHuiteacherForm({
      organizationId:organization.id,actorUserId:admin.id,
      formId:draft.id,expectedRevision:form.revision,
    })
    const ref=teacherFormResourceRef(draft.id,form.definitionDigest)
    const policy=await productionRunResourceAuthorityRegistry.resolveExact(ref)
    expect(policy.runtimeLaunchTarget?.kind).toBe('HUITEACHER_FORM_V2')
    expect(policy.minimumRespondents).toBe(10)
    const created=await createHuiteacherEventRunDraft({
      organizationId:organization.id,actorUserId:admin.id,
      eventId:event.id,name:'Teacher Form Run',
    })
    const key={organizationId:organization.id,actorUserId:admin.id,eventId:event.id}
    await addTeacherRunTrack({...key,resource:ref,
      subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},
      requestedPolicy:{
        subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],
        relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],
        analysisMode:'COHORT_AGGREGATE',
        visibilityPolicyKey:'HUITEACHER_FORM_GROUP_V1',minimumRespondents:10,
      }})
    const opened=await transitionHuiteacherEvent({
      organizationId:organization.id,actorUserId:admin.id,
      eventId:event.id,action:'OPEN',expectedVersion:1,
    })
    expect(opened.status).toBe('OPEN')
    let run=await readHuiteacherEventRun(key)
    const dry=await previewTeacherRun({...key,expectedVersion:run.version})
    expect(dry).toBeTruthy()
    const pub=await publishTeacherRun({...key,expectedVersion:run.version})
    expect(pub.executionCount).toBe(10)
    run=await readHuiteacherEventRun(key)
    expect(run.status).toBe('PUBLISHED')
    const assignments=await db.$queryRaw<Array<{id:string}>>`
      SELECT execution."id" FROM "assessment_run_executions" execution
      JOIN "assessment_run_actor_snapshots" respondent
        ON respondent."id"=execution."respondent_actor_snapshot_id"
      WHERE execution."run_id"=${created.runId}
        AND respondent."user_id"=${participants[0].id}
      LIMIT 1
    `
    expect(assignments).toHaveLength(1)
    const executionId=assignments[0].id
    const started=await startAssessmentRunExecution({
      executionId,actorUserId:participants[0].id,
    })
    expect(started.state).toBe('STARTED')
    if(started.state!=='STARTED')return
    expect(started.runtimeBindingKind).toBe('HUITEACHER_FORM_V2')
    const task=await readOwnHuiteacherFormTask({
      actorUserId:participants[0].id,attemptId:started.runtimeBindingRef,
    })
    expect(task.pages[0].questions).toHaveLength(2)
    expect(task.reportMode).toBe('COMPLETION_ONLY')
    const submissionId=randomUUID()
    const input={actorUserId:participants[0].id,attemptId:started.runtimeBindingRef,
      submissionId,answers:{q1:'b',q2:'建议继续支持'} }
    const completed=await submitOwnHuiteacherFormFinal(input)
    expect(completed.idempotent).toBe(false)
    expect((await submitOwnHuiteacherFormFinal(input)).idempotent).toBe(true)
    await expect(submitOwnHuiteacherFormFinal({
      ...input,answers:{q1:'a'},
    })).rejects.toThrow()
    const persisted=await db.huiteacherFormFinal.findUniqueOrThrow({
      where:{attemptId:started.runtimeBindingRef},
    })
    expect(persisted.resultsCipher).not.toContain('建议继续支持')
    const count=await db.huiteacherFormFinal.count({
      where:{attemptId:started.runtimeBindingRef},
    })
    expect(count).toBe(1)
    const rows=await db.$queryRaw<Array<{status:string}>>`
      SELECT "status" FROM "assessment_run_executions"
      WHERE "id"=${executionId}
    `
    expect(rows[0].status).toBe('COMPLETED')
  })
})
