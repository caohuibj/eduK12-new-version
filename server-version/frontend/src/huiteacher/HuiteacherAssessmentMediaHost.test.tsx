import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import HuiteacherApp from './HuiteacherApp'
vi.mock('./HuiteacherPersonalSelf',()=>({HuiteacherPersonalSelf:()=>null}))
vi.mock('./HuiteacherMyFormTasks',()=>({HuiteacherMyFormTasks:()=>null}))
vi.mock('./HuiteacherClassRelationships',()=>({HuiteacherClassRelationships:()=>null}))
const reply=(data:unknown)=>({ok:true,status:200,json:async()=>({code:0,data})})
function state(id:string,video=true){return {id,assessmentId:'assessment',name:'教师题图测评',instruction:null,status:'IN_PROGRESS',progress:0,completedItems:0,totalItems:1,currentIndex:0,startedAt:'2026-10-22T00:00:00Z',lastSavedAt:'2026-10-22T00:00:00Z',completedAt:null,anonymousCode:null,items:[{id:'unit',type:'SCALE',position:0,label:'题图单元',completed:false,index:0}],deliveryMode:'FINAL_ONLY',attemptEpoch:1,contextSnapshotHash:null,currentItem:{id:'unit',type:'SCALE',position:0,required:true,definitionHash:'hash-'+id,scaleAssessmentId:'scale-assessment',scale:{id:'scale',name:'题图量表',definition:{schemaVersion:2,respondentType:'participant_self_report',display:{randomizeItems:false},items:[{itemCode:'q',content:'教师题目',type:'single',required:true,sortOrder:0,responseSetKey:'set',randomizeOptions:false,options:[{value:'yes',label:'同意'}],images:[{asset:{assetId:'image',contentHash:'a'.repeat(64),mimeType:'image/png'},altText:'教师题图',order:0}],...(video?{video:{schemaVersion:1,video:{assetId:'video',contentHash:'b'.repeat(64),mimeType:'video/webm'}}}:{})}]}}}}}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();window.history.replaceState(null,'','/')})
describe('real Teacher host and FinalComposite assessment media',()=>{
 it.each(['valid','invalid'] as const)('routes images and %s video capabilities only through Teacher session and CSRF',async mode=>{
  const id='attempt-'+mode,prefix='/api/huiteacher'
  const binary=new Blob(['png'],{type:'image/png'}),readBlob=vi.fn().mockResolvedValue(binary)
  const create=vi.fn(()=> 'blob:teacher-image')
  vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=vi.fn()});vi.stubGlobal('scrollTo',vi.fn())
  document.cookie='huiteacher_csrf=; Max-Age=0; path=/'
  const request=vi.fn(async(url:string,options?:RequestInit)=>{
   if(url===prefix+'/auth/me')return reply({id:'teacher',username:'教师',role:'TEACHER',mustChangePassword:false,organizations:[{organizationId:'school',organizationName:'学校',productAdmin:false}]})
   if(url===prefix+'/auth/csrf')return reply({csrfToken:'teacher-media-csrf'})
   if(url===prefix+'/my-scale-tasks')return reply({list:[{executionId:'exec',eventId:'event',eventTitle:'活动',runId:'run',organizationId:'school',status:'STARTED',runtimeBindingRef:id,resourceKey:'library-scale:one',title:'我的量表',runStatus:'PUBLISHED'}]})
   if(url===prefix+'/composite-attempts/'+id)return reply(state(id))
   if(url.endsWith('/scale/assets/image/content'))return {ok:true,status:200,blob:readBlob,json:()=>{throw Error('image parsed as JSON')}}
   if(url.endsWith('/scale/items/q/video-capability'))return reply(mode==='valid'?{videoUrl:'https://media.example.test/video.webm',expiresAt:1900000000000}:{videoUrl:7})
   if(options?.method==='POST')throw Error('Unexpected POST '+url)
   return reply({list:[],canAuthor:false})
  })
  vi.stubGlobal('fetch',request);render(<HuiteacherApp/>)
  fireEvent.click(await screen.findByRole('button',{name:'进入本人自评'}))
  await screen.findByRole('img',{name:'教师题图'})
  const videoPath=`${prefix}/composite-attempts/${id}/items/unit/scale/items/q/video-capability`
  await waitFor(()=>expect(request.mock.calls.some(([url])=>url===videoPath)).toBe(true))
  const exchange=request.mock.calls.find(([url])=>url===videoPath)![1]!
  expect(exchange).toMatchObject({method:'POST',credentials:'same-origin',body:'{}'})
  expect(new Headers(exchange.headers).get('x-csrf-token')).toBe('teacher-media-csrf')
  const image=request.mock.calls.find(([url])=>url===`${prefix}/composite-attempts/${id}/items/unit/scale/assets/image/content`)![1]!
  expect(image).toMatchObject({method:'GET',credentials:'same-origin'});expect(create).toHaveBeenCalledWith(binary)
  if(mode==='invalid')await screen.findByText('视频授权响应无效')
  else await waitFor(()=>expect(document.querySelector('video')?.getAttribute('src')).toBe('https://media.example.test/video.webm'))
  expect(request.mock.calls.every(([url])=>url.startsWith(prefix+'/'))).toBe(true)
 })
 it('does not mount a late old-attempt image after another real task is opened',async()=>{
  const late=deferred<Blob>(),create=vi.fn<(blob:Blob)=>string>(()=> 'blob:current'),prefix='/api/huiteacher'
  vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=vi.fn()});vi.stubGlobal('scrollTo',vi.fn())
  const current=new Blob(['new'],{type:'image/png'})
  const request=vi.fn(async(url:string)=>{
   if(url===prefix+'/auth/me')return reply({id:'teacher',username:'教师',role:'TEACHER',mustChangePassword:false,organizations:[]})
   if(url===prefix+'/my-scale-tasks')return reply({list:['old','new'].map(id=>({executionId:id,eventId:'event',eventTitle:'活动',runId:'run',organizationId:'school',status:'STARTED',runtimeBindingRef:id,resourceKey:'library-scale:one',title:id,runStatus:'PUBLISHED'}))})
   if(url===prefix+'/composite-attempts/old')return reply(state('old',false))
   if(url===prefix+'/composite-attempts/new')return reply(state('new',false))
   if(url.includes('/old/items/unit/scale/assets/'))return {ok:true,status:200,blob:()=>late.promise}
   if(url.includes('/new/items/unit/scale/assets/'))return {ok:true,status:200,blob:async()=>current}
   return reply({list:[],canAuthor:false})
  })
  vi.stubGlobal('fetch',request);render(<HuiteacherApp/>)
  const buttons=await screen.findAllByRole('button',{name:'进入本人自评'});fireEvent.click(buttons[0])
  await waitFor(()=>expect(request.mock.calls.some(([url])=>url.includes('/old/items/unit/scale/assets/'))).toBe(true))
  await waitFor(()=>expect(screen.getAllByRole('button',{name:'进入本人自评'})[1]).toBeEnabled())
  fireEvent.click(screen.getAllByRole('button',{name:'进入本人自评'})[1])
  expect(await screen.findByRole('img',{name:'教师题图'})).toHaveAttribute('src','blob:current')
  const old=new Blob(['old'],{type:'image/png'});await act(async()=>late.resolve(old))
  expect(create.mock.calls.some(([blob])=>blob===current)).toBe(true)
  expect(create.mock.calls.some(([blob])=>blob===old)).toBe(false)
  expect(screen.getByRole('img',{name:'教师题图'})).toHaveAttribute('src','blob:current')
  expect(request.mock.calls.every(([url])=>url.startsWith(prefix+'/'))).toBe(true)
 })
})
