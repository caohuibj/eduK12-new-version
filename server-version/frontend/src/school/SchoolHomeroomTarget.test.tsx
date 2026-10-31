import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SchoolActivityManager} from './SchoolActivityManager'
import type {SchoolApi} from './SchoolRecovery'
const base='/organizations/org/activities/activity'
const modes=['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS','SELECTED_CLASS_TEACHERS']
async function setup(isAdmin:boolean,allowedTargetModes:string[]=modes){
 const activity={courseId:'activity',organizationId:'org',title:'教师他评活动',purpose:'SCHOOL_CLIMATE',status:'DRAFT',version:1,participantCount:0,runCount:1,runs:[{runId:'run',name:'他评批次',status:'DRAFT'}],capabilities:{canSubmit:true,canOpen:false,canPause:false,canResume:false,canClose:false,canPublishRun:false,ownPsychologyPublisher:true}}
 const resource={family:'SCALE',key:'library-scale:first',version:'v1',title:'量表甲',scientificMaturity:'PILOT',subjectRoles:['STUDENT'],respondentRoles:['TEACHER'],relationshipKinds:['CLASS_TEACHER_STUDENT'],perspectives:['OBSERVER_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'EDUCATION_LIBRARY_APPROVED_CONTENT_V1',minimumRespondents:null,allowedTargetModes}
 const api=vi.fn(async(path:string,method='GET')=>{
  if(path.endsWith('pageSize=50'))return {list:[activity]}
  if(path===base)return activity
  if(path.endsWith('/eligible-classes'))return {list:[]}
  if(path===base+'/runs/run')return {run:{id:'run',name:'他评批次',status:'DRAFT',version:1}}
  if(path===base+'/run-resources?page=1')return {list:[resource,{...resource,key:'library-scale:second',title:'量表乙'}],nextCursor:null}
  if(path===base+'/runs/run/tracks'&&method==='POST')return {}
  throw Error('Unexpected '+path)
 })
 render(<SchoolActivityManager api={api as SchoolApi} organizationId="org" isAdmin={isAdmin} classes={[]}/>)
 await screen.findByRole('option',{name:'教师他评活动（准备中）'})
 fireEvent.change(screen.getByLabelText('选择已有活动'),{target:{value:'activity'}})
 fireEvent.click(await screen.findByRole('button',{name:'他评批次 · 准备中'}))
 fireEvent.click(await screen.findByRole('button',{name:'查看已发布、受授权的测评资源'}))
 fireEvent.change(await screen.findByLabelText('测评资源 · 精确版本'),{target:{value:'SCALE:library-scale:first:v1'}})
 return api
}
afterEach(cleanup)
describe('School explicit homeroom target selection',()=>{
 it('requires an explicit homeroom choice for psychologist, rejects forged broader scope and resets on resource change',async()=>{
  const api=await setup(false)
  const target=screen.getByLabelText('班主任作答目标（需要明确选择）'),add=screen.getByRole('button',{name:'添加当前版本的测评项目'})
  expect(target).toHaveValue('');expect(add).toBeDisabled()
  expect(within(target).getByRole('option',{name:'班主任'})).toBeInTheDocument()
  expect(within(target).queryByRole('option',{name:'全部班级教师'})).not.toBeInTheDocument()
  const forged=document.createElement('option');forged.value='ALL_CLASS_TEACHERS';target.append(forged)
  fireEvent.change(target,{target:{value:'ALL_CLASS_TEACHERS'}})
  expect(add).toBeDisabled();fireEvent.click(add)
  expect(api.mock.calls.some(([path])=>path.endsWith('/tracks'))).toBe(false)
  fireEvent.change(target,{target:{value:'HOMEROOM_TEACHER'}})
  expect(add).toBeEnabled()
  fireEvent.change(screen.getByLabelText('测评资源 · 精确版本'),{target:{value:'SCALE:library-scale:second:v1'}})
  expect(target).toHaveValue('');expect(add).toBeDisabled()
  fireEvent.change(target,{target:{value:'HOMEROOM_TEACHER'}});fireEvent.click(add)
  await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/runs/run/tracks','POST',expect.objectContaining({resource:{family:'SCALE',key:'library-scale:second',version:'v1'},requestedPolicy:expect.objectContaining({targetPolicy:{mode:'HOMEROOM_TEACHER'}})})))
 })
 it('fails closed when the source does not declare any supported homeroom mode',async()=>{
  const api=await setup(false,['SELECTED_CLASS_TEACHERS'])
  expect(screen.getByLabelText('班主任作答目标（需要明确选择）')).toHaveValue('')
  expect(screen.queryByRole('option',{name:'班主任'})).not.toBeInTheDocument()
  expect(screen.getByText(/当前版本未提供可用的教师作答目标/)).toBeInTheDocument()
  const add=screen.getByRole('button',{name:'添加当前版本的测评项目'})
  expect(add).toBeDisabled();fireEvent.click(add)
  expect(api.mock.calls.some(([path])=>path.endsWith('/tracks'))).toBe(false)
 })
 it('requires explicit administrator target and posts all-class scope without exposing selected-teacher mode',async()=>{
  const api=await setup(true)
  const target=screen.getByLabelText('课程/教师目标（需要明确选择）'),add=screen.getByRole('button',{name:'添加当前版本的测评项目'})
  expect(target).toHaveValue('')
  expect(within(target).getAllByRole('option').map(option=>(option as HTMLOptionElement).value)).toEqual(['','HOMEROOM_TEACHER','ALL_CLASS_TEACHERS'])
  fireEvent.click(add);await screen.findByText('请明确选择当前版本支持的教师作答目标。')
  expect(api.mock.calls.some(([path])=>path.endsWith('/tracks'))).toBe(false)
  await waitFor(()=>expect(add).toBeEnabled())
  fireEvent.change(target,{target:{value:'ALL_CLASS_TEACHERS'}});fireEvent.click(add)
  await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/runs/run/tracks','POST',expect.objectContaining({requestedPolicy:expect.objectContaining({targetPolicy:{mode:'ALL_CLASS_TEACHERS'}})})))
 })
})
