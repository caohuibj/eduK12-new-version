import {describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,within} from '@testing-library/react'
import {SchoolWorkspaceShell,SchoolWorkspaceOverview} from './SchoolWorkspaceShell'
import {schoolNavigation,type SchoolAccess} from './school-navigation'
const teacher:SchoolAccess={orgRole:'MEMBER',canGovern:false,personas:['TEACHER'],capabilities:[],explicitDenies:[]}
const counselor:SchoolAccess={...teacher,personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF','PARENT_REPORT_DISCLOSURE']}
const ids=(role:string,access:SchoolAccess|null,status='APPROVED',reports=true)=>schoolNavigation(role,status,access,reports).map(i=>i.id)
describe('campus page navigation boundaries',()=>{
 it('keeps ordinary teacher, psychology and governance entry permissions independent',()=>{
  expect(ids('TEACHER',teacher)).toContain('tasks')
  expect(ids('TEACHER',teacher)).not.toEqual(expect.arrayContaining(['protected-reports']))
  expect(ids('TEACHER',teacher)).not.toContain('staff')
  expect(ids('TEACHER',teacher)).not.toContain('classes')
  expect(ids('TEACHER',counselor)).toContain('protected-reports')
  expect(ids('TEACHER',counselor)).toContain('classes')
  expect(ids('TEACHER',counselor)).not.toContain('staff')
  const admin={...teacher,personas:[],orgRole:'ORG_ADMIN',canGovern:true}
  expect(ids('ADMIN',admin)).toContain('staff')
  expect(ids('ADMIN',admin)).not.toContain('protected-reports')
 })
 it('honors explicit denies, approval and parent-report availability',()=>{
  expect(ids('TEACHER',{...counselor,explicitDenies:['ORG_PROTECTED_FEEDBACK_V1']})).not.toContain('protected-reports')
  expect(ids('TEACHER',{...counselor,explicitDenies:['*']})).not.toContain('report-review')
  expect(ids('TEACHER',{...counselor,explicitDenies:['CLASS_APPROVE']})).not.toContain('classes')
  expect(ids('STUDENT',null,'PENDING_CLASS_APPROVAL')).toEqual(['overview','account'])
  expect(ids('PARENT',null,'APPROVED',false)).not.toContain('parent-reports')
 })
 it('does not mount the supplied sensitive page when its deep link is unavailable',()=>{
  render(<SchoolWorkspaceShell items={schoolNavigation('TEACHER','',teacher,true)} page="protected-reports" onNavigate={vi.fn()}><h2>Private report content</h2></SchoolWorkspaceShell>)
  expect(screen.queryByText('Private report content')).not.toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'当前无法进入此功能'})).toBeInTheDocument()
 })
 it('closes compact navigation with Escape and returns focus to its toggle',()=>{
  render(<SchoolWorkspaceShell items={schoolNavigation('PARENT','',null,true)} page="overview" onNavigate={vi.fn()}><h1>概览</h1></SchoolWorkspaceShell>)
  const toggle=screen.getByRole('button',{name:'功能导航'})
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded','true')
  fireEvent.keyDown(screen.getByRole('navigation',{name:'工作台功能导航'}),{key:'Escape'})
  expect(toggle).toHaveAttribute('aria-expanded','false')
  expect(toggle).toHaveFocus()
 })
})


describe('campus overview shortcuts',()=>{
 it('pairs each card title and destination with an authorized item, prioritizing activities over private tools',()=>{
  const items=schoolNavigation('TEACHER','',teacher,true,true)
  const navigate=vi.fn()
  render(<SchoolWorkspaceOverview username="Teacher" items={items} onNavigate={navigate}/>)
  const activity=screen.getByRole('heading',{name:'活动管理'}).closest('a')!
  expect(activity).toHaveAttribute('href','/workspace/activities')
  fireEvent.click(activity)
  expect(navigate).toHaveBeenCalledWith('activities')
  const tools=screen.getByRole('heading',{name:'我的工具'}).closest('a')!
  expect(tools).toHaveAttribute('href','/workspace/private-tools')
  for(const link of screen.getAllByRole('link')){
   const label=within(link).getByRole('heading').textContent
   const item=items.find(candidate=>candidate.label===label)!
   expect(item).toBeDefined()
   expect(link).toHaveAttribute('href',item.id==='overview'?'/workspace':`/workspace/${item.id}`)
  }
 })
 it('keeps pending students out of protected functions without duplicating banner navigation',()=>{
  render(<SchoolWorkspaceShell items={schoolNavigation('STUDENT','PENDING_CLASS_APPROVAL',null,true)} page="overview" onNavigate={vi.fn()}><SchoolWorkspaceOverview username="Student" items={schoolNavigation('STUDENT','PENDING_CLASS_APPROVAL',null,true)} onNavigate={vi.fn()} pending={<p>等待学校审批</p>}/></SchoolWorkspaceShell>)
  expect(screen.getByText('等待学校审批')).toBeInTheDocument()
  expect(screen.queryByRole('navigation',{name:'工作台功能导航'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'功能导航'})).not.toBeInTheDocument()
  expect(screen.queryByRole('region',{name:'可用功能'})).not.toBeInTheDocument()
  expect(screen.queryAllByRole('link')).toHaveLength(0)
  expect(screen.queryByRole('heading',{name:'我的校园任务'})).not.toBeInTheDocument()
 })
 it('does not invent an account entry when none is supplied',()=>{
  const items=schoolNavigation('TEACHER','',teacher,true).filter(item=>item.id!=='account')
  render(<SchoolWorkspaceOverview username="Teacher" items={items} onNavigate={vi.fn()}/>)
  expect(screen.getAllByRole('link').some(link=>link.getAttribute('href')==='/workspace/account')).toBe(false)
 })
 it('retains the page h1, description, school context and return navigation in its compact header',()=>{
  const items=schoolNavigation('TEACHER','',teacher,true)
  const navigate=vi.fn()
  render(<SchoolWorkspaceShell items={items} page="activities" onNavigate={navigate} context={<p>当前学校：学校 a</p>}><h2>已授权活动</h2></SchoolWorkspaceShell>)
  expect(screen.getByRole('heading',{level:1,name:'活动管理'})).toBeInTheDocument()
  expect(screen.getByText(items.find(item=>item.id==='activities')!.description)).toBeInTheDocument()
  expect(screen.getByText('当前学校：学校 a')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link',{name:'返回概览'}))
  expect(navigate).toHaveBeenCalledWith('overview')
 })
})

it('keeps compact teacher navigation authorized and retains the page heading',()=>{
 const items=schoolNavigation('TEACHER','',teacher,true)
 const {rerender}=render(<SchoolWorkspaceShell compactNavigation items={items} page="activities" onNavigate={vi.fn()}><p>教师活动内容</p></SchoolWorkspaceShell>)
 expect(screen.queryByRole('navigation',{name:'工作台功能导航'})).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'功能导航'})).not.toBeInTheDocument()
 expect(screen.getByRole('heading',{level:1,name:'活动管理'})).toBeInTheDocument()
 rerender(<SchoolWorkspaceShell compactNavigation items={items} page="staff" onNavigate={vi.fn()}><p>不应挂载的人员数据</p></SchoolWorkspaceShell>)
 expect(screen.queryByText('不应挂载的人员数据')).not.toBeInTheDocument()
 expect(screen.getByText('当前无法进入此功能')).toBeInTheDocument()
})
