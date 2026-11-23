import {afterEach,describe,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {SchoolParentTasks} from './SchoolParentTasks'
import {SchoolTeacherTasks} from './SchoolTeacherTasks'
import {SchoolStudentTasks} from './SchoolStudentTasks'
import type {SchoolApi} from './SchoolRecovery'

vi.mock('../components/FinalCompositeAssessment',()=>({default:({state,onExit}:{state:{id:string};onExit:()=>void})=> <div><p>已读取授权的原有作答</p><p>作答记录 {state.id}</p><button onClick={onExit}>保存并退出</button></div>}))
vi.mock('../modules/cognitive/pages/CognitiveRunner',()=>({CognitiveRunner:()=>null}))
vi.mock('../modules/situational/pages/SituationalRunner',()=>({default:()=>null}))
afterEach(cleanup)
const prefix='/organizations/school/activities/activity/runs/run/executions/execution'
const entryButtons={student:'开始／继续官方测评',parent:/查看任务|继续作答/,teacher:'开始／继续教师观察测评'}
function setup(role:keyof typeof entryButtons,resume:boolean,rejectRead=false){
  const task={id:'execution',executionId:'execution',organizationId:'school',activityId:'activity',
    activityTitle:'学校观察',runId:'run',runTitle:'观察任务',title:'观察任务',kind:'MEASUREMENT',
    status:resume?(role==='student'?'IN_PROGRESS':'STARTED'):(role==='student'?'PENDING':'ASSIGNED'),
    deadline:null,href:prefix,consentRequired:true,canResumeExisting:resume,
    consentPurpose:'学校观察',consentVisibility:'仅限正式授权',studentReference:'匿名观察编号'}
  const api=vi.fn(async(path:string,method='GET')=>{
    if(path.startsWith('/my/'))return {list:[task],total:1,hasMore:false,truncated:false,page:1}
    if(path===prefix+'/consent/accept'&&method==='POST')return {}
    if(path===prefix+'/start'&&method==='POST')return {state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'bound-attempt'}
    if(path==='/composite-attempts/bound-attempt?view=current-unit'){
      if(rejectRead)throw Error('当前作答访问被拒绝')
      return {id:'bound-attempt',status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY'}
    }
    throw Error('unexpected request '+path)
  })
  const client=api as unknown as SchoolApi
  render(role==='student'?<SchoolStudentTasks api={client}/>:
    role==='parent'?<SchoolParentTasks api={client}/>:
      <SchoolTeacherTasks api={client} organizationId="school"/>)
  return api
}
describe('School real inbox → runner consent sequence',()=>{
  function exitFixture(role:'parent'|'teacher'){
    let started=false,reads=0
    let resolve!:(value:unknown)=>void,reject!:(reason:Error)=>void
    const pending=new Promise((yes,no)=>{resolve=yes;reject=no})
    const projection=()=>({list:[{executionId:'execution',organizationId:'school',activityId:'activity',
      activityTitle:'学校观察',runId:'run',runTitle:'观察任务',status:started?'STARTED':'ASSIGNED',deadline:null,
      studentReference:'匿名观察编号',feedbackMode:'COMPOSITION',consentRequired:true,canResumeExisting:started,
      consentPurpose:'学校观察',consentVisibility:'仅限正式授权'}],truncated:false})
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path.startsWith('/my/'))return ++reads===2?pending:projection()
      if(path===prefix+'/consent/accept'&&method==='POST'){
        if(started)throw Error('Run is not open for consent acceptance')
        return {}
      }
      if(path===prefix+'/start'&&method==='POST'){
        started=true
        return {state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'original-attempt'}
      }
      if(path==='/composite-attempts/original-attempt?view=current-unit')return {id:'original-attempt',status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY'}
      throw Error('unexpected request '+path)
    })
    const client=api as unknown as SchoolApi
    render(role==='parent'?<SchoolParentTasks api={client}/>:<SchoolTeacherTasks api={client} organizationId="school"/>)
    return {api,resolve:()=>resolve(projection()),reject}
  }
  async function startAndExit(role:'parent'|'teacher'){
    fireEvent.click(await screen.findByRole('button',{name:entryButtons[role]}))
    const start=await screen.findByRole('button',{name:'开始或继续正式测评'})
    expect(start).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(start)
    await screen.findByText('作答记录 original-attempt')
    fireEvent.click(screen.getByRole('button',{name:'保存并退出'}))
  }
  async function resumeOriginal(role:'parent'|'teacher',api:ReturnType<typeof exitFixture>['api']){
    fireEvent.click(await screen.findByRole('button',{name:entryButtons[role]}))
    const start=await screen.findByRole('button',{name:'开始或继续正式测评'})
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(start)
    await screen.findByText('作答记录 original-attempt')
    expect(api.mock.calls.filter(([path])=>path===prefix+'/consent/accept')).toHaveLength(1)
    expect(api.mock.calls.filter(([path])=>path===prefix+'/start')).toHaveLength(2)
  }
  it.each(['parent','teacher'] as const)('%s reloads the server continuation hint after saving and exiting before offering the same task again',async role=>{
    const fixture=exitFixture(role)
    await startAndExit(role)
    await waitFor(()=>expect(fixture.api.mock.calls.filter(([path])=>path.startsWith('/my/'))).toHaveLength(2))
    expect(screen.queryByRole('button',{name:entryButtons[role]})).not.toBeInTheDocument()
    expect(fixture.api.mock.calls.filter(([path])=>path===prefix+'/start')).toHaveLength(1)
    await act(async()=>fixture.resolve())
    await resumeOriginal(role,fixture.api)
  })
  it.each(['parent','teacher'] as const)('%s cannot reopen a stale admission card after the exit refresh fails and can retry the protected inbox read',async role=>{
    const fixture=exitFixture(role)
    await startAndExit(role)
    await act(async()=>fixture.reject(Error('暂时无法核对继续作答权限')))
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法核对继续作答权限')
    expect(screen.queryByRole('button',{name:entryButtons[role]})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:role==='parent'?'重试读取任务':'重试读取观察任务'}))
    await resumeOriginal(role,fixture.api)
  })
  it.each(['student','parent','teacher'] as const)('%s resumes a server-confirmed binding without signing new admission consent',async role=>{
    const api=setup(role,true)
    fireEvent.click(await screen.findByRole('button',{name:entryButtons[role]}))
    const start=await screen.findByRole('button',{name:'开始或继续正式测评'})
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(start)
    await screen.findByText('已读取授权的原有作答')
    expect(api.mock.calls.filter(([path])=>!path.startsWith('/my/')).map(([path])=>path))
      .toEqual([prefix+'/start','/composite-attempts/bound-attempt?view=current-unit'])
  })
  it.each(['student','parent','teacher'] as const)('%s still requires explicit consent for new admission',async role=>{
    const api=setup(role,false)
    fireEvent.click(await screen.findByRole('button',{name:entryButtons[role]}))
    expect(await screen.findByRole('button',{name:'开始或继续正式测评'})).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(await screen.findByRole('button',{name:'开始或继续正式测评'}))
    await screen.findByText('已读取授权的原有作答')
    expect(api.mock.calls.filter(([path])=>!path.startsWith('/my/')).map(([path])=>path))
      .toEqual([prefix+'/consent/accept',prefix+'/start','/composite-attempts/bound-attempt?view=current-unit'])
  })
  it('does not reopen or re-sign consent when protected continuation is rejected',async()=>{
    const api=setup('parent',true,true)
    fireEvent.click(await screen.findByRole('button',{name:entryButtons.parent}))
    fireEvent.click(await screen.findByRole('button',{name:'开始或继续正式测评'}))
    await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('当前作答访问被拒绝'))
    expect(screen.queryByText('已读取授权的原有作答')).not.toBeInTheDocument()
    expect(api.mock.calls.some(([path])=>path.endsWith('/consent/accept'))).toBe(false)
  })
})
