import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({read:vi.fn(),workflow:vi.fn(),rc:vi.fn(),source:vi.fn()}))
vi.mock('../../modules/assessment-run/educationLibraryContext',()=>({readEducationRunLibraryContext:m.read,lockAndAssertEducationRunWorkflow:m.workflow}))
vi.mock('../../modules/scale-library-governance/education-runtime-resources',()=>({assertEducationLibraryReadCommitted:m.rc}))
vi.mock('../../modules/education-tools/private-tool.runtime-resources',()=>({readPrivateScaleRuntimeResource:m.source}))
import {assertPrivateScaleRunEditor,assertPrivateScaleRunResource,readPrivateScaleRunSourceForPreparation} from '../../modules/assessment-run/educationPrivateScaleContext'
const input={organizationId:'org',runId:'run',actorUserId:'actor'},tx={huiteacherStudentEvaluationConfig:{findUnique:vi.fn().mockResolvedValue(null)}} as any
const school={product:'SCHOOL',schoolCourseId:'course',teacherEventId:null,schoolEditor:{activity:{ownerMembershipId:'member'},context:{membershipId:'member',orgRole:'MEMBER',canGovern:false}}}
beforeEach(()=>{vi.clearAllMocks();tx.huiteacherStudentEvaluationConfig.findUnique.mockResolvedValue(null);m.rc.mockResolvedValue(undefined);m.read.mockResolvedValue(school);m.workflow.mockResolvedValue(school);m.source.mockResolvedValue({identityOnly:true})})
describe('Private workflow context uses current shared facts, not library grants',()=>{
 it('derives entry from persisted workflow and uses only NEW_USE for author draft attachment',async()=>{
  await assertPrivateScaleRunResource(tx,{...input,resource:{key:'private-scale:key',version:'1.0.0'}})
  expect(m.workflow).toHaveBeenCalledWith(tx,{...input,resource:{key:'private-scale:key',version:'1.0.0'},purpose:'EDIT'},school)
  expect(m.source).toHaveBeenCalledWith(tx,{key:'private-scale:key',version:'1.0.0',purpose:'NEW_USE',context:{entry:'SCHOOL',organizationId:'org',principal:{userId:'actor',accountDomain:'SCHOOL'}}})
 })
 it('rejects noneducation workflow and changed workflow permission before source read',async()=>{
  m.read.mockResolvedValue(null)
  await expect(assertPrivateScaleRunEditor(tx,input)).rejects.toThrow('WORKFLOW_REQUIRED')
  expect(m.workflow).not.toHaveBeenCalled()
  m.read.mockResolvedValue(school);m.workflow.mockRejectedValue(new Error('changed current editor'))
  await expect(assertPrivateScaleRunResource(tx,{...input,resource:{key:'private-scale:key',version:'1.0.0'}})).rejects.toThrow('changed current editor')
  expect(m.source).not.toHaveBeenCalled()
 })
 it('does not let collaborator edit permission imply psychology ownership of another activity',async()=>{
  m.workflow.mockResolvedValue({...school,schoolEditor:{...school.schoolEditor,activity:{ownerMembershipId:'other'}}})
  await expect(assertPrivateScaleRunEditor(tx,input)).rejects.toThrow('OWN_ACTIVITY_REQUIRED')
 })
 it('preserves actual School governor editing and Teacher event manager boundaries without inventing a publisher',async()=>{
  m.workflow.mockResolvedValue({...school,schoolEditor:{activity:{ownerMembershipId:'other'},context:{membershipId:'member',orgRole:'ORG_ADMIN',canGovern:true}}})
  expect((await assertPrivateScaleRunEditor(tx,input)).schoolAdmin).toBe(true)
  m.workflow.mockResolvedValue({product:'TEACHER',schoolCourseId:null,teacherEventId:'event',schoolEditor:null})
  const result=await assertPrivateScaleRunEditor(tx,input)
  expect(result.context.entry).toBe('TEACHER');expect(result).not.toHaveProperty('canPublish')
 })
 it('does not attach private Scale to the protected student evaluation Form run',async()=>{
  m.workflow.mockResolvedValue({product:'TEACHER',schoolCourseId:null,teacherEventId:'event',schoolEditor:null})
  tx.huiteacherStudentEvaluationConfig.findUnique.mockResolvedValue({id:'config'})
  await expect(assertPrivateScaleRunEditor(tx,input)).rejects.toThrow('STUDENT_EVAL_TRACK_READONLY')
  expect(m.source).not.toHaveBeenCalled()
 })

 it('prepares exact private identity with persisted product and current author without claiming mutation authority',async()=>{
  await readPrivateScaleRunSourceForPreparation(tx,{...input,resource:{family:'SCALE',key:'private-scale:fixed',version:'1.0.0'}})
  expect(m.source).toHaveBeenCalledWith(tx,{key:'private-scale:fixed',version:'1.0.0',purpose:'NEW_USE',context:{entry:'SCHOOL',organizationId:'org',principal:{userId:'actor',accountDomain:'SCHOOL'}}})
  expect(m.workflow).not.toHaveBeenCalled();expect(m.rc).not.toHaveBeenCalled()
 })
 it('rejects a private namespace on another family or version before source preparation',async()=>{
  for(const resource of [{family:'FORM',key:'private-scale:x',version:'1.0.0'},{family:'SCALE',key:'private-scale:x',version:'2.0.0'}])await expect(readPrivateScaleRunSourceForPreparation(tx,{...input,resource})).rejects.toThrow('RESOURCE_INVALID')
  expect(m.read).not.toHaveBeenCalled();expect(m.source).not.toHaveBeenCalled()
 })

})
