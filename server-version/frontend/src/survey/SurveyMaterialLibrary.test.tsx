import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {SurveyMaterialLibrary,type SurveyMaterial} from './SurveyMaterialLibrary'
vi.mock('../components/shared-ui/ModalSurface',()=>({default:({open,children}:{open:boolean;children:React.ReactNode})=>open?<div>{children}</div>:null}))
vi.mock('../components/scale-governance/ScaleLibraryMediaPreview',()=>({ScaleLibraryMediaPreview:({context}:{context:{id:string}})=><p>受控媒体预览：{context.id}</p>}))
const row:SurveyMaterial={id:'own-one',name:'课堂图片.png',kind:'image',mimeType:'image/png',size:1024,updatedAt:'2026-10-22T00:00:00Z',source:'owned'}
const response=(data:unknown,ok=true)=>Promise.resolve({ok,json:async()=>({code:ok?0:-1,data,message:ok?'ok':'权限不足'})} as Response)
beforeEach(()=>{window.history.replaceState(null,'','/workspace/media');vi.stubGlobal('fetch',vi.fn((url:string)=>url.endsWith('/auth/csrf')?response({csrfToken:'test-csrf'}):response({list:[row],total:1})))})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('Survey materials follow the Training management flow',()=>{
 it('filters types and sources server-side, submits search, and preserves the URL',async()=>{
  render(<SurveyMaterialLibrary/>);await screen.findByRole('heading',{name:row.name})
  fireEvent.click(within(screen.getByRole('group',{name:'素材类型'})).getByRole('button',{name:'视频'}))
  fireEvent.change(screen.getByLabelText('素材来源'),{target:{value:'granted'}})
  fireEvent.change(screen.getByLabelText('检索素材'),{target:{value:'培训'}});fireEvent.click(screen.getByRole('button',{name:'检索'}))
  await waitFor(()=>expect(String(vi.mocked(fetch).mock.calls[vi.mocked(fetch).mock.calls.length-1]?.[0])).toContain('keyword=%E5%9F%B9%E8%AE%AD'))
  expect(window.location.search).toContain('source=granted');expect(window.location.search).toContain('kind=video')
 })
 it('ignores stale lists after switching source and shows a recoverable read error',async()=>{
  let resolve!:(value:Response)=>void;const pending=new Promise<Response>(r=>{resolve=r})
  vi.stubGlobal('fetch',vi.fn((url:string)=>url.includes('source=all')?pending:response(null,false)))
  render(<SurveyMaterialLibrary/>);fireEvent.change(screen.getByLabelText('素材来源'),{target:{value:'granted'}})
  expect(await screen.findByRole('alert')).toHaveTextContent('权限不足');resolve(await response({list:[row],total:1}))
  await waitFor(()=>expect(screen.queryByRole('heading',{name:row.name})).not.toBeInTheDocument())
  expect(screen.getByRole('button',{name:'重新读取列表'})).toBeEnabled()
 })
 it('keeps granted media read-only and previews only through its exact entry context',async()=>{
  vi.stubGlobal('fetch',vi.fn(()=>response({list:[{...row,source:'granted',bound:{entryId:'exact-entry',title:'授权量表',item:{assetId:row.id}}}],total:1})))
  render(<SurveyMaterialLibrary/>);await screen.findByRole('heading',{name:row.name})
  expect(screen.queryByRole('button',{name:'改名'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'预览'}));expect(screen.getByText('受控媒体预览：exact-entry')).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
 })
 it('requires an explicit upload, validates files locally and keeps a pending upload protected',async()=>{
  const user=userEvent.setup({applyAccept:false});let finish!:(value:Response)=>void
  vi.stubGlobal('fetch',vi.fn((url:string)=>url.includes('/upload/')?new Promise<Response>(resolve=>{finish=resolve}):url.endsWith('/auth/csrf')?response({csrfToken:'test-csrf'}):response({list:[row],total:1})))
  render(<SurveyMaterialLibrary/>);await screen.findByRole('heading',{name:row.name})
  fireEvent.click(screen.getByText('上传素材'));fireEvent.click(screen.getByRole('button',{name:'上传图片'}))
  const picker=screen.getByLabelText('选择素材文件')
  await user.upload(picker,new File(['x'],'bad.svg',{type:'image/svg+xml'}))
  expect(screen.getByRole('alert')).toHaveTextContent('符合要求');expect(screen.getByRole('button',{name:'开始上传'})).toBeDisabled()
  await user.upload(picker,new File(['image'],'课堂.png',{type:'image/png'}))
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('/upload/'))).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'开始上传'}));await waitFor(()=>expect(screen.getByRole('button',{name:'关闭上传窗口'})).toBeDisabled())
  const call=vi.mocked(fetch).mock.calls.find(([url])=>String(url).includes('/upload/image'))!;expect(call[1]).toMatchObject({method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':'test-csrf'}});expect(call[1]?.body).toBeInstanceOf(FormData)
  finish(await response({id:'uploaded'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByLabelText('素材来源')).toHaveValue('owned');expect(await screen.findByRole('status')).toHaveTextContent('素材已上传')
 })
 it('renames an owned card inline and preserves the input after a failed save',async()=>{
  let succeeds=false;vi.stubGlobal('fetch',vi.fn((url:string,options?:RequestInit)=>options?.method==='PATCH'?response({},succeeds):url.endsWith('/auth/csrf')?response({csrfToken:'test-csrf'}):response({list:[row],total:1})))
  render(<SurveyMaterialLibrary/>);await screen.findByRole('heading',{name:row.name});fireEvent.click(screen.getByRole('button',{name:'改名'}))
  fireEvent.change(screen.getByLabelText('修改素材名称'),{target:{value:'新图片名称'}});fireEvent.click(screen.getByRole('button',{name:'保存名称'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('权限不足');expect(screen.getByLabelText('修改素材名称')).toHaveValue('新图片名称')
  succeeds=true;fireEvent.click(screen.getByRole('button',{name:'保存名称'}));await waitFor(()=>expect(screen.queryByLabelText('修改素材名称')).not.toBeInTheDocument())
  expect(screen.getByRole('status')).toHaveTextContent('名称已更新')
 })
})
