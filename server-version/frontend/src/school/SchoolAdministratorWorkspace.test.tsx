import {it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor,within} from '@testing-library/react'
import SchoolApp from './SchoolApp'

const units=[{id:'grade',name:'一年级',unitKind:'GRADE'},{id:'class',name:'一班',unitKind:'CLASS'}]
function setup(page:string){
 window.history.replaceState(null,'','/workspace/'+page+'?organizationId=school&classUnitId=class')
 vi.stubGlobal('scrollTo',vi.fn())
 const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,data})})
 const fetcher=vi.fn(async(url:string,options?:RequestInit)=>{
  if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-csrf'})
  if(url.endsWith('/auth/me'))return reply({id:'admin',username:'管理员',role:'ADMIN',accountDomain:'SCHOOL'})
  if(url.endsWith('/organizations'))return reply({list:[{id:'school',name:'管理学校',orgRole:'ORG_ADMIN'}]})
  if(url.endsWith('/context'))return reply({access:{orgRole:'ORG_ADMIN',canGovern:true,personas:[],capabilities:[],explicitDenies:[]}})
  if(url.endsWith('/units'))return reply(options?.method==='POST'?{id:'new-unit'}:{list:units})
  if(url.endsWith('/summary'))return reply({status:'CLOSED',rosterVersion:4,rosterExpectedCount:3,eligibleCount:3,registeredCount:3,unresolvedIncidents:0})
  if(options?.method==='POST'){
   if(url.endsWith('/codes'))return reply({codes:['synthetic-code']})
   if(url.endsWith('/staff-invitations'))return reply({inviteCode:'synthetic-invite'})
   if(url.endsWith('/roster')||url.endsWith('/window')||url.endsWith('/auth/mfa/step-up'))return reply({})
   throw Error('Unexpected write '+url)
  }
  return reply({list:[],sources:[],specs:[],subjects:[],truncated:false,canAuthor:false,parentReportsEnabled:false})
 })
 vi.stubGlobal('fetch',fetcher)
 return fetcher
}
const writes=(fetcher:ReturnType<typeof setup>)=>fetcher.mock.calls.filter(([,options])=>options?.method==='POST')
const bodies=(fetcher:ReturnType<typeof setup>,path:string)=>writes(fetcher).filter(([url])=>url.endsWith(path)).map(([,options])=>JSON.parse(options!.body as string))
const reset=()=>{vi.unstubAllGlobals();window.history.replaceState(null,'','/')}

it('preserves governor grade/class creation parameters and parent-grade requirement',async()=>{
 const fetcher=setup('classes')
 try{
  render(<SchoolApp/>)
  await screen.findByRole('heading',{name:'年级与班级维护'})
  const createClass=screen.getByRole('button',{name:'增加班级'})
  expect(createClass).toBeDisabled()
  fireEvent.change(screen.getByLabelText('新建年级名称'),{target:{value:'合成年级'}})
  fireEvent.click(screen.getByRole('button',{name:'增加年级'}))
  await screen.findByText('年级已建立')
  expect(bodies(fetcher,'/units')).toEqual([{unitKind:'GRADE',name:'合成年级'}])
  expect(screen.getByLabelText('新建年级名称')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('新建班级名称'),{target:{value:'合成班级'}})
  fireEvent.change(screen.getByLabelText('所属年级'),{target:{value:'grade'}})
  fireEvent.click(createClass)
  await screen.findByText('班级已建立')
  expect(bodies(fetcher,'/units')[1]).toEqual({unitKind:'CLASS',name:'合成班级',parentUnitId:'grade'})
 }finally{reset()}
})

