import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationFormBulkImport} from './EducationFormBulkImport'
import {EducationPrivateToolStudio} from './EducationPrivateToolStudio'
import type {PrivateTool,PrivateToolApi} from './privateToolClient'
const content='type,prompt,required,options\nSINGLE,新题,true,甲||乙'
const tool:PrivateTool={id:'tool',kind:'FORM',title:'已有表单',revision:2,contentHash:'a'.repeat(64),definition:{schemaVersion:2,pages:[{pageKey:'existing',title:'已有分组',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'已有题目',required:true,options:[],rows:[]}]}]}}
const preview={ok:true,issues:[],count:1,totalQuestions:2,totalFields:2,groups:[{title:'导入题目',addedCount:1}],items:[{line:2,type:'SINGLE',prompt:'新题',required:true,options:['甲','乙'],rows:[]}],digest:'b'.repeat(64),previewToken:'c'.repeat(64),previewExpiresAt:1799999999999,expectedRevision:2,expectedContentHash:tool.contentHash}
const props=()=>({api:vi.fn(),organizationId:'org',actorId:'author',tool,disabled:false,onImported:vi.fn(),onBusy:vi.fn(),onPendingChange:vi.fn()})
const enter=()=>{fireEvent.click(screen.getByText('批量导入题目 · CSV／多行文本'));fireEvent.change(screen.getByLabelText('表单待导入内容'),{target:{value:content}})}
const start=()=>fireEvent.click(screen.getByRole('button',{name:'解析并预览'}))
afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('School form import confirmation workflow',()=>{
 it('previews without saving and applies the exact proof once before adopting the saved DTO',async()=>{
  const p=props(),saved={...tool,revision:3,contentHash:'d'.repeat(64)}
  p.api.mockResolvedValueOnce(preview).mockResolvedValueOnce(saved)
  render(<EducationFormBulkImport {...p}/>);enter();start()
  await screen.findByRole('button',{name:'确认追加并保存草稿'})
  expect(p.onImported).not.toHaveBeenCalled();expect(p.api).toHaveBeenCalledTimes(1)
  const request=p.api.mock.calls[0][2]
  expect(request).toMatchObject({content,format:'CSV',expectedRevision:2,expectedContentHash:tool.contentHash})
  expect(request).not.toHaveProperty('targetPageKey')
  fireEvent.click(screen.getByRole('button',{name:'确认追加并保存草稿'}));fireEvent.click(screen.getByRole('button',{name:'确认追加并保存草稿'}))
  await waitFor(()=>expect(p.onImported).toHaveBeenCalledWith(saved))
  expect(p.api).toHaveBeenCalledTimes(2)
  expect(p.api).toHaveBeenNthCalledWith(2,'/organizations/org/private-tools/tool/form-import/apply','POST',{...request,digest:preview.digest,previewToken:preview.previewToken,previewExpiresAt:preview.previewExpiresAt})
  expect(screen.getByLabelText('表单待导入内容')).toHaveValue('');expect(p.onPendingChange).toHaveBeenLastCalledWith(false)
 })
 it('shows row errors, retains input and never exposes confirmation for an invalid plan',async()=>{
  const p=props();p.api.mockResolvedValue({...preview,ok:false,issues:[{line:4,message:'选择题至少需要两项选项'}]})
  render(<EducationFormBulkImport {...p}/>);enter();start()
  expect(await screen.findByRole('alert',{name:'导入错误'})).toHaveTextContent('第 4 行')
  expect(screen.queryByRole('button',{name:'确认追加并保存草稿'})).not.toBeInTheDocument()
  expect(screen.getByLabelText('表单待导入内容')).toHaveValue(content);expect(p.onImported).not.toHaveBeenCalled()
 })
 it('invalidates preview when content, format, destination or saved revision changes',async()=>{
  const p=props();p.api.mockResolvedValue(preview)
  const view=render(<EducationFormBulkImport {...p}/>);enter();start()
  await screen.findByRole('button',{name:'确认追加并保存草稿'})
  fireEvent.change(screen.getByLabelText('表单导入格式'),{target:{value:'TEXT'}})
  expect(screen.queryByRole('button',{name:'确认追加并保存草稿'})).not.toBeInTheDocument();start();await screen.findByRole('button',{name:'确认追加并保存草稿'})
  fireEvent.change(screen.getByLabelText('导入题目追加位置'),{target:{value:'existing'}})
  expect(screen.queryByRole('button',{name:'确认追加并保存草稿'})).not.toBeInTheDocument();start();await screen.findByRole('button',{name:'确认追加并保存草稿'})
  expect(p.api.mock.calls[2][2]).toMatchObject({format:'TEXT',targetPageKey:'existing'})
  fireEvent.change(screen.getByLabelText('表单待导入内容'),{target:{value:content+'\n'}})
  expect(screen.queryByRole('button',{name:'确认追加并保存草稿'})).not.toBeInTheDocument();start();await screen.findByRole('button',{name:'确认追加并保存草稿'})
  view.rerender(<EducationFormBulkImport {...p} tool={{...tool,revision:3}}/>)
  expect(screen.queryByRole('button',{name:'确认追加并保存草稿'})).not.toBeInTheDocument()
 })
 it.each(['PRIVATE_TOOL_REVISION_CONFLICT','PRIVATE_TOOL_FORM_IMPORT_PREVIEW_EXPIRED'])('keeps input after %s without retry or false success',async code=>{
  const p=props();p.api.mockResolvedValueOnce(preview).mockRejectedValueOnce({code,status:409})
  render(<EducationFormBulkImport {...p}/>);enter();start();fireEvent.click(await screen.findByRole('button',{name:'确认追加并保存草稿'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('输入已保留')
  expect(screen.getByLabelText('表单待导入内容')).toHaveValue(content);expect(p.onImported).not.toHaveBeenCalled();expect(p.api).toHaveBeenCalledTimes(2)
 })
 it.each([Error('connection lost'),{code:500,status:500,message:'Server error'}])('stops duplicate import after an unknown apply outcome until the draft is explicitly reloaded: %s',async failure=>{
  const p=props();p.api.mockResolvedValueOnce(preview).mockRejectedValueOnce(failure)
  render(<EducationFormBulkImport {...p}/>);enter();start();fireEvent.click(await screen.findByRole('button',{name:'确认追加并保存草稿'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('导入结果尚未确认')
  expect(screen.getByRole('button',{name:'解析并预览'})).toBeDisabled();expect(screen.getByRole('button',{name:'清空导入内容'})).toBeDisabled()
  expect(screen.getByLabelText('表单待导入内容')).toHaveValue(content);expect(p.api).toHaveBeenCalledTimes(2)
 })
 it('does not adopt a late preview from another school or unlock its replacement request',async()=>{
  const p=props();let first!:(value:unknown)=>void,second!:(value:unknown)=>void
  p.api.mockImplementationOnce(()=>new Promise(resolve=>{first=resolve})).mockImplementationOnce(()=>new Promise(resolve=>{second=resolve}))
  const view=render(<EducationFormBulkImport {...p}/>);enter();start()
  view.rerender(<EducationFormBulkImport {...p} organizationId="other"/>);enter();start()
  await act(async()=>first(preview))
  expect(screen.queryByRole('button',{name:'确认追加并保存草稿'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'正在处理…'})).toBeDisabled()
  await act(async()=>second(preview));expect(await screen.findByRole('button',{name:'确认追加并保存草稿'})).toBeEnabled()
 })
 it('integrates pending import buffers with existing draft, leave, save and freeze guards',async()=>{
  const api=vi.fn(async(path:string,method?:string)=>{if(method)throw Error('Unexpected mutation');return path.endsWith('/versions')?{list:[]}:path.endsWith('/tool')?tool:{list:[tool],nextCursor:null}})
  const state=vi.fn(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  render(<EducationPrivateToolStudio api={api as PrivateToolApi} entry="SCHOOL" organizationId="org" actorId="author" onDraftStateChange={state}/> )
  fireEvent.click(await screen.findByRole('button',{name:'编辑 已有表单'}));await waitFor(()=>expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled())
  await screen.findByLabelText('题干')
  enter();expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled();expect(screen.getByRole('button',{name:'检查定义'})).toBeDisabled();expect(screen.getByLabelText('题干')).toBeDisabled()
  expect(state).toHaveBeenLastCalledWith({dirty:true,writing:false})
  fireEvent.click(screen.getByRole('button',{name:'返回我的工具'}));expect(confirm).toHaveBeenCalled();expect(screen.getByLabelText('表单待导入内容')).toHaveValue(content)
  fireEvent.click(screen.getByRole('button',{name:'清空导入内容'}));expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled();expect(screen.getByLabelText('题干')).toHaveValue('已有题目')
  expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
 })
})
