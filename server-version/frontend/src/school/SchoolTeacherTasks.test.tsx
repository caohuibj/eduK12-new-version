import { describe,expect,it,vi } from 'vitest'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { SchoolTeacherTasks } from './SchoolTeacherTasks'
import type { SchoolApi } from './SchoolRecovery'

vi.mock('./SchoolCompositeRunner',()=>({
  SchoolCompositeRunner:({execution}:{execution:{executionId:string}})=>
    <div role="region" aria-label="official campus runner">正式测评 {execution.executionId}</div>,
}))
describe('Huischool teacher observation inbox',()=>{
  it('shows only a pseudonymous observation task and enters the campus runner',async()=>{
    const api=vi.fn(async(path:string)=>{
      if(path==='/my/teacher-run-tasks')return {
        list:[{executionId:'exec-1',runId:'run-1',activityId:'activity-1',
          organizationId:'school-a',activityTitle:'班级支持',runTitle:'观察学生',
          studentReference:'林-123456789ABC',status:'ASSIGNED',deadline:null,
          consentRequired:false,consentPurpose:null,consentVisibility:null}],
        truncated:false,
      }
      throw Error('unexpected API '+path)
    })
    render(<SchoolTeacherTasks api={api as unknown as SchoolApi}/>)
    expect(await screen.findByText('林-123456789ABC')).toBeInTheDocument()
    expect(screen.queryByText(/登录名|PRIVATE_LOGIN_NAME|原始答案/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'开始／继续教师观察测评'}))
    expect(screen.getByRole('region',{name:'official campus runner'})).toHaveTextContent('exec-1')
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/my/teacher-run-tasks'))
  })
  it('does not invent work when no authorized tasks are returned',async()=>{
    const api=vi.fn(async()=>({list:[],truncated:false}))
    render(<SchoolTeacherTasks api={api as unknown as SchoolApi}/>)
    expect(await screen.findByText(/目前没有可作答的教师观察任务/)).toBeInTheDocument()
  })
})
