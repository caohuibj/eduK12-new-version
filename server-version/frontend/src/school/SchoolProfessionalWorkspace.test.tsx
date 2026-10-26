import {afterEach,describe,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent,within} from '@testing-library/react'
import {SchoolProfessionalHome,SchoolProfessionalNavigation} from './SchoolProfessionalWorkspace'
import {schoolNavigation,type SchoolAccess} from './school-navigation'
const access:SchoolAccess={orgRole:'MEMBER',canGovern:false,personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF'],explicitDenies:[]}
const items=schoolNavigation('TEACHER','',access,false,true)
afterEach(()=>{cleanup();window.history.replaceState(null,'','/')})
describe('School professional workspace navigation',()=>{
 it('shows every authorized destination once on the compact home and preserves the school context',()=>{
  window.history.replaceState(null,'','/workspace?organizationId=school-a')
  const navigate=vi.fn()
  const view=render(<SchoolProfessionalHome items={items} username="示例心理教师" schoolName="示例学校" onNavigate={navigate}/>)
  expect(screen.getByRole('heading',{level:1,name:'心理教师工作台'})).toBeInTheDocument()
  expect(screen.getByText('示例学校')).toBeInTheDocument()
  expect(view.container.querySelector('.hs-workspace-welcome')).toBeNull()
  const expected=items.filter(item=>!['overview','account'].includes(item.id))
  expect(screen.getAllByRole('link')).toHaveLength(expected.length)
  for(const item of expected){
   const card=screen.getByRole('heading',{name:item.label}).closest('a')!
   expect(card).toHaveAttribute('href',`/workspace/${item.id}?organizationId=school-a`)
   fireEvent.click(card)
   expect(navigate).toHaveBeenLastCalledWith(item.id)
  }
  expect(screen.queryByRole('link',{name:/人员邀请|校园关系/})).not.toBeInTheDocument()
 })
 it('uses three group links and limits the second row to the current authorized group',()=>{
  const navigate=vi.fn()
  const view=render(<SchoolProfessionalNavigation items={items} page="protected-reports" onNavigate={navigate}/>)
  const groups=within(screen.getByRole('navigation',{name:'校园功能分组'}))
  expect(groups.getAllByRole('link')).toHaveLength(3)
  expect(groups.getByRole('link',{name:'报告与支持'})).toHaveAttribute('aria-current','true')
  const reports=within(screen.getByRole('navigation',{name:'报告与支持功能入口'}))
  expect(reports.getByRole('link',{name:'保护性反馈'})).toHaveAttribute('aria-current','page')
  expect(reports.queryByRole('link',{name:'学校与班级'})).not.toBeInTheDocument()
  fireEvent.click(groups.getByRole('link',{name:'校园活动'}))
  expect(navigate).toHaveBeenLastCalledWith('activities')
  const denied=schoolNavigation('TEACHER','',{...access,explicitDenies:['ORG_PROTECTED_FEEDBACK_V1']},false,false)
  view.rerender(<SchoolProfessionalNavigation items={denied} page="protected-reports" onNavigate={navigate}/>)
  expect(screen.queryByRole('link',{name:'保护性反馈'})).not.toBeInTheDocument()
  expect(screen.queryByRole('link',{name:'我的工具'})).not.toBeInTheDocument()
  expect(screen.queryByRole('navigation',{name:'报告与支持功能入口'})).not.toBeInTheDocument()
 })
})


it('shows the governor home using only actual authorized entries and keeps school/class links',()=>{
 window.history.replaceState(null,'','/workspace?organizationId=school-a&classUnitId=class-a')
 const adminAccess:SchoolAccess={orgRole:'ORG_ADMIN',canGovern:true,personas:[],capabilities:[],explicitDenies:['ORG_GROUP_REPORT_V1']}
 const adminItems=schoolNavigation('ADMIN','',adminAccess,false)
 const navigate=vi.fn()
 render(<SchoolProfessionalHome administrator items={adminItems} username="示例管理员" schoolName="管理学校" onNavigate={navigate}/>)
 expect(screen.getByRole('heading',{name:'学校管理工作台'})).toBeInTheDocument()
 expect(screen.queryByRole('heading',{name:'心理教师工作台'})).not.toBeInTheDocument()
 const expected=adminItems.filter(item=>!['overview','account'].includes(item.id))
 expect(screen.getAllByRole('link')).toHaveLength(expected.length)
 for(const item of expected){
  const card=screen.getByRole('heading',{name:item.label}).closest('a')!
  expect(card).toHaveAttribute('href',`/workspace/${item.id}?organizationId=school-a&classUnitId=class-a`)
  fireEvent.click(card)
  expect(navigate).toHaveBeenLastCalledWith(item.id)
 }
 expect(screen.queryByRole('heading',{name:'群体报告'})).not.toBeInTheDocument()
 expect(screen.queryByRole('heading',{name:'专业报告'})).not.toBeInTheDocument()
})
