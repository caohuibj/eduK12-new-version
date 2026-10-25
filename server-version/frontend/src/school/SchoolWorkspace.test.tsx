import {it,expect,vi} from 'vitest'
import {render,screen,waitFor,fireEvent,within} from '@testing-library/react'
import SchoolApp from './SchoolApp'

it('keeps teacher task panels unique when organization context loads',async()=>{
 vi.stubGlobal('scrollTo',vi.fn())
 const errors=vi.spyOn(console,'error').mockImplementation(()=>{})
 const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,data})})
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  if(url.endsWith('/auth/me'))return reply({id:'preview',username:'示例教师',role:'TEACHER',accountDomain:'SCHOOL'})
  if(url.endsWith('/organizations'))return reply({list:[{id:'preview-school',name:'示例学校',orgRole:'MEMBER'}]})
  if(url.endsWith('/context'))return reply({access:{orgRole:'MEMBER',canGovern:false,personas:['TEACHER'],capabilities:[],explicitDenies:[]}})
  if(url.endsWith('/reports/availability'))return reply({parentReportsEnabled:false})
  return reply({list:[],truncated:false})
 }))
 try{
  render(<SchoolApp/> )
  await screen.findByRole('heading',{name:'我的学生观察任务'})
  expect(screen.queryByRole('navigation',{name:'校园功能入口'})).not.toBeInTheDocument()
  expect(screen.queryByRole('link',{name:/活动管理/})).not.toBeInTheDocument()
  expect(screen.queryByRole('link',{name:'返回概览'})).not.toBeInTheDocument()
  expect(screen.queryByRole('heading',{name:'校园工作台'})).not.toBeInTheDocument()
  expect(window.location.pathname).toBe('/workspace/tasks')
  expect(screen.getByRole('link',{name:/School @eduk12.top/})).toHaveAttribute('href','/workspace/tasks?organizationId=preview-school')
  fireEvent.click(screen.getByRole('link',{name:'个人信息编辑'}))
  await screen.findByRole('heading',{name:'校园账号'})
  fireEvent.click(screen.getByRole('link',{name:'返回任务'}))
  await screen.findByRole('heading',{name:'我的学生观察任务'})
  await screen.findByText('目前没有可作答的教师观察任务。请确认任教关系、活动状态和测评发布情况。')
  await waitFor(()=>expect(screen.getAllByRole('heading',{name:'我的学生观察任务'})).toHaveLength(1))
  const inbox=screen.getByText('目前没有可作答的教师观察任务。请确认任教关系、活动状态和测评发布情况。').closest('section')!
  expect(inbox.compareDocumentPosition(screen.getByLabelText('当前学校'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/)
 }finally{errors.mockRestore();vi.unstubAllGlobals();window.history.replaceState(null,'','/')}
})


it('does not mount activity configuration or request activity data for an ordinary teacher deep link',async()=>{
 window.history.replaceState(null,'','/workspace/activities?organizationId=preview-school')
 vi.stubGlobal('scrollTo',vi.fn())
 const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,data})})
 const fetcher=vi.fn(async(url:string)=>{
  if(url.endsWith('/auth/me'))return reply({id:'preview',username:'示例教师',role:'TEACHER',accountDomain:'SCHOOL'})
  if(url.endsWith('/organizations'))return reply({list:[{id:'preview-school',name:'示例学校',orgRole:'MEMBER'}]})
  if(url.endsWith('/context'))return reply({access:{orgRole:'MEMBER',canGovern:false,personas:['TEACHER'],capabilities:[],explicitDenies:[]}})
  return reply({list:[],canAuthor:false,parentReportsEnabled:false})
 })
 vi.stubGlobal('fetch',fetcher)
 try{
  render(<SchoolApp/> )
  await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>url.endsWith('/context'))).toBe(true))
  expect(screen.queryByRole('navigation',{name:'校园功能入口'})).not.toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'当前无法进入此功能'})).toBeInTheDocument()
  expect(screen.queryByRole('link',{name:/活动管理/})).not.toBeInTheDocument()
  expect(screen.queryByText('新建活动',{exact:true})).not.toBeInTheDocument()
  expect(fetcher.mock.calls.some(([url])=>url.includes('/activities'))).toBe(false)
 }finally{vi.unstubAllGlobals();window.history.replaceState(null,'','/')}
})


it.each([false,true])('shows direct parent tabs and only available report entries (reports=%s)',async reports=>{
 window.history.replaceState(null,'','/workspace?organizationId=parent-school')
 vi.stubGlobal('scrollTo',vi.fn())
 const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,data})})
 const fetcher=vi.fn(async(url:string)=>{
  if(url.endsWith('/auth/me'))return reply({id:'parent',username:'示例家长',role:'PARENT',accountDomain:'SCHOOL'})
  if(url.endsWith('/organizations'))return reply({list:[{id:'parent-school',name:'示例学校',orgRole:'MEMBER'}]})
  if(url.endsWith('/reports/availability'))return reply({parentReportsEnabled:reports})
  return reply({list:[]})
 })
 vi.stubGlobal('fetch',fetcher)
 try{
  const view=render(<SchoolApp/> )
  await screen.findByRole('heading',{level:1,name:'家校陪伴'})
  const tabs=within(screen.getByRole('navigation',{name:'校园功能入口'}))
  for(const [label,id] of [['我的观察任务','tasks'],['亲子关联','family'],['参与授权','peer']]){
   expect(tabs.getByRole('link',{name:label})).toHaveAttribute('href',`/workspace/${id}?organizationId=parent-school`)
   expect(screen.getByRole('region',{name:'可用功能'})).toContainElement(screen.getByRole('heading',{name:label}))
  }
  if(reports){await waitFor(()=>expect(tabs.getByRole('link',{name:'家长报告'})).toBeInTheDocument())}
  else expect(tabs.queryByRole('link',{name:'家长报告'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'功能导航'})).not.toBeInTheDocument()
  expect(view.container.querySelector('.hs-workspace-welcome')).toBeNull()
  expect(tabs.queryByRole('link',{name:'活动管理'})).not.toBeInTheDocument()
  fireEvent.click(tabs.getByRole('link',{name:'亲子关联'}))
  await screen.findByRole('heading',{name:'我的家校关系'})
  expect(tabs.getByRole('link',{name:'亲子关联'})).toHaveAttribute('aria-current','page')
  expect(window.location.search).toBe('?organizationId=parent-school')
  fireEvent.click(screen.getByRole('link',{name:'返回概览'}))
  await screen.findByRole('heading',{level:1,name:'家校陪伴'})
 }finally{vi.unstubAllGlobals();window.history.replaceState(null,'','/')}
})
