import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import HuiteacherApp from './HuiteacherApp'
import {HuiteacherMyFormTasks} from './HuiteacherMyFormTasks'
type Api=Parameters<typeof HuiteacherMyFormTasks>[0]['api']
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();window.history.replaceState(null,'','/')})
describe('Teacher student task presentation',()=>{
 it('opens a student answer page after an in-place identity switch from personal-self',async()=>{
  window.history.replaceState(null,'','/#ht-personal-self')
  const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,message:'成功',data})})
  let actor='teacher'
  const fetch=vi.fn(async(url:string,_options?:RequestInit)=>{
   if(url.endsWith('/auth/csrf'))return reply({csrfToken:'fixture'})
   if(url.endsWith('/auth/login')){actor='student';return reply({user:{id:'student'},product:'HUITEACHER'})}
   if(url.endsWith('/auth/me'))return reply({id:actor,username:actor,role:actor==='student'?'STUDENT':'TEACHER',mustChangePassword:false,organizations:[{organizationId:'school',organizationName:'测试学校',productAdmin:false}]})
   if(url.endsWith('/tool-authoring-capabilities'))return reply({canAuthor:false,authorableToolKinds:[]})
   if(url.endsWith('/my-student-evaluations'))return reply({list:[{executionId:'execution',formTitle:'学生评教表单',eventTitle:'评价活动',status:'STARTED',runtimeBindingKind:'HUITEACHER_FORM_V2',runtimeBindingRef:'attempt'}]})
   if(url.endsWith('/form-attempts/attempt/task'))return reply({attemptId:'attempt',formId:'form',status:'STARTED',title:'学生评教表单',definitionDigest:'fixed',pages:[{pageKey:'first',title:'课堂反馈',questions:[{itemKey:'first',prompt:'请选择课堂观察',type:'SINGLE',required:true,options:[{optionKey:'a',label:'课堂目标清晰'}],rows:[]}]}]})
   return reply({list:[]})
  })
  vi.stubGlobal('fetch',fetch)
  render(<HuiteacherApp/>)
  fireEvent.click(await screen.findByRole('link',{name:'个人测评'}))
  fireEvent.click(screen.getByRole('button',{name:'退出'}))
  fireEvent.click(await screen.findByRole('button',{name:/^登录$/}))
  fireEvent.change(screen.getByLabelText('教育账号'),{target:{value:'student'}})
  fireEvent.change(screen.getByLabelText('密码'),{target:{value:'fixture-password'}})
  fireEvent.submit(screen.getByLabelText('教育账号').closest('form')!)
  fireEvent.click(await screen.findByRole('button',{name:'继续评价'}))
  const page=await screen.findByRole('region',{name:'测评独立作答页'})
  expect(within(page).getByRole('radio',{name:'课堂目标清晰'})).toBeVisible()
  expect(screen.queryByRole('heading',{name:'我的教育发展空间'})).not.toBeInTheDocument()
  expect(screen.queryByRole('navigation',{name:'Teacher 工作台'})).not.toBeInTheDocument()
  expect(fetch.mock.calls.every(([url,options])=>!options?.method||options.method==='GET'||/auth\/(login|logout)$/.test(url))).toBe(true)
 })

 it('shows student-only tasks, localized states and privacy help without extra reads or writes',async()=>{
  const api=vi.fn(async()=>({list:['ASSIGNED','STARTED','COMPLETED'].map((status,index)=>({executionId:'task'+index,formTitle:'教师评价 '+index,eventTitle:'学校教研活动',teacherName:'示例教师',deadline:'2026-12-01T08:00:00Z',status}))}))
  render(<HuiteacherMyFormTasks student api={api as Api}/>)
  await screen.findByText('已加载 3 项评教任务')
  expect(api).toHaveBeenCalledExactlyOnceWith('/my-student-evaluations')
  const cards=screen.getAllByRole('heading',{level:3}).map(heading=>heading.closest('article')!)
  expect(within(cards[0]).getByText('待完成')).toBeInTheDocument()
  expect(within(cards[0]).getByRole('button',{name:'开始评价'})).toBeEnabled()
  expect(within(cards[1]).getByText('进行中')).toBeInTheDocument()
  expect(within(cards[1]).getByRole('button',{name:'继续评价'})).toBeEnabled()
  expect(within(cards[2]).getByRole('button',{name:'已完成'})).toBeDisabled()
  const info=screen.getByRole('button',{name:'学生评教与隐私说明'})
  expect(screen.queryByText(/不是绝对匿名/)).not.toBeInTheDocument()
  fireEvent.click(info)
  expect(screen.getByRole('note',{name:'学生评教与隐私说明'})).toHaveTextContent('教师不能查看逐人作答')
  expect(screen.getByRole('note')).toHaveTextContent('不是绝对匿名')
  fireEvent.keyDown(info,{key:'Escape'})
  expect(screen.queryByRole('note')).not.toBeInTheDocument()
  expect(api).toHaveBeenCalledTimes(1)
 })
 it('keeps read errors separate from a successful empty task list and retries only the student list',async()=>{
  let failed=true
  const api=vi.fn(async()=>{if(failed)throw Error('学生列表暂不可用');return {list:[]}})
  render(<HuiteacherMyFormTasks student api={api as Api}/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('学生列表暂不可用')
  expect(screen.queryByText('暂无已分配的学生评教任务。')).not.toBeInTheDocument()
  expect(screen.queryByText('已加载 0 项评教任务')).not.toBeInTheDocument()
  failed=false;fireEvent.click(screen.getByRole('button',{name:'重试读取任务列表'}))
  expect(await screen.findByText('暂无已分配的学生评教任务。')).toBeInTheDocument()
  expect(screen.getByText('已加载 0 项评教任务')).toBeInTheDocument()
  expect(api.mock.calls).toEqual([['/my-student-evaluations'],['/my-student-evaluations']])
 })
})
