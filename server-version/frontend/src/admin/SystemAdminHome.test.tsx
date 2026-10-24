import {render,screen} from '@testing-library/react'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import {describe,it,expect,vi} from 'vitest'
import SystemAdminHome from './SystemAdminHome'
import AdminAccess from './AdminAccess'
import {adminReturnTo} from './authority'
import type {User} from '../types'
const mock=vi.hoisted(()=>({user:{id:'system',username:'system_admin',role:'STUDENT',platformRole:'SYSTEM_ADMIN',entryGrants:[]} as User}))
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:mock.user,isLoading:false})}))
describe('system workbench scope',()=>{
 it('opens the first working tab directly without a duplicate landing page',()=>{
  render(<MemoryRouter initialEntries={['/admin/system']}><Routes><Route path="/admin/system" element={<SystemAdminHome/>}/><Route path="/admin/permissions" element={<h1>管理授权内容</h1>}/></Routes></MemoryRouter>)
  expect(screen.getByRole('heading',{name:'管理授权内容'})).toBeVisible()
  expect(screen.queryByRole('heading',{name:'系统管理工作台'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'查阅 Survey 项目'})).not.toBeInTheDocument()
 })
 it('preserves system deep links while rejecting Survey-only return targets',()=>{
  const user=mock.user
  expect(adminReturnTo(user,null)).toBe('/admin/system')
  expect(adminReturnTo(user,'/admin/permissions')).toBe('/admin/permissions')
  expect(adminReturnTo(user,'/admin/system/survey-audit')).toBe('/admin/system/survey-audit')
  expect(adminReturnTo(user,'/admin/survey-researchers')).toBe('/admin/system')
  expect(adminReturnTo(user,'https://invalid.test/admin/system')).toBe('/admin/system')
 })
 it('keeps the system workbench protected from an independent Survey manager',()=>{
  mock.user={id:'survey',username:'survey_local_admin',role:'STUDENT',platformRole:'STANDARD',entryGrants:[{entry:'SURVEY',version:1}]} as User
  render(<MemoryRouter><AdminAccess system><SystemAdminHome/></AdminAccess></MemoryRouter>)
  expect(screen.getByText('当前账号没有此入口的管理权限')).toBeVisible()
  expect(screen.queryByRole('heading',{name:'系统管理工作台'})).not.toBeInTheDocument()
 })
})
