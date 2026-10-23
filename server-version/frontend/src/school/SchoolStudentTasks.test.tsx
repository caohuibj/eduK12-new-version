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
    expect(await screen.findByText('状态：已完成')).toBeInTheDocument()
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
