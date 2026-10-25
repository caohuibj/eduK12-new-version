import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { SchoolStudentTasks } from './SchoolStudentTasks'
import { SchoolTeacherTasks } from './SchoolTeacherTasks'
import { SchoolParentTasks } from './SchoolParentTasks'
import { SchoolParentLinks } from './SchoolParentPortal'
import type { SchoolApi } from './SchoolRecovery'

vi.mock('./SchoolCompositeRunner',()=>({
  SchoolCompositeRunner:({execution}:{execution:{executionId:string}})=><div role="region" aria-label="test runner">{execution.executionId}<input aria-label="runner answer"/></div>,
}))
afterEach(cleanup)
function deferred<T>(){
  let resolve!:(value:T)=>void, reject!:(reason:Error)=>void
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no})
  return {promise,resolve,reject}
}
const task={id:'task-1',activityId:'activity-1',activityTitle:'校园活动',kind:'ASSIGNMENT',title:'练习一',status:'PENDING',href:'safe',deadline:null}
const run={executionId:'exec-1',runId:'run-1',organizationId:'school-a',activityId:'activity-1',activityTitle:'校园观察',runTitle:'观察一',studentReference:'观察编号',status:'ASSIGNED',deadline:null,consentRequired:false,consentPurpose:null,consentVisibility:null}
const page=(list:unknown[]=[],n=1)=>({list,page:n,total:2,hasMore:n===1,truncated:false})

