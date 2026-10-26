import {it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor,within} from '@testing-library/react'
import SchoolApp from './SchoolApp'

const ready={status:'CLOSED',rosterVersion:7,rosterExpectedCount:2,eligibleCount:2,registeredCount:2,unresolvedIncidents:0}
const cases=[
 ['ready',ready,true],
 ['open',{...ready,status:'OPEN'},false],
 ['roster mismatch',{...ready,rosterExpectedCount:3},false],
 ['registration mismatch',{...ready,registeredCount:1},false],
 ['incident',{...ready,unresolvedIncidents:1},false],
 ['approved',{...ready,status:'APPROVED'},false],
] as const

function setup(summary=ready,governor=false){
 vi.stubGlobal('scrollTo',vi.fn())
 const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,data})})
 let approved=false
 const fetcher=vi.fn(async(url:string,options?:RequestInit)=>{
  if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-test-csrf'})
  if(url.endsWith('/auth/me'))return reply({id:'psych',username:'心理教师',role:'TEACHER',accountDomain:'SCHOOL'})
  if(url.endsWith('/organizations'))return reply({list:[{id:'school',name:'示例学校',orgRole:governor?'ORG_ADMIN':'MEMBER'}]})
  if(url.endsWith('/context'))return reply({access:{orgRole:governor?'ORG_ADMIN':'MEMBER',canGovern:governor,personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF'],explicitDenies:[]}})
  if(url.endsWith('/units'))return reply({list:[{id:'class',name:'一班',unitKind:'CLASS'}]})
  if(url.endsWith('/summary'))return reply({...summary,status:approved?'APPROVED':summary.status})
  if(url.endsWith('/approve')&&options?.method==='POST'){approved=true;return reply({})}
  if(options?.method&&options.method!=='GET')throw Error('Unexpected write')
  return reply({list:[],canAuthor:false,parentReportsEnabled:false})
 })
 vi.stubGlobal('fetch',fetcher)
 return fetcher
}

it.each(cases)('keeps original counselor approval guard and version request (%s)',async(_,summary,canApprove)=>{
 window.history.replaceState(null,'','/workspace/admission?organizationId=school&classUnitId=class')
 const fetcher=setup(summary)
 try{
  render(<SchoolApp/>)
  await screen.findByRole('region',{name:'审批班级选择'})
  expect(screen.getAllByRole('heading',{name:'班级注册与审批'})).toHaveLength(1)
  expect(screen.queryByRole('button',{name:'开启注册'})).not.toBeInTheDocument()
  const approve=screen.getByRole('button',{name:'心理教师 · 确认整班身份审批'})
  expect(approve).toBeDisabled()
  expect(fetcher.mock.calls.some(([url])=>url.endsWith('/summary'))).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'刷新班级状态'}))
  await screen.findByText('名册版本 7')
  expect(within(screen.getByRole('region',{name:'班级注册进度与审批'})).getByText('名册预期')).toBeInTheDocument()
  if(canApprove){
   expect(approve).toBeEnabled()
   fireEvent.click(approve)
   await waitFor(()=>expect(fetcher.mock.calls.some(([url,options])=>url.endsWith('/approve')&&options?.method==='POST')).toBe(true))
   const request=fetcher.mock.calls.find(([url,options])=>url.endsWith('/approve')&&options?.method==='POST')!
   expect(JSON.parse(request[1]!.body as string)).toEqual({expectedRosterVersion:7})
   await screen.findByText('已审批')
   expect(approve).toBeDisabled()
  }else{
   expect(approve).toBeDisabled()
   fireEvent.click(approve)
   if(summary.status==='APPROVED')expect(screen.queryByRole('list',{name:'班级审批待办'})).not.toBeInTheDocument()
   else expect(screen.getByRole('list',{name:'班级审批待办'})).toBeInTheDocument()
   expect(fetcher.mock.calls.some(([url])=>url.endsWith('/approve'))).toBe(false)
  }
 }finally{vi.unstubAllGlobals();window.history.replaceState(null,'','/')}
})

it('shows a single empty selection state and collapsed instructions without loading a summary',async()=>{
 window.history.replaceState(null,'','/workspace/admission?organizationId=school')
 const fetcher=setup()
 try{
  render(<SchoolApp/>)
  await screen.findByRole('region',{name:'审批班级选择'})
  expect(screen.getByText('请先选择班级，查看注册进度与审批状态。')).toBeInTheDocument()
  expect(screen.queryByRole('heading',{name:'先选择一个班级'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'刷新班级状态'})).not.toBeInTheDocument()
  expect(screen.queryByRole('note')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'班级注册与审批说明'}))
  expect(screen.getByRole('note')).toHaveTextContent('班级审批不代表校园活动已开放')
  fireEvent.scroll(document)
  expect(screen.queryByRole('note')).not.toBeInTheDocument()
  expect(fetcher.mock.calls.some(([url])=>url.endsWith('/summary'))).toBe(false)
 }finally{vi.unstubAllGlobals();window.history.replaceState(null,'','/')}
})

it('retains school governor roster and registration controls',async()=>{
 window.history.replaceState(null,'','/workspace/admission?organizationId=school&classUnitId=class')
 setup(ready,true)
 try{
  render(<SchoolApp/>)
  await screen.findByRole('navigation',{name:'班级注册管理'})
  fireEvent.click(screen.getByRole('button',{name:'资格名册'}))
  expect(screen.getByRole('button',{name:'更新资格名册'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'激活码'}))
  expect(screen.getByRole('button',{name:'批量生成一次性激活码'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'注册窗口'}))
  expect(screen.getByRole('button',{name:'开启注册'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'关闭注册'})).toBeInTheDocument()
  expect(screen.getByRole('region',{name:'审批班级选择'})).toBeInTheDocument()
 }finally{vi.unstubAllGlobals();window.history.replaceState(null,'','/')}
})
