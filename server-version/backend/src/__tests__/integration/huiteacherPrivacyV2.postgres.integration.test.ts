import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll,afterAll,describe,it,expect } from 'vitest'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from './integration-env'
import { createHuiteacherForm,updateHuiteacherForm,publishHuiteacherForm } from '../../modules/huiteacher/forms.service'
import { createHuiteacherTarget,createHuiteacherEvent,
  createHuiteacherEventRunDraft,transitionHuiteacherEvent,readHuiteacherEventRun,
} from '../../modules/huiteacher/evaluation.service'
import { addTeacherRunTrack,previewTeacherRun,publishTeacherRun,closeTeacherRun } from '../../modules/huiteacher/run.service'
import { readTeacherFormGroupReport } from '../../modules/huiteacher/groupReport.service'
import {assertTeacherComparableDisclosure} from '../../modules/huiteacher/disclosureOverlap.service'
import { saveReportPrivacyPreferences } from '../../modules/report-privacy/preferences.service'
import type { AuthenticatedPrincipal } from '../../types'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { readOwnHuiteacherFormTask,submitOwnHuiteacherFormFinal } from '../../modules/huiteacher/formFinal.service'
import { productionRunResourceAuthorityRegistry } from '../../modules/assessment-run/resourceAuthority'
import { teacherFormResourceRef } from '../../modules/huiteacher/formRunResource'