describe('School task GET read recovery',()=>{
  it.each(['student','teacher','parent'] as const)('%s has mutually exclusive pending, error and confirmed empty states, with GET-only retry',async(kind)=>{
    const pending=deferred<unknown>()
    const listRead=vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(page())
    const api=vi.fn((path:string)=>path==='/my/student-reference'?Promise.resolve({reference:'ref'}):listRead())
    const typed=api as unknown as SchoolApi
    render(kind==='student'?<SchoolStudentTasks api={typed}/>:kind==='teacher'?<SchoolTeacherTasks api={typed} organizationId="school-a"/>:<SchoolParentTasks api={typed}/>)
    expect(screen.getByRole('status')).toHaveTextContent(/正在/)
    expect(screen.queryByText(/目前没有|暂无需要/)).not.toBeInTheDocument()
    await act(async()=>pending.reject(Error('GET failed')))
    expect(screen.getByRole('alert')).toHaveTextContent('GET failed')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText(/目前没有|暂无需要/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:/重试读取/}))
    expect(await screen.findByText(/目前没有|暂无需要/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(listRead).toHaveBeenCalledTimes(2)
    expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
  })
  it('preserves the student draft and committed page, deduplicates paging, and retries the failed target page',async()=>{
    const next=deferred<unknown>()
    const listRead=vi.fn().mockResolvedValueOnce(page([task])).mockReturnValueOnce(next.promise).mockResolvedValueOnce(page([{...task,id:'task-2',title:'练习二'}],2))
    const api=vi.fn((path:string)=>{
      if(path==='/my/student-reference')return Promise.resolve({reference:'ref'})
      if(path.startsWith('/my/activity-tasks'))return listRead()
      if(path==='/activities/activity-1/assignments/task-1')return Promise.resolve({id:task.id,title:'练习详情',mySubmission:{content:'已有答案',status:'DRAFT'}})
      throw Error('Unexpected path '+path)
    })
    render(<SchoolStudentTasks api={api as unknown as SchoolApi}/>)
    fireEvent.click(await screen.findByRole('button',{name:'查看活动任务'}))
    const answer=await screen.findByRole('textbox',{name:'你的回答'})
    fireEvent.change(answer,{target:{value:'未提交的补充答案'}})
    fireEvent.click(screen.getByText('查看任务列表'))
    const nextButton=screen.getByRole('button',{name:'下一页'})
    fireEvent.click(nextButton);fireEvent.click(nextButton)
    expect(listRead).toHaveBeenCalledTimes(2)
    expect(nextButton).toBeDisabled()
    await act(async()=>next.reject(Error('page failed')))
    expect(screen.getByText(/第 1 页/)).toBeInTheDocument()
    expect(screen.getByRole('heading',{name:'练习一'})).toBeInTheDocument()
    expect(answer).toHaveValue('未提交的补充答案')
    fireEvent.click(screen.getByRole('button',{name:'重试读取待办'}))
    expect(await screen.findByText(/第 2 页/)).toBeInTheDocument()
    expect(answer).toHaveValue('未提交的补充答案')
    expect(api.mock.calls.filter(([path])=>path==='/my/activity-tasks?page=2&pageSize=25')).toHaveLength(2)
    expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
  })
  it('ignores an old organization response after the teacher changes organization',async()=>{
    const old=deferred<unknown>()
    const api=vi.fn((path:string)=>path.endsWith('school-a')?old.promise:Promise.resolve({list:[{...run,executionId:'new-exec',runTitle:'新校任务'}],truncated:false}))
    const view=render(<SchoolTeacherTasks api={api as unknown as SchoolApi} organizationId="school-a"/>)
    view.rerender(<SchoolTeacherTasks api={api as unknown as SchoolApi} organizationId="school-b"/>)
    expect(await screen.findByText('新校任务')).toBeInTheDocument()
    await act(async()=>old.resolve({list:[run],truncated:false}))
    expect(screen.queryByText('观察一')).not.toBeInTheDocument()
    expect(screen.getByText('新校任务')).toBeInTheDocument()
  })
  it.each(['teacher','parent'] as const)('%s refresh failure and retry preserve the open runner and its answers',async(kind)=>{
    const api=vi.fn().mockResolvedValueOnce({list:[run],truncated:false}).mockRejectedValueOnce(Error('refresh failed')).mockResolvedValueOnce({list:[run],truncated:false})
    render(kind==='teacher'?<SchoolTeacherTasks api={api as SchoolApi} organizationId="school-a"/>:<SchoolParentTasks api={api as SchoolApi}/>)
    fireEvent.click(await screen.findByRole('button',{name:/开始／继续/}))
    const answer=screen.getByRole('textbox',{name:'runner answer'})
    fireEvent.change(answer,{target:{value:'保留观察作答'}})
    fireEvent.click(screen.getByText('查看任务列表'))
    fireEvent.click(screen.getByRole('button',{name:/刷新/}))
    expect(await screen.findByRole('alert')).toHaveTextContent('refresh failed')
    expect(answer).toHaveValue('保留观察作答')
    fireEvent.click(screen.getByRole('button',{name:/重试读取/}))
    await waitFor(()=>expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByRole('textbox',{name:'runner answer'})).toBe(answer)
    expect(answer).toHaveValue('保留观察作答')
    expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
  })

  it('ignores old student task details after the actor changes',async()=>{
    const details=deferred<unknown>()
    const apiA=vi.fn((path:string)=>path==='/my/student-reference'?Promise.resolve({reference:'old-ref'}):path.startsWith('/my/activity-tasks')?Promise.resolve(page([task])):details.promise)
    const apiB=vi.fn(async(path:string)=>path==='/my/student-reference'?{reference:'new-ref'}:page())
    const view=render(<SchoolStudentTasks api={apiA as unknown as SchoolApi}/>)
    fireEvent.click(await screen.findByRole('button',{name:'查看活动任务'}))
    view.rerender(<SchoolStudentTasks api={apiB as unknown as SchoolApi}/>)
    expect(await screen.findByText(/目前没有开放给你的活动/)).toBeInTheDocument()
    await act(async()=>details.resolve({id:task.id,title:'旧账号私有详情',mySubmission:{content:'旧账号答案',status:'DRAFT'}}))
    expect(screen.queryByText('旧账号私有详情')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
  it.each(['student','parent'] as const)('%s rejects stale responses when the API actor changes',async(kind)=>{
    const old=deferred<unknown>()
    const apiA=vi.fn((path:string)=>path==='/my/student-reference'?Promise.resolve({reference:'old-ref'}):old.promise)
    const apiB=vi.fn(async(path:string)=>path==='/my/student-reference'?{reference:'new-ref'}:page())
    const component=(api:SchoolApi)=>kind==='student'?<SchoolStudentTasks api={api}/>:<SchoolParentTasks api={api}/>
    const view=render(component(apiA as unknown as SchoolApi))
    view.rerender(component(apiB as unknown as SchoolApi))
    expect(await screen.findByText(/目前没有|暂无需要/)).toBeInTheDocument()
    await act(async()=>old.resolve(page([kind==='student'?task:run])))
    expect(screen.queryByText('练习一')).not.toBeInTheDocument()
    expect(screen.queryByText('观察一')).not.toBeInTheDocument()
  })
})

describe('School parent relationship GET recovery',()=>{
  it('retries only relationship and consent reads without sending a claim or losing entered code',async()=>{
    const pending=deferred<unknown>()
    const reads=vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce({list:[],truncated:false,canApprove:false})
    const api=vi.fn((path:string)=>path==='/parent-links'?reads():Promise.resolve({version:'v1',text:'关系确认',reminder:'独立报告授权'}))
    render(<SchoolParentLinks api={api as unknown as SchoolApi} role="PARENT"/>)
    expect(screen.getByRole('status')).toHaveTextContent('正在读取家校关系')
    expect(screen.queryByText('目前没有亲子关联记录。')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox'),{target:{value:'abcdefghijklmnopqrstuvwx'}})
    await act(async()=>pending.reject(Error('link read failed')))
    expect(screen.getByRole('alert')).toHaveTextContent('link read failed')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'重试读取关系'}))
    expect(await screen.findByText('目前没有亲子关联记录。')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('abcdefghijklmnopqrstuvwx')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(api.mock.calls.every(call=>call.length===1&&['/parent-links','/parent-links/consent'].includes(call[0]))).toBe(true)
  })
  it('does not use stale consent or old links after changing organization',async()=>{
    const oldLinks=deferred<unknown>(),oldConsent=deferred<unknown>()
    let count=0
    const api=vi.fn((path:string)=>{
      count++
      if(count<=2)return path==='/parent-links'?oldLinks.promise:oldConsent.promise
      return Promise.resolve(path==='/parent-links'?{list:[],truncated:false,canApprove:true}:{version:'new',text:'新校确认说明',reminder:'new'})
    })
    const view=render(<SchoolParentLinks api={api as unknown as SchoolApi} role="STUDENT" organizationId="school-a"/>)
    view.rerender(<SchoolParentLinks api={api as unknown as SchoolApi} role="STUDENT" organizationId="school-b"/>)
    expect(await screen.findByText('目前没有亲子关联记录。')).toBeInTheDocument()
    await act(async()=>{
      oldLinks.resolve({list:[{id:'old-link',status:'PENDING',approvedAt:null}],truncated:false,canApprove:true})
      oldConsent.resolve({version:'old',text:'旧校确认说明',reminder:'old'})
    })
    expect(screen.queryByRole('button',{name:'确认监护人关系'})).not.toBeInTheDocument()
    expect(screen.queryByText('旧校确认说明')).not.toBeInTheDocument()
    expect(screen.getByText('新校确认说明')).toBeInTheDocument()
  })
})
