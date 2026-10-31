import {useEffect,useRef,useState} from 'react'
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import HuiteacherApp from './HuiteacherApp'
import {HuiteacherFieldWorkspace} from './HuiteacherFieldWorkspace'
import {TeacherAssessmentProvider} from './TeacherAssessmentPage'
// This suite owns activity/note/account boundaries. Native transport and finals
// are covered by HuiteacherFieldQuestionnaire.test.tsx; no second Form engine.
vi.mock('./HuiteacherFieldQuestionnaire',()=>({HuiteacherFieldQuestionnaire:({task,onProgress}:{task:{title:string;attemptId:string|null;status:string};onProgress:(value:{attemptId:string|null;completed:boolean;writing:boolean})=>void})=>{
 const [started,setStarted]=useState(!!task.attemptId),[completed,setCompleted]=useState(task.status==='COMPLETED'),notify=useRef(onProgress);notify.current=onProgress
 useEffect(()=>notify.current({attemptId:started?'canonical-attempt':null,completed,writing:false}),[started,completed])
 return <section><h4>{task.title}</h4><button onClick={()=>setStarted(true)}>开始固定问卷</button><button onClick={()=>{setStarted(true);setCompleted(true)}}>完成固定问卷</button></section>
}}))
type Api=Parameters<typeof HuiteacherFieldWorkspace>[0]['api']
const invite={invitationId:'invite',organizationId:'school',eventId:'event',title:'课堂实践活动',kind:'CLASSROOM',role:'PEER',expiresAt:'2026-12-01T00:00:00Z',status:'ACCEPTED'}
const form={title:'课堂观察预制表单',targetName:'本次教师',assessmentRef:{origin:{versionId:'fixed-version',contentHash:'a'.repeat(64),targetKind:'PERSON'}},attemptId:null,status:'ASSIGNED',attemptEpoch:null}
const note={id:'note',eventId:'event',kind:'FORMAL_FEEDBACK',status:'DRAFT',revision:1,content:'原有意见',createdAt:'2026-10-26',submittedAt:null as string|null}
function Workspace({api,onDraftStateChange}:{api:Api;onDraftStateChange?:(value:{dirty:boolean;writing:boolean})=>void}){
 const [active,setActive]=useState(false)
 return <TeacherAssessmentProvider scope="ht-professional-practice" onActiveChange={setActive}><div hidden={active}><h1>专业实践首页</h1><HuiteacherFieldWorkspace api={api} onDraftStateChange={onDraftStateChange}/><p>其他协作卡片</p></div></TeacherAssessmentProvider>
}
function fixture({bound=form,existing=[] as typeof note[],invites=[invite]}:{bound?:typeof form|null;existing?:typeof note[];invites?:typeof invite[]}={}){
 let notes=[...existing]
 const api=vi.fn(async(path:string,method?:string,data?:unknown)=>{
  if(path==='/my-field-invitations')return {list:invites}
  if(path==='/my-field-notes')return {list:notes}
  if(path.endsWith('/form'))return bound
  if(path.endsWith('/field-notes')&&method==='POST'){const body=data as {kind:string;content:string};notes=[{...note,...body}];return {id:'note',eventId:'event',kind:body.kind,status:'DRAFT',revision:1}}
  if(path==='/field-notes/note'&&method==='PUT'){const body=data as {content:string};notes=notes.map(n=>({...n,content:body.content,revision:n.revision+1}));return {id:'note',revision:2}}
  if(path==='/field-notes/note/submit'){notes=notes.map(n=>({...n,status:'SUBMITTED',revision:n.revision+1}));return {id:'note',status:'SUBMITTED'}}
  throw Error('Unexpected '+path)
 })
 return api
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();window.history.replaceState(null,'','/')})
describe('Teacher professional practice form pages',()=>{
 it('opens submitted feedback read-only instead of creating another form, retaining historical duplicates',async()=>{
  const completed={...note,id:'completed',status:'SUBMITTED',content:'已提交专业意见',submittedAt:'2026-10-26T10:00:00Z'}
  const older={...completed,id:'older',content:'历史原稿'}
  const api=fixture({existing:[completed,older]});render(<Workspace api={api as Api}/>)
  const view=await screen.findByRole('button',{name:'查看已提交记录'})
  expect(screen.queryByRole('button',{name:'填写实践表单'})).not.toBeInTheDocument()
  expect(screen.getAllByRole('button',{name:'查看记录'})).toHaveLength(2)
  fireEvent.click(view)
  const page=await screen.findByRole('region',{name:'专业实践独立页面'})
  expect(within(page).getByText('已提交专业意见')).toBeInTheDocument()
  expect(within(page).queryByRole('textbox')).not.toBeInTheDocument()
  expect(within(page).queryByRole('button',{name:'正式提交'})).not.toBeInTheDocument()
  expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
  expect(api.mock.calls.some(([path])=>path.endsWith('/form'))).toBe(false)
 })
 it('prevents an older draft from submitting when the activity already has formal feedback',async()=>{
  const completed={...note,id:'completed',status:'SUBMITTED',content:'已提交专业意见',submittedAt:'2026-10-26T10:00:00Z'}
  const api=fixture({existing:[note,completed]});render(<Workspace api={api as Api}/>)
  fireEvent.click(await screen.findByRole('button',{name:'继续填写'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('不能再次填写或提交')
  expect(screen.getByRole('button',{name:'保存专业意见草稿'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'正式提交'})).toBeDisabled()
  expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
 })
 it('opens the canonical host on a dedicated page and preserves the professional draft on return',async()=>{
  const api=fixture(),draft=vi.fn();render(<Workspace api={api as Api} onDraftStateChange={draft}/>)
  expect(screen.queryByRole('textbox',{name:'专业意见与补充说明'})).not.toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button',{name:'填写实践表单'}))
  const page=await screen.findByRole('region',{name:'专业实践独立页面'})
  expect(screen.queryByRole('heading',{name:'专业实践首页'})).not.toBeInTheDocument()
  expect(screen.getByText('其他协作卡片')).not.toBeVisible()
  await within(page).findByRole('heading',{name:'课堂观察预制表单'})
  fireEvent.click(screen.getByRole('button',{name:'开始固定问卷'}))
  expect(screen.getByRole('button',{name:'正式提交'})).toBeDisabled()
  fireEvent.change(within(page).getByRole('textbox',{name:'专业意见与补充说明'}),{target:{value:'未提交的专业意见'}})
  fireEvent.click(within(page).getByRole('button',{name:'返回专业实践'}))
  expect(screen.getByRole('heading',{name:'专业实践首页'})).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'填写实践表单'}))
  expect(await screen.findByRole('textbox',{name:'专业意见与补充说明'})).toHaveValue('未提交的专业意见')
  expect(draft).toHaveBeenLastCalledWith({dirty:true,writing:false})
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true)
  expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
  expect(api.mock.calls.filter(([path])=>path.endsWith('/form'))).toHaveLength(1)
 })
 it('links only canonical completion on explicit formal confirmation and preserves the separately saved opinion',async()=>{
  const api=fixture(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false);render(<Workspace api={api as Api}/>)
  fireEvent.click(await screen.findByRole('button',{name:'填写实践表单'}))
  await screen.findByRole('heading',{name:'课堂观察预制表单'})
  fireEvent.change(screen.getByRole('textbox',{name:'专业意见与补充说明'}),{target:{value:'独立专业意见'}})
  fireEvent.click(screen.getByRole('button',{name:'保存专业意见草稿'}))
  await screen.findByText(/专业意见草稿已加密保存/)
  expect(screen.getByRole('button',{name:'正式提交'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'完成固定问卷'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'正式提交'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'正式提交'}))
  await waitFor(()=>expect(confirm).toHaveBeenCalledOnce())
  expect(api.mock.calls.some(([path])=>path.endsWith('/submit'))).toBe(false)
  await waitFor(()=>expect(screen.getByRole('button',{name:'正式提交'})).toBeEnabled())
  confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'正式提交'}))
  await screen.findByText('正式观察记录已提交，原稿将保持不可改写。')
  expect(api).toHaveBeenCalledWith('/organizations/school/evaluation-events/event/field-notes','POST',{kind:'FORMAL_FEEDBACK',content:'独立专业意见'})
  expect(api).toHaveBeenCalledWith('/field-notes/note/submit','POST',{expectedRevision:1,assessmentAttemptId:'canonical-attempt'})
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(api.mock.calls.filter(([path])=>path.endsWith('/form'))).toHaveLength(1)
 })
 it('warns before leaving the practice module with unsubmitted form answers and respects cancellation',async()=>{
  const api=fixture(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,message:'成功',data})})
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url.endsWith('/auth/me'))return reply({id:'actor',username:'Teacher',role:'TEACHER',mustChangePassword:false,organizations:[{organizationId:'school',organizationName:'测试学校',productAdmin:true}]})
    if(url.endsWith('/tool-authoring-capabilities'))return reply({canAuthor:false,authorableToolKinds:[]})
    const path=url.replace('/api/huiteacher','')
    if(path==='/my-field-invitations'||path==='/my-field-notes'||path.endsWith('/form'))return reply(await api(path))
    return reply({list:[]})
  }))
  render(<HuiteacherApp/>)
  fireEvent.click(await screen.findByRole('button',{name:'专业实践'}))
  fireEvent.click(await screen.findByRole('button',{name:'填写实践表单'}))
  fireEvent.click(await screen.findByRole('button',{name:'开始固定问卷'}))
  fireEvent.click(screen.getByRole('button',{name:'返回专业实践'}))
  fireEvent.click(screen.getByRole('button',{name:'教师成长'}))
  expect(confirm).toHaveBeenCalledWith('实践表单或记录尚未正式保存，确定放弃当前输入并离开吗？')
  expect(screen.getByRole('button',{name:'专业实践'})).toHaveAttribute('aria-pressed','true')
  confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'教师成长'}))
  expect(screen.getByRole('button',{name:'教师成长'})).toHaveAttribute('aria-pressed','true')
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(false)
 })
 it('reports missing presets instead of offering an empty text-only formal activity',async()=>{
  const api=fixture({bound:null});render(<Workspace api={api as Api}/>)
  fireEvent.click(await screen.findByRole('button',{name:'填写实践表单'}))
  await screen.findByText(/本活动尚未配置预制表单/)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'正式提交'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'返回专业实践'}))
  expect(screen.getByRole('heading',{name:'专业实践首页'})).toBeVisible()
  expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
 })
 it('opens saved formal drafts with the preset rather than expanding them among other cards',async()=>{
  const api=fixture({existing:[note]});render(<Workspace api={api as Api}/>)
  fireEvent.click(await screen.findByRole('button',{name:'继续填写'}))
  await screen.findByRole('heading',{name:'课堂观察预制表单'})
  expect(screen.getByRole('textbox',{name:'专业意见与补充说明'})).toHaveValue('原有意见')
  expect(screen.queryByRole('heading',{name:'我的记录'})).not.toBeInTheDocument()
 })
 it('shows submitted private reflections read-only without requesting formal form evidence',async()=>{
  const api=fixture({existing:[{...note,kind:'PRIVATE_REFLECTION',status:'SUBMITTED',content:'仅本人可见的反思'}]});render(<Workspace api={api as Api}/>)
  fireEvent.click(await screen.findByRole('button',{name:'查看记录'}))
  await screen.findByText('仅本人可见的反思')
  expect(screen.getByText('私人反思仅本人可见，未向学校披露。')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
  expect(api.mock.calls.some(([path])=>path.endsWith('/form'))).toBe(false)
 })
 it('isolates a failed form load per activity and allows an explicit retry without a write',async()=>{
  const other={...invite,invitationId:'other',eventId:'other-event',title:'另一活动'};let fail=true
  const base=fixture({invites:[invite,other]})
  const api=vi.fn(async(path:string,method?:string,data?:unknown)=>{if(path==='/field-invitations/other/form'&&fail)throw Error('暂时不可用');return base(path,method,data)})
  render(<Workspace api={api as Api}/>)
  const buttons=await screen.findAllByRole('button',{name:'填写实践表单'})
  fireEvent.click(buttons[0]);await screen.findByRole('heading',{name:'课堂观察预制表单'})
  fireEvent.click(screen.getByRole('button',{name:'返回专业实践'}));fireEvent.click(buttons[1])
  await screen.findByText(/实践表单暂时无法读取/)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  fail=false;fireEvent.click(screen.getByRole('button',{name:'重试实践表单'}))
  await screen.findByRole('heading',{name:'课堂观察预制表单'})
  expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
 })
 it('does not prefetch accepted activities or auxiliary records, and reads only the opened formal activity',async()=>{
  const other={...invite,invitationId:'other',eventId:'other-event',title:'另一活动'}
  const auxiliary={...note,id:'fact',kind:'FACT',content:'事实记录'}
  const api=fixture({invites:[invite,other],existing:[auxiliary]})
  render(<Workspace api={api as Api}/>)
  const buttons=await screen.findAllByRole('button',{name:'填写实践表单'})
  expect(api.mock.calls.map(([path])=>path)).toEqual(['/my-field-invitations','/my-field-notes'])
  fireEvent.click(screen.getByRole('button',{name:'继续填写'}))
  expect(await screen.findByRole('textbox',{name:'记录正文'})).toHaveValue('事实记录')
  expect(api.mock.calls.some(([path])=>path.endsWith('/form'))).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'返回专业实践'}))
  fireEvent.click(buttons[1])
  await screen.findByRole('heading',{name:'课堂观察预制表单'})
  expect(api.mock.calls.filter(([path])=>path.endsWith('/form')).map(([path])=>path)).toEqual(['/field-invitations/other/form'])
 })
 it('ignores a late abandoned activity read and reloads it without replacing the currently selected frozen form',async()=>{
  const other={...invite,invitationId:'other',eventId:'other-event',title:'另一活动'}
  let resolve!:(value:typeof form)=>void,reads=0
  const late=new Promise<typeof form>(done=>{resolve=done})
  const base=fixture({invites:[invite,other]})
  const api=vi.fn((path:string,method?:string,data?:unknown)=>{
   if(path==='/field-invitations/invite/form')return ++reads===1?late:Promise.resolve({...form,title:'重新读取的冻结版本'})
   if(path==='/field-invitations/other/form')return Promise.resolve({...form,title:'另一活动冻结表单'})
   return base(path,method,data)
  })
  render(<Workspace api={api as Api}/>)
  const buttons=await screen.findAllByRole('button',{name:'填写实践表单'})
  fireEvent.click(buttons[0]);await screen.findByText('正在读取本活动的预制表单…')
  fireEvent.click(screen.getByRole('button',{name:'返回专业实践'}));fireEvent.click(buttons[1])
  await screen.findByRole('heading',{name:'另一活动冻结表单'})
  fireEvent.change(screen.getByRole('textbox',{name:'专业意见与补充说明'}),{target:{value:'保留活动意见'}})
  await act(async()=>resolve({...form,title:'迟到的旧版本'}))
  expect(screen.queryByRole('heading',{name:'迟到的旧版本'})).not.toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'另一活动冻结表单'})).toBeInTheDocument()
  expect(screen.getByRole('textbox',{name:'专业意见与补充说明'})).toHaveValue('保留活动意见')
  fireEvent.click(screen.getByRole('button',{name:'返回专业实践'}));fireEvent.click(buttons[0])
  await screen.findByRole('heading',{name:'重新读取的冻结版本'})
  expect(reads).toBe(2)
  fireEvent.click(screen.getByRole('button',{name:'返回专业实践'}));fireEvent.click(buttons[1])
  expect(await screen.findByRole('textbox',{name:'专业意见与补充说明'})).toHaveValue('保留活动意见')
  expect(api.mock.calls.filter(([path])=>path==='/field-invitations/other/form')).toHaveLength(1)
  expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
 })
 it('keeps the previously loaded activity draft and frozen definition when retrying another activity',async()=>{
  const other={...invite,invitationId:'other',eventId:'other-event',title:'另一活动'}
  let fail=true
  const base=fixture({invites:[invite,other]})
  const api=vi.fn(async(path:string,method?:string,data?:unknown)=>{
   if(path==='/field-invitations/other/form'&&fail)throw Error('另一活动读取失败')
   return base(path,method,data)
  })
  render(<Workspace api={api as Api}/>)
  const buttons=await screen.findAllByRole('button',{name:'填写实践表单'})
  fireEvent.click(buttons[0]);fireEvent.click(await screen.findByRole('button',{name:'开始固定问卷'}))
  fireEvent.change(screen.getByRole('textbox',{name:'专业意见与补充说明'}),{target:{value:'保留的活动意见'}})
  fireEvent.click(screen.getByRole('button',{name:'返回专业实践'}));fireEvent.click(buttons[1])
  await screen.findByText(/实践表单暂时无法读取/)
  fail=false;fireEvent.click(screen.getByRole('button',{name:'重试实践表单'}))
  await screen.findByRole('heading',{name:'课堂观察预制表单'})
  fireEvent.click(screen.getByRole('button',{name:'返回专业实践'}));fireEvent.click(buttons[0])
  expect(await screen.findByRole('textbox',{name:'专业意见与补充说明'})).toHaveValue('保留的活动意见')
  expect(api.mock.calls.filter(([path])=>path==='/field-invitations/invite/form')).toHaveLength(1)
  expect(api.mock.calls.filter(([path])=>path==='/field-invitations/other/form')).toHaveLength(2)
 })
 it('does not reuse a prior API scope form or accept its late response',async()=>{
  let resolve!:(value:typeof form)=>void
  const late=new Promise<typeof form>(done=>{resolve=done}),base=fixture()
  const api=vi.fn((path:string,method?:string,data?:unknown)=>path.endsWith('/form')?late:base(path,method,data))
  const nextBase=fixture(),next=vi.fn(async(path:string,method?:string,data?:unknown)=>path.endsWith('/form')?{...form,title:'当前账号冻结表单'}:nextBase(path,method,data))
  const {rerender}=render(<Workspace api={api as Api}/>)
  fireEvent.click(await screen.findByRole('button',{name:'填写实践表单'}))
  await screen.findByText('正在读取本活动的预制表单…')
  rerender(<Workspace api={next as Api}/>)
  fireEvent.click(await screen.findByRole('button',{name:'填写实践表单'}))
  await screen.findByRole('heading',{name:'当前账号冻结表单'})
  await act(async()=>resolve({...form,title:'旧账号迟到表单'}))
  expect(screen.queryByRole('heading',{name:'旧账号迟到表单'})).not.toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'当前账号冻结表单'})).toBeInTheDocument()
  expect(next.mock.calls.filter(([path])=>path.endsWith('/form'))).toHaveLength(1)
 })

})
