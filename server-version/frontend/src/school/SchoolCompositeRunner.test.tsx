import {describe,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import type {SchoolApi} from './SchoolRecovery'

const m=vi.hoisted(()=>({entry:vi.fn(),cognitive:vi.fn(),presentation:vi.fn()}))
vi.mock('../components/FinalCompositeAssessment',()=>({
  default:(props:any)=>{m.presentation(props);return <button onClick={()=>props.onEnterCognitive(m.entry())}>进入冻结认知子测评</button>},
}))
vi.mock('../modules/cognitive/pages/CognitiveRunner',()=>({
  CognitiveRunner:({campus}:any)=>{
    m.cognitive(campus)
    return <section>
      <p>校园认知子测评已进入</p>
      <button onClick={()=>void campus.api.getSession(campus.sessionId)}>读取认知子测评</button>
      <button onClick={()=>void campus.api.submitFinal(campus.sessionId,{
        submissionId:'0123456789abcdef',attemptEpoch:1,
        definitionHash:'a'.repeat(64),trials:[{trialIndex:0,payload:{response:'A'}}],
      })}>提交认知 FINAL</button>
      <button onClick={campus.onCompleted}>返回校园活动</button>
      <button onClick={campus.onExit}>保存并返回上级测评</button>
    </section>
  },
}))
vi.mock('../modules/situational/pages/SituationalRunner',()=>({default:()=>null}))
import {SchoolCompositeRunner} from './SchoolCompositeRunner'

const execution={organizationId:'school-a',courseId:'campus-act-1',runId:'run-1',
  executionId:'execution-1'}
const parentPath='/composite-attempts/parent-attempt-1'
const childPath=parentPath+'/items/slot-cognitive-1/cognitive/cognitive-session-1'

describe('Huischool Cognitive task uses only school-bound Composite FINAL endpoints',()=>{
  it('loads existing frozen slot and returns to parent after FINAl without training credentials',async()=>{
    m.entry.mockReturnValue({id:'slot-cognitive-1',type:'COGNITIVE',
      cognitiveSession:{sessionId:'cognitive-session-1'}})
    const submitted=vi.fn()
    const api=vi.fn(async(path:string,method='GET',payload?:unknown)=>{
      if(path==='/organizations/school-a/activities/campus-act-1/runs/run-1/executions/execution-1/start'&&method==='POST')
        return {state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'parent-attempt-1'}
      if(path===parentPath&&method==='GET')
        return {id:'parent-attempt-1',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS',currentItem:{
          id:'slot-cognitive-1',type:'COGNITIVE',cognitiveSession:{sessionId:'cognitive-session-1'},
        }}
      if(path===childPath&&method==='GET')return {sessionId:'cognitive-session-1',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS'}
      if(path===childPath+'/submit'&&method==='POST'){
        submitted(payload)
        return {completed:true,feedbackDeferred:true,replayed:false}
      }
      throw Error('unexpected campus call: '+path+' '+method)
    })
    render(<SchoolCompositeRunner api={api as unknown as SchoolApi} execution={execution}
      title="学生认知任务" onExit={vi.fn()} onFinished={vi.fn()}/>)
    fireEvent.click(screen.getByRole('button',{name:'开始或继续正式测评'}))
    fireEvent.click(await screen.findByRole('button',{name:'进入冻结认知子测评'}))
    expect(await screen.findByText('校园认知子测评已进入')).toBeInTheDocument()
    expect(screen.getByLabelText('校园任务作答')).toHaveAttribute('data-school-child','COGNITIVE')
    expect(screen.getByLabelText('校园任务作答')).not.toHaveClass('hs-school-task-runner--answer')
    fireEvent.click(screen.getByRole('button',{name:'读取认知子测评'}))
    fireEvent.click(screen.getByRole('button',{name:'提交认知 FINAL'}))
    await waitFor(()=>expect(submitted).toHaveBeenCalledTimes(1))
    expect(api).toHaveBeenCalledWith(childPath)
    expect(api).toHaveBeenCalledWith(childPath+'/submit','POST',expect.objectContaining({
      attemptEpoch:1,submissionId:'0123456789abcdef',
    }))
    expect(api.mock.calls.every(c=>c[0].startsWith('/'))).toBe(true)
    expect(api.mock.calls.some(c=>c[0].startsWith('/cognitive/sessions'))).toBe(false)
    fireEvent.click(screen.getByRole('button',{name:'返回校园活动'}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'进入冻结认知子测评'})).toBeInTheDocument())
  })
  it('does not start a child when the frozen session binding is absent',async()=>{
    m.entry.mockReturnValue({id:'slot-cognitive-1',type:'COGNITIVE'})
    const api=vi.fn(async(path:string)=>{
      if(path.endsWith('/start'))return {state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'parent-attempt-1'}
      if(path===parentPath)return {id:'parent-attempt-1',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS'}
      throw Error('unexpected')
    })
    render(<SchoolCompositeRunner api={api as unknown as SchoolApi} execution={execution}
      onExit={vi.fn()} onFinished={vi.fn()}/>)
    fireEvent.click(screen.getByRole('button',{name:'开始或继续正式测评'}))
    fireEvent.click(await screen.findByRole('button',{name:'进入冻结认知子测评'}))
    expect(screen.getByRole('alert')).toHaveTextContent('认知子测评缺少经过冻结的会话')
    expect(screen.queryByText('校园认知子测评已进入')).not.toBeInTheDocument()
  })
})