const URL=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=URL?describe:describe.skip
let db:PrismaClient
const previousEncryptionKey=process.env.DATA_ENCRYPTION_KEY
const oldPrivacy=process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED
const oldTeacher=process.env.REPORT_PRIVACY_TEACHER_V2_ENABLED
const principal=(user:{id:string}):AuthenticatedPrincipal=>({
  userId:user.id,username:'Teacher V2',role:'TEACHER',platformRole:'STANDARD',
  accountDomain:'SCHOOL',mustChangePassword:false,tokenVersion:0,
})
const identity=async()=>{
  const id=randomUUID()
  return db.user.create({data:{
    id,username:'teacher_form_'+id.replace(/-/g,''),
    accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true,
    passwordHash:'synthetic-test-only',
  }})
}
suite('Teacher V2 per-Run saved disclosure preferences — actual isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED='true'
    process.env.REPORT_PRIVACY_TEACHER_V2_ENABLED='true'
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
    else process.env.DATA_ENCRYPTION_KEY=previousEncryptionKey
    if(oldPrivacy===undefined)delete process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED
    else process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED=oldPrivacy
    if(oldTeacher===undefined)delete process.env.REPORT_PRIVACY_TEACHER_V2_ENABLED
    else process.env.REPORT_PRIVACY_TEACHER_V2_ENABLED=oldTeacher
  })
  it('N=6 with five immutable finals: selected default remains valid after edits, V2 needs explicit publication',async()=>{
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
    const participants=await Promise.all(Array.from({length:5},()=>identity()))
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
    expect(policy.minimumRespondents).toBe(5)
    const created=await createHuiteacherEventRunDraft({
      organizationId:organization.id,actorUserId:admin.id,
      eventId:event.id,name:'Teacher Form Run',
    })
    const key={organizationId:organization.id,actorUserId:admin.id,eventId:event.id}
    await saveReportPrivacyPreferences({
      organizationId:organization.id,actor:principal(admin),
      product:'HUITEACHER',scenario:'TEACHER_ADULT_FORM_GROUP',
      request:{scope:'MY',preset:'STANDARD',expectedRevision:0,requestKey:randomUUID()},
    })
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
    expect(pub.executionCount).toBe(6)
    run=await readHuiteacherEventRun(key)
    expect(run.status).toBe('PUBLISHED')
    const policySnapshot=await db.educationReportPolicySnapshot.findUniqueOrThrow({
      where:{organizationId_runId:{organizationId:organization.id,runId:created.runId}},
    })
    expect(policySnapshot.scenario).toBe('TEACHER_ADULT_FORM_GROUP')
    expect((policySnapshot.effective as any).options.minRespondentsProfile).toBe('BASELINE')
    await saveReportPrivacyPreferences({
      organizationId:organization.id,actor:principal(admin),
      product:'HUITEACHER',scenario:'TEACHER_ADULT_FORM_GROUP',
      request:{scope:'MY',preset:'ENHANCED',expectedRevision:1,requestKey:randomUUID()},
    })
    const stillFrozen=await db.educationReportPolicySnapshot.findUniqueOrThrow({
      where:{organizationId_runId:{organizationId:organization.id,runId:created.runId}},
    })
    expect(stillFrozen.effectiveHash).toBe(policySnapshot.effectiveHash)
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
        answers:{q1:index===0?'a':'b',q3:'b',q4:[index<2?'a':'b']},
      })
      expect(value.status).toBe('COMPLETED')
    }
    // The frozen population has 10 TEACHERs: nine participants PLUS this
    // Teaching administrator (who has a current TEACHER persona). It would
    // breach the group-report privacy contract to disclose a 9/10 cohort.
    // The sixth respondent intentionally never starts; Run close expires it.
    const closed=await closeTeacherRun(key)
    expect(closed.status).toBe('CLOSED')
    await transitionHuiteacherEvent({
      organizationId:organization.id,actorUserId:admin.id,eventId:event.id,
      action:'CLOSE',expectedVersion:2,
    })

    const cohort=await db.$queryRaw<Array<{
      assigned:number;respondents:number;completed:number
    }>>`
      SELECT COUNT(*)::int AS "assigned",
        COUNT(DISTINCT respondent."user_id")::int AS "respondents",
        COUNT(*) FILTER(WHERE execution."status"='COMPLETED')::int AS "completed"
      FROM assessment_run_executions execution
      JOIN assessment_run_actor_snapshots respondent
        ON respondent.organization_id=execution.organization_id
        AND respondent.run_id=execution.run_id
        AND respondent.id=execution.respondent_actor_snapshot_id
      JOIN assessment_run_tracks track ON track.id=execution.track_id
        AND track.organization_id=execution.organization_id
        AND track.run_id=execution.run_id
      WHERE execution.organization_id=${organization.id}
        AND execution.run_id=${created.runId}
        AND track.resource_key=${'huiteacher-form:'+draft.id}
    `
    expect(cohort[0]).toEqual({assigned:6,respondents:6,completed:5})
    // A plain reader cannot release. Only the explicitly authorized school
    // Teacher admin POST freezes the first projection.
    await expect(readTeacherFormGroupReport({...key,formId:draft.id}))
      .rejects.toMatchObject({code:'HUITEACHER_REPORT_AWAITING_RELEASE'})
    const released=await readTeacherFormGroupReport({
      ...key,formId:draft.id,publishV2:true,
    }) as any
    expect(released.privacyPolicy).toBe('FROZEN_TEACHER_V2')
    expect(released.independentRespondents).toBe(5)
    expect(released.minimumRespondents).toBe(5)
    const sparse=released.distributions.find((x:any)=>x.itemKey==='q1')
    expect(sparse).toMatchObject({status:'READY'})
    expect(sparse.cells.find((x:any)=>x.key==='a').count).toBe(1)
    expect(released.distributions.find((x:any)=>x.itemKey==='q2'))
      .toMatchObject({reason:'PRIVATE_FREE_TEXT'})
    expect(JSON.stringify(released)).not.toContain('建议继续支持')
    const reread=await readTeacherFormGroupReport({...key,formId:draft.id})
    expect(reread).toEqual(released)
    expect(await db.educationReportReleaseRecord.count({where:{
      organizationId:organization.id,reportKind:'TEACHER_ADULT_FORM_GROUP',
    }})).toBe(1)
    expect(await db.huiteacherGroupDisclosureLedger.count({where:{
      organizationId:organization.id,
    }})).toBe(0)
    const record=await db.educationReportReleaseRecord.findFirstOrThrow({
      where:{organizationId:organization.id,sourceRunId:created.runId},
    })
    expect(record.reportDigest).toMatch(/^[a-f0-9]{64}$/)
    // Real PostgreSQL proof: retrieve historical FINAL contributors from
    // the immutable source, not a projected invited roster or fake digest.
    const comparable={organizationId:organization.id,runId:randomUUID(),
      definitionDigest:form.definitionDigest,
      scenario:'TEACHER_ADULT_FORM_GROUP' as const,enhanced:true}
    await expect(assertTeacherComparableDisclosure(db as any,{
      ...comparable,respondents:participants.map(x=>x.id),
    })).resolves.toBeUndefined()
    await expect(assertTeacherComparableDisclosure(db as any,{
      ...comparable,respondents:[...participants.slice(0,4).map(x=>x.id),randomUUID()],
    })).rejects.toMatchObject({code:'TEACHER_REPORT_EFFECTIVE_DIFFERENCING_BLOCKED'})
    await expect(db.educationReportReleaseRecord.delete({where:{id:record.id}}))
      .rejects.toThrow()
    await expect(readTeacherFormGroupReport({
      ...key,actorUserId:participants[0].id,formId:draft.id,
    })).rejects.toThrow()
  })
})
