import {describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,within,waitFor} from '@testing-library/react'
import {SchoolParentTasks} from './SchoolParentTasks'
import type {SchoolApi} from './SchoolRecovery'
const runner=vi.hoisted(()=>vi.fn())
vi.mock('./SchoolCompositeRunner',()=>({SchoolCompositeRunner:(props:any)=>{runner(props);return <section aria-label="测试作答页"><p>{props.observerTaskTitle}</p><button onClick={props.onExit}>返回任务</button></section>}}))
const task={executionId:'e1',runId:'run',organizationId:'school',activityId:'activity',activityTitle:'校园活动',runTitle:'乙观察任务',status:'ASSIGNED',deadline:null,consentRequired:true,consentPurpose:'教育观察',consentVisibility:'PRIVATE_RESPONDENT'}
describe('School parent observation collection',()=>{
 it('offers collapsed search, sorting and card/list views without mutating tasks',async()=>{
  const api=vi.fn(async()=>({list:[task,{...task,executionId:'e2',runTitle:'甲观察任务',status:'COMPLETED'}]}))
  const view=render(<SchoolParentTasks api={api as SchoolApi}/>)
  await screen.findByRole('heading',{name:'乙观察任务'})
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'检索家长观察任务'}))
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'甲'}})
  fireEvent.submit(screen.getByRole('search'))
  expect(screen.queryByRole('heading',{name:'乙观察任务'})).not.toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'甲观察任务'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'清空检索'}))
  fireEvent.change(screen.getByRole('combobox',{name:'排序'}),{target:{value:'title'}})
  expect(screen.getAllByRole('article').map(el=>within(el).getByRole('heading').textContent)).toEqual(['甲观察任务','乙观察任务'])
  fireEvent.click(screen.getByRole('button',{name:'卡片视图'}))
  expect(view.container.querySelector('.hs-parent-task-list--cards')).toBeInTheDocument()
  expect(within(screen.getByRole('heading',{name:'甲观察任务'}).closest('article')!).queryByRole('button')).not.toBeInTheDocument()
  expect(api.mock.calls).toEqual([['/my/parent-run-tasks']])
 })
 it('passes the unchanged execution binding into the parent observer presentation and returns to the same inbox',async()=>{
  const api=vi.fn(async()=>({list:[{...task,status:'STARTED',canResumeExisting:true}]}))
  render(<SchoolParentTasks api={api as SchoolApi}/>)
  fireEvent.click(await screen.findByRole('button',{name:/继续作答/}))
  await waitFor(()=>expect(runner).toHaveBeenLastCalledWith(expect.objectContaining({observer:true,observerRole:'parent',observerTaskTitle:task.runTitle,execution:{organizationId:'school',courseId:'activity',runId:'run',executionId:'e1',resumeExisting:true,consentRequired:true,consentPurpose:'教育观察',consentVisibility:'PRIVATE_RESPONDENT'}})))
  fireEvent.click(screen.getByRole('button',{name:'返回任务'}))
  expect(screen.queryByRole('region',{name:'测试作答页'})).not.toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'乙观察任务'})).toBeInTheDocument()
  expect(api.mock.calls).toEqual([['/my/parent-run-tasks']])
 })
})
