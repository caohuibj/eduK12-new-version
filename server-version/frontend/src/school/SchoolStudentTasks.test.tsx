import { describe,expect,it,vi } from 'vitest'
import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react'
import { SchoolStudentTasks } from './SchoolStudentTasks'
import type { SchoolApi } from './SchoolRecovery'

describe('Huischool student tasks remain inside the campus account realm',()=>{
  it('reads only the published respondent contract for a completed campus FINAL',async()=>{
    const executionId='00000000-0000-4000-8000-000000000042'
    const api=vi.fn(async(path:string)=>{
      if(path.startsWith('/my/activity-tasks'))return {
        list:[{id:executionId,activityId:'campus-act',activityTitle:'学习与心理支持',
          kind:'MEASUREMENT',resourceFamily:'SCALE',title:'我的学习状态',status:'COMPLETED',href:null,deadline:null}],
        total:1,page:1,hasMore:false,truncated:false,
      }
      if(path==='/reports/student/executions/'+executionId)return {
        schemaVersion:1,mode:'INDIVIDUAL_SUMMARY',state:'READY',metrics:{score:3.5,invalid:null},
      }
      throw Error('unexpected path '+path)
    })
    render(<SchoolStudentTasks api={api as unknown as SchoolApi}/>)
    fireEvent.click(await screen.findByRole('button',{name:'查看我的测评反馈'}))
    const panel=await screen.findByRole('region',{name:'获准的个人测评反馈'})
    expect(panel).toHaveTextContent('解释尚未完成科学与适龄内容审核')
    expect(panel).not.toHaveTextContent('score：3.5')
    expect(panel).not.toHaveTextContent('invalid')
    expect(api).toHaveBeenCalledWith('/reports/student/executions/'+executionId)
    expect(screen.queryByText(/原始答卷/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'关闭我的反馈'}))
    expect(screen.queryByRole('region',{name:'获准的个人测评反馈'})).not.toBeInTheDocument()
  })
  it('shows the real completed FORM task contract as a receipt without requesting a report',async()=>{
    const executionId='00000000-0000-4000-8000-000000000043'
    const api=vi.fn(async(path:string)=>{
      if(path==='/my/student-reference')return {reference:'SYNTHETIC-STUDENT'}
      if(path.startsWith('/my/activity-tasks'))return {
        list:[{id:executionId,activityId:'campus-form',activityTitle:'校园支持活动',
          kind:'MEASUREMENT',resourceFamily:'FORM',title:'本人固定版本表单',status:'COMPLETED',href:null,deadline:null}],
        total:1,page:1,hasMore:false,truncated:false,
      }
      throw Error('FORM receipt must not request a report: '+path)
    })
    render(<SchoolStudentTasks api={api as unknown as SchoolApi}/>)
    expect(await screen.findByLabelText('状态：已完成')).toBeInTheDocument()
    expect(screen.getByText('本次表单已正式提交。表单只记录作答，不计算量表分数，也不新增个人报告读取权。')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'查看我的测评反馈'})).not.toBeInTheDocument()
    expect(screen.queryByRole('region',{name:'获准的个人测评反馈'})).not.toBeInTheDocument()
    expect(api.mock.calls.every(([path])=>path.startsWith('/my/activity-tasks')||path==='/my/student-reference')).toBe(true)
    expect(api.mock.calls.filter(([path])=>path.startsWith('/reports/'))).toHaveLength(0)
  })
  it.each([true,false])('keeps task identity through a delayed reversed refresh (FORM first: %s)',async formFirst=>{
    const formId='00000000-0000-4000-8000-000000000043',scaleId='00000000-0000-4000-8000-000000000042'
    const common={activityId:'same-activity',activityTitle:'同一活动',kind:'MEASUREMENT',title:'相同显示标题',status:'COMPLETED',href:null,deadline:null}
    const form={...common,id:formId,resourceFamily:'FORM'},scale={...common,id:scaleId,resourceFamily:'SCALE'}
    const initial=formFirst?[form,scale]:[scale,form]
    const page=(list:unknown[])=>({list,total:2,page:1,hasMore:false,truncated:false})
    let resolveRefresh!:(value:ReturnType<typeof page>)=>void
    const pending=new Promise<ReturnType<typeof page>>(resolve=>{resolveRefresh=resolve})
    let reads=0
    const api=vi.fn(async(path:string)=>{
      if(path==='/my/student-reference')return {reference:'SYNTHETIC-STUDENT'}
      if(path.startsWith('/my/activity-tasks'))return ++reads===1?page(initial):pending
      throw Error('Unexpected request '+path)
    })
    const {container}=render(<SchoolStudentTasks api={api as unknown as SchoolApi}/>)
    const card=(id:string)=>container.querySelector(`article.hs-task-card[data-task-id="${id}"]`) as HTMLElement
    const assertIdentity=()=>{
      expect(card(formId)).toHaveTextContent('本次表单已正式提交')
      expect(within(card(formId)).queryByRole('button',{name:'查看我的测评反馈'})).not.toBeInTheDocument()
      expect(within(card(scaleId)).getByRole('button',{name:'查看我的测评反馈'})).toBeInTheDocument()
    }
    await waitFor(()=>expect(card(formId)).not.toBeNull())
    assertIdentity()
    fireEvent.click(screen.getByRole('button',{name:'刷新待办'}))
    expect(screen.getByRole('button',{name:'正在读取…'})).toBeDisabled()
    // The API's next ordering is known while the DOM intentionally retains the old list.
    assertIdentity()
    await act(async()=>{resolveRefresh(page([...initial].reverse()));await pending})
    await waitFor(()=>expect(container.querySelector('article.hs-task-card')).toHaveAttribute('data-task-id',initial[1].id))
    assertIdentity()
    expect(api.mock.calls.filter(([path])=>path.startsWith('/reports/'))).toHaveLength(0)
  })
  it('shows only server-authorized tasks and submits through campus path',async()=>{
    const execute=vi.fn(async(path:string,method:string='GET')=>{
      if(path.startsWith('/my/activity-tasks'))return {
        list:[{id:'task-1',activityId:'school-activity',activityTitle:'情绪练习',
          kind:'READING',title:'阅读班级支持指南',status:'PENDING',href:'safe',
          deadline:null}],
        total:1,hasMore:false,truncated:false,page:1,
      }
      if(path==='/activities/school-activity/assignments/task-1'&&method==='GET')
        return {id:'task-1',title:'阅读班级支持指南',content:'试着描述一个能够支持你的朋友。'}
      if(path==='/activities/school-activity/assignments/task-1/submit'&&method==='POST')
        return {id:'submitted'}
      throw new Error('unexpected campus task API: '+path)
    })
    render(<SchoolStudentTasks api={execute as unknown as SchoolApi}/>)
    expect(await screen.findByText('阅读班级支持指南')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'查看阅读材料'}))
    expect(await screen.findByText('试着描述一个能够支持你的朋友。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'确认已阅读'}))
    await waitFor(()=>expect(execute).toHaveBeenCalledWith(
      '/activities/school-activity/assignments/task-1/submit','POST',
      {content:'已阅读'},
    ))
    expect(execute.mock.calls.every(call=>call[0].startsWith('/'))).toBe(true)
    expect(execute.mock.calls.some(call=>call[0].includes('/api/auth'))).toBe(false)
  })
})