it('keeps registration pane drafts and the original roster, code and window requests',async()=>{
 const fetcher=setup('admission')
 try{
  render(<SchoolApp/>)
  const tabs=within(await screen.findByRole('navigation',{name:'班级注册管理'}))
  expect(screen.queryByRole('button',{name:'心理教师 · 确认整班身份审批'})).not.toBeInTheDocument()
  expect(document.getElementById('hs-admin-pane-roster')).not.toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'刷新班级状态'}))
  await screen.findByText('名册版本 4')
  fireEvent.click(tabs.getByRole('button',{name:'资格名册'}))
  const roster=screen.getByLabelText('资格名册（每行一个学号，仅上传时用于计算受保护索引）')
  fireEvent.change(roster,{target:{value:'S001\nS002'}})
  fireEvent.click(tabs.getByRole('button',{name:'激活码'}))
  fireEvent.click(tabs.getByRole('button',{name:'资格名册'}))
  expect(roster).toHaveValue('S001\nS002')
  expect(writes(fetcher)).toHaveLength(0)
  fireEvent.click(screen.getByRole('button',{name:'更新资格名册'}))
  await waitFor(()=>expect(roster).toHaveValue(''))
  expect(bodies(fetcher,'/roster')).toEqual([{studentNumbers:['S001','S002']}])
  fireEvent.click(tabs.getByRole('button',{name:'激活码'}))
  fireEvent.click(screen.getByRole('button',{name:'批量生成一次性激活码'}))
  await screen.findByText('synthetic-code')
  expect(bodies(fetcher,'/codes')).toEqual([{count:3,ttlMinutes:120}])
  fireEvent.click(tabs.getByRole('button',{name:'注册窗口'}))
  expect(screen.getByRole('button',{name:'开启注册'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('注册截止时间'),{target:{value:'2026-11-01T18:00'}})
  fireEvent.click(screen.getByRole('button',{name:'开启注册'}))
  await screen.findByText('注册窗口已开启')
  expect(bodies(fetcher,'/window')[0]).toEqual({action:'OPEN',closesAt:new Date('2026-11-01T18:00').toISOString()})
  fireEvent.click(screen.getByRole('button',{name:'关闭注册'}))
  await screen.findByText('注册窗口已关闭')
  expect(bodies(fetcher,'/window')[1]).toEqual({action:'CLOSE'})
  expect(writes(fetcher).every(([,options])=>(options?.headers as Record<string,string>)['X-CSRF-Token']==='synthetic-csrf')).toBe(true)
  expect(screen.getByText('查看注册链接').closest('details')).not.toHaveAttribute('open')
 }finally{reset()}
})

it('preserves the independent staff persona and capability flags and one-time invitation display',async()=>{
 const fetcher=setup('staff')
 try{
  render(<SchoolApp/>)
  await screen.findByRole('heading',{name:'邀请校园教职员工'})
  expect(screen.getByLabelText('心理专业权限')).not.toBeChecked()
  expect(screen.getByLabelText('学校管理员')).not.toBeChecked()
  fireEvent.change(screen.getByLabelText('岗位'),{target:{value:'COUNSELOR'}})
  fireEvent.click(screen.getByLabelText('心理专业权限'))
  fireEvent.click(screen.getByLabelText('学校管理员'))
  fireEvent.click(screen.getByRole('button',{name:'生成邀请'}))
  await screen.findByText('synthetic-invite')
  expect(bodies(fetcher,'/staff-invitations')).toEqual([{persona:'COUNSELOR',adminRole:true,psychologyStaff:true}])
 }finally{reset()}
})

it('keeps the six-digit security check and the same step-up request',async()=>{
 const fetcher=setup('account')
 try{
  render(<SchoolApp/>)
  await screen.findByRole('button',{name:'二次验证使用说明'})
  const code=screen.getByLabelText('验证器 6 位动态验证码')
  const verify=screen.getByRole('button',{name:'重新验证高权限操作'})
  fireEvent.change(code,{target:{value:'123'}})
  expect(verify).toBeDisabled()
  fireEvent.change(code,{target:{value:'123456'}})
  fireEvent.click(verify)
  await screen.findByText('高权限操作已重新验证，有效期五分钟。')
  expect(bodies(fetcher,'/auth/mfa/step-up')).toEqual([{code:'123456'}])
  expect(code).toHaveValue('')
 }finally{reset()}
})

it('keeps administrator page navigation and explanation toggles GET-only',async()=>{
 const fetcher=setup('classes')
 try{
  const view=render(<SchoolApp/>)
  await screen.findByRole('button',{name:'年级与班级管理说明'})
  for(const [group,page,help] of [['学校管理','学校与班级','年级与班级管理说明'],['学校管理','班级注册与审批','班级注册与审批说明'],['学校管理','学生账号恢复','账号恢复操作说明'],['学校管理','校园关系','校园关系使用说明'],['学校管理','人员邀请','人员邀请使用说明'],['校园活动','活动管理','活动与发布说明'],['报告与支持','群体报告','群体报告使用说明'],['报告与支持','群体纵向分析','群体纵向分析使用说明']]){
   fireEvent.click(within(screen.getByRole('navigation',{name:'校园功能分组'})).getByRole('link',{name:group}))
   const pages=screen.queryByRole('navigation',{name:group+'功能入口'})
   if(pages)fireEvent.click(within(pages).getByRole('link',{name:page}))
   else expect(page).toBe('活动管理')
   const toggle=await screen.findByRole('button',{name:help})
   expect(toggle).toHaveAttribute('aria-expanded','false')
   fireEvent.click(toggle)
   expect(screen.getByRole('note',{name:help})).toBeInTheDocument()
   fireEvent.scroll(document)
   expect(screen.queryByRole('note')).not.toBeInTheDocument()
   expect(window.location.search).toBe('?organizationId=school&classUnitId=class')
  }
  expect(view.container.querySelector('.hs-report-panel')).not.toBeNull()
  expect(writes(fetcher)).toHaveLength(0)
 }finally{reset()}
})
