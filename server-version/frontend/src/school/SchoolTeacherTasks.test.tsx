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
      if(path==='/my/teacher-run-tasks?organizationId=school-a')return {
        list:[{executionId:'exec-1',runId:'run-1',activityId:'activity-1',
          organizationId:'school-a',activityTitle:'班级支持',runTitle:'观察学生',
          studentReference:'林-123456789ABC',status:'ASSIGNED',deadline:null,
          consentRequired:false,consentPurpose:null,consentVisibility:null}],
        truncated:false,
      }
      throw Error('unexpected API '+path)
    })
    render(<SchoolTeacherTasks api={api as unknown as SchoolApi} organizationId="school-a"/>)
    expect(await screen.findByText('林-123456789ABC')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('PRIVATE_LOGIN_NAME')
    fireEvent.click(screen.getByRole('button',{name:'开始／继续教师观察测评'}))
    expect(await screen.findByRole('region',{name:'official campus runner'})).toHaveTextContent('exec-1')
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/my/teacher-run-tasks?organizationId=school-a'))
  })
  it('does not invent work when no authorized tasks are returned',async()=>{
    const api=vi.fn(async()=>({list:[],truncated:false}))
    render(<SchoolTeacherTasks api={api as unknown as SchoolApi} organizationId="school-a"/>)
    expect(await screen.findByText(/目前没有可作答的教师观察任务/)).toBeInTheDocument()
  })
})

it('filters and sorts only returned tasks, retaining execution identity after changing view',async()=>{
  const entry={runId:'run-1',activityId:'activity-1',organizationId:'school-a',activityTitle:'班级支持',studentReference:'林-123456789ABC',status:'ASSIGNED',deadline:null,consentRequired:false,consentPurpose:null,consentVisibility:null}
  const api=vi.fn(async()=>({list:[{...entry,executionId:'exec-z',runTitle:'Z 观察'},{...entry,executionId:'exec-a',runTitle:'A 观察'}],truncated:true}))
  render(<SchoolTeacherTasks api={api as unknown as SchoolApi} organizationId="school-a"/>)
  await screen.findByRole('heading',{name:'Z 观察'})
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox',{name:'排序'}),{target:{value:'title'}})
  expect(screen.getAllByRole('article').map(node=>node.getAttribute('data-execution-id'))).toEqual(['exec-a','exec-z'])
  fireEvent.click(screen.getByRole('button',{name:'卡片视图'}))
  expect(screen.getByRole('button',{name:'卡片视图'})).toHaveAttribute('aria-pressed','true')
  fireEvent.click(screen.getByRole('button',{name:'检索观察任务'}))
  fireEvent.change(screen.getByRole('searchbox',{name:'检索观察任务'}),{target:{value:'Z 观察'}})
  fireEvent.submit(screen.getByRole('search'))
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByText(/检索和排序仅作用于当前已加载任务/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'开始／继续教师观察测评'}))
  expect(await screen.findByRole('region',{name:'official campus runner'})).toHaveTextContent('exec-z')
  expect(api).toHaveBeenCalledTimes(1)
})


it('keeps compact observation guidance on demand and dismisses it without changing tasks',async()=>{
 const api=vi.fn(async()=>({list:[],truncated:false}))
 render(<SchoolTeacherTasks compact api={api as unknown as SchoolApi} organizationId="school-a"/>)
 await screen.findByText(/目前没有可作答的教师观察任务/)
 const toggle=screen.getByRole('button',{name:'观察任务与隐私说明'})
 expect(toggle).toHaveAttribute('aria-expanded','false')
 expect(screen.queryByRole('note')).not.toBeInTheDocument()
 fireEvent.click(toggle)
 expect(screen.getByRole('note')).toHaveTextContent('不显示登录名')
 fireEvent.mouseLeave(toggle.parentElement!)
 expect(screen.queryByRole('note')).not.toBeInTheDocument()
 fireEvent.click(toggle)
 fireEvent.scroll(document)
 expect(screen.queryByRole('note')).not.toBeInTheDocument()
 fireEvent.click(toggle)
 fireEvent.pointerDown(document.body)
 expect(screen.queryByRole('note')).not.toBeInTheDocument()
 fireEvent.click(toggle)
 fireEvent.keyDown(toggle,{key:'Escape'})
 expect(screen.queryByRole('note')).not.toBeInTheDocument()
 expect(toggle).toHaveFocus()
 expect(api).toHaveBeenCalledTimes(1)
})