it('shows an existing completed activity response without offering editable unsavable text',async()=>{
 const api=vi.fn(async(path:string)=>path==='/my/student-reference'?{reference:'test'}:path.startsWith('/my/activity-tasks')?
  {list:[{id:'done',activityId:'activity',activityTitle:'校园活动',kind:'READING',title:'已读材料',status:'COMPLETED',href:'safe',deadline:null}],total:1,page:1,hasMore:false,truncated:false}:
  {id:'done',title:'已读材料',content:'阅读正文',mySubmission:{content:'已有阅读感受',status:'SUBMITTED'}})
 render(<SchoolStudentTasks api={api as unknown as SchoolApi}/>)
 fireEvent.click(await screen.findByRole('button',{name:'查看阅读材料'}))
 expect(await screen.findByRole('heading',{name:'我的提交'})).toBeInTheDocument()
 expect(screen.getByRole('textbox',{name:'阅读感受（选填）'})).toHaveAttribute('readonly')
 expect(screen.getByRole('textbox',{name:'阅读感受（选填）'})).toHaveValue('已有阅读感受')
 expect(screen.getByRole('button',{name:'确认已阅读'})).toBeDisabled()
 expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
})

it('keeps typed answers on submission failure and returns focus to the inbox without posting again',async()=>{
 const api=vi.fn(async(path:string,method?:string)=>{
  if(path==='/my/student-reference')return {reference:'test'}
  if(path.startsWith('/my/activity-tasks'))return {list:[{id:'task',activityId:'activity',activityTitle:'校园活动',kind:'ASSIGNMENT',title:'校园记录',status:'PENDING',href:'safe',deadline:null}],total:1,page:1,hasMore:false,truncated:false}
  if(method==='POST')throw Error('本次提交暂未成功，请重试')
  return {id:'task',title:'校园记录',content:'记录一次校园活动'}
 })
 render(<SchoolStudentTasks api={api as unknown as SchoolApi}/>)
 fireEvent.click(await screen.findByRole('button',{name:'查看活动任务'}))
 const field=await screen.findByRole('textbox',{name:'你的回答'})
 fireEvent.change(field,{target:{value:'保留这份活动记录'}})
 fireEvent.click(screen.getByRole('button',{name:'提交活动记录'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('本次提交暂未成功，请重试')
 expect(field).toHaveValue('保留这份活动记录')
 fireEvent.click(screen.getByRole('button',{name:'返回活动'}))
 expect(screen.getByRole('heading',{name:'我的校园任务'})).toHaveFocus()
 expect(api.mock.calls.filter(call=>call[1]==='POST')).toHaveLength(1)
})

it.each(['READING','ASSIGNMENT','CHECKIN'] as const)('uses fresh detail to lock a stale pending %s task',async kind=>{
 const api=vi.fn(async(path:string)=>path==='/my/student-reference'?{reference:'test'}:path.startsWith('/my/activity-tasks')?
  {list:[{id:'stale',activityId:'activity',activityTitle:'校园活动',kind,title:'旧页任务',status:'PENDING',href:'safe',deadline:null}],total:1,page:1,hasMore:false,truncated:false}:
  {id:'stale',title:'旧页任务',mySubmission:{content:'已保存的首次记录',status:'SUBMITTED'}})
 render(<SchoolStudentTasks api={api as unknown as SchoolApi}/>)
 fireEvent.click(await screen.findByRole('button',{name:kind==='READING'?'查看阅读材料':'查看活动任务'}))
 expect(await screen.findByRole('heading',{name:'我的提交'})).toBeInTheDocument()
 expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
 expect(screen.getByRole('textbox')).toHaveValue('已保存的首次记录')
 expect(screen.getByRole('button',{name:kind==='READING'?'确认已阅读':'提交活动记录'})).toBeDisabled()
 expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
})

it('sends only one campus task POST while a submission is pending',async()=>{
 let finish!:(value:unknown)=>void
 const pending=new Promise(resolve=>{finish=resolve})
 const api=vi.fn(async(path:string,method?:string)=>{
  if(method==='POST')return pending
  if(path==='/my/student-reference')return {reference:'test'}
  if(path.startsWith('/my/activity-tasks'))return {list:[{id:'task',activityId:'activity',activityTitle:'校园活动',kind:'ASSIGNMENT',title:'观察记录',status:'PENDING',href:'safe',deadline:null}],total:1,page:1,hasMore:false,truncated:false}
  return {id:'task',title:'观察记录'}
 })
 render(<SchoolStudentTasks api={api as unknown as SchoolApi}/>)
 fireEvent.click(await screen.findByRole('button',{name:'查看活动任务'}))
 const submit=await screen.findByRole('button',{name:'提交活动记录'})
 act(()=>{fireEvent.click(submit);fireEvent.click(submit)})
 expect(api.mock.calls.filter(call=>call[1]==='POST')).toHaveLength(1)
 expect(screen.getByRole('button',{name:'正在提交…'})).toBeDisabled()
 await act(async()=>{finish({id:'saved'});await pending})
 expect(await screen.findByText('提交成功。感谢你完成今天的校园活动。')).toHaveAttribute('role','status')
})

it('navigates task breadcrumbs in-app only for ordinary clicks and rereads an explicit activity scope',async()=>{
 const api=vi.fn(async(path:string)=>path==='/my/student-reference'?{reference:'SYNTHETIC'}:{list:[],total:0,page:1,hasMore:false,truncated:false})
 const onNavigate=vi.fn()
 // Observe the host's decision before suppressing jsdom's unsupported native navigation.
 const click=(link:HTMLElement,options:Record<string,unknown>={button:0})=>{
  let prevented=false
  document.addEventListener('click',event=>{prevented=event.defaultPrevented;event.preventDefault()},{once:true})
  fireEvent.click(link,options);return prevented
 }
 const view=render(<SchoolStudentTasks api={api as unknown as SchoolApi} activityId="first activity" onNavigate={onNavigate}/>)
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/my/activity-tasks?page=1&pageSize=25&activityId=first%20activity'))
 const overview=screen.getByRole('link',{name:'返回概览'}),all=screen.getByRole('link',{name:'查看全部任务'})
 expect(overview).toHaveAttribute('href','/workspace');expect(all).toHaveAttribute('href','/workspace/tasks')
 expect(click(overview)).toBe(true)
 expect(onNavigate).toHaveBeenLastCalledWith('overview')
 expect(click(all)).toBe(true)
 expect(onNavigate).toHaveBeenLastCalledWith('tasks')
 for(const modifier of ['metaKey','ctrlKey','shiftKey','altKey'])expect(click(all,{button:0,[modifier]:true})).toBe(false)
 expect(click(all,{button:1})).toBe(false)
 expect(onNavigate).toHaveBeenCalledTimes(2)
 view.rerender(<SchoolStudentTasks api={api as unknown as SchoolApi} activityId="second" onNavigate={onNavigate}/>)
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/my/activity-tasks?page=1&pageSize=25&activityId=second'))
 view.rerender(<SchoolStudentTasks api={api as unknown as SchoolApi}/> )
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/my/activity-tasks?page=1&pageSize=25'))
 expect(screen.queryByRole('link',{name:'查看全部任务'})).not.toBeInTheDocument()
 expect(click(screen.getByRole('link',{name:'返回概览'}))).toBe(false)
 expect(onNavigate).toHaveBeenCalledTimes(2)
})
