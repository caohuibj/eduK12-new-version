import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {SchoolActivityManager} from './SchoolActivityManager'
import type {SchoolApi} from './SchoolRecovery'

const organizationId='00000000-0000-4000-8000-000000000001'
const courseId='00000000-0000-4000-8000-000000000002'
const runId='00000000-0000-4000-8000-000000000003'
const entryId='00000000-0000-4000-8000-000000000004'
const base=`/organizations/${organizationId}/activities`
// Actual education-runtime-entry + compileEducationApplicability projection:
// TEACHER_REPORT is in the resource key; the perspective is OBSERVER_REPORT.
const resource={title:'教师观察量表',family:'SCALE',
  key:`library-scale:${entryId}:SCHOOL:STUDENT:TEACHER_REPORT`,version:'1.0.0',
  scientificMaturity:'PILOT',subjectRoles:['STUDENT'],respondentRoles:['TEACHER'],
  relationshipKinds:['CLASS_TEACHER_STUDENT','COURSE_TEACHER_STUDENT'],
  perspectives:['OBSERVER_REPORT'],analysisMode:'INDIVIDUAL_ONLY',
  visibilityPolicyKey:'observer_private_respondent_v1',minimumRespondents:null,
  allowedTargetModes:['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS','SELECTED_CLASS_TEACHERS']}

async function open(isAdmin:boolean){
  const activity={courseId,organizationId,title:'观察活动',purpose:'STUDENT_WELLBEING',
    status:'DRAFT',version:1,participantCount:1,runCount:1,
    capabilities:{ownPsychologyPublisher:!isAdmin},runs:[{runId,name:'观察批次',status:'DRAFT'}]}
  const detail={run:{id:runId,name:'观察批次',status:'DRAFT',version:2},tracks:[]}
  const api=vi.fn(async(path:string,method='GET')=>{
    if(path===base+'?page=1&pageSize=50')return {list:[activity]}
    if(path===base+'/'+courseId)return activity
    if(path===base+'/'+courseId+'/eligible-classes')return {list:[]}
    if(path===base+'/'+courseId+'/runs/'+runId)return detail
    if(path===base+'/'+courseId+'/run-resources?page=1')return {list:[resource]}
    if(path===base+'/'+courseId+'/runs/'+runId+'/tracks'&&method==='POST')return {id:'track'}
    throw new Error('Unexpected '+method+' '+path)
  })
  render(<SchoolActivityManager api={api as unknown as SchoolApi} organizationId={organizationId}
    isAdmin={isAdmin} actorKey="psychologist" classes={[]}/>)
  fireEvent.change(await screen.findByLabelText('选择已有活动'),{target:{value:courseId}})
  fireEvent.click(await screen.findByRole('button',{name:'观察批次 · 准备中'}))
  fireEvent.click(await screen.findByRole('button',{name:'查看已发布、受授权的测评资源'}))
  const chooser=await screen.findByLabelText('测评资源 · 精确版本')
  await within(chooser).findByRole('option',{name:/教师观察量表/})
  fireEvent.change(chooser,{target:{value:'SCALE:'+resource.key+':'+resource.version}})
  return api
}

describe('School real observer DTO target selection',()=>{
  it('requires the owned psychology activity homeroom target before sending the unchanged observer policy',async()=>{
    const api=await open(false)
    const target=await screen.findByLabelText('班主任作答目标（需要明确选择）')
    expect(within(target).getAllByRole('option').map(option=>option.getAttribute('value')))
      .toEqual(['','HOMEROOM_TEACHER'])
    expect(screen.getByText(/本人活动的教师他评仅支持班主任/)).toBeInTheDocument()
    const add=screen.getByRole('button',{name:'添加当前版本的测评项目'})
    expect(add).toBeDisabled()
    expect(api.mock.calls.every(([,method])=>method!=='POST')).toBe(true)
    fireEvent.change(target,{target:{value:'HOMEROOM_TEACHER'}})
    fireEvent.click(add)
    await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/'+courseId+'/runs/'+runId+'/tracks','POST',
      expect.objectContaining({requestedPolicy:expect.objectContaining({
        subjectRoles:['STUDENT'],respondentRoles:['TEACHER'],relationshipKinds:['CLASS_TEACHER_STUDENT'],
        perspectives:['OBSERVER_REPORT'],targetPolicy:{mode:'HOMEROOM_TEACHER'},
      })})))
  })

  it('offers only the supported explicit administrator targets and refuses an empty target',async()=>{
    const api=await open(true)
    const target=await screen.findByLabelText('课程/教师目标（需要明确选择）')
    expect(within(target).getAllByRole('option').map(option=>option.getAttribute('value')))
      .toEqual(['','HOMEROOM_TEACHER','ALL_CLASS_TEACHERS'])
    fireEvent.click(screen.getByRole('button',{name:'添加当前版本的测评项目'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('请明确选择当前版本支持的教师作答目标')
    expect(api.mock.calls.every(([,method])=>method!=='POST')).toBe(true)
    fireEvent.change(target,{target:{value:'ALL_CLASS_TEACHERS'}})
    fireEvent.click(screen.getByRole('button',{name:'添加当前版本的测评项目'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/'+courseId+'/runs/'+runId+'/tracks','POST',
      expect.objectContaining({requestedPolicy:expect.objectContaining({targetPolicy:{mode:'ALL_CLASS_TEACHERS'}})})))
  })
})
