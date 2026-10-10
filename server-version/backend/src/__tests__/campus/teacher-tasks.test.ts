import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks=vi.hoisted(()=>({query:vi.fn(),official:vi.fn(),reference:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:mocks.query}}))
vi.mock('../../modules/assessment-run/productRead',()=>({listAssignedRunTasks:mocks.official}))
vi.mock('../../modules/campus/studentReference',()=>({campusStudentReference:mocks.reference}))
import { listCampusTeacherRunTasks } from '../../modules/campus/teacher-tasks'

const actor={userId:'teacher-a',role:'TEACHER',accountDomain:'SCHOOL',platformRole:'STANDARD'}
const scoped={executionId:'exec-a',runId:'run-a',activityId:'activity-a',
  organizationId:'school-a',activityTitle:'学习适应',studentUserId:'student-a'}
const task={executionId:'exec-a',runId:'run-a',organizationId:'school-a',runName:'教师观察',
  subjectUserId:'student-a',subjectName:'PRIVATE_LOGIN_NAME',subjectRole:'STUDENT',
  respondentRole:'TEACHER',relationship:'CLASS_TEACHER_STUDENT',
  status:'ASSIGNED',deadline:null,consentRequired:true,consentPurpose:'教育支持',
  consentVisibility:'仅限授权',reportAttemptId:null}

describe('Huischool teacher observer task boundary',()=>{
  beforeEach(()=>{
    vi.clearAllMocks()
    mocks.query.mockResolvedValue([scoped])
    mocks.official.mockResolvedValue({list:[task],truncated:false})
    mocks.reference.mockReturnValue('林-AB12C3D4E5F6')
  })
  it('refuses TRAINING and non-teacher personas before any SQL discovery',async()=>{
    await expect(listCampusTeacherRunTasks({...actor,accountDomain:'TRAINING'} as any))
      .rejects.toMatchObject({statusCode:403})
    await expect(listCampusTeacherRunTasks({...actor,role:'PARENT'} as any))
      .rejects.toMatchObject({statusCode:403})
    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.official).not.toHaveBeenCalled()
  })
  it('uses live school/class/teacher/approved-student constraints and only projects aliases',async()=>{
    const result=await listCampusTeacherRunTasks(actor as any)
    expect(result.list).toEqual([{
      executionId:'exec-a',runId:'run-a',organizationId:'school-a',
      activityId:'activity-a',activityTitle:'学习适应',runTitle:'教师观察',
      studentReference:'林-AB12C3D4E5F6',status:'ASSIGNED',deadline:null,
      consentRequired:true,consentPurpose:'教育支持',consentVisibility:'仅限授权',
    }])
    const sql=mocks.query.mock.calls[0][0].join('')
    for(const expression of [
      "r.actor_role='TEACHER'","s.actor_role='STUDENT'",
      "activity.status='OPEN'","run.status='PUBLISHED'",
      "org.product_domain='SCHOOL'","teacher_role.persona='TEACHER'",
      'organization_staff_class_assignments',
      'organization_student_class_assignments',
      "enrollment.status='APPROVED'",
      "selected.status='ACTIVE'","organization_access_denies",
    ])expect(sql).toContain(expression)
    expect(mocks.official).toHaveBeenCalledWith('teacher-a',{runIds:['run-a']})
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_LOGIN_NAME|subjectUserId|student-a|reportAttemptId/)
  })
  it('drops unrelated or teacher-to-teacher runs even if the generic inbox returns them',async()=>{
    mocks.official.mockResolvedValue({list:[
      {...task,respondentRole:'STUDENT'},
      {...task,executionId:'other'},
      {...task,organizationId:'school-b'},
    ],truncated:false})
    const result=await listCampusTeacherRunTasks(actor as any)
    expect(result.list).toEqual([])
  })
})
