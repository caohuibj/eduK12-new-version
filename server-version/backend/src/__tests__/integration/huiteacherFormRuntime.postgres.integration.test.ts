import { prisma } from '../../config/database'
import * as runtimeSecurity from '../../modules/assessment-runtime/security'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll,afterAll,describe,it,expect,vi } from 'vitest'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from './integration-env'
import { createHuiteacherForm,updateHuiteacherForm,publishHuiteacherForm } from '../../modules/huiteacher/forms.service'
import { createHuiteacherTarget,createHuiteacherEvent,
  createHuiteacherEventRunDraft,transitionHuiteacherEvent,readHuiteacherEventRun,
} from '../../modules/huiteacher/evaluation.service'
import { addTeacherRunTrack,previewTeacherRun,publishTeacherRun,closeTeacherRun } from '../../modules/huiteacher/run.service'
import { readTeacherFormGroupReport } from '../../modules/huiteacher/groupReport.service'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { readOwnHuiteacherFormTask,submitOwnHuiteacherFormFinal } from '../../modules/huiteacher/formFinal.service'
import { productionRunResourceAuthorityRegistry } from '../../modules/assessment-run/resourceAuthority'
import { teacherFormResourceRef } from '../../modules/huiteacher/formRunResource'

const URL=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=URL?describe:describe.skip
let db:PrismaClient
const previousEncryptionKey=process.env.DATA_ENCRYPTION_KEY
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
    // Fixture-only key. Never depend on production data encryption material
    // to verify one encrypted canonical FINAL in disposable PostgreSQL.
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
  })
  afterAll(async()=>{
    await db?.$disconnect()
    if(previousEncryptionKey===undefined)delete process.env.DATA_ENCRYPTION_KEY
  })
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
            required:false,options:[],rows:[],maxLength:200},
          {itemKey:'q3',type:'LIKERT',prompt:'团队支持',
            required:true,options:[{optionKey:'a',label:'不足'},{optionKey:'b',label:'充分'}],rows:[]},
          {itemKey:'q4',type:'MULTIPLE',prompt:'实际使用的反馈渠道',
            required:true,options:[{optionKey:'a',label:'线上'},{optionKey:'b',label:'线下'}],
            rows:[],minSelections:1,maxSelections:2},
          {itemKey:'q5',type:'NUMBER',prompt:'本月活动次数',
            required:false,options:[],rows:[]}],
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
    expect(task.pages[0].questions).toHaveLength(5)
    expect(task.reportMode).toBe('COMPLETION_ONLY')
    const submissionId=randomUUID()
    const input={actorUserId:participants[0].id,attemptId:started.runtimeBindingRef,
      submissionId,answers:{q1:'b',q2:'建议继续支持',q3:'b',q4:['a']} }
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
    // Full cohort only: report must remain unavailable while the survey
    // is open and until every eligible Run task has reached authoritative FINAL.
    await expect(readTeacherFormGroupReport({
      ...key,formId:draft.id,
    })).rejects.toThrow()
    for(const [index,respondent] of participants.slice(1).entries()){
      const entries=await db.$queryRaw<Array<{id:string}>>`
        SELECT e."id" FROM "assessment_run_executions" e
        JOIN "assessment_run_actor_snapshots" actor
          ON actor."id"=e."respondent_actor_snapshot_id"
          AND actor."organization_id"=e."organization_id"
          AND actor."run_id"=e."run_id"
        WHERE e."run_id"=${created.runId} AND actor."user_id"=${respondent.id}
        LIMIT 1
      `
      expect(entries).toHaveLength(1)
      const next=await startAssessmentRunExecution({
        executionId:entries[0].id,actorUserId:respondent.id,
      })
      if(next.state!=='STARTED')throw Error('RUN START did not create Teacher Form')
      const value=await submitOwnHuiteacherFormFinal({
        actorUserId:respondent.id,attemptId:next.runtimeBindingRef,
        submissionId:randomUUID(),
        answers:{q1:index===8?'a':'b',q3:'b',q4:[index<4?'a':'b']},
      })
      expect(value.status).toBe('COMPLETED')
    }
    // The frozen population has 10 TEACHERs: nine participants PLUS this
    // Teaching administrator (who has a current TEACHER persona). It would
    // breach the group-report privacy contract to disclose a 9/10 cohort.
    const adminRows=await db.$queryRaw<Array<{id:string}>>`
      SELECT execution."id" FROM "assessment_run_executions" execution
      JOIN "assessment_run_actor_snapshots" respondent
        ON respondent."organization_id"=execution."organization_id"
        AND respondent."run_id"=execution."run_id"
        AND respondent."id"=execution."respondent_actor_snapshot_id"
      WHERE execution."run_id"=${created.runId}
        AND respondent."user_id"=${admin.id} LIMIT 1
    `
    expect(adminRows).toHaveLength(1)
    const adminStart=await startAssessmentRunExecution({
      executionId:adminRows[0].id,actorUserId:admin.id,
    })
    if(adminStart.state!=='STARTED')throw Error('Admin Teacher Run START failed')
    expect((await submitOwnHuiteacherFormFinal({
      actorUserId:admin.id,attemptId:adminStart.runtimeBindingRef,
      submissionId:randomUUID(),answers:{q1:'a',q3:'b',q4:['b']},
    })).status).toBe('COMPLETED')
    const closed=await closeTeacherRun(key)
    expect(closed.status).toBe('CLOSED')
    await transitionHuiteacherEvent({
      organizationId:organization.id,actorUserId:admin.id,eventId:event.id,
      action:'CLOSE',expectedVersion:2,
    })
    // Source-of-truth cohort sanity: keep a separate real-SQL assertion in
    // this disposable test so a failed protected report cannot be 'fixed'
    // by weakening the n>=10 / all-completed privacy policy.
    const cohort=await db.$queryRaw<Array<{
      assigned:number;respondents:number;completed:number
    }>>`
      SELECT COUNT(*)::int AS "assigned",
        COUNT(DISTINCT respondent."user_id")::int AS "respondents",
        COUNT(*) FILTER(WHERE execution."status"='COMPLETED')::int AS "completed"
      FROM "assessment_run_executions" execution
      JOIN "assessment_run_actor_snapshots" respondent
        ON respondent."organization_id"=execution."organization_id"
        AND respondent."run_id"=execution."run_id"
        AND respondent."id"=execution."respondent_actor_snapshot_id"
        AND respondent."actor_role"='TEACHER'
      JOIN "assessment_run_tracks" track
        ON track."organization_id"=execution."organization_id"
        AND track."run_id"=execution."run_id"
        AND track."id"=execution."track_id"
      WHERE execution."organization_id"=${organization.id}
        AND execution."run_id"=${created.runId}
        AND track."resource_family"='FORM'
        AND track."resource_key"=${'huiteacher-form:'+draft.id}
        AND track."resource_version"=${form.definitionDigest}
    `
    expect(cohort[0]).toEqual({assigned:10,respondents:10,completed:10})
    let inTransaction = false
    const originalTransaction = prisma.$transaction.bind(prisma)
    const transaction = vi.spyOn(prisma, '$transaction').mockImplementation((async (fn: any, options: any) => originalTransaction(async tx => {
      inTransaction = true
      try { return await fn(tx) } finally { inTransaction = false }
    }, options)) as any)
    const originalDecrypt = runtimeSecurity.decryptUnifiedRuntimePayload
    const decrypt = vi.spyOn(runtimeSecurity, 'decryptUnifiedRuntimePayload').mockImplementation((cipher: string) => {
      expect(inTransaction).toBe(false)
      return originalDecrypt(cipher)
    })
    let report
    try {
      report=await readTeacherFormGroupReport({...key,formId:draft.id})
      expect(transaction).toHaveBeenCalledTimes(2)
      expect(decrypt).toHaveBeenCalledTimes(10)
    } finally { transaction.mockRestore(); decrypt.mockRestore() }

    expect(report.independentRespondents).toBe(10)
    expect(report.reportMode).toBe('FORM_DESCRIPTIVE_AGGREGATE')
    const smallCell=report.distributions.find(x=>x.itemKey==='q1')
    expect(smallCell?.status).toBe('WITHHELD')
    const safeCell=report.distributions.find(x=>x.itemKey==='q3')
    expect(safeCell?.status).toBe('READY')
    if(safeCell?.status!=='READY')throw Error('safe cohort unexpectedly masked')
    expect(safeCell.cells?.find(x=>x.key==='b')?.count).toBe(10)
    const choice=report.distributions.find(x=>x.itemKey==='q4')
    expect(choice?.status).toBe('READY')
    if(choice?.status!=='READY')throw Error('multiple-choice selection was masked')
    expect(choice.cells?.find(x=>x.key==='a')?.count).toBe(5)
    expect(choice.cells?.find(x=>x.key==='b')?.count).toBe(5)
    // No raw text item or numeric raw responses are reportable.
    expect(report.distributions.find(x=>x.itemKey==='q2')?.reason).toBe('PRIVATE_FREE_TEXT')
    expect(report.distributions.find(x=>x.itemKey==='q5')?.reason).toBe('AGGREGATION_NOT_RELEASED')
    expect(JSON.stringify(report)).not.toContain('建议继续支持')
    await expect(readTeacherFormGroupReport({
      ...key,actorUserId:participants[0].id,formId:draft.id,
    })).rejects.toThrow()
    // First report records only the digest of the exact frozen respondent
    // population, not its IDs or any individual's raw answers.
    const ledger=await db.huiteacherGroupDisclosureLedger.findUniqueOrThrow({
      where:{organizationId_definitionDigest:{
        organizationId:organization.id,definitionDigest:form.definitionDigest,
      }},
    })
    expect(ledger.populationDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(ledger.firstRunId).toBe(created.runId)
    // Simulate another released same-form cohort with a different digest.
    // A privacy ledger collision must fail closed, not return another
    // differencing-compatible set of exact option counts.
    await db.huiteacherGroupDisclosureLedger.update({
      where:{organizationId_definitionDigest:{
        organizationId:organization.id,definitionDigest:form.definitionDigest,
      }},
      data:{populationDigest:'b'.repeat(64)},
    })
    await expect(readTeacherFormGroupReport({...key,formId:draft.id}))
      .rejects.toMatchObject({
        code:'HUITEACHER_GROUP_POPULATION_DIFFERENCING_BLOCKED',
      })
  })
})
