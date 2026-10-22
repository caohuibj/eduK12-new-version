import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationPrivateToolStudio} from './EducationPrivateToolStudio'
import {emptyDefinition} from '../../pages/scaleDefinitionEditorModel'
import type {PrivateTool,PrivateToolApi} from './privateToolClient'

const base='/organizations/a/private-tools'
const draft:PrivateTool={id:'draft-a',kind:'SCALE',title:'我的量表',revision:3,contentHash:'hash-3',definition:emptyDefinition()}
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function apiWith(handler?:(path:string,method?:string,data?:unknown)=>unknown){
 return vi.fn(async(path:string,method?:string,data?:unknown)=>{
  const result=handler?.(path,method,data)
  if(result!==undefined)return result
  if(path===base)return {list:[draft],nextCursor:null}
  if(path===`${base}/${draft.id}`)return draft
  if(path.endsWith('/versions'))return {list:[]}
  throw Error(`Unexpected request: ${method??'GET'} ${path}`)
 })
}
async function openDraft(api:ReturnType<typeof apiWith>){
 render(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="a" entry="SCHOOL"/>)
 fireEvent.click(await screen.findByRole('button',{name:'编辑 我的量表'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled())
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})

describe('EducationPrivateToolStudio bounded private authoring workflow',()=>{
 it('explains private image editing and authorized task/report reading separately',async()=>{
  const api=apiWith()
  render(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="a" entry="SCHOOL"/>)
  await waitFor(()=>expect(screen.getByLabelText('工具名称')).toBeEnabled())
  expect(screen.getByText(/图片的编辑与上传仅限作者；发布后，仅在对应获授权任务及允许查看的报告中读取固定版本的图片。/)).toBeInTheDocument()
 })

 it('creates one draft despite repeated clicks and opens the returned native definition',async()=>{
  const created=deferred<PrivateTool>()
  const api=apiWith((path,method)=>path===base&&method==='POST'?created.promise:undefined)
  render(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="a" entry="TEACHER"/>)
  await waitFor(()=>expect(screen.getByLabelText('工具名称')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('工具名称'),{target:{value:'新量表'}})
  const create=screen.getByRole('button',{name:'创建私有工具'})
  fireEvent.click(create);fireEvent.click(create)
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
  expect(create).toBeDisabled()
  await act(async()=>created.resolve({...draft,title:'新量表'}))
  expect(screen.getByLabelText('工具名称')).toHaveValue('新量表')
  expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled()
  expect(api).toHaveBeenCalledWith(base,'POST',{kind:'SCALE',title:'新量表'})
 })
 it('does not blindly retry uncertain creation and requires an explicit list reload',async()=>{
  const api=apiWith((path,method)=>path===base&&method==='POST'?Promise.reject(Error('connection lost')):undefined)
  render(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="a" entry="SCHOOL"/>)
  await waitFor(()=>expect(screen.getByLabelText('工具名称')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('工具名称'),{target:{value:'新量表'}})
  fireEvent.click(screen.getByRole('button',{name:'创建私有工具'}))
  await screen.findByText(/创建结果尚未确认/)
  expect(screen.getByRole('button',{name:'创建私有工具'})).toBeDisabled()
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'重新读取列表'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'创建私有工具'})).toBeEnabled())
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
 })
 it('preserves the draft after CAS 409 and does not automatically reload or overwrite',async()=>{
  const api=apiWith((_path,method)=>method==='PUT'?Promise.reject({status:409,code:'PRIVATE_TOOL_REVISION_CONFLICT'}):undefined)
  await openDraft(api)
  fireEvent.change(screen.getByLabelText('工具名称'),{target:{value:'未保存的标题'}})
  fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
  await screen.findByText(/草稿已被其他窗口修改/)
  expect(screen.getByLabelText('工具名称')).toHaveValue('未保存的标题')
  expect(api.mock.calls.filter(([path,method])=>path===`${base}/${draft.id}`&&!method)).toHaveLength(1)
  const put=api.mock.calls.find(([,method])=>method==='PUT')
  expect(put?.[2]).toMatchObject({expectedRevision:3,title:'未保存的标题'})
  vi.spyOn(window,'confirm').mockReturnValue(false)
  fireEvent.click(screen.getByRole('button',{name:'重新读取草稿'}))
  expect(window.confirm).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('工具名称')).toHaveValue('未保存的标题')
 })
 it('guards dirty back and unload, and removes the unload guard on unmount',async()=>{
  const api=apiWith()
  await openDraft(api)
  fireEvent.change(screen.getByLabelText('工具名称'),{target:{value:'尚未保存'}})
  vi.spyOn(window,'confirm').mockReturnValue(false)
  fireEvent.click(screen.getByRole('button',{name:'返回我的工具'}))
  expect(screen.getByLabelText('工具名称')).toHaveValue('尚未保存')
  const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  cleanup()
  const after=new Event('beforeunload',{cancelable:true});window.dispatchEvent(after)
  expect(after.defaultPrevented).toBe(false)
 })
 it('ignores an old school detail response after scope change',async()=>{
  const old=deferred<PrivateTool>()
  const api=apiWith((path)=>path===`${base}/${draft.id}`?old.promise:path==='/organizations/b/private-tools'?{list:[],nextCursor:null}:undefined)
  const {rerender}=render(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="a" entry="SCHOOL"/>)
  fireEvent.click(await screen.findByRole('button',{name:'编辑 我的量表'}))
  rerender(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="b" entry="SCHOOL"/>)
  await screen.findByText(/暂无私有工具/)
  await act(async()=>old.resolve(draft))
  expect(screen.queryByRole('button',{name:'保存草稿'})).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue(draft.title)).not.toBeInTheDocument()
  expect(api).not.toHaveBeenCalledWith(`${base}/${draft.id}/versions`)
 })
 it('freezes only a checked private revision and never calls Training media transport',async()=>{
  const fetch=vi.fn(()=>Promise.reject(Error('unexpected global transport')));vi.stubGlobal('fetch',fetch)
  const api=apiWith((path)=>path.endsWith('/validate')?{valid:true,issues:[],revision:3,contentHash:'hash-3'}:path.endsWith('/freeze')?{id:'version-a',title:draft.title,sourceRevision:3,contentHash:'hash-3'}:undefined)
  await openDraft(api)
  expect(screen.getByRole('button',{name:'固定私有版本'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'报告文案'}))
  expect(screen.queryByRole('button',{name:/上传/})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'检查定义'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'固定私有版本'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'固定私有版本'}))
  await screen.findByText('私有版本已固定。此操作不会发布活动、开放学生作答或进入公共工具库。')
  expect(api).toHaveBeenCalledWith(`${base}/${draft.id}/freeze`,'POST',{expectedRevision:3,expectedContentHash:'hash-3'})
  expect(api.mock.calls.every(([path])=>path.startsWith(base))).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
 })
 it('rejects a preview produced from a changed server definition and revokes freeze readiness',async()=>{
  const api=apiWith(path=>path.endsWith('/validate')?{valid:true,issues:[],revision:3,contentHash:'hash-3'}:path.endsWith('/preview')?{contentHash:'different-hash',result:{score:999}}:undefined)
  await openDraft(api)
  fireEvent.click(screen.getByRole('button',{name:'检查定义'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'试填预览'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'试填预览'}))
  fireEvent.click(screen.getByRole('button',{name:'检查试填结果'}))
  await screen.findByText('服务端定义已变化，当前试填结果不再对应本页版本。请重新读取并核对草稿。')
  expect(screen.queryByText('服务端预览结果')).not.toBeInTheDocument()
  expect(screen.queryByText(/999/)).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'固定私有版本'})).toBeDisabled()
 })

})

describe('private version history copy',()=>{
 it('labels a cursor-limited history as partial rather than newest or complete',async()=>{
  const api=apiWith(path=>path.endsWith('/versions')?{list:[{id:'v1',title:'历史版本',sourceRevision:1,contentHash:'old'}],nextCursor:'more-id'}:undefined)
  await openDraft(api)
  expect(await screen.findByText(/当前仅显示部分固定版本，不代表完整历史/)).toBeInTheDocument()
  expect(screen.getByText('当前显示的固定版本（1）')).toBeInTheDocument()
  expect(screen.queryByText(/最近50|全部固定版本/)).not.toBeInTheDocument()
 })
})
