import {describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent} from '@testing-library/react'
import {SchoolWorkspaceShell} from './SchoolWorkspaceShell'
import {schoolNavigation,type SchoolAccess} from './school-navigation'
const teacher:SchoolAccess={orgRole:'MEMBER',canGovern:false,personas:['TEACHER'],capabilities:[],explicitDenies:[]}
const counselor:SchoolAccess={...teacher,personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF','PARENT_REPORT_DISCLOSURE']}
const ids=(role:string,access:SchoolAccess|null,status='APPROVED',reports=true)=>schoolNavigation(role,status,access,reports).map(i=>i.id)
describe('campus page navigation boundaries',()=>{
 it('keeps ordinary teacher, psychology and governance entry permissions independent',()=>{
  expect(ids('TEACHER',teacher)).toContain('tasks')
  expect(ids('TEACHER',teacher)).not.toEqual(expect.arrayContaining(['protected-reports']))
  expect(ids('TEACHER',teacher)).not.toContain('staff')
  expect(ids('TEACHER',counselor)).toContain('protected-reports')
  expect(ids('TEACHER',counselor)).not.toContain('staff')
  const admin={...teacher,personas:[],orgRole:'ORG_ADMIN',canGovern:true}
  expect(ids('ADMIN',admin)).toContain('staff')
  expect(ids('ADMIN',admin)).not.toContain('protected-reports')
 })
 it('honors explicit denies, approval and parent-report availability',()=>{
  expect(ids('TEACHER',{...counselor,explicitDenies:['ORG_PROTECTED_FEEDBACK_V1']})).not.toContain('protected-reports')
  expect(ids('TEACHER',{...counselor,explicitDenies:['*']})).not.toContain('report-review')
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
