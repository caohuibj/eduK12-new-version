import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll,afterAll,describe,expect,it } from 'vitest'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from './integration-env'
import { createHuiteacherTarget,createHuiteacherEvent } from '../../modules/huiteacher/evaluation.service'
import { createHuiteacherForm,updateHuiteacherForm,publishHuiteacherForm } from '../../modules/huiteacher/forms.service'
import {
  configureHuiteacherStudentEvaluation,
  listHuiteacherStudentEvaluationCandidates,
  previewHuiteacherStudentEvaluation,
} from '../../modules/huiteacher/studentEvaluation.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=url?describe:describe.skip
let db:PrismaClient
const makeUser=(role:'TEACHER'|'STUDENT')=>db.user.create({data:{
  id:randomUUID(),username:'teacher_pr5_'+randomUUID().replaceAll('-',''),
  accountDomain:'SCHOOL',role,teacherApproved:true,passwordHash:'synthetic',
}})
suite('Huiteacher PR5 Teacher-only student feedback scope (not released)',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!)
    db=new PrismaClient({datasources:{db:{url:url!}}})
    await db.$connect()
  })
  afterAll(async()=>{await db?.$disconnect()})
  it('freezes only exact target teacher, approved class appointment and Form',async()=>{
    const [admin,teacher,stranger]=await Promise.all([
      makeUser('TEACHER'),makeUser('TEACHER'),makeUser('TEACHER'),
    ])
    const org=await db.organization.create({data:{
      id:randomUUID(),name:'PR5-only-'+randomUUID(),
      productDomain:'SCHOOL',createdByUserId:admin.id,
    }})
    const adminMember=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:org.id,userId:admin.id,orgRole:'ORG_ADMIN',
    }})
    const teacherMember=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:org.id,userId:teacher.id,orgRole:'MEMBER',
    }})
    const strangerMember=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:org.id,userId:stranger.id,orgRole:'MEMBER',
    }})
    await db.educationProductEntitlement.create({data:{
      organizationId:org.id,product:'HUITEACHER',
      status:'ACTIVE',grantedByUserId:admin.id,
    }})
    // In particular, no HUISCHOOL psychology entitlement is inserted.
    await db.educationProductRoleGrant.create({data:{
      id:randomUUID(),organizationId:org.id,membershipId:adminMember.id,
      product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:admin.id,
    }})
    for(const membership of [teacherMember,strangerMember]){
      await db.organizationPersonaGrant.create({data:{
        id:randomUUID(),organizationId:org.id,membershipId:membership.id,
        persona:'TEACHER',grantedByUserId:admin.id,
      }})
    }
    const grade=randomUUID(),classId=randomUUID()
    await db.$executeRaw`
      INSERT INTO "organization_units"("id","organization_id","unit_kind","name")
      VALUES(${grade},${org.id},'GRADE','PR5 test grade')
    `
    await db.$executeRaw`
      INSERT INTO "organization_units"("id","organization_id","unit_kind","name","parent_unit_id")
      VALUES(${classId},${org.id},'CLASS','PR5 test class',${grade})
    `
    const staffId=randomUUID(),unrelatedId=randomUUID()
    await db.$executeRaw`
      INSERT INTO "organization_staff_class_assignments"
        ("id","organization_id","membership_id","class_unit_id","staff_role")
      VALUES(${staffId},${org.id},${teacherMember.id},${classId},'TEACHING'),
        (${unrelatedId},${org.id},${strangerMember.id},${classId},'TEACHING')
    `
    const target=await createHuiteacherTarget({
      organizationId:org.id,actorUserId:admin.id,kind:'PERSON',
      name:'正式登记的授课教师',subjectUserId:teacher.id,
    })
    const event=await createHuiteacherEvent({
      organizationId:org.id,actorUserId:admin.id,targetId:target.id,
      kind:'ASSESSMENT',title:'学生对指定教师的教学评价',
    })
    const draft=await createHuiteacherForm({
      organizationId:org.id,actorUserId:admin.id,title:'不计分学生评教表',
    })
    await updateHuiteacherForm({
      organizationId:org.id,actorUserId:admin.id,formId:draft.id,
      expectedRevision:draft.revision,title:'不计分学生评教表',
      definition:{schemaVersion:2,pages:[{pageKey:'p1',title:'课堂体验',
        questions:[{itemKey:'q1',type:'LIKERT',prompt:'教师讲解是否清晰',
          required:true,options:[{optionKey:'yes',label:'清晰'},
            {optionKey:'no',label:'尚需改进'}],rows:[]}]}]},
    })
    const frozen=await db.huiteacherFormInstrument.findUniqueOrThrow({
      where:{id:draft.id},
    })
    await publishHuiteacherForm({
      organizationId:org.id,actorUserId:admin.id,
      formId:draft.id,expectedRevision:frozen.revision,
    })
    const key={organizationId:org.id,eventId:event.id,actorUserId:admin.id}
    const candidates=await listHuiteacherStudentEvaluationCandidates(key)
    expect(candidates.list.some(x=>x.staffAssignmentId===staffId)).toBe(true)
    const base={...key,classUnitId:classId,formId:draft.id}
    await expect(configureHuiteacherStudentEvaluation({
      ...base,staffAssignmentId:unrelatedId,
    })).rejects.toThrow()
    await expect(configureHuiteacherStudentEvaluation({
      ...base,actorUserId:stranger.id,staffAssignmentId:staffId,
    })).rejects.toThrow()
    const result=await configureHuiteacherStudentEvaluation({
      ...base,staffAssignmentId:staffId,
    })
    expect(result.teacherTargetUserId).toBe(teacher.id)
    expect(result.formId).toBe(draft.id)
    await expect(configureHuiteacherStudentEvaluation({
      ...base,staffAssignmentId:staffId,
    })).rejects.toThrow()
    for(let i=0;i<10;i++){
      const student=await makeUser('STUDENT')
      const member=await db.organizationMembership.create({data:{
        id:randomUUID(),organizationId:org.id,userId:student.id,orgRole:'MEMBER',
      }})
      await db.organizationPersonaGrant.create({data:{
        id:randomUUID(),organizationId:org.id,membershipId:member.id,
        persona:'STUDENT',grantedByUserId:admin.id,
      }})
      await db.$executeRaw`
        INSERT INTO "organization_student_class_assignments"
          ("id","organization_id","membership_id","class_unit_id","is_primary")
        VALUES(${randomUUID()},${org.id},${member.id},${classId},TRUE)
      `
      const progress=await previewHuiteacherStudentEvaluation(key)
      expect(progress.eligibleStudentCount).toBe(i+1)
      expect(progress.readyForPrivacyProtectedFeedback).toBe(i===9)
    }
    expect(await db.educationProductEntitlement.count({
      where:{organizationId:org.id,product:'HUISCHOOL'},
    })).toBe(0)
    // No PR5 submissions or results exist at this stage.
    expect(await db.huiteacherFormFinal.count({
      where:{organizationId:org.id},
    })).toBe(0)
  })
})
