import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SchoolActivityManager} from './SchoolActivityManager'
import type {SchoolApi} from './SchoolRecovery'
const base='/organizations/org/activities/activity'
const activity={courseId:'activity',organizationId:'org',title:'关系检查活动',purpose:'SCHOOL_CLIMATE',status:'DRAFT',version:1,participantCount:0,runCount:1,runs:[{runId:'run',name:'关系批次',status:'DRAFT'}]}
const run={id:'run',name:'关系批次',status:'DRAFT',version:1}
afterEach(cleanup)
describe('School library relationship boundary',()=>{
 it.each(['library','legacy'])('preserves the supported %s relationship without changing version declarations',async kind=>{
  const key=kind==='library'?'library-scale:approved':'legacy-scale:approved'
  const resource={family:'SCALE',key,version:'fixed-v1',title:'教师评学生',scientificMaturity:'PILOT',subjectRoles:['STUDENT'],respondentRoles:['TEACHER'],relationshipKinds:['COURSE_TEACHER_STUDENT','CLASS_TEACHER_STUDENT'],perspectives:['TEACHER_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'EDUCATION_LIBRARY_APPROVED_CONTENT_V1',minimumRespondents:null,allowedTargetModes:kind==='library'?['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS','SELECTED_CLASS_TEACHERS']:['CLASS_TEACHER','COURSE_TEACHER']}
  const api=vi.fn(async(path:string,method='GET')=>{
   if(path.endsWith('pageSize=50'))return {list:[activity]}
   if(path===base)return activity
   if(path.endsWith('/eligible-classes'))return {list:[]}
   if(path===base+'/runs/run')return {run}
   if(path===base+'/run-resources?page=1')return {list:[resource],nextCursor:null}
   if(path===base+'/runs/run/tracks'&&method==='POST')return {}
   throw Error('Unexpected '+method+' '+path)
  })
  render(<SchoolActivityManager api={api as SchoolApi} organizationId="org" isAdmin classes={[]}/>)
  await screen.findByRole('option',{name:'关系检查活动（准备中）'})
  fireEvent.change(screen.getByLabelText('选择已有活动'),{target:{value:'activity'}})
  fireEvent.click(await screen.findByRole('button',{name:'关系批次 · 准备中'}))
  fireEvent.click(await screen.findByRole('button',{name:'查看已发布、受授权的测评资源'}))
  fireEvent.change(await screen.findByLabelText('测评资源 · 精确版本'),{target:{value:`SCALE:${key}:fixed-v1`}})
  const relation=screen.getByLabelText('关系')
  const add=screen.getByRole('button',{name:'添加当前版本的测评项目'})
  if(kind==='library'){
   expect(relation).toHaveValue('CLASS_TEACHER_STUDENT')
   expect(within(relation).queryByRole('option',{name:'COURSE_TEACHER_STUDENT'})).not.toBeInTheDocument()
   expect(within(relation).getByRole('option',{name:'CLASS_TEACHER_STUDENT'})).toBeInTheDocument()
   expect(screen.getByText('课程师生施测关系暂未接通，请使用班级师生关系；不会改动该版本的适用声明。')).toBeInTheDocument()
   // A forged browser selection cannot turn a hidden relationship into an allowed submission.
   const forgedRelation=document.createElement('option');forgedRelation.value='COURSE_TEACHER_STUDENT';relation.append(forgedRelation)
   fireEvent.change(relation,{target:{value:'COURSE_TEACHER_STUDENT'}})
   expect(add).toBeDisabled();fireEvent.click(add)
   expect(api.mock.calls.some(([path])=>path.endsWith('/tracks'))).toBe(false)
   fireEvent.change(relation,{target:{value:'CLASS_TEACHER_STUDENT'}})
   const target=screen.getByLabelText('课程/教师目标（需要明确选择）')
   const forgedTarget=document.createElement('option');forgedTarget.value='COURSE_TEACHER';target.append(forgedTarget)
   fireEvent.change(target,{target:{value:'COURSE_TEACHER'}})
   fireEvent.click(add)
   await screen.findByText('课程师生施测关系暂未接通，请使用已声明的班级师生关系。')
   expect(api.mock.calls.some(([path])=>path.endsWith('/tracks'))).toBe(false)
   await waitFor(()=>expect(add).toBeEnabled())
   fireEvent.change(target,{target:{value:'HOMEROOM_TEACHER'}})
  }else{
   expect(relation).toHaveValue('COURSE_TEACHER_STUDENT')
   expect(within(relation).getByRole('option',{name:'COURSE_TEACHER_STUDENT'})).toBeInTheDocument()
   expect(within(relation).getByRole('option',{name:'CLASS_TEACHER_STUDENT'})).toBeInTheDocument()
  }
  fireEvent.click(add)
  await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/runs/run/tracks','POST',expect.objectContaining({resource:{family:'SCALE',key,version:'fixed-v1'},requestedPolicy:expect.objectContaining({relationshipKinds:[kind==='library'?'CLASS_TEACHER_STUDENT':'COURSE_TEACHER_STUDENT']})})))
  expect(resource.relationshipKinds).toEqual(['COURSE_TEACHER_STUDENT','CLASS_TEACHER_STUDENT'])
 })
})
