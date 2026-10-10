import { describe,expect,it,vi } from 'vitest'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { SchoolStudentTasks } from './SchoolStudentTasks'
import type { SchoolApi } from './SchoolRecovery'

describe('Huischool student tasks remain inside the campus account realm',()=>{
  it('reads only the published respondent contract for a completed campus FINAL',async()=>{
    const executionId='00000000-0000-4000-8000-000000000042'
    const api=vi.fn(async(path:string)=>{
      if(path.startsWith('/my/activity-tasks'))return {
        list:[{id:executionId,activityId:'campus-act',activityTitle:'学习与心理支持',
          kind:'MEASUREMENT',title:'我的学习状态',status:'COMPLETED',href:null,deadline:null}],
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
