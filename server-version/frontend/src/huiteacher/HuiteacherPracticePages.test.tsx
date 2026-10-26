import {useState} from 'react'
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import HuiteacherApp from './HuiteacherApp'
import {HuiteacherFieldWorkspace} from './HuiteacherFieldWorkspace'
import {TeacherAssessmentProvider} from './TeacherAssessmentPage'
import type {FormDraft} from '../survey/builder.types'
type Api=Parameters<typeof HuiteacherFieldWorkspace>[0]['api']
const invite={invitationId:'invite',organizationId:'school',eventId:'event',title:'课堂实践活动',kind:'CLASSROOM',role:'PEER',expiresAt:'2026-12-01T00:00:00Z',status:'ACCEPTED'}
const pages:FormDraft['pages']=[{pageKey:'one',title:'课堂观察',questions:[{itemKey:'q1',prompt:'教学目标是否清晰',type:'SINGLE',required:true,options:[{optionKey:'a',label:'目标清晰'}],rows:[]},{itemKey:'q2',prompt:'学生参与情况',type:'SINGLE',required:true,options:[{optionKey:'b',label:'积极参与'}],rows:[]}]},{pageKey:'two',title:'改进建议',questions:[{itemKey:'q3',prompt:'后续跟进',type:'SINGLE',required:true,options:[{optionKey:'c',label:'安排教研跟进'}],rows:[]}]}]
const form={formId:'form',title:'课堂观察预制表单',definitionDigest:'fixed',pages}
const note={id:'note',eventId:'event',kind:'FORMAL_FEEDBACK',status:'DRAFT',revision:1,content:'原有意见',createdAt:'2026-10-26',submittedAt:null}
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
 it('opens the preset form on a dedicated page, keeps the manual block boundary and preserves answers on return',async()=>{
  const api=fixture(),draft=vi.fn();render(<Workspace api={api as Api} onDraftStateChange={draft}/>)
  expect(screen.queryByRole('textbox',{name:'专业意见与补充说明'})).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox',{name:'记录正文'})).not.toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button',{name:'填写实践表单'}))
  const page=await screen.findByRole('region',{name:'专业实践独立页面'})
  expect(screen.queryByRole('heading',{name:'专业实践首页'})).not.toBeInTheDocument()
  expect(screen.getByText('其他协作卡片')).not.toBeVisible()
  await within(page).findByRole('heading',{name:'课堂观察预制表单'})
  const choice=within(page).getByRole('radio',{name:'目标清晰'})
  choice.focus();fireEvent.click(choice)
  await waitFor(()=>expect(choice).toBeChecked())
  expect(choice).toHaveFocus()
  expect(document.getElementById('survey-answer-form-q2')).not.toHaveFocus()
  fireEvent.click(within(page).getByRole('radio',{name:'积极参与'}))
  expect(screen.queryByRole('radio',{name:'安排教研跟进'})).not.toBeInTheDocument()
  expect(within(page).getByRole('button',{name:'正式提交'})).toBeDisabled()
  fireEvent.click(within(page).getByRole('button',{name:'下一页'}))
  fireEvent.click(within(page).getByRole('radio',{name:'安排教研跟进'}))
  fireEvent.change(within(page).getByRole('textbox',{name:'专业意见与补充说明'}),{target:{value:'未提交的专业意见'}})
  fireEvent.click(within(page).getByRole('button',{name:'返回专业实践'}))
  expect(screen.getByRole('heading',{name:'专业实践首页'})).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'填写实践表单'}))
  expect(await screen.findByRole('radio',{name:'安排教研跟进'})).toBeChecked()
  expect(screen.getByRole('textbox',{name:'专业意见与补充说明'})).toHaveValue('未提交的专业意见')
  expect(draft).toHaveBeenLastCalledWith({dirty:true,writing:false})
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true)
  expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
 })
 it('keeps structured answers through creation and submits only via explicit confirmation using the existing API',async()=>{
  const api=fixture(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false);render(<Workspace api={api as Api}/>)
  fireEvent.click(await screen.findByRole('button',{name:'填写实践表单'}))
  fireEvent.click(await screen.findByRole('radio',{name:'目标清晰'}));fireEvent.click(screen.getByRole('radio',{name:'积极参与'}))
  fireEvent.click(screen.getByRole('button',{name:'下一页'}));fireEvent.click(screen.getByRole('radio',{name:'安排教研跟进'}))
  fireEvent.change(screen.getByRole('textbox',{name:'专业意见与补充说明'}),{target:{value:'独立专业意见'}})
  fireEvent.click(screen.getByRole('button',{name:'保存专业意见草稿'}))
  await screen.findByText(/专业意见草稿已加密保存/)
  await waitFor(()=>expect(screen.getByRole('radio',{name:'安排教研跟进'})).toBeChecked())
  fireEvent.click(screen.getByRole('button',{name:'正式提交'}))
  await waitFor(()=>expect(confirm).toHaveBeenCalledOnce())
  expect(api.mock.calls.some(([path])=>path.endsWith('/submit'))).toBe(false)
  await waitFor(()=>expect(screen.getByRole('button',{name:'正式提交'})).toBeEnabled())
  confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'正式提交'}))
  await screen.findByText('正式观察记录已提交，原稿将保持不可改写。')
  expect(api).toHaveBeenCalledWith('/organizations/school/evaluation-events/event/field-notes','POST',{kind:'FORMAL_FEEDBACK',content:'独立专业意见'})
  expect(api).toHaveBeenCalledWith('/field-notes/note/submit','POST',{expectedRevision:1,fieldFormId:'form',answers:{q1:'a',q2:'b',q3:'c'}})
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
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
  fireEvent.click(await screen.findByRole('radio',{name:'目标清晰'}))
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
})
