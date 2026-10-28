import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import SchoolApp from '../../school/SchoolApp'
import HuiteacherApp from '../../huiteacher/HuiteacherApp'
vi.mock('../../huiteacher/HuiteacherAssessmentTasks',()=>({HuiteacherAssessmentTasks:()=> <p>当前任务列表</p>}))
vi.mock('../../huiteacher/HuiteacherPersonalSelf',()=>({HuiteacherPersonalSelf:()=> <input aria-label="个人草稿"/>}))
vi.mock('../education-roster/EducationRosterManagement',()=>({EducationRosterManagement:()=>null}))
vi.mock('../../huiteacher/HuiteacherClassRelationships',()=>({HuiteacherClassRelationships:()=> <input aria-label="关系选择草稿"/>}))
const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,message:'成功',data})})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();window.history.replaceState(null,'','/')})
it.each(['School','Teacher'])('%s public home renders before session resolution, but login remains gated',async product=>{
 window.history.replaceState(null,'','/')
 const fetch=vi.fn(()=>new Promise(()=>{}));vi.stubGlobal('fetch',fetch);vi.stubGlobal('scrollTo',vi.fn())
 const view=render(product==='School'?<SchoolApp/>:<HuiteacherApp/>)
 expect(screen.getByRole('heading',{level:1})).toHaveTextContent(product==='School'?'看见每一个独特的你':'走向更好的教育')
 expect(fetch).toHaveBeenCalledTimes(1)
 fireEvent.click(screen.getByRole('button',{name:'登录'}))
 expect(screen.queryByLabelText('密码')).not.toBeInTheDocument()
 expect(view.container.querySelector(product==='School'?'.hs-landing-hero':'.ht-journal')).toBeNull()
})
it('School protected deep link waits for session without loading public hero',()=>{
 window.history.replaceState(null,'','/workspace/tasks')
 vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})))
 const view=render(<SchoolApp/>);expect(view.container.querySelector('.hs-landing-hero')).toBeNull()
 expect(screen.getByText('正在核对校园会话…')).toBeInTheDocument()
})
it('Teacher defers directory and untouched sections, and refresh requests each directory only once',async()=>{
 window.history.replaceState(null,'','/')
 vi.stubGlobal('scrollTo',vi.fn())
 const fetch=vi.fn(async(url:string)=>{
  if(url.endsWith('/auth/me'))return reply({id:'admin',username:'Admin',role:'TEACHER',mustChangePassword:false,organizations:[{organizationId:'a',organizationName:'学校 A',productAdmin:true}]})
  if(url.endsWith('/tool-authoring-capabilities'))return reply({canAuthor:false})
  return reply({list:[]})
 });vi.stubGlobal('fetch',fetch)
 render(<HuiteacherApp/>);await screen.findByText('当前任务列表')
 const count=(suffix:string)=>fetch.mock.calls.filter(([url])=>url.endsWith(suffix)).length
 expect(count('/units')).toBe(0);expect(count('/members')).toBe(0);expect(count('/forms')).toBe(0)
 expect(screen.queryByLabelText('个人草稿')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('link',{name:'个人测评'}));fireEvent.change(await screen.findByLabelText('个人草稿'),{target:{value:'保留'}})
 fireEvent.click(screen.getByRole('link',{name:'参与测评'}));fireEvent.click(screen.getByRole('link',{name:'个人测评'}));expect(screen.getByLabelText('个人草稿')).toHaveValue('保留')
 fireEvent.click(screen.getByRole('button',{name:'学校改进'}));await screen.findByRole('button',{name:'刷新学校信息'})
 await waitFor(()=>{expect(count('/units')).toBe(1);expect(count('/members')).toBe(1)})
 expect(count('/forms')).toBe(0)
 fireEvent.click(screen.getByRole('link',{name:'班级关系'}));fireEvent.change(await screen.findByLabelText('关系选择草稿'),{target:{value:'保留关系选择'}})
 fireEvent.click(screen.getByRole('link',{name:'学校设置与成员'}))
 fireEvent.click(screen.getByRole('button',{name:'刷新学校信息'}))
 await waitFor(()=>{expect(count('/units')).toBe(2);expect(count('/members')).toBe(2)})
 fireEvent.click(screen.getByRole('link',{name:'班级关系'}));expect(await screen.findByLabelText('关系选择草稿')).toHaveValue('保留关系选择')
})
it('Teacher discards old-school directory responses and distinguishes failure from an empty list',async()=>{
 let resolveA!:(data:unknown)=>void
 const fetch=vi.fn(async(url:string)=>{
  if(url.endsWith('/auth/me'))return reply({id:'admin',username:'Admin',role:'TEACHER',mustChangePassword:false,organizations:['a','b'].map(id=>({organizationId:id,organizationName:id,productAdmin:true}))})
  if(url.endsWith('/a/units'))return new Promise(resolve=>{resolveA=resolve})
  if(url.endsWith('/b/units'))throw Error('名单读取失败')
  return reply({list:[],canAuthor:false})
 });vi.stubGlobal('fetch',fetch);vi.stubGlobal('scrollTo',vi.fn())
 render(<HuiteacherApp/>);await screen.findByText('当前任务列表')
 fireEvent.click(screen.getByRole('button',{name:'学校改进'}));await waitFor(()=>expect(resolveA).toBeTypeOf('function'))
 expect(screen.queryByText(/暂无年级和班级/)).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('当前学校管理范围'),{target:{value:'b'}})
 await screen.findByText('名单读取失败');await act(async()=>resolveA(reply({list:[{id:'old',name:'旧学校名单',unitKind:'GRADE',parentUnitId:null}]})))
 expect(screen.queryByText(/旧学校名单/)).not.toBeInTheDocument();expect(screen.queryByText(/暂无年级和班级/)).not.toBeInTheDocument()
})
