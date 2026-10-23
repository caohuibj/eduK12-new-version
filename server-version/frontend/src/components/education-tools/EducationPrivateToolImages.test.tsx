import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationPrivateToolStudio} from './EducationPrivateToolStudio'
import {emptyDefinition} from '../../pages/scaleDefinitionEditorModel'
import type {PrivateTool,PrivateToolApi} from './privateToolClient'
const base='/organizations/school/private-tools/draft'
const asset={assetId:'image',contentHash:'a'.repeat(64),mimeType:'image/png' as const}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
function apiFor(draft:PrivateTool,upload:Promise<typeof asset>){return vi.fn(async(path:string,method?:string,_data?:unknown)=>{
 if(path==='/organizations/school/private-tools')return {list:[draft],nextCursor:null}
 if(path===base&&method==='PUT')return {revision:2,contentHash:'saved'}
 if(path===base)return draft
 if(path===base+'/versions')return {list:[],nextCursor:null}
 if(path===base+'/assets/images')return upload
 if(path===base+'/assets/image/content')return new Blob(['png'],{type:'image/png'})
 throw Error(`Unexpected ${method} ${path}`)
})}
async function open(api:ReturnType<typeof apiFor>,onDraftStateChange=vi.fn()){
 vi.stubGlobal('URL',class extends URL {static createObjectURL=vi.fn(()=> 'blob:private-image');static revokeObjectURL=vi.fn()})
 render(<EducationPrivateToolStudio api={api as PrivateToolApi} entry="SCHOOL" organizationId="school" actorId="psych" onDraftStateChange={onDraftStateChange}/>)
 fireEvent.click(await screen.findByRole('button',{name:'编辑 工具'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled())
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('private studio scoped static image integration',()=>{
 it('locks leaving and saving while a scale image uploads, then retains and saves the resulting dirty image',async()=>{
  const definition=emptyDefinition()
  definition.items=[{itemCode:'q',content:'题目',type:'SINGLE',required:true,sortOrder:0,responseSetKey:'default',randomizeOptions:false}]
  const pending=deferred<typeof asset>()
  const api=apiFor({id:'draft',kind:'SCALE',title:'工具',revision:1,contentHash:'draft-hash',definition},pending.promise)
  const state=vi.fn()
  await open(api,state)
  fireEvent.click(screen.getByRole('button',{name:'题目'}))
  fireEvent.change(screen.getByLabelText('上传题目图片'),{target:{files:[new File(['png'],'question.png',{type:'image/png'})]}})
  expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'固定私有版本'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'返回我的工具'})).toBeDisabled()
  expect(state).toHaveBeenLastCalledWith({dirty:false,writing:true})
  const blocked=new Event('beforeunload',{cancelable:true});window.dispatchEvent(blocked);expect(blocked.defaultPrevented).toBe(true)
  await act(async()=>pending.resolve(asset))
  await waitFor(()=>expect(screen.getByLabelText('图片说明')).toHaveValue('question'))
  expect(state).toHaveBeenLastCalledWith({dirty:true,writing:false})
  fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
  await waitFor(()=>expect(api.mock.calls.some(([,method])=>method==='PUT')).toBe(true))
  const saved=api.mock.calls.find(([,method])=>method==='PUT')?.[2]
  expect(saved).toMatchObject({expectedRevision:1,definition:{items:[{itemCode:'q',images:[{asset,altText:'question',order:0}]}]}})
  expect(api.mock.calls.filter(([path])=>path.endsWith('/assets/images'))).toHaveLength(1)
 })
 it('preserves form image rights when editing its alt text and caption before save',async()=>{
  const pending=deferred<typeof asset>()
  const draft:PrivateTool={id:'draft',kind:'FORM',title:'工具',revision:1,contentHash:'draft-hash',definition:{schemaVersion:2,pages:[{pageKey:'page',title:'第一页',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'问题',required:true,allowRefusal:false,options:[],rows:[]}]}]}}
  const api=apiFor(draft,pending.promise)
  await open(api)
  fireEvent.change(screen.getByLabelText('上传题目图片'),{target:{files:[new File(['png'],'question.png',{type:'image/png'})]}})
  await act(async()=>pending.resolve(asset))
  fireEvent.change(await screen.findByLabelText('图片版权状态'),{target:{value:'authorized'}})
  fireEvent.change(screen.getByLabelText('版权或授权说明（必填）'),{target:{value:'作者已许可本工具使用'}})
  fireEvent.change(screen.getByLabelText('图片说明'),{target:{value:'保留版权的新说明'}})
  fireEvent.change(screen.getByLabelText('图片标题（可选）'),{target:{value:'题目图片标题'}})
  expect(screen.getByLabelText('图片版权状态')).toHaveValue('authorized')
  expect(screen.getByLabelText('版权或授权说明（必填）')).toHaveValue('作者已许可本工具使用')
  fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
  await waitFor(()=>expect(api.mock.calls.some(([,method])=>method==='PUT')).toBe(true))
  const saved=api.mock.calls.find(([,method])=>method==='PUT')?.[2]
  expect(saved).toMatchObject({definition:{pages:[{questions:[{itemKey:'q',image:{asset,altText:'保留版权的新说明',caption:'题目图片标题',rightsStatus:'authorized',rightsNote:'作者已许可本工具使用'}}]}]}})
  expect(api.mock.calls.every(([path])=>path.startsWith('/organizations/school/private-tools'))).toBe(true)
 })
})
