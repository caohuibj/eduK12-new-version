import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import SchoolApp from '../../school/SchoolApp'
import HuiteacherApp from '../../huiteacher/HuiteacherApp'
import {emptyDefinition,updateReportContract} from '../../pages/scaleDefinitionEditorModel'

vi.mock('../../huiteacher/HuiteacherPersonalSelf',()=>({HuiteacherPersonalSelf:()=>null}))
vi.mock('../../huiteacher/HuiteacherMyFormTasks',()=>({HuiteacherMyFormTasks:()=>null}))
vi.mock('../../huiteacher/HuiteacherMyScaleTasks',()=>({HuiteacherMyScaleTasks:()=>null}))
vi.mock('../../huiteacher/HuiteacherClassRelationships',()=>({HuiteacherClassRelationships:()=>null}))
const asset={assetId:'report-image',contentHash:'a'.repeat(64),mimeType:'image/png' as const}
const reply=(data:unknown)=>({ok:true,status:200,json:async()=>({code:0,message:'成功',data})})
function makeDraft(){
 const definition=emptyDefinition()
 definition.items=[{itemCode:'q',content:'题目',type:'SINGLE',required:true,sortOrder:0,responseSetKey:'default',randomizeOptions:false}]
 definition.scoring.itemRules=[{itemCode:'q',transform:{type:'identity'}}]
 definition.scoring.scores=[{key:'total',type:'total',label:'总分',direction:'descriptive',canonical:true,displayPrecision:0,source:{type:'items',items:[{itemCode:'q',weight:1}],aggregation:'sum'}}]
 definition.report.rawScoreFeedback={schemaVersion:1,rules:[{scoreKey:'total',ranges:[{key:'low',min:0,max:5,includeMax:true,text:'本区间的说明'}]}]}
 return {id:'draft',kind:'SCALE',title:'报告图量表',revision:1,contentHash:'draft-hash',definition:updateReportContract(definition)}
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();window.history.replaceState(null,'','/')})
describe('real education host private report image transport',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('%s keeps multipart, CSRF and Blob preview on its own entry API',async(entry)=>{
  const prefix=entry==='SCHOOL'?'/api/campus':'/api/huiteacher'
  const base=prefix+'/organizations/school/private-tools/draft'
  const draft=makeDraft()
  const binary=new Blob(['png'],{type:'image/png'})
  const readBlob=vi.fn().mockResolvedValue(binary)
  const readJson=vi.fn(()=>{throw Error('Binary content must not be decoded as JSON')})
  const objectURL=vi.fn(()=> 'blob:private-report')
  vi.stubGlobal('URL',class extends URL {static createObjectURL=objectURL;static revokeObjectURL=vi.fn()})
  vi.stubGlobal('scrollTo',vi.fn())
  document.cookie='huischool_csrf=; Max-Age=0; path=/'
  document.cookie='huiteacher_csrf=; Max-Age=0; path=/'
  const request=vi.fn(async(url:string,options?:RequestInit)=>{
   if(url===prefix+'/auth/me')return reply(entry==='SCHOOL'
    ?{id:'psych',username:'心理教师',role:'TEACHER',accountDomain:'SCHOOL',mustChangePassword:false}
    :{id:'psych',username:'心理教师',role:'TEACHER',mustChangePassword:false,organizations:[{organizationId:'school',organizationName:'学校',productAdmin:true}]})
   if(url===prefix+'/auth/csrf')return reply({csrfToken:'test-private-image-csrf'})
   if(url===prefix+'/organizations')return reply({list:[{id:'school',name:'学校',orgRole:'MEMBER'}]})
   if(url.endsWith('/context'))return reply({access:{orgRole:'MEMBER',canGovern:false,personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF'],explicitDenies:[]}})
   if(url.endsWith('/tool-authoring-capabilities'))return reply({canAuthor:true,authorableToolKinds:['SCALE','FORM']})
   if(url===prefix+'/reports/availability')return reply({parentReportsEnabled:false})
   if(url===prefix+'/organizations/school/private-tools')return reply({list:[draft],nextCursor:null})
   if(url===base&&options?.method==='PUT')return reply({revision:2,contentHash:'saved'})
   if(url===base)return reply(draft)
   if(url===base+'/versions')return reply({list:[],nextCursor:null})
   if(url===base+'/assets/images')return reply(asset)
   if(url===base+'/assets/report-image/content')return {ok:true,status:200,blob:readBlob,json:readJson}
   return reply({list:[],nextCursor:null})
  })
  vi.stubGlobal('fetch',request)
  if(entry==='SCHOOL'){
   window.history.replaceState(null,'','/workspace/private-tools?organizationId=school')
   render(<SchoolApp/> )
  }else{
   render(<HuiteacherApp/> )
   fireEvent.click(await screen.findByRole('button',{name:'我的工具'}))
  }
  fireEvent.click(await screen.findByRole('button',{name:'编辑 报告图量表'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'报告文案'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'报告文案'}))
  const image=new File(['png'],'report.png',{type:'image/png'})
  fireEvent.change(await screen.findByLabelText('上传反馈图片'),{target:{files:[image]}})
  await waitFor(()=>expect(screen.getByLabelText('图片说明')).toHaveValue('report'))
  await waitFor(()=>expect(screen.getByRole('img',{name:'report'})).toHaveAttribute('src','blob:private-report'))
  const upload=request.mock.calls.find(([url])=>url===base+'/assets/images')
  expect(upload?.[1]?.method).toBe('POST')
  expect(upload?.[1]?.body).toBeInstanceOf(FormData)
  expect((upload?.[1]?.body as FormData).get('image')).toBeInstanceOf(File)
  const headers=new Headers(upload?.[1]?.headers)
  expect(headers.get('content-type')).toBeNull()
  expect(headers.get('x-csrf-token')).toBe('test-private-image-csrf')
  expect(upload?.[1]?.credentials).toBe('same-origin')
  expect(request).toHaveBeenCalledWith(prefix+'/auth/csrf',{credentials:'same-origin'})
  expect(readBlob).toHaveBeenCalled();expect(readJson).not.toHaveBeenCalled()
  expect(objectURL).toHaveBeenCalledWith(binary)
  const content=request.mock.calls.find(([url])=>url===base+'/assets/report-image/content')
  expect(content?.[1]).toMatchObject({method:'GET',credentials:'same-origin'})
  expect(content?.[1]?.body).toBeUndefined()
  // Simulation must reuse the scoped report-image adapter, not Training's URL API.
  fireEvent.change(screen.getByLabelText('模拟原始分（仅检查呈现，不是实际计分）'),{target:{value:'2'}})
  await waitFor(()=>expect(screen.getAllByRole('img',{name:'report'})).toHaveLength(2))
  fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
  await waitFor(()=>expect(request.mock.calls.some(([url,options])=>url===base&&options?.method==='PUT')).toBe(true))
  const save=request.mock.calls.find(([url,options])=>url===base&&options?.method==='PUT')
  const saved=JSON.parse(save?.[1]?.body as string)
  expect(saved.definition.report.rawScoreFeedback.rules[0].ranges[0].images).toEqual([{asset,altText:'report',order:0}])
  expect(saved.definition.items[0].images).toBeUndefined()
  expect(request.mock.calls.every(([url])=>url.startsWith(prefix+'/'))).toBe(true)
  expect(request.mock.calls.some(([url])=>url.includes('/uploads/image')||url.endsWith('/url'))).toBe(false)
 })
})
