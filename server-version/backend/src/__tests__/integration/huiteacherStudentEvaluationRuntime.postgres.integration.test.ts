import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createHuiteacherTarget,createHuiteacherEvent,
  transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {createHuiteacherForm,updateHuiteacherForm,
  publishHuiteacherForm} from '../../modules/huiteacher/forms.service'
import {configureHuiteacherStudentEvaluation,
  createHuiteacherStudentEvaluationRun,previewHuiteacherStudentEvaluationRun,
  publishHuiteacherStudentEvaluationRun} from '../../modules/huiteacher/studentEvaluation.service'
import {resolveEducationProductMemberScope} from '../../modules/organization/educationProductAccess'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {closeAssessmentRun} from '../../modules/assessment-run/lifecycle'
import {readOwnHuiteacherFormTask,
  submitOwnHuiteacherFormFinal} from '../../modules/huiteacher/formFinal.service'
import {readHuiteacherStudentFeedbackReport} from '../../modules/huiteacher/studentReport.service'

/** Real, disposable PostgreSQL; all service transactions, FK/unique keys,
 * encrypted FINAL and release-ledger triggers are verified on the SAME DB.
 * Source is committed but NEVER executed before authorized formal checks.
 */
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=url?describe:describe.skip
let db:PrismaClient
let oldFlag:string|undefined
const user=(role:'TEACHER'|'STUDENT')=>db.user.create({data:{
  id:randomUUID(),username:'ht_pr5_'+randomUUID().replaceAll('-',''),
  accountDomain:'SCHOOL',role,teacherApproved:true,passwordHash:'synthetic',
}})
suite('Huiteacher PR5 canonical student feedback (isolated PostgreSQL)',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!)
    oldFlag=process.env.HUITEACHER_STUDENT_FEEDBACK_ENABLED
    process.env.HUITEACHER_STUDENT_FEEDBACK_ENABLED='true'
    db=new PrismaClient({datasources:{db:{url:url!}}})
    await db.$connect()
  })
  afterAll(async()=>{
    await db?.$disconnect()
    if(oldFlag===undefined)delete process.env.HUITEACHER_STUDENT_FEEDBACK_ENABLED
    else process.env.HUITEACHER_STUDENT_FEEDBACK_ENABLED=oldFlag
  })
  it('Teacher-only + frozen class/teacher + unique FINAL + partial protected report',async()=>{
    const [admin,teacher,otherTeacher,outsider]=await Promise.all([
      user('TEACHER'),user('TEACHER'),user('TEACHER'),user('STUDENT'),
    ])
    const schoolOnly=await db.organization.create({data:{
      id:randomUUID(),name:'PR5 SCHOOL only '+randomUUID(),
      productDomain:'SCHOOL',createdByUserId:admin.id,
    }})
    await db.educationProductEntitlement.create({data:{
      organizationId:schoolOnly.id,product:'HUISCHOOL',
      status:'ACTIVE',grantedByUserId:admin.id,
    }})
    await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:schoolOnly.id,userId:admin.id,
      orgRole:'ORG_ADMIN',
    }})
    await expect(createHuiteacherTarget({
      organizationId:schoolOnly.id,actorUserId:admin.id,
      kind:'PERSON',name:'Not permitted',subjectUserId:teacher.id,
    })).rejects.toThrow()
    const org=await db.organization.create({data:{
      id:randomUUID(),name:'PR5 HUITEACHER only '+randomUUID(),
      productDomain:'SCHOOL',createdByUserId:admin.id,
    }})
    const adminMember=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:org.id,userId:admin.id,
      orgRole:'ORG_ADMIN',
    }})
    await db.educationProductEntitlement.create({data:{
      organizationId:org.id,product:'HUITEACHER',
      status:'ACTIVE',grantedByUserId:admin.id,
    }})
    await db.educationProductRoleGrant.create({data:{
      id:randomUUID(),organizationId:org.id,membershipId:adminMember.id,
      product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:admin.id,
    }})
    const teacherMembers=[]
    for(const t of [teacher,otherTeacher]){
      const m=await db.organizationMembership.create({data:{
        id:randomUUID(),organizationId:org.id,userId:t.id,orgRole:'MEMBER',
      }})
      teacherMembers.push(m.id)
      await db.organizationPersonaGrant.create({data:{
        id:randomUUID(),organizationId:org.id,membershipId:m.id,
        persona:'TEACHER',grantedByUserId:admin.id,
      }})
    }
    const gradeId=randomUUID(),classId=randomUUID()
    await db.$executeRawUnsafe(
      'INSERT INTO "organization_units"("id","organization_id","unit_kind","name") VALUES ($1,$2,$3,$4)',
      gradeId,org.id,'GRADE','PR5 grade')
    await db.$executeRawUnsafe(
      'INSERT INTO "organization_units"("id","organization_id","unit_kind","name","parent_unit_id") VALUES ($1,$2,$3,$4,$5)',
      classId,org.id,'CLASS','PR5 class',gradeId)
    const teacherStaff=randomUUID(),otherStaff=randomUUID()
    for(const [i,staff] of [teacherStaff,otherStaff].entries()){
      await db.$executeRawUnsafe(
        'INSERT INTO "organization_staff_class_assignments"("id","organization_id","membership_id","class_unit_id","staff_role") VALUES ($1,$2,$3,$4,$5)',
        staff,org.id,teacherMembers[i],classId,'TEACHING')
    }
    const students:Array<{userId:string;memberId:string;personaId:string}>=[]
    for(let i=0;i<15;i++){
      const student=await user('STUDENT')
      const member=await db.organizationMembership.create({data:{
        id:randomUUID(),organizationId:org.id,userId:student.id,orgRole:'MEMBER',
      }})
      const persona=await db.organizationPersonaGrant.create({data:{
        id:randomUUID(),organizationId:org.id,membershipId:member.id,
        persona:'STUDENT',grantedByUserId:admin.id,
      }})
      await db.$executeRawUnsafe(
        'INSERT INTO "organization_student_class_assignments"("id","organization_id","membership_id","class_unit_id","is_primary") VALUES ($1,$2,$3,$4,$5)',
        randomUUID(),org.id,member.id,classId,true)
      students.push({userId:student.id,memberId:member.id,personaId:persona.id})
    }
    // Teacher-only school requires NO psychology entitlement/account.
    expect((await resolveEducationProductMemberScope({
      actorUserId:students[0].userId,organizationId:org.id,product:'HUITEACHER',
    }))?.membershipId).toBe(students[0].memberId)
    expect(await resolveEducationProductMemberScope({
      actorUserId:students[0].userId,organizationId:org.id,product:'HUISCHOOL',
    })).toBeNull()
    const target=await createHuiteacherTarget({
      organizationId:org.id,actorUserId:admin.id,kind:'PERSON',
      name:'First authorized teacher',subjectUserId:teacher.id,
    })
    const event=await createHuiteacherEvent({
      organizationId:org.id,actorUserId:admin.id,targetId:target.id,
      kind:'ASSESSMENT',title:'Protected student feedback',
    })
    const formDraft=await createHuiteacherForm({
      organizationId:org.id,actorUserId:admin.id,title:'Student FORM V2',
    })
    const options=[{optionKey:'yes',label:'好'},{optionKey:'no',label:'需改进'}]
    await updateHuiteacherForm({
      organizationId:org.id,actorUserId:admin.id,formId:formDraft.id,
      expectedRevision:formDraft.revision,title:'Student FORM V2',
      definition:{schemaVersion:2,pages:[{pageKey:'p1',title:'课堂体验',questions:[
        {itemKey:'q1',type:'LIKERT',prompt:'教师讲解是否清晰',
          required:true,options,rows:[]},
        {itemKey:'q2',type:'LIKERT',prompt:'能否收到反馈',
          required:true,options,rows:[]},
        {itemKey:'q3',type:'LONG_TEXT',prompt:'建议（私有）',
          required:false,options:[],rows:[],maxLength:120,
          displayIf:{itemKey:'q1',operator:'EQUALS',optionKey:'yes'}},
      ]}]},
    })
    const form=await db.huiteacherFormInstrument.findUniqueOrThrow({where:{id:formDraft.id}})
    await publishHuiteacherForm({
      organizationId:org.id,actorUserId:admin.id,formId:form.id,
      expectedRevision:form.revision,
    })
    const campaign={organizationId:org.id,eventId:event.id,actorUserId:admin.id}
    await configureHuiteacherStudentEvaluation({
      ...campaign,classUnitId:classId,staffAssignmentId:teacherStaff,formId:form.id,
    })
    await expect(createHuiteacherStudentEvaluationRun({
      ...campaign,actorUserId:students[0].userId,
    })).rejects.toThrow()
    const run=await createHuiteacherStudentEvaluationRun(campaign)
    expect(run.trackCount).toBe(1)
    await expect(createHuiteacherStudentEvaluationRun(campaign)).rejects.toThrow()
    await previewHuiteacherStudentEvaluationRun({
      ...campaign,expectedVersion:run.version,
    })
    await transitionHuiteacherEvent({...campaign,action:'OPEN',expectedVersion:event.version})
    await publishHuiteacherStudentEvaluationRun({...campaign,expectedVersion:run.version})
    const executions=await db.$queryRawUnsafe<Array<{
      id:string;studentId:string;teacherId:string;classUnitId:string
    }>>(
      'SELECT x."id",r."user_id" AS "studentId",s."user_id" AS "teacherId",rel."snapshot_payload"->\'facts\'->>\'classUnitId\' AS "classUnitId" '+
      'FROM "assessment_run_executions" x '+
      'JOIN "assessment_run_actor_snapshots" r ON r."id"=x."respondent_actor_snapshot_id" '+
      'JOIN "assessment_run_actor_snapshots" s ON s."id"=x."subject_actor_snapshot_id" '+
      'JOIN "assessment_run_relationship_snapshots" rel ON rel."id"=x."relationship_snapshot_id" '+
      'WHERE x."run_id"=$1 ORDER BY x."id"',run.runId)
    expect(executions).toHaveLength(15)
    expect(new Set(executions.map(x=>x.studentId)).size).toBe(15)
    expect(executions.every(x=>x.teacherId===teacher.id&&x.classUnitId===classId)).toBe(true)
    await expect(startAssessmentRunExecution({
      executionId:executions[0].id,actorUserId:outsider.id,
    })).rejects.toThrow()
    await expect(startAssessmentRunExecution({
      executionId:executions[0].id,actorUserId:otherTeacher.id,
    })).rejects.toThrow()
    const positions=new Map(students.map((s,i)=>[s.userId,i]))
    let privateAttempt=''
    let revokedAttempt=''
    for(const execution of executions.slice(0,11)){
      const i=positions.get(execution.studentId)!
      const started=await startAssessmentRunExecution({
        executionId:execution.id,actorUserId:execution.studentId,
      })
      expect(started.state).toBe('STARTED')
      expect(started.runtimeBindingRef).toBeTruthy()
      const attemptId=started.runtimeBindingRef!
      if(i===10){
        revokedAttempt=attemptId
        await db.organizationPersonaGrant.update({
          where:{id:students[i].personaId},data:{revokedAt:new Date()},
        })
        await expect(submitOwnHuiteacherFormFinal({
          actorUserId:execution.studentId,attemptId,submissionId:randomUUID(),
          answers:{q1:'yes',q2:'yes'},
        })).rejects.toThrow()
        continue
      }
      const answers={q1:i<5?'yes':'no',q2:i===0?'no':'yes',
        ...(i<5?{q3:'具体建议不应出现在报告中'}:{})}
      const submissionId=randomUUID()
      const final=await submitOwnHuiteacherFormFinal({
        actorUserId:execution.studentId,attemptId,submissionId,answers,
      })
      expect(final.idempotent).toBe(false)
      if(i===0){
        privateAttempt=attemptId
        const replay=await submitOwnHuiteacherFormFinal({
          actorUserId:execution.studentId,attemptId,submissionId,answers,
        })
        expect(replay.receiptId).toBe(final.receiptId)
        expect(replay.idempotent).toBe(true)
        await expect(submitOwnHuiteacherFormFinal({
          actorUserId:execution.studentId,attemptId,submissionId:randomUUID(),answers,
        })).rejects.toThrow()
      }
    }
    expect(await db.huiteacherFormFinal.count({where:{organizationId:org.id}})).toBe(10)
    await expect(readOwnHuiteacherFormTask({
      actorUserId:teacher.id,attemptId:privateAttempt,
    })).rejects.toThrow()
    await expect(readOwnHuiteacherFormTask({
      actorUserId:admin.id,attemptId:privateAttempt,
    })).rejects.toThrow()
    await expect(readHuiteacherStudentFeedbackReport({
      ...campaign,actorUserId:teacher.id,
    })).rejects.toThrow()
    await closeAssessmentRun({organizationId:org.id,runId:run.runId})
    await transitionHuiteacherEvent({
      ...campaign,action:'CLOSE',expectedVersion:event.version+1,
    })
    await expect(submitOwnHuiteacherFormFinal({
      actorUserId:students[10].userId,attemptId:revokedAttempt,
      submissionId:randomUUID(),answers:{q1:'no',q2:'yes'},
    })).rejects.toThrow()
    const report=await readHuiteacherStudentFeedbackReport({
      ...campaign,actorUserId:teacher.id,
    })
    expect(report.reportMode).toBe('FORM_DESCRIPTIVE_AGGREGATE')
    expect(report.frozenPopulation).toBe(15)
    expect(report.independentRespondents).toBe(10)
    expect(report.participationRate).toBeCloseTo(10/15,2)
    expect(report.withheldFreeText).toBe(true)
    expect(JSON.stringify(report)).not.toContain('respondentId')
    expect(JSON.stringify(report)).not.toContain('具体建议不应出现在报告中')
    expect(JSON.stringify(report)).not.toContain(students[0].userId)
    const q1=report.distributions.find(x=>x.itemKey==='q1')
    const q2=report.distributions.find(x=>x.itemKey==='q2')
    const q3=report.distributions.find(x=>x.itemKey==='q3')
    expect(q1?.status).toBe('READY')
    if(q1?.status==='READY')
      expect(q1.cells?.filter(c=>['yes','no'].includes(c.key))
        .map(c=>c.count).sort((a,b)=>a-b)).toEqual([5,5])
    expect(q2?.status).toBe('WITHHELD')
    expect(q3?.status).toBe('WITHHELD')
    await expect(readHuiteacherStudentFeedbackReport({
      ...campaign,actorUserId:students[0].userId,
    })).rejects.toThrow()
    await expect(readHuiteacherStudentFeedbackReport({
      ...campaign,actorUserId:otherTeacher.id,
    })).rejects.toThrow()
    const repeat=await readHuiteacherStudentFeedbackReport({
      ...campaign,actorUserId:admin.id,
    })
    expect(repeat.releasedAt).toEqual(report.releasedAt)
    const ledger=await db.huiteacherStudentDisclosureLedger.findUniqueOrThrow({
      where:{organizationId_teacherUserId_classUnitId:{
        organizationId:org.id,teacherUserId:teacher.id,classUnitId:classId,
      }},
    })
    expect(ledger.firstRunId).toBe(run.runId)
    // Verify real database immutability, rather than a mocked permission.
    await expect(db.huiteacherStudentDisclosureLedger.delete({
      where:{organizationId_teacherUserId_classUnitId:{
        organizationId:org.id,teacherUserId:teacher.id,classUnitId:classId,
      }},
    })).rejects.toThrow()
    // Dual product: same user and membership; not a second student account.
    await db.educationProductEntitlement.create({data:{
      organizationId:org.id,product:'HUISCHOOL',
      status:'ACTIVE',grantedByUserId:admin.id,
    }})
    expect((await resolveEducationProductMemberScope({
      actorUserId:students[0].userId,organizationId:org.id,product:'HUISCHOOL',
    }))?.membershipId).toBe(students[0].memberId)
  })
})