it('returns without promising to save or sending a submission',()=>{
  const api=vi.fn()
  const onExit=vi.fn()
  render(<SchoolCompositeRunner api={api as unknown as SchoolApi} execution={execution}
    onExit={onExit} onFinished={vi.fn()}/>)
  expect(screen.queryByRole('button',{name:'保存并返回活动'})).not.toBeInTheDocument()
  expect(screen.getByText(/返回不会提交当前作答/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'返回活动'}))
  expect(onExit).toHaveBeenCalledOnce()
  expect(api).not.toHaveBeenCalled()
})

 it.each(['FORM_SECTION','SCALE'])('opts student %s into compact instructions without altering transport',async(type)=>{
  const api=vi.fn(async(path:string)=>path.endsWith('/start')?{state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'parent-attempt-1'}:{id:'parent-attempt-1',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS',currentItem:{id:'unit-1',type}})
  const {container}=render(<SchoolCompositeRunner api={api as unknown as SchoolApi} title="学生任务" execution={execution} onExit={vi.fn()} onFinished={vi.fn()}/>)
  fireEvent.click(screen.getByRole('button',{name:'开始或继续正式测评'}))
  await screen.findByRole('button',{name:'进入冻结认知子测评'})
  expect(container.querySelector('.hs-school-task-runner--answer')).not.toBeNull()
  expect(container.querySelector('.hs-school-runner-help')).not.toHaveAttribute('open')
  expect(m.presentation).toHaveBeenLastCalledWith(expect.objectContaining({campusMode:true,instructionsSummary:'作答说明'}))
  expect(api.mock.calls.map(call=>call[0])).toEqual(['/organizations/school-a/activities/campus-act-1/runs/run-1/executions/execution-1/start',parentPath])
 })


it('keeps observer preparation concise without hiding required consent or starting automatically',()=>{
 const api=vi.fn(),onExit=vi.fn()
 render(<SchoolCompositeRunner observer observerTaskTitle="成长支持多角色问卷" api={api as unknown as SchoolApi}
   execution={{...execution,consentRequired:true,consentPurpose:'教育观察',consentVisibility:'授权专业人员'}} onExit={onExit} onFinished={vi.fn()}/>)
 expect(screen.getByRole('heading',{name:'成长支持多角色问卷'})).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'返回活动'})).not.toBeInTheDocument()
 expect(screen.queryByText(/返回不会提交当前作答/)).not.toBeInTheDocument()
 const start=screen.getByRole('button',{name:'开始或继续正式测评'})
 expect(start).toBeDisabled()
 expect(screen.getByText('用途：教育观察')).toBeVisible()
 expect(screen.getByText('可见性政策：授权专业人员')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'作答与隐私说明'}))
 expect(screen.getByRole('note',{name:'作答与隐私说明'})).toHaveTextContent('尚未提交的内容可能无法保留')
 fireEvent.click(screen.getByRole('checkbox',{name:'我已阅读本次测评的用途与可见性说明，自愿同意作答。'}))
 expect(start).toBeEnabled()
 fireEvent.click(screen.getByRole('button',{name:'返回任务'}))
 expect(onExit).toHaveBeenCalledOnce()
 expect(api).not.toHaveBeenCalled()
})
