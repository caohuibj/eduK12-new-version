import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import HuiteacherApp from './HuiteacherApp'
import {TeacherFormGroupVersions} from './TeacherFormGroupVersions'
vi.mock('./HuiteacherPersonalSelf',()=>({HuiteacherPersonalSelf:()=>null}))
vi.mock('./HuiteacherMyFormTasks',()=>({HuiteacherMyFormTasks:()=>null}))
vi.mock('./HuiteacherMyScaleTasks',()=>({HuiteacherMyScaleTasks:()=>null}))
vi.mock('./HuiteacherClassRelationships',()=>({HuiteacherClassRelationships:()=>null}))
const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,message:'成功',data})})
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('keeps a successfully generated Teacher report when the directory refresh fails and retries only GET',async()=>{
 const report={versionId:'saved',eventId:'event',formId:'form',definitionDigest:'a'.repeat(64),releasedAt:'2026-10-30T12:00:00Z',populationLabel:'全部合格参与教师',independentRespondents:10,minimumRespondents:10,distributions:[]}
 const index={versioned:true,truncated:false,versions:[] as Array<{versionId:string;releasedAt:string;populationLabel:string}>,groups:{options:[],limitations:[]}}
 let reads=0
 const requests=vi.fn(async(_path:string,method?:string):Promise<unknown>=>{
  if(method==='POST')return report
  if(++reads===2)throw new Error('目录暂不可用')
  return {...index,versions:reads>2?[report]:[]}
 })
 const api=async<T,>(path:string,method?:string):Promise<T>=>await requests(path,method) as T
 const deliver=vi.fn()
 render(<TeacherFormGroupVersions api={api} endpoint="/group-report" onReport={deliver}/> )
 fireEvent.click(await screen.findByRole('button',{name:'生成更新版报告'}))
 await screen.findByText(/报告已生成，版本目录刷新失败/)
 expect(deliver).toHaveBeenLastCalledWith(report)
 expect(screen.getByLabelText('已生成版本')).toHaveValue('saved')
 fireEvent.click(screen.getByRole('button',{name:'重试读取版本目录'}))
 await waitFor(()=>expect(screen.queryByText(/版本目录刷新失败/)).not.toBeInTheDocument())
 expect(deliver).toHaveBeenLastCalledWith(report)
 expect(screen.getByLabelText('已生成版本')).toHaveValue('saved')
 expect(requests.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
 expect(reads).toBe(3)
})
it('opens existing Teacher Form versions, explicitly generates one class report, and prints only its authorized rounded projection',async()=>{
 vi.stubEnv('VITE_REPORT_PRIVACY_TEACHER_V2_ENABLED','true')
 const print=vi.spyOn(window,'print').mockImplementation(()=>{})
 const saved={versionId:'old',eventId:'event',formId:'form',definitionDigest:'a'.repeat(64),releasedAt:'2026-10-20T00:00:00Z',independentRespondents:null,minimumRespondents:10,distributions:[
  {itemKey:'single',prompt:'教学支持',status:'READY',precision:'ROUNDED_10_PERCENT',cells:[{key:'yes',label:'支持充分',percentage:60},{key:'none',label:'未选',percentage:0}]},
  {itemKey:'multi',prompt:'所需资源',status:'READY',selectionMode:'NON_EXCLUSIVE',precision:'ROUNDED_10_PERCENT',cells:[{key:'time',label:'时间',percentage:60},{key:'training',label:'培训',percentage:60}]},
  {itemKey:'text',prompt:'补充文字',status:'WITHHELD',reason:'PRIVATE_FREE_TEXT'},
 ]}
 const updated={...saved,versionId:'new',populationLabel:'任教班级：甲班（任一匹配）'}
 let generated=false
 const fetch=vi.fn(async(url:string,options?:RequestInit)=>{
  if(url.endsWith('/auth/me'))return reply({id:'admin',username:'Teacher admin',role:'TEACHER',mustChangePassword:false,organizations:[{organizationId:'school',organizationName:'合成学校',productAdmin:true}]})
  if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-csrf'})
  if(url.endsWith('/evaluation-targets'))return reply({list:[{id:'target',name:'学校',kind:'ORGANIZATION'}]})
  if(url.endsWith('/evaluation-events'))return reply({list:[{id:'event',targetId:'target',title:'学期教师调查',kind:'ASSESSMENT',status:'CLOSED',version:3}]})
  if(url.endsWith('/forms'))return reply({list:[{id:'form',title:'教师体验表',status:'PUBLISHED',definitionDigest:'a'.repeat(64)}]})
  if(url.endsWith('/evaluation-events/event/run'))return reply({eventId:'event',runId:'run',status:'CLOSED',version:4,trackCount:1})
  if(url.endsWith('/evaluation-events/event/run/tracking'))return reply({baselineId:null})
  if(url.endsWith('/group-report/versions')&&options?.method==='POST'){
   expect(JSON.parse(options.body as string)).toEqual({selection:{kind:'CLASSES',ids:['class-a']}});generated=true;return reply(updated)
  }
  if(url.endsWith('/group-report/versions'))return reply({versioned:true,truncated:false,versions:(generated?[updated,saved]:[saved]).map(report=>({versionId:report.versionId,releasedAt:report.releasedAt,populationLabel:'populationLabel' in report?report.populationLabel:'全部合格参与教师'})),groups:{options:[{kind:'CLASSES',id:'class-a',name:'甲班',dimensionId:null,dimensionName:null}],limitations:['按发布时的任教关系选人。']}})
  if(url.endsWith('/versions/old'))return reply(saved)
  if(url.endsWith('/versions/new'))return reply(updated)
  return reply({list:[],nextCursor:null})
 })
 vi.stubGlobal('fetch',fetch)
 render(<HuiteacherApp/>)
 const schoolButton=within(await screen.findByRole('navigation',{name:'Teacher 工作台'})).getByRole('button',{name:'学校改进'})
 fireEvent.click(schoolButton);await waitFor(()=>expect(schoolButton).toHaveAttribute('aria-pressed','true'))
 fireEvent.click(await screen.findByRole('link',{name:'评价活动'}))
 const configure=await screen.findByRole('button',{name:'查看任务配置'},{timeout:3000}).catch(error=>{
  throw new Error(String(error)+'\nRequests: '+JSON.stringify(fetch.mock.calls.map(([url,options])=>({url,method:options?.method??'GET'}))))
 })
 fireEvent.click(configure)
 fireEvent.change(await screen.findByLabelText('报告对应 Form'),{target:{value:'form'}})
 await screen.findByRole('article',{name:'教师群体报告阅读'})
 expect(generated).toBe(false)
 fireEvent.change(screen.getByLabelText('报告人群'),{target:{value:'CLASSES'}})
 fireEvent.click(screen.getByLabelText('甲班'))
 fireEvent.click(screen.getByRole('button',{name:'生成更新版报告'}))
 await screen.findByText(/任教班级：甲班/, {selector:'p'})
 const report=screen.getByRole('article',{name:'教师群体报告阅读'})
 expect(within(report).getByText('0%')).toBeInTheDocument()
 expect(within(report).getAllByText(/不据此推算人数/)).toHaveLength(2)
 fireEvent.change(within(report).getByLabelText('阅读题目'),{target:{value:'multi'}})
 expect(within(report).getByText(/合计可能超过 100%/)).toBeInTheDocument()
 fireEvent.click(within(report).getByRole('button',{name:'打印 / 保存 PDF'}));expect(print).toHaveBeenCalledOnce()
 fireEvent.change(screen.getByLabelText('已生成版本'),{target:{value:'old'}})
 await waitFor(()=>expect(screen.getByLabelText('已生成版本')).toHaveValue('old'))
 expect(fetch.mock.calls.filter(([,options])=>options?.method==='POST')).toHaveLength(1)
 expect(fetch.mock.calls.some(([url])=>url.endsWith('/evaluation-events/event/run/tracking'))).toBe(true)
 expect(screen.queryByRole('button',{name:'创建下一轮教师自评'})).not.toBeInTheDocument()
 expect(report.textContent).not.toContain('NaN')
})
