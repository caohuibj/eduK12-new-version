import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import HuiteacherApp from './HuiteacherApp'
vi.mock('./HuiteacherPersonalSelf',()=>({HuiteacherPersonalSelf:()=>null}))
vi.mock('./HuiteacherMyFormTasks',()=>({HuiteacherMyFormTasks:()=>null}))
vi.mock('./HuiteacherMyScaleTasks',()=>({HuiteacherMyScaleTasks:()=>null}))
vi.mock('./HuiteacherClassRelationships',()=>({HuiteacherClassRelationships:()=>null}))
const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,message:'成功',data})})
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('opens an existing Teacher Form release through the real product navigation and prints only its authorized rounded projection',async()=>{
 vi.stubEnv('VITE_REPORT_PRIVACY_TEACHER_V2_ENABLED','true')
 const print=vi.spyOn(window,'print').mockImplementation(()=>{})
 const fetch=vi.fn(async(url:string)=>{
  if(url.endsWith('/auth/me'))return reply({id:'admin',username:'Teacher admin',role:'TEACHER',mustChangePassword:false,organizations:[{organizationId:'school',organizationName:'合成学校',productAdmin:true}]})
  if(url.endsWith('/evaluation-targets'))return reply({list:[{id:'target',name:'学校',kind:'ORGANIZATION'}]})
  if(url.endsWith('/evaluation-events'))return reply({list:[{id:'event',targetId:'target',title:'学期教师调查',kind:'ASSESSMENT',status:'CLOSED',version:3}]})
  if(url.endsWith('/forms'))return reply({list:[{id:'form',title:'教师体验表',status:'PUBLISHED',definitionDigest:'a'.repeat(64)}]})
  if(url.endsWith('/evaluation-events/event/run'))return reply({eventId:'event',runId:'run',status:'CLOSED',version:4,trackCount:1})
  if(url.endsWith('/evaluation-events/event/run/tracking'))return reply({baselineId:null})
  if(url.endsWith('/forms/form/group-report/released'))return reply({eventId:'event',formId:'form',definitionDigest:'a'.repeat(64),releasedAt:'2026-10-20T00:00:00Z',independentRespondents:null,minimumRespondents:10,distributions:[
   {itemKey:'single',prompt:'教学支持',status:'READY',precision:'ROUNDED_10_PERCENT',cells:[{key:'yes',label:'支持充分',percentage:60},{key:'none',label:'未选',percentage:0}]},
   {itemKey:'multi',prompt:'所需资源',status:'READY',selectionMode:'NON_EXCLUSIVE',precision:'ROUNDED_10_PERCENT',cells:[{key:'time',label:'时间',percentage:60},{key:'training',label:'培训',percentage:60}]},
   {itemKey:'text',prompt:'补充文字',status:'WITHHELD',reason:'PRIVATE_FREE_TEXT'},
  ]})
  return reply({list:[],nextCursor:null})
 })
 vi.stubGlobal('fetch',fetch)
 render(<HuiteacherApp/>)
 const schoolButton=within(await screen.findByRole('navigation',{name:'Teacher 工作台'})).getByRole('button',{name:'学校改进'})
 fireEvent.click(schoolButton)
 await waitFor(()=>expect(schoolButton).toHaveAttribute('aria-pressed','true'))
 fireEvent.click(await screen.findByRole('link',{name:'评价活动'}))
 fireEvent.click(await screen.findByRole('button',{name:'查看任务配置'}))
 fireEvent.change(await screen.findByLabelText('报告对应 Form'),{target:{value:'form'}})
 fireEvent.click(screen.getByRole('button',{name:'查看已发布群体报告'}))
 const report=await screen.findByRole('article',{name:'教师群体报告阅读'})
 expect(within(report).getByRole('heading',{name:'教师体验表'})).toBeInTheDocument()
 expect(within(report).getByText('0%')).toBeInTheDocument()
 expect(within(report).getAllByText(/不据此推算人数/)).toHaveLength(2)
 fireEvent.change(within(report).getByLabelText('阅读题目'),{target:{value:'multi'}})
 expect(within(report).getByText(/合计可能超过 100%/)).toBeInTheDocument()
 fireEvent.click(within(report).getByRole('button',{name:'打印 / 保存 PDF'}))
 expect(print).toHaveBeenCalledOnce()
 expect(fetch.mock.calls.some(([url])=>url.endsWith('/group-report/released'))).toBe(true)
 expect(fetch.mock.calls.some(([url])=>url.endsWith('/group-report/release'))).toBe(false)
 expect(fetch.mock.calls.some(([url])=>url.endsWith('/evaluation-events/event/run/tracking'))).toBe(true)
 expect(screen.queryByRole('button',{name:'创建下一轮教师自评'})).not.toBeInTheDocument()
 expect(report.textContent).not.toContain('NaN')
})
